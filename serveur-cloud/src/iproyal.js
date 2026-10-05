// Le client de l'API IPRoyal (proxys « ISP / static residential »).
// Base : https://apid.iproyal.com/v1/reseller, en-tête X-Access-Token (docs
// lues le 05/10 : orders, change-credentials, availability).
//
// ⛔ Les LECTURES sont libres (échéance, disponibilité). Tout ce qui DÉPENSE
//    (prolonger, commander) est refusé tant que IPROYAL_ACHATS_AUTORISES n'est
//    pas à 1 — et une commande d'IP neuve n'est JAMAIS faite par la boucle :
//    seulement par l'outil `outils/ip.mjs commander`, sur le GO de Nico.
const BASE = 'https://apid.iproyal.com/v1/reseller';

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
    return appel('POST', `/orders/${encodeURIComponent(commandeId)}/extend`, { product_plan_id: planId });
  }

  async function disponibilite() {
    const d = await appel('GET', '/access/availability/static-residential');
    return (Array.isArray(d) ? d : d?.data ?? []).find((x) => x.country_code === 'FR') ?? null;
  }

  return { disponible, lireCommande, urlProxy, changerIdentifiants, prolonger, disponibilite };
}
