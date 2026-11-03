// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE eBay DÉCLARÉE ABSENTE : CE QU'eBAY EN DIT VRAIMENT (03/11)
// ═══════════════════════════════════════════════════════════════════════════
// Cas du 03/11 : une annonce publiée par l'API le 01/11 à 14:30:46.
// La vitrine eBay (Browse) la rend encore : fin le 01/11 à 14:47:45, 0 vendu — elle a été EN LIGNE 17 minutes, puis
// arrêtée. La veille eBay ne l'avait relue qu'à 14:32 (une seule visite : 11 635 annonces sous veille, dernière visite
// médiane il y a 14 jours le 03/11) : aucune date de fin connue quand les relevés complets du 02/11 08:20 et du
// 03/11 04:30 l'ont trouvée absente — d'où « eBay n'a donné aucun motif » (fiche_releve_ferme, branche
// refus_moderation_probable), alors que ni eBay ni FillSell n'avaient été lus.
// LA RÈGLE : une publication eBay close par les relevés « absente, sans motif » est relue chez eBay (GetItem avec le
// jeton du vendeur, et la vitrine) ; le message dit ce qu'eBay sait : en ligne de quand à quand, arrêtée depuis le compte
// eBay (avec le motif choisi, s'il existe) ou supprimée par eBay (avec SES mots), remise en vente sous un autre numéro.
// Rien d'inventé : sans lecture concordante, le message reste celui d'avant. Jamais une vente ici (vendue : son circuit).
// Pur (Deno + Node) : scripts/ebay-disparue-motif-selftest.mjs.

import { refusGetItemDefinitif } from "./ebay-retrait-trading.js";

/** Les motifs de fin anticipée qu'un vendeur choisit chez eBay (EndingReason), en mots. */
export const RAISONS_FIN_EBAY = {
  NotAvailable: "l'article n'est plus disponible",
  LostOrBroken: "l'article est perdu ou abîmé",
  Incorrect: "erreur dans l'annonce",
  OtherListingError: "erreur dans l'annonce",
  SellToHighBidder: "vendu au meilleur enchérisseur",
  Sold: "vendu",
};

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const quand = (v) => {
  const t = ms(v);
  if (!Number.isFinite(t)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} à ${p.hour}h${p.minute}`;
};

/** Le numéro de relance d'une lecture GetItem brute (ListingDetails/RelistedItemID), ou null. */
export function relanceDepuisXml(xml) {
  const m = String(xml ?? "").match(/<RelistedItemID>(\d{9,15})<\/RelistedItemID>/);
  return m ? m[1] : null;
}
/** Le motif de fin anticipée (EndingReason) d'une lecture GetItem brute, ou null. */
export function raisonFinDepuisXml(xml) {
  const m = String(xml ?? "").match(/<EndingReason>([A-Za-z]+)<\/EndingReason>/);
  return m ? m[1] : null;
}

/**
 * Ce qu'eBay dit d'une annonce déclarée absente par les relevés.
 * @param {{ lecture: any, raisonFin?: string|null, relance?: string|null, vitrine?: { verdict: string, motif?: string, fin?: string|null }|null, publieLe?: string|null, numero: string }} a
 *   lecture = lireItemTrading(xml) (jeton du vendeur) ; vitrine = lireEtatAnnonceEbay (Browse).
 * @returns {null | { issue: 'encore_active'|'arretee_depuis_le_compte'|'arretee_sans_motif'|'supprimee_par_ebay'|'vendue', message: string|null, fin: string|null, motif: string|null, raison_fin: string|null, relance: string|null }}
 *   null = rien de sûr : le message d'avant reste.
 */
export function motifAnnonceDisparueEbay({ lecture, raisonFin = null, relance = null, vitrine = null, publieLe = null, numero }) {
  const debut = quand(publieLe);
  const enLigne = (fin) => debut && fin ? `Cette annonce a bien été en ligne sur eBay, du ${debut} au ${fin}` : fin ? `Cette annonce a bien été en ligne sur eBay jusqu'au ${fin}` : "Cette annonce a bien été en ligne sur eBay";
  const suite = "Rien n'est vendu, ton article reste dans ton stock ; si cet arrêt n'était pas voulu, relance la publication depuis la fiche.";
  // 1. eBay a supprimé l'annonce lui-même : GetItem refuse définitivement EN LE DISANT, la vitrine ne la vend plus.
  const refus = refusGetItemDefinitif(lecture);
  if (refus) {
    const v = String(vitrine?.verdict ?? "");
    const vitrineMorte = (v === "indetermine" && String(vitrine?.motif ?? "") === "http_404") || v === "terminee_sans_vente" || v === "enchere_sans_acheteur";
    if (!vitrineMorte) return null;
    const fin = quand(vitrine?.fin);
    return { issue: "supprimee_par_ebay", fin: vitrine?.fin ?? null, motif: refus.motif, raison_fin: null, relance: null,
      message: `${enLigne(fin)}, puis eBay l'a supprimée. Motif donné par eBay : « ${refus.motif} » Ce n'est pas FillSell. ${suite}` };
  }
  if (!lecture || (lecture.ack !== "Success" && lecture.ack !== "Warning")) return null;
  if (String(lecture.itemId ?? "") !== String(numero)) return null;
  if (lecture.statut === "Active") return { issue: "encore_active", fin: null, motif: null, raison_fin: null, relance: null, message: null };
  if (lecture.vendus > 0) return { issue: "vendue", fin: lecture.fin ?? null, motif: null, raison_fin: null, relance: null, message: null };
  if (lecture.statut !== "Completed" && lecture.statut !== "Ended") return null;
  const fin = quand(lecture.fin);
  const libelle = raisonFin ? (RAISONS_FIN_EBAY[raisonFin] ?? raisonFin) : null;
  const relancee = relance && relance !== String(numero) ? ` Elle a été remise en vente sous l'annonce ${relance}.` : "";
  const comment = libelle
    ? `, puis elle a été arrêtée depuis ton compte eBay, sans vente (motif choisi : « ${libelle} »)`
    : ", puis elle a été arrêtée sans vente ; eBay ne dit pas pourquoi";
  return { issue: libelle ? "arretee_depuis_le_compte" : "arretee_sans_motif", fin: lecture.fin ?? null, motif: null, raison_fin: raisonFin ?? null, relance: relance ?? null,
    message: `${enLigne(fin)}${comment}. Ce n'est ni FillSell ni un refus de publication.${relancee} ${suite}` };
}
