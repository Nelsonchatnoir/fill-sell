// ═══════════════════════════════════════════════════════════════════════════
// eBay : LES RETOURS QUE L'ÉCRAN PROPOSE = CEUX QU'EBAY ACCEPTE POUR CE COMPTE (06/11, Nico, point 4 — Pascal Caffray)
// ═══════════════════════════════════════════════════════════════════════════
// Pascal (fluxen62, compte eBay PROFESSIONNEL) : l'écran Réglages › Compte eBay proposait « Pas de retour » à tout le
// monde, et seulement « 30 jours » sinon. eBay interdit « pas de retour » aux professionnels (refus 25002,
// ReturnsAcceptedOption) : sa politique était créée, puis chaque publication refusée, la politique retirée, la question
// reposée — et l'écran reproposait « Pas de retour ». Le serveur acceptait déjà 14, 30 ou 60 jours (corpsCreation),
// l'écran n'envoyait jamais la durée : toujours 30.
// LA RÈGLE :
//   · le type de vendeur est LU chez eBay (Trading GetUser, SellerInfo.SellerBusinessType : « Commercial » =
//     professionnel, « Private » = particulier ; toute autre réponse, ou rien de lisible = inconnu) ;
//   · « pas de retour » n'est proposé — et accepté par le serveur — QUE pour un compte qu'eBay dit particulier ;
//     professionnel ou inconnu : jamais (eBay le refuserait à la publication) ;
//   · les durées proposées sont celles que le serveur envoie à eBay : 14, 30, 60 jours ; le choix de l'écran part tel
//     quel (retours_jours), jamais remplacé.
// Pur (Deno + Node + Vite) : scripts/ebay-retours-selftest.mjs.

export const DUREES_RETOURS_EBAY = Object.freeze([14, 30, 60]);
export const DUREE_RETOURS_DEFAUT = 30;

/** Le type de vendeur que dit la réponse GetUser d'eBay : "professionnel", "particulier", ou null (inconnu). */
export function typeVendeurEbayDuXml(xml) {
  const m = String(xml ?? "").match(/<SellerBusinessType>\s*([A-Za-z]+)\s*<\/SellerBusinessType>/);
  const v = m ? m[1].toLowerCase() : "";
  if (v === "commercial") return "professionnel";
  if (v === "private") return "particulier";
  return null;
}

/** « Pas de retour » est-il permis à ce compte ? Seulement quand eBay le dit particulier. */
export const pasDeRetourPermis = (typeVendeur) => typeVendeur === "particulier";

/** Les choix de l'écran, dans l'ordre : les durées acceptées, puis « pas de retour » si (et seulement si) permis. */
export function choixRetoursEbay(typeVendeur) {
  const out = DUREES_RETOURS_EBAY.map((j) => ({ valeur: `acceptes_${j}`, jours: j }));
  if (pasDeRetourPermis(typeVendeur)) out.push({ valeur: "refuses", jours: null });
  return out;
}

/**
 * Le choix de l'écran (« acceptes_14 », « refuses »…) en options pour le serveur (creer_politique) : { retours,
 * retours_jours }. Un choix illisible, ou « pas de retour » non permis, redevient la valeur par défaut (30 jours).
 */
export function optionsRetoursEbay(choix, typeVendeur) {
  if (choix === "refuses" && pasDeRetourPermis(typeVendeur)) return { retours: "refuses", retours_jours: null };
  const j = Number(String(choix ?? "").match(/^acceptes_(\d+)$/)?.[1]);
  const jours = DUREES_RETOURS_EBAY.includes(j) ? j : DUREE_RETOURS_DEFAUT;
  return { retours: `acceptes_${jours}`, retours_jours: jours };
}

/**
 * (06/11, Nico, point 5) Le type de vendeur que dit une annonce eBay lue par l'API Browse (seller.sellerAccountType :
 * « BUSINESS » = professionnel, « INDIVIDUAL » = particulier) — la voie extension n'a pas de connexion API pour GetUser.
 */
export function typeVendeurEbayDeBrowse(item) {
  const t = String(item?.seller?.sellerAccountType ?? "").toUpperCase();
  if (t === "BUSINESS") return "professionnel";
  if (t === "INDIVIDUAL") return "particulier";
  return null;
}
