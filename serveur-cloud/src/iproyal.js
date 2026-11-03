// Le client de l'API IPRoyal (proxys « ISP / static residential »).
// Base : https://apid.iproyal.com/v1/reseller, en-tête X-Access-Token (docs
// lues le 05/10 : orders, change-credentials, availability).
//
// ⛔ Les LECTURES sont libres (échéance, disponibilité, catalogue, prix). Tout ce
//    qui DÉPENSE (prolonger, commander) est refusé tant que IPROYAL_ACHATS_AUTORISES
//    n'est pas à 1. (03/11, point 2 de Nico) La boucle d'entretien peut alors acheter
//    et prolonger — seulement sous ses deux autres gardes (coin_config
//    cloud_ip_achats_auto / cloud_ip_renouvellement_auto, plafond mensuel en base).
const BASE = 'https://apid.iproyal.com/v1/reseller';

/**
 * (03/11) LE PRODUIT ACHETÉ, LU DANS LE CATALOGUE (pur : testé) — jamais supposé : « ISP Dedicated », son offre
 * « 30 Days », le lieu « France ». Rend { produitId, planId, lieuId, prixUnitaireUsd, minQuantite } ; lève si l'un
 * manque (on n'achète pas à l'aveugle). Au 03/11 : produit 9, plan 22 (4 $), lieu 25.
 */
export function lireCatalogueIsp(produits) {
  const liste = Array.isArray(produits) ? produits : (produits?.data ?? []);
  const produit = liste.find((p) => /^isp dedicated$/i.test(String(p?.name ?? '').trim()));
  const plan = produit?.plans?.find((x) => /^30\s*days?$/i.test(String(x?.name ?? '').trim()));
  const aplatir = (ls) => (ls ?? []).flatMap((l) => [l, ...aplatir(l.child_locations)]);
  const france = aplatir(produit?.locations).find((l) => /^france$/i.test(String(l?.name ?? '').trim()));
  if (!produit || !plan || !france) {
    throw new Error(`catalogue IPRoyal illisible (produit ${produit?.name ?? '?'}, offre 30 j ${plan ? 'ok' : '?'}, France ${france ? 'ok' : '?'})`);
  }
  if (france.out_of_stock === true) throw new Error('IPRoyal : France épuisée');
  return { produitId: produit.id, planId: plan.id, lieuId: france.id, prixUnitaireUsd: Number(plan.price),
    minQuantite: Number(plan.min_quantity ?? 1) };
}

/** Le prix d'une commande lu par calculate-pricing (pur) : nombre en dollars, ou NaN. */
export function prixDeCalcul(d) {
  const x = d?.data ?? d ?? {};
  return Number(x.price_with_vat ?? x.price ?? x.total ?? NaN);
}

/** Les IP livrées d'une commande (pure) : [{ ip, port }] — vide tant qu'IPRoyal prépare. */
export function proxiesLivres(commande) {
  const port = commande?.proxy_data?.ports?.['http|https'] ?? commande?.proxy_data?.ports?.http ?? 12323;
  return (commande?.proxy_data?.proxies ?? [])
    .filter((p) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(p?.ip ?? '')))
    .map((p) => ({ ip: String(p.ip), port: Number(p.port ?? port) }));
}

export function creerIproyal({ jeton, achatsAutorises = false, journal }) {
  const disponible = Boolean(jeton);

  async function appel(methode, chemin, corps) {
    if (!disponible) throw new Error('IPRoyal : jeton absent (IPROYAL_API_TOKEN)');
    const r = await fetch(`${BASE}${chemin}`, {
      method: methode,
      headers: { 'X-Access-Token': jeton, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: corps == null ? undefined : JSON.stringify(corps),
      signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`IPRoyal ${methode} ${chemin} → HTTP ${r.status}`);
    return d?.data ?? d;
  }

  /** La commande : échéance, statut, proxys (ip, port, identifiants — JAMAIS journalisés). */
  async function lireCommande(id) {
    return appel('GET', `/orders/${encodeURIComponent(id)}`);
  }

  /** L'URL du proxy d'une IP de la commande. */
  function urlProxy(commande, ip) {
    const p = (commande?.proxy_data?.proxies ?? []).find((x) => x.ip === ip) ?? (commande?.proxy_data?.proxies ?? [])[0];
    if (!p) return null;
    return `http://${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@${p.ip}:${p.port ?? commande?.proxy_data?.ports?.http ?? 12323}`;
  }

  /** Identifiants NEUFS (purge) : l'ancien conteneur ne peut plus jamais sortir par cette IP. Rend la nouvelle URL. */
  async function changerIdentifiants(commandeId, ip) {
    await appel('POST', '/orders/proxies/change-credentials', { order_id: Number(commandeId), proxies: [ip], is_reset: true });
    const c = await lireCommande(commandeId);
    const url = urlProxy(c, ip);
    if (!url) throw new Error('IPRoyal : identifiants neufs illisibles');
    journal?.info('iproyal_identifiants_changes', { commande: String(commandeId) });
    return url;
  }

  async function prolonger(commandeId, planId) {
    if (!achatsAutorises) throw new Error('IPRoyal : prolongation REFUSÉE — achats non autorisés (GO de Nico)');
    if (!Number.isFinite(Number(planId))) throw new Error('IPRoyal : prolongation REFUSÉE — offre illisible');
    return appel('POST', `/orders/${encodeURIComponent(commandeId)}/extend`, { product_plan_id: Number(planId) });
  }

  /** (03/11) Le catalogue lu (lecture seule) : le produit ISP Dedicated / 30 jours / France. */
  async function catalogueIsp() {
    return lireCatalogueIsp(await appel('GET', '/products'));
  }

  /** (03/11) Le prix de `quantite` IP (lecture seule, calculate-pricing : la remise de volume comprise). */
  async function prixCommande(quantite, cat) {
    const c = cat ?? await catalogueIsp();
    return prixDeCalcul(await appel('GET', `/orders/calculate-pricing?product_id=${c.produitId}&product_plan_id=${c.planId}`
      + `&product_location_id=${c.lieuId}&quantity=${Math.max(1, Math.floor(Number(quantite) || 1))}`));
  }

  /**
   * (03/11) UNE COMMANDE de `quantite` IP France 30 jours, SANS renouvellement automatique chez IPRoyal (c'est
   * l'entretien qui prolonge, sous ses gardes). Refusée sans IPROYAL_ACHATS_AUTORISES=1. Rend la commande ({ id, … }).
   */
  async function commander(quantite, cat) {
    if (!achatsAutorises) throw new Error('IPRoyal : achat REFUSÉ — achats non autorisés (GO de Nico)');
    const n = Math.floor(Number(quantite));
    if (!(n >= 1 && n <= 50)) throw new Error('IPRoyal : achat REFUSÉ — quantité hors bornes');
    const c = cat ?? await catalogueIsp();
    const o = await appel('POST', '/orders', { product_id: c.produitId, product_plan_id: c.planId,
      product_location_id: c.lieuId, quantity: n, auto_extend: false });
    if (!o?.id) throw new Error('IPRoyal : commande sans numéro');
    journal?.info('iproyal_commande', { commande: String(o.id), quantite: n });
    return o;
  }

  /** (30/10, lot D) Le solde du compte, en dollars (GET /balance — lecture seule). */
  async function solde() {
    const d = await appel('GET', '/balance');
    const montant = Number(typeof d === 'object' && d != null ? (d.balance ?? d.amount) : d);
    if (!Number.isFinite(montant)) throw new Error('IPRoyal : solde illisible');
    return { montant, devise: 'USD' };
  }

  async function disponibilite() {
    const d = await appel('GET', '/access/availability/static-residential');
    return (Array.isArray(d) ? d : d?.data ?? []).find((x) => x.country_code === 'FR') ?? null;
  }

  return { disponible, achatsAutorises: achatsAutorises === true, lireCommande, urlProxy, changerIdentifiants, prolonger,
    disponibilite, solde, catalogueIsp, prixCommande, commander };
}
