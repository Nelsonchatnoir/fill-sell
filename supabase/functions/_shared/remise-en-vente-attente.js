// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN : UNE REMISE EN VENTE N'EST DÉPOSÉE QU'UNE FOIS L'ANNONCE VENDUE HORS LIGNE (06/11, Nico, règle A)
// ═══════════════════════════════════════════════════════════════════════════
// Louis (compte Amiral), 06/11 : 7 ventes en série enregistrées à 07:15 (transaction Leboncoin « Achat en cours »), puis 7
// remises en vente déposées de 07:22 à 07:29 — alors que les 7 annonces vendues étaient toujours EN LIGNE sur Leboncoin
// (Leboncoin garde une annonce sous transaction « active » des jours durant). Leboncoin a refusé les nouvelles : « une
// annonce similaire déjà en ligne, vous ne pouvez pas déposer une annonce identique », refus par contrôle automatique.
// Aucune n'est jamais parue (410 relus à 12:20) ; chez nous, « published ».
// Cause : 20261105170000 (remises_en_vente_tick, a) ne compte plus une annonce Leboncoin sous transaction comme « encore
// en ligne » — voulu pour que la vente ne bloque pas la remise à vie —, et rien ne retenait le DÉPÔT tant qu'elle l'est.
// LA RÈGLE : sur Leboncoin, la tâche de remise en vente (platform_fields.remise_en_vente) n'est SERVIE à l'extension
// qu'une fois l'annonce vendue (remise_en_vente.annonce_vendue) réellement hors ligne — relevée disparue, retirée, ou
// plus du tout relevée en ligne. Tant qu'elle l'est, la tâche attend, pending, intacte, SANS message (rien à faire
// pour le vendeur), et part d'elle-même au premier poll qui suit le relevé qui la voit partir. La vente, elle, reste
// enregistrée tout de suite (« transaction Leboncoin pending = vente payée », décision de Nico, inchangée).
// Les autres plateformes : Vinted, Beebs, Depop marquent l'annonce vendue « vendue » (elle n'est plus en vente) et
// n'interdisent pas une annonce semblable ; eBay clôt l'annonce à la vente (une série y vit en quantité, pas en remise).
// Seul Leboncoin refuse un dépôt identique à une annonce encore active : la règle ne joue que là.
// Pur (Deno + Node).

export const PLATEFORMES_REMISE_APRES_DISPARITION = Object.freeze(["leboncoin"]);
const VIVANTE = new Set(["en_ligne", "en_verification"]);

/** Le numéro de l'annonce vendue que cette remise en vente remplace, ou null (pas une remise, ou numéro inconnu). */
export function annonceVendueDeLaRemise(job) {
  const r = job?.platform_fields?.remise_en_vente;
  if (!r || typeof r !== "object") return null;
  const n = String(r.annonce_vendue ?? "").trim();
  return /^\d{4,}$/.test(n) ? n : null;
}

/** Cette tâche est-elle une remise en vente qui doit attendre la disparition de l'annonce vendue (sa plateforme) ? */
export function remiseAAttendre(job) {
  return !!job && PLATEFORMES_REMISE_APRES_DISPARITION.includes(String(job.platform ?? ""))
    && String(job.action ?? "publish") === "publish" && annonceVendueDeLaRemise(job) != null;
}

/**
 * L'annonce vendue est-elle encore EN LIGNE d'après le relevé ? (la ligne annonces_plateforme de son numéro, même compte,
 * même plateforme). Aucune ligne : inconnue → on ne retient pas (rien ne prouve qu'elle est là).
 * @param {{ disparu_le?: string|null, retiree_le?: string|null, ignoree_le?: string|null, statut_plateforme?: string|null }|null} ligne
 */
export function annonceVendueEncoreEnLigne(ligne) {
  if (!ligne) return false;
  if (ligne.disparu_le || ligne.retiree_le || ligne.ignoree_le) return false;
  return VIVANTE.has(String(ligne.statut_plateforme ?? ""));
}
