// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (09/11, point 2 de Nico — Jess, jessica.alhiane) LE BADGE « ARTICLE VENDU » D'AVANT LE SUIVI N'ARRÊTE PAS LA
// REPUBLICATION ; UNE VENTE LUE PENDANT LE SUIVI DEVIENT UNE VENTE DÉTECTÉE
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Cas : « ⚡️ Câble USB-C vers USB-C (1M) … (Unité ou Lot) » (Leboncoin 3178619102) et « Boîte en métal vintage »
// (3234168813), IMPORTÉES par le relevé le 07/11 à 19:47 (compte créé à 17:51), vendues le 20/07 et le 17/07 (commandes
// 349375855 et 348857560, ventes anciennes 491407 et 491408 déjà dans l'historique). Leboncoin garde l'annonce en ligne
// avec le badge « Article vendu ». Règle de Nico (08/11, migration 20261108142000 ; 09/11, migration 20261109010000) :
// ce badge d'avant le suivi n'est jamais une vente et la republication part. Mais l'EXTENSION relit la page avant tout
// retrait (republish_etat_reel) : « sold » → échec → pas-de-rouge A4 « annulée : ton annonce est vendue ». 12 annulations
// chez Jess (08/11 17:06 → 09/11 01:47), 9 chez jeanluclassarat916 (04-05/11), aucune vente réelle en 14 jours.
// Règle :
//   · get-pending-jobs marque la tâche SERVIE (republication Leboncoin pas encore retirée) quand le badge de son
//     annonce date d'avant le suivi — même définition que la base (republication_annonce_partie, CTE avant_suivi) :
//     leboncoin_vendu_avant_suivi ET (annonce relevée en ligne non disparue OU née hors FillSell : import, sans dépôt
//     de FillSell sous ce numéro). Rien n'est écrit en base : la marque voyage avec la tâche servie ;
//   · l'extension (≥ 0.6.184) qui lit « sold » sur une tâche ainsi marquée continue comme une annonce en ligne (la page
//     répond en 200, list_id présent) — et, à l'étape du retrait, « sold » ne prouve JAMAIS un retrait pour elle : seule
//     une page morte (410/404) le prouve ;
//   · une extension plus ancienne s'arrête encore sur le badge : pas-de-rouge le dit vrai (jamais « vendue »), la
//     republication se clôt sans rien retirer, l'article reste republiable ;
//   · un « Article vendu » lu SANS cette marque (vente pendant le suivi) : la republication se clôt comme avant ET
//     l'annonce publiée de ce numéro reçoit le signal de vente de la veille (sale_signal « sold ») — le circuit des
//     ventes détectées prend la suite tout de suite (Ventes à confirmer, mail, retraits ailleurs à l'enregistrement ;
//     republication refusée par la base). Le déclencheur cross_post_jobs_lbc_vendu_avant_suivi écarte toujours un
//     badge d'avant le suivi avant écriture.

export const CLE_BADGE_AVANT_SUIVI = "badge_vendu_avant_suivi";
/** Au plus tant de tâches lues par passage (une RPC par numéro). */
export const BADGE_MAX_PAR_PASSAGE = 10;

const numero = (j) => String(j?.platform_listing_id ?? "").trim();
const pfDe = (j) => (j && typeof j.platform_fields === "object" && j.platform_fields) ? j.platform_fields : {};

/** Les tâches servies à juger : republication Leboncoin, rien retiré (étape a_capturer ou absente), numéro connu. */
export function tachesBadgeAJuger(jobs) {
  const out = [];
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (String(j?.platform ?? "") !== "leboncoin" || String(j?.action ?? "") !== "republish") continue;
    const etape = String(pfDe(j).republish_step ?? "a_capturer");
    if (etape !== "a_capturer" || !/^\d{4,}$/.test(numero(j))) continue;
    out.push(j);
    if (out.length >= BADGE_MAX_PAR_PASSAGE) break;
  }
  return out;
}

/**
 * Le badge de cette annonce date-t-il d'avant le suivi ? (miroir de la CTE avant_suivi de republication_annonce_partie)
 * @param {{ venduAvantSuivi: boolean|null, enLigne: boolean, importee: boolean, deposeeParFillSell: boolean }} x
 * venduAvantSuivi null (lecture ratée) → false : sans preuve, la règle d'avant.
 */
export function badgeAvantSuivi({ venduAvantSuivi, enLigne, importee, deposeeParFillSell }) {
  if (venduAvantSuivi !== true) return false;
  return enLigne === true || (importee === true && deposeeParFillSell !== true);
}

/** Lecture des lignes de la base (annonces relevées, tâches du numéro) → { enLigne, importee, deposeeParFillSell }. */
export function faitsDuNumero(listing, annonces, taches) {
  const n = String(listing ?? "").trim();
  const enLigne = (annonces ?? []).some((a) => String(a?.listing_id ?? "").trim() === n
    && String(a?.statut_plateforme ?? "") === "en_ligne" && a?.disparu_le == null);
  let importee = false, deposeeParFillSell = false;
  for (const x of taches ?? []) {
    if (String(x?.platform_listing_id ?? "").trim() !== n) continue;
    const pf = pfDe(x);
    const source = String(pf.source ?? "");
    const imp = String(pf?.rattachement?.import ?? "") === "true" || pf?.rattachement?.import === true;
    if (source === "releve" || imp) importee = true;
    if (["publish", "republish"].includes(String(x?.action ?? "")) && source !== "releve" && !imp) deposeeParFillSell = true;
  }
  return { enLigne, importee, deposeeParFillSell };
}

/** La tâche servie, marquée (ou démarquée : une marque d'un passage précédent qui ne tient plus est retirée). */
export function marquerTache(job, avantSuivi, at = new Date().toISOString()) {
  const pf = { ...pfDe(job) };
  if (avantSuivi) pf[CLE_BADGE_AVANT_SUIVI] = { listing: numero(job), verifie_le: at };
  else delete pf[CLE_BADGE_AVANT_SUIVI];
  return { ...job, platform_fields: pf };
}

/** La marque porte-t-elle sur CE numéro ? (pas-de-rouge ; recopié dans l'extension : badgeAvantSuiviDuJob) */
export function marqueBadgeAvantSuivi(pf, listing) {
  const m = pf && typeof pf === "object" ? pf[CLE_BADGE_AVANT_SUIVI] : null;
  const n = String(listing ?? "").trim();
  return !!(m && typeof m === "object" && n && String(m.listing ?? "").trim() === n);
}

/** Extension d'avant 0.6.184 arrêtée sur le badge : le message vrai (jamais « vendue »). */
export function messageBadgeAvantSuivi() {
  return "Republication pas encore partie : la page Leboncoin de cette annonce affiche « Article vendu » pour une vente " +
    "d'avant ton arrivée sur FillSell — ce n'est pas une vente, ton annonce est toujours en vente. Ta version de " +
    "l'extension FillSell s'arrête sur ce badge ; la prochaine version la republiera. Rien n'a été retiré.";
}

/** Le signal de vente posé sur l'annonce publiée du même numéro (comme la veille de l'extension). null = rien à écrire. */
export function signalVenteLueALaRepublication(pfPublie, at = new Date().toISOString()) {
  const pf = pfPublie && typeof pfPublie === "object" ? pfPublie : {};
  if (String(pf.sale_signal ?? "") === "sold") return null;
  return {
    ...pf,
    unavailable_since: pf.unavailable_since ?? at,
    sale_signal: "sold",
    sale_signal_par: { par: "republication (page « Article vendu » relue avant le retrait)", le: at },
  };
}
