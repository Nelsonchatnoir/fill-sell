// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UNE ANNONCE eBAY, LU SUR L'API BROWSE (09/10, Marta — enchère)
// ═══════════════════════════════════════════════════════════════════════════
// Le veilleur de vente lisait « date de fin présente » comme « annonce
// terminée », SANS comparer cette date à maintenant. Une ENCHÈRE a toujours une
// date de fin, dans le futur tant qu'elle court : l'enchère « Panini 3 scatole
// vuote » de Marta (920016444915, Browse : buyingOptions [FIXED_PRICE,
// AUCTION], fin 14/10 06:36Z, IN_STOCK, 1 disponible, 0 vendu) a été posée
// « Plus en ligne — Vendue ? » cinq jours avant sa fin ; un appui sur « Oui »
// a enregistré une vente « Ailleurs ». Mesuré le 09/10 : 16 annonces du parc
// posées « terminées » AVANT leur fin, 13 bandeaux faux en ligne sur 5 comptes.
//
// LES RÈGLES, lues dans cet ordre :
//  · 0 disponible ET au moins 1 vendu = VENDUE (01/10, inchangé) ;
//  · pas de date de fin, ou une date de fin FUTURE = VIVANTE — une enchère en
//    cours n'est ni indisponible ni vendue ;
//  · ENCHÈRE terminée depuis moins d'une heure, sans vendu = INDÉTERMINÉ (le
//    gagnant peut ne pas être encore compté) : rien n'est écrit ;
//  · ENCHÈRE terminée, 0 vendu = « enchère sans acheteur » : JAMAIS une vente,
//    jamais la question « Vendue ? » — l'annonce n'existe plus, l'article
//    reste en stock ;
//  · PRIX FIXE terminé, 0 vendu = « terminée sans vente » : la question
//    « Vendue ? » reste (le vendeur qui arrête son annonce a souvent vendu
//    ailleurs — c'est à lui de trancher, jamais à nous) ;
//  · date de fin illisible = INDÉTERMINÉ.
// Module pur (aucun appel réseau) : rejoué par scripts/ebay-encheres-selftest.mjs.

/** Délai après la fin d'une enchère avant de conclure « sans acheteur ». */
export const DELAI_FIN_ENCHERE_MS = 3600_000;

/** « AUCTION » dès que l'annonce est une enchère (avec ou sans « Achat immédiat »). */
export function formatEbay(buyingOptions) {
  if (!Array.isArray(buyingOptions) || !buyingOptions.length) return null;
  const o = buyingOptions.map((x) => String(x).toUpperCase());
  if (o.includes("AUCTION")) return "AUCTION";
  if (o.includes("FIXED_PRICE")) return "FIXED_PRICE";
  return null;
}

/** La quantité affichée par eBay. `exacte` = un nombre, pas un seuil « plus de N ». */
export function lireQuantiteEbay(dispo) {
  const brut = dispo?.estimatedAvailableQuantity;
  const seuil = dispo?.availabilityThresholdType != null || dispo?.availabilityThreshold != null;
  const exacte = typeof brut === "number" && Number.isInteger(brut) && brut >= 0 && !seuil;
  const vendus = Number(dispo?.estimatedSoldQuantity ?? Number.NaN);
  return { disponible: exacte ? brut : null, vendus: Number.isFinite(vendus) ? vendus : null, exacte };
}

/**
 * Le verdict sur une réponse Browse `get_item_by_legacy_id` (HTTP 200).
 * @param {Record<string, unknown>} j  la réponse eBay
 * @param {number} maintenant          horodatage (ms)
 */
export function verdictAnnonceEbay(j, maintenant = Date.now()) {
  const fin = typeof j?.itemEndDate === "string" && j.itemEndDate ? j.itemEndDate : null;
  const format = formatEbay(j?.buyingOptions);
  const bids = Number(j?.bidCount ?? Number.NaN);
  const encheres = Number.isFinite(bids) ? bids : null;
  const dispo = (Array.isArray(j?.estimatedAvailabilities) ? j.estimatedAvailabilities[0] : null) ?? {};
  const vendus = Number(dispo.estimatedSoldQuantity ?? 0);
  const statut = String(dispo.estimatedAvailabilityStatus ?? "");
  const q = lireQuantiteEbay(dispo);
  const epuisee = statut === "OUT_OF_STOCK" || (q.exacte && q.disponible === 0);
  if (vendus >= 1 && epuisee) {
    const prixBrut = Number(j?.price?.value ?? Number.NaN);
    return { verdict: "vendue", fin, vendus, prix: Number.isFinite(prixBrut) && prixBrut > 0 ? prixBrut : null, sans_fin: !fin, format, encheres };
  }
  if (!fin) return { verdict: "vivante", quantite: q, format, fin: null, encheres };
  const finMs = Date.parse(fin);
  if (!Number.isFinite(finMs)) return { verdict: "indetermine", motif: "fin_illisible", limite: false, format };
  if (finMs > maintenant) return { verdict: "vivante", quantite: q, format, fin, encheres };
  if (format === "AUCTION") {
    if (maintenant - finMs < DELAI_FIN_ENCHERE_MS) {
      return { verdict: "indetermine", motif: "enchere_terminee_resultat_attendu", limite: false, format };
    }
    // Épuisée sans aucun vendu : eBay ne dit pas encore qui l'a emportée.
    if (epuisee) return { verdict: "indetermine", motif: "enchere_epuisee_sans_vendu", limite: false, format };
    return { verdict: "enchere_sans_acheteur", fin, format, encheres };
  }
  return { verdict: "terminee_sans_vente", fin, format };
}

/** Le drapeau « plus en ligne » posé sur une annonce AVANT sa date de fin (le défaut du 09/10). */
export function drapeauAvantLaFin(pf) {
  const f = pf?.fin_ebay;
  if (!f || typeof f !== "object") return false;
  const fin = Date.parse(String(f.fin ?? ""));
  const vu = Date.parse(String(f.vu_le ?? ""));
  return Number.isFinite(fin) && Number.isFinite(vu) && fin > vu;
}

/** Les clés de la question « Plus en ligne — Vendue ? », levées quand eBay dément. */
export const CLES_QUESTION_PLUS_EN_LIGNE = [
  "unavailable_since", "unavailable_pending_since", "detected_price",
  "alerte_masquee_pour", "alerte_masquee_le", "fin_ebay",
];
