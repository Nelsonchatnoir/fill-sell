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
