// Le client de l'API IPRoyal (proxys « ISP / static residential »).
// Base : https://apid.iproyal.com/v1/reseller, en-tête X-Access-Token (docs
// lues le 05/10 : orders, change-credentials, availability).
//
// ⛔ Les LECTURES sont libres (échéance, disponibilité, catalogue, prix). Tout ce
//    qui DÉPENSE (prolonger, commander) est refusé tant que IPROYAL_ACHATS_AUTORISES
//    n'est pas à 1. (03/11, point 2 de Nico) La boucle d'entretien peut alors acheter
//    et prolonger — seulement sous ses autres gardes (coin_config cloud_ip_achats_auto /
//    cloud_ip_renouvellement_auto ; (07/11) garde du NOMBRE en base, plus aucun plafond en dollars).
//    (07/11, addendum de Nico) Paiement par CARTE enregistrée (card_id, GET /cards) si
//    coin_config cloud_ip_paiement_carte = 1 ; sinon le solde. Le solde ne se recharge PAS par l'API.
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

/**
 * (07/11, addendum de Nico) LA FIN DE VALIDITÉ D'UNE CARTE (pure) : IPRoyal donne « AAAA/MM » (« 2031/12 », « 2029/4 ») —
 * la carte vaut jusqu'à la fin de ce mois (UTC). NaN si illisible.
 */
export function finCarte(expiry) {
  const m = /^(\d{4})\s*[/-]\s*(\d{1,2})$/.exec(String(expiry ?? '').trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]), 1) - 1;   // le dernier instant du mois
}

/**
 * (07/11, addendum) LA CARTE QUI PAIE (pure) : celle de coin_config cloud_ip_carte_id si elle est dans GET /cards et
 * encore valide ; sinon la carte valide dont l'échéance est la plus lointaine. Rend { id, fin, quatre, fournisseur,
 * choisie: 'reglage'|'plus_lointaine' } ou null. Jamais plus que les 4 derniers chiffres (jamais journalisés ailleurs).
 */
export function choisirCarte(cartes, carteIdVoulue = null, maintenant = Date.now()) {
  const liste = (Array.isArray(cartes) ? cartes : (cartes?.data ?? []))
    .filter((c) => Number.isFinite(Number(c?.id)))
    .map((c) => ({ id: Number(c.id), fin: finCarte(c.expiry_date), quatre: /^\d{4}$/.test(String(c.last_four_digits ?? '')) ? String(c.last_four_digits) : null,
      fournisseur: String(c.provider ?? c.card_type ?? '') || null }))
    .filter((c) => Number.isFinite(c.fin) && c.fin > maintenant);
  const voulue = Number(carteIdVoulue) > 0 ? liste.find((c) => c.id === Number(carteIdVoulue)) : null;
  if (voulue) return { ...voulue, choisie: 'reglage' };
  const loin = [...liste].sort((a, b) => b.fin - a.fin || a.id - b.id)[0];
  return loin ? { ...loin, choisie: 'plus_lointaine' } : null;
}
/** Une carte dite sans ses chiffres : « carte …1234 (stripe, fin 2031-12) ». */
export const carteLisible = (c) => (c ? `carte …${c.quatre ?? '????'} (${c.fournisseur ? `${c.fournisseur}, ` : ''}fin ${new Date(c.fin).toISOString().slice(0, 7)})` : 'aucune carte');

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
    if (!r.ok) {
      // (07/11) Le statut voyage avec l'erreur : un REFUS (4xx) est sûr — rien n'a été payé — ; un 5xx ou une coupure, non.
      const e = new Error(`IPRoyal ${methode} ${chemin} → HTTP ${r.status}`);
      e.statut = r.status;
      throw e;
    }
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

  /** (07/11, addendum) `carteId` : payée par cette carte enregistrée (card_id) ; absent = payée par le solde. */
  async function prolonger(commandeId, planId, { carteId = null } = {}) {
    if (!achatsAutorises) throw new Error('IPRoyal : prolongation REFUSÉE — achats non autorisés (GO de Nico)');
    if (!Number.isFinite(Number(planId))) throw new Error('IPRoyal : prolongation REFUSÉE — offre illisible');
    return appel('POST', `/orders/${encodeURIComponent(commandeId)}/extend`, { product_plan_id: Number(planId),
      ...(Number(carteId) > 0 ? { card_id: Number(carteId) } : {}) });
  }

  /** (07/11, addendum) Les cartes enregistrées (GET /cards — lecture seule). Jamais journalisées. */
  async function cartes() {
    const d = await appel('GET', '/cards');
    return Array.isArray(d) ? d : (d?.data ?? []);
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
  async function commander(quantite, cat, { carteId = null } = {}) {
    if (!achatsAutorises) throw new Error('IPRoyal : achat REFUSÉ — achats non autorisés (GO de Nico)');
    const n = Math.floor(Number(quantite));
    if (!(n >= 1 && n <= 50)) throw new Error('IPRoyal : achat REFUSÉ — quantité hors bornes');
    const c = cat ?? await catalogueIsp();
    // (07/11, addendum) card_id : payée par cette carte ; sans lui, IPRoyal prend le solde (doc « Create order »).
    const o = await appel('POST', '/orders', { product_id: c.produitId, product_plan_id: c.planId,
      product_location_id: c.lieuId, quantity: n, auto_extend: false, ...(Number(carteId) > 0 ? { card_id: Number(carteId) } : {}) });
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
    disponibilite, solde, catalogueIsp, prixCommande, commander, cartes };
}
