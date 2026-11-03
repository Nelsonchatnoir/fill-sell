// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT eBay PAR LA VOIE QUI MARCHE : L'API TRADING (15/10 soir, point 3)
// ═══════════════════════════════════════════════════════════════════════════
// Amega Gaming (compte relié « vintora16 » depuis le 12/10, jeton valide) :
// « Lot de 3 boxers Pierre Cardin » vendu sur Vinted le 14/10, annonce eBay
// 178450879276 toujours EN LIGNE (relevé API du 15/10 06:10) — risque de double
// vente. Le retrait attendait « Connexion eBay requise » : le déclencheur
// cross_post_jobs_voie_ebay ne donne la voie API qu'aux annonces créées par
// NOTRE API, et le worker ne savait retirer que celles-là (retrait d'offre).
// Une annonce déposée par l'extension, ou importée par le relevé, n'avait que
// le Seller Hub du navigateur — mort tant que la session eBay de Chrome l'est.
//
// LA RÈGLE : un retrait d'un compte RELIÉ (jeton non révoqué) arrêté faute de
// session eBay dans Chrome passe par l'API Trading, avec le jeton du vendeur :
//   1. GetItem relu AVANT tout geste : même numéro, même vendeur que le compte
//      relié, annonce active — sinon on ne touche à rien (autre compte : on le
//      dit ; déjà vendue sur eBay : on le dit ; déjà terminée : rien à faire) ;
//   2. EndFixedPriceItem (EndItem pour une enchère), motif « NotAvailable » ;
//   3. GetItem relu APRÈS : l'annonce n'est plus active = la preuve.
// Un compte NON relié n'a aucune voie serveur : le mur « Connexion eBay » reste,
// c'est la raison exacte (aucun jeton eBay, session Chrome fermée).
// Pur (Deno + Node) : scripts/ebay-retrait-trading-selftest.mjs.

/** Les champs utiles d'une réponse GetItem (XML), sans dépendance. */
export function lireItemTrading(xml) {
  const v = (s, tag) => { const m = String(s ?? "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : null; };
  const ack = v(xml, "Ack");
  const it = v(xml, "Item") ?? "";
  const selling = v(it, "SellingStatus") ?? "";
  const erreurs = [];
  const re = /<Errors>([\s\S]*?)<\/Errors>/g; let m;
  while ((m = re.exec(String(xml ?? "")))) erreurs.push({ code: v(m[1], "ErrorCode"), message: v(m[1], "LongMessage") ?? v(m[1], "ShortMessage"), severite: v(m[1], "SeverityCode") });
  return {
    ack, erreurs,
    itemId: v(it, "ItemID"),
    vendeur: v(v(it, "Seller") ?? "", "UserID"),
    statut: v(selling, "ListingStatus"),
    vendus: Number(v(selling, "QuantitySold") ?? "0") || 0,
    type: v(it, "ListingType"),
    fin: v(v(it, "ListingDetails") ?? "", "EndTime"),
    titre: v(it, "Title"),
  };
}

/**
 * Le verdict AVANT le geste.
 * @returns {{ geste: 'retirer'|'deja_terminee'|'deja_vendue'|'autre_compte'|'identite'|'illisible', appel?: string, motif?: string }}
 */
export function verdictAvantRetraitTrading({ itemId, compteEbay, lecture }) {
  if (!lecture || (lecture.ack !== "Success" && lecture.ack !== "Warning")) return { geste: "illisible", motif: lecture?.erreurs?.[0]?.message ?? "réponse illisible" };
  if (String(lecture.itemId ?? "") !== String(itemId)) return { geste: "identite", motif: `GetItem rend ${lecture.itemId ?? "rien"} au lieu de ${itemId}` };
  if (!lecture.vendeur || !compteEbay || String(lecture.vendeur).toLowerCase() !== String(compteEbay).toLowerCase()) {
    return { geste: "autre_compte", motif: `annonce de @${lecture.vendeur ?? "?"}, compte relié @${compteEbay ?? "?"}` };
  }
  if (lecture.statut !== "Active") return lecture.vendus > 0 ? { geste: "deja_vendue" } : { geste: "deja_terminee" };
  return { geste: "retirer", appel: lecture.type === "Chinese" ? "EndItem" : "EndFixedPriceItem" };
}

// ── (03/11) UNE ANNONCE QU'eBAY A DÉJÀ SUPPRIMÉE : LE RETRAIT EST FAIT ───────────────────────────
// Un article vendu sur Vinted (commande du 17/10, vue par FillSell le 02/11 23:56), retrait eBay armé à 23:57.
// eBay avait déjà supprimé l'annonce : GetItem (jeton du vendeur) répond Failure, « Cette annonce a été
// supprimée, car elle enfreint notre Règlement sur les contrefaçons. », et la vitrine (Browse, jeton applicatif)
// répond 404 « legacy item Id was not found » (11003). verdictAvantRetraitTrading lisait « illisible » : retrait reporté
// à chaque passage, en boucle, depuis le 02/11 23:57.
// LA RÈGLE (Nico, pour toutes les plateformes) : quand la plateforme confirme que l'annonce n'existe plus (supprimée,
// terminée, retirée par elle), le retrait est TERMINÉ — `deleted`, drapeau deja_absente — avec le motif de la
// plateforme, tel quel, montré à la personne. Pour eBay, DEUX lectures concordantes, jamais une seule :
//   1. GetItem du vendeur en échec DÉFINITIF : Ack Failure, une erreur nommée (code + texte), aucune erreur passagère
//      (jeton, quota, panne eBay) — sinon c'est illisible, comme avant ;
//   2. la vitrine eBay ne la vend plus : 404 (introuvable), ou terminée (sans vente / vendue). Une vitrine qui la montre
//      en vente, ou qui ne répond pas (429, 5xx, réseau), ne conclut rien : le retrait reste reporté.
// ⛔ Jamais sur un titre, jamais sur une seule lecture : une annonce peut-être encore en vente n'est jamais dite retirée.
/** Erreurs eBay passagères ou de compte : jamais la preuve qu'une annonce n'existe plus. */
export const CODES_GETITEM_PASSAGERS = new Set(["1", "2", "518", "841", "931", "932", "10007", "16110", "16112", "16114", "16118", "16119", "17470", "21916984", "21917053", "21917062"]);

/** GetItem a-t-il refusé DÉFINITIVEMENT, en le disant ? { code, motif } ou null. */
export function refusGetItemDefinitif(lecture) {
  if (!lecture || lecture.ack !== "Failure") return null;
  const erreurs = (lecture.erreurs ?? []).filter((e) => e && String(e.severite ?? "Error") !== "Warning");
  if (!erreurs.length) return null;
  if (erreurs.some((e) => CODES_GETITEM_PASSAGERS.has(String(e.code ?? "")))) return null;
  const e = erreurs.find((x) => String(x.message ?? "").trim()) ?? null;
  const motif = String(e?.message ?? "").replace(/\s+/g, " ").trim();
  if (!e || !motif) return null;
  return { code: e.code ? String(e.code) : null, motif: motif.slice(0, 300) };
}

/**
 * Les deux lectures concordent-elles : GetItem refuse définitivement ET la vitrine ne la vend plus ?
 * @param {{ lecture: ReturnType<typeof lireItemTrading>|null, vitrine: { verdict: string, motif?: string }|null }} a
 *   vitrine = l'état lu par Browse (lireEtatAnnonceEbay) : vivante / vendue / terminee_sans_vente /
 *   enchere_sans_acheteur / indetermine (motif http_404 = introuvable).
 * @returns {null | { vente: boolean|null, motif: string, code: string|null, vitrine: string }}
 */
export function annonceSupprimeeParEbay({ lecture, vitrine }) {
  const refus = refusGetItemDefinitif(lecture);
  if (!refus || !vitrine) return null;
  const v = String(vitrine.verdict ?? "");
  let lu = null;
  if (v === "indetermine" && String(vitrine.motif ?? "") === "http_404") lu = "introuvable_404";
  else if (v === "terminee_sans_vente" || v === "enchere_sans_acheteur") lu = "terminee";
  else if (v === "vendue") lu = "vendue";
  if (!lu) return null;
  return { vente: lu === "vendue" ? true : lu === "terminee" ? false : null, motif: refus.motif, code: refus.code, vitrine: lu };
}

/** Le verdict APRÈS le geste (relecture) : la preuve, ou rien. */
export function preuveApresRetraitTrading({ itemId, lecture }) {
  if (!lecture || String(lecture.itemId ?? "") !== String(itemId)) return { prouve: false, motif: "relecture illisible" };
  if (lecture.statut && lecture.statut !== "Active") return { prouve: true, statut: lecture.statut, fin: lecture.fin, vendus: lecture.vendus };
  return { prouve: false, motif: `annonce toujours ${lecture.statut ?? "?"}` };
}

/** Un retrait arrêté faute de session eBay dans Chrome (le mur que l'API lève). */
export function retraitBloqueParSessionEbay(job) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.platform !== "ebay" || job?.action !== "delete") return false;
  if (job.status === "needs_user") return pf.needs_user_source === "connexion" || !!pf.ebay_connexion_requise || !!pf.attente_session;
  if (job.status === "pending") return !!pf.attente_session;
  return false;
}

// ── (24/10, point 5 — Thierry) LE RETRAIT N'ATTEND JAMAIS L'ORDINATEUR ─────
// « Marc Aurèle, Sesterce » vendu sur Vinted le 23/10 à 16:40 ; son annonce eBay
// 168782813446 est restée EN LIGNE toute la soirée — risque de double vente —
// parce que le retrait attendait l'extension, dont le poste s'était tu (pris à
// 16:55, « Timeout : pas de réponse du content script » à 17:10, rendu par le
// chien de garde « poste muet depuis 46 min », ordinateur éteint après 17:16).
// Le compte est RELIÉ par l'API (jeton valide) : le serveur pouvait le faire.
// LA RÈGLE : un retrait eBay d'un compte relié, encore en file (pending) 15 min
// après sa création, ou rendu par le chien de garde parce que son poste s'est
// tu, passe par l'API Trading — avec les mêmes gardes (GetItem avant : même
// numéro, même vendeur, active ; GetItem après = la preuve). Jamais un retrait
// en cours chez l'extension (processing) : la bascule ne vise que pending, et
// l'écriture exige le même statut et la voie extension (aucun double geste).
export const RETRAIT_ATTENTE_POSTE_MS = 15 * 60_000;
/** Un retrait que l'ordinateur n'a pas fait à temps (poste muet, ou 15 min en file). */
export function retraitAttendLePoste(job, maintenantMs = Date.now()) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.platform !== "ebay" || job?.action !== "delete" || job?.status !== "pending") return false;
  const rp = pf.reprise_processing && typeof pf.reprise_processing === "object" ? pf.reprise_processing : null;
  const it = pf.interruption && typeof pf.interruption === "object" ? pf.interruption : null;
  if (rp?.motif === "poste_muet" || it?.poste === "muet") return true;
  const cree = Date.parse(String(job?.created_at ?? ""));
  return Number.isFinite(cree) && maintenantMs - cree >= RETRAIT_ATTENTE_POSTE_MS;
}

// ── (24/10 nuit, jocabroc8) L'ANNONCE RETIRÉE SORT DE LA VEILLE ─────────────
// Un retrait fait par l'API Trading laissait la publication d'origine
// « published » sur une annonce terminée : la veille eBay la relisait
// « terminée sans vente » et posait « Plus en ligne — Vendue ? » (13939a70 et
// 559613dd en portent la trace ; sur un article en stock, c'est une fausse
// question à la personne). L'extension (cancelPublishAfterDelete) et le retrait
// d'offre de notre API (annulerSourceEbayRetiree) closent déjà la publication :
// la voie Trading fait pareil, après la preuve seulement, sur le numéro EXACT de
// l'annonce (colonne ou lien /itm/<numéro>, jamais deux numéros contraires),
// sur la fiche du retrait quand elle est connue, jamais sur un titre. Une
// annonce qu'eBay a dite vendue (sale_signal « sold ») n'est jamais close ici.
export const MSG_SOURCE_RETIREE = "Annonce retirée par le vendeur (retrait ciblé depuis l'app) — pas une vente";

/** Le numéro eBay d'un job, ou "" quand la colonne et le lien se contredisent. */
function numeroEbay(j) {
  const lien = String(j?.listing_url ?? "").trim().match(/\/itm\/(?:[^/?#]*\/)?(\d{9,})(?:[/?#]|$)/i)?.[1] ?? "";
  const col = String(j?.platform_listing_id ?? "").trim();
  if (lien && col && lien !== col) return "";
  return lien || col;
}

/** Les publications à clore après un retrait Trading prouvé : la même annonce, exactement. */
export function sourcesACloreApresRetraitTrading(publications, retrait, itemId) {
  const cible = String(itemId ?? "").trim();
  if (!/^\d{9,}$/.test(cible) || !retrait?.user_id) return [];
  return (publications ?? []).filter((p) => {
    if (!p || p.platform !== "ebay" || p.status !== "published") return false;
    if (!["publish", "republish"].includes(String(p.action ?? "publish"))) return false;
    if (String(p.id) === String(retrait.id) || String(p.user_id) !== String(retrait.user_id)) return false;
    if (retrait.inventaire_id != null && String(p.inventaire_id) !== String(retrait.inventaire_id)) return false;
    const pf = (p.platform_fields && typeof p.platform_fields === "object") ? p.platform_fields : {};
    if (pf.sale_signal === "sold") return false;
    return numeroEbay(p) === cible;
  });
}

/** (03/11) Le texte de la publication close quand c'est eBay qui avait déjà supprimé l'annonce : jamais « par le vendeur ». */
export const MSG_SOURCE_SUPPRIMEE_PAR_EBAY = "Annonce supprimée par eBay (pas par le vendeur) — pas une vente";

/** La clôture d'une publication retirée (même sens que « Non, je l'ai retirée ») : jamais une vente.
 *  parEbay (03/11) : eBay l'avait déjà supprimée — le texte le dit, removed_by_user n'est pas posé, son motif est gardé.
 * @param {any} platformFields
 * @param {{ le: string, retraitId: string, itemId: string, parEbay?: { motif?: string|null } | null }} a */
export function clotureSourceRetiree(platformFields, { le, retraitId, itemId, parEbay = null }) {
  const pf = { ...((platformFields && typeof platformFields === "object") ? platformFields : {}) };
  // La trace d'une lecture hors ligne d'avant le retrait est archivée, pas détruite.
  if (pf.unavailable_pending_since) {
    pf.unavailable_pending_at_delete = pf.unavailable_pending_since;
    pf.unavailable_pending_archived_at = le;
  }
  for (const k of ["unavailable_since", "unavailable_pending_since", "sale_signal", "detected_price", "fin_ebay"]) delete pf[k];
  if (parEbay) {
    pf.supprimee_par_ebay = { le, retrait: retraitId, annonce: String(itemId), motif: String(parEbay.motif ?? "").slice(0, 300) || null };
    return { status: "cancelled", error: MSG_SOURCE_SUPPRIMEE_PAR_EBAY, platform_fields: pf };
  }
  pf.removed_by_user = true;
  pf.retiree_par_trading = { le, retrait: retraitId, annonce: String(itemId) };
  return { status: "cancelled", error: MSG_SOURCE_RETIREE, platform_fields: pf };
}
