// ═══════════════════════════════════════════════════════════
// LES PLATEFORMES PAR PAYS — PAYS ANGLOPHONES (05/11/2026 soir, lot « Ouverture du Cloud », phase 3 point 2, ordre de Nico)
// ═══════════════════════════════════════════════════════════
// « Ce qu'un pays n'a pas est MASQUÉ, pas seulement refusé. » France : inchangé. États-Unis : Vinted (site américain, s'il
// existe et fonctionne), eBay.com, Depop ; Royaume-Uni : Vinted UK, eBay.co.uk, Depop ; autres pays anglophones : même
// logique selon ce qui existe vraiment chez eux. Leboncoin et Beebs (sites français) : masqués hors de France.
// ⛔ GARDE-FOU DE NICO : une plateforme non PROUVÉE dans un pays reste MASQUÉE, jamais proposée cassée. Elle s'ouvre par
//    un interrupteur par pays dans coin_config — `<plateforme>_pays_<cc>` = 1 (ex. `ebay_pays_us`), posé APRÈS une
//    preuve réelle — sans binaire ni OTA. Absente ou à 0 : masquée. Aujourd'hui, AUCUNE n'est prouvée hors de France.
// ⛔ ZÉRO RÉGRESSION : seuls les pays anglophones de la liste suivent cette règle. La France et les autres pays (zone euro :
//    Italie, Belgique…) gardent exactement l'app d'avant (leurs règles existantes : lbc-adresse-france.js, vinted_pays_<cc>).
// Le pays : celui du COMPTE quand une plateforme le dit (sonde Vinted, site eBay), sinon celui du TÉLÉPHONE (fuseau
// horaire, comme pour la zone euro). Inconnu = rien ne change.
// Lu par l'app (Vite) et les selftests (Node) ; CE MODULE NE LIT RIEN ET N'ÉCRIT RIEN.
// Preuve : scripts/plateformes-pays-selftest.mjs.

/** Les pays anglophones suivis, et les plateformes qu'on vise chez eux (ouvertes seulement une fois prouvées). */
export const PAYS_ANGLOPHONES = Object.freeze({
  US: Object.freeze(['vinted', 'ebay', 'depop']),
  GB: Object.freeze(['vinted', 'ebay', 'depop']),
  IE: Object.freeze(['vinted', 'ebay', 'depop']),
  CA: Object.freeze(['ebay', 'depop']),
  AU: Object.freeze(['ebay', 'depop']),
  NZ: Object.freeze(['ebay', 'depop']),
});
/** Toutes les plateformes que l'app sait proposer (une plateforme hors de cette liste n'est jamais touchée ici). */
export const PLATEFORMES = Object.freeze(['vinted', 'leboncoin', 'beebs', 'ebay', 'depop']);

const FUSEAUX_ANGLOPHONES = (() => {
  const m = new Map([['Europe/London', 'GB'], ['Europe/Belfast', 'GB'], ['Europe/Dublin', 'IE'], ['Pacific/Auckland', 'NZ'], ['Pacific/Chatham', 'NZ']]);
  for (const z of ['New_York', 'Chicago', 'Denver', 'Los_Angeles', 'Phoenix', 'Anchorage', 'Juneau', 'Sitka', 'Nome', 'Yakutat', 'Metlakatla',
    'Adak', 'Boise', 'Detroit', 'Menominee', 'Indiana/Indianapolis', 'Indiana/Knox', 'Indiana/Marengo', 'Indiana/Petersburg', 'Indiana/Tell_City',
    'Indiana/Vevay', 'Indiana/Vincennes', 'Indiana/Winamac', 'Kentucky/Louisville', 'Kentucky/Monticello', 'North_Dakota/Beulah',
    'North_Dakota/Center', 'North_Dakota/New_Salem']) m.set(`America/${z}`, 'US');
  m.set('Pacific/Honolulu', 'US');
  for (const z of ['Toronto', 'Vancouver', 'Edmonton', 'Winnipeg', 'Halifax', 'St_Johns', 'Regina', 'Moncton', 'Glace_Bay', 'Goose_Bay', 'Whitehorse',
    'Dawson', 'Dawson_Creek', 'Fort_Nelson', 'Creston', 'Iqaluit', 'Rankin_Inlet', 'Resolute', 'Cambridge_Bay', 'Inuvik', 'Swift_Current',
    'Atikokan', 'Blanc-Sablon']) m.set(`America/${z}`, 'CA');
  for (const z of ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Hobart', 'Darwin', 'Lord_Howe', 'Broken_Hill', 'Lindeman', 'Eucla']) m.set(`Australia/${z}`, 'AU');
  return m;
})();

/** Le pays ANGLOPHONE d'un fuseau horaire IANA, ou null (France, zone euro, autre pays, inconnu). */
export function paysAnglophoneDuFuseau(fuseau) {
  return FUSEAUX_ANGLOPHONES.get(String(fuseau ?? '').trim()) ?? null;
}

/**
 * Le pays que le COMPTE FillSell dit déjà (pure) : 'FR' dès qu'une trace française existe — adresse de remise française
 * (lbc-adresse-france.js, motif « france »), une annonce Leboncoin ou Beebs, une annonce sur un site en « .fr », ou la
 * sonde Vinted du compte (pays) ; sinon le pays de la sonde, sinon null. Un vendeur français en voyage, ou installé à
 * Londres sur vinted.fr, garde ainsi l'app d'avant (zéro régression).
 */
export function paysDuCompte({ motifAdresse = null, jobs = [], paysSonde = null } = {}) {
  const sonde = String(paysSonde ?? '').trim().toUpperCase();
  if (sonde === 'FR' || motifAdresse === 'france') return 'FR';
  for (const j of jobs ?? []) {
    if (j?.platform === 'leboncoin' || j?.platform === 'beebs') return 'FR';
    if (/^https?:\/\/(www\.)?[a-z0-9.-]+\.fr\//i.test(String(j?.listing_url ?? ''))) return 'FR';
  }
  return /^[A-Z]{2}$/.test(sonde) ? sonde : null;
}

/** Le pays retenu : le compte d'abord (code ISO à 2 lettres), sinon le téléphone ; null = on ne sait pas. */
export function paysDuVendeur({ paysCompte = null, fuseau = null } = {}) {
  const c = String(paysCompte ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  return paysAnglophoneDuFuseau(fuseau);
}

/** La clé coin_config qui ouvre une plateforme dans un pays (posée seulement après une preuve réelle). */
export const cleOuverture = (plateforme, pays) => `${plateforme}_pays_${String(pays).toLowerCase()}`;

/**
 * Les plateformes FERMÉES (masquées) pour ce pays (pure). Hors pays anglophone suivi : [] (rien ne change).
 * @param {{ pays: string|null, ouvertes?: Iterable<string> }} p — ouvertes : les clés coin_config à 1 (cleOuverture).
 */
export function plateformesFermeesParPays({ pays = null, ouvertes = [] } = {}) {
  const vise = PAYS_ANGLOPHONES[String(pays ?? '').toUpperCase()];
  if (!vise) return [];
  const cles = new Set(ouvertes ?? []);
  return PLATEFORMES.filter((p) => !(vise.includes(p) && cles.has(cleOuverture(p, pays))));
}

/** Les clés coin_config à lire pour un pays (vide hors pays anglophone suivi). */
export function clesAOuvrir(pays) {
  const vise = PAYS_ANGLOPHONES[String(pays ?? '').toUpperCase()];
  return vise ? vise.map((p) => cleOuverture(p, pays)) : [];
}
