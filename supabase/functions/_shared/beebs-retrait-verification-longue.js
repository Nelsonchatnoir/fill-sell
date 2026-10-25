// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT BEEBS BLOQUÉ PAR UNE VÉRIFICATION QUI DURE (25/10, DeadRoz)
// ═══════════════════════════════════════════════════════════════════════════
// Retrait 53cff028 (annonce 34083555, « Jeans 511 Levi's », déposée par FillSell
// le 30/09 à 19:00, jamais vue en ligne, « en vérification » à chaque relevé
// depuis le 01/10 ; article vendu « Ailleurs » le 14/10) : 153 essais, un par
// heure, chacun ouvre /fr/p/34083555 — page publique 404. Constaté le 25/10 sur
// le compte de Nico : l'onglet « En cours de vérification » montre la carte SANS
// AUCUN lien ni bouton — Beebs n'offre aucun geste de suppression pendant la
// vérification. Le message disait « Beebs vérifie encore… le retrait part dès
// qu'elle se termine » : vrai, mais sans date, et l'essai horaire ne servait à
// rien.
// LA RÈGLE (update-job-status pose, get-pending-jobs sert) :
//   · au-delà de 72 h en vérification, le message est DATÉ et vrai (ni visible
//     ni achetable, aucun geste possible chez Beebs, FillSell la retire dès
//     qu'elle est en ligne — rien à faire) ;
//   · le retrait n'est alors servi que si la ligne du relevé de CETTE annonce a
//     changé depuis le dernier essai (statut, disparition, retrait) — sinon une
//     fois toutes les 12 h. Rien n'est jamais conclu ni clos ici : le retrait
//     reste en file tant que l'annonce existe.
// « Depuis » ne dit que ce qu'on sait VRAI : le dépôt FillSell de ce numéro
// jamais vu en ligne (une annonce déposée entre en vérification), sinon la
// première ligne du relevé qui la range « en vérification » ; le plus ancien
// des deux ; rien de sûr → pas de traitement « longue » (l'essai horaire reste).
// Pur, sans import réseau (Deno + Node).

export const VERIFICATION_LONGUE_MS = 72 * 3600_000;
export const RELECTURE_VERIFICATION_LONGUE_MS = 12 * 3600_000;

const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/**
 * Depuis quand (ISO) Beebs garde cette annonce en vérification, ou null.
 * @param {{ ligne?: { statut_plateforme?: string, created_at?: string } | null, depot?: { published_at?: string, created_at?: string, vu_en_ligne_le?: string|null } | null }} [p]
 */
export function debutVerificationBeebs({ ligne = null, depot = null } = {}) {
  if (depot?.vu_en_ligne_le) return null; // vue en ligne un jour : on ne sait plus depuis quand elle y est revenue
  const dates = [];
  const deposeLe = ms(depot?.published_at ?? depot?.created_at);
  if (Number.isFinite(deposeLe)) dates.push(deposeLe);
  if (String(ligne?.statut_plateforme ?? "") === "en_verification" && Number.isFinite(ms(ligne?.created_at))) dates.push(ms(ligne.created_at));
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null;
}

/** Plus de 72 h en vérification ? */
export function verificationLongue(depuis, maintenant = Date.now()) {
  const t = ms(depuis);
  return Number.isFinite(t) && maintenant - t > VERIFICATION_LONGUE_MS;
}

/** Ce qui, dans la ligne du relevé, dit que l'annonce a BOUGÉ (jamais vu_le : il change à chaque relevé). */
export function signatureAnnonceBeebs(ligne) {
  if (!ligne) return "absente";
  return [String(ligne.statut_plateforme ?? ""), String(ligne.disparu_le ?? ""), String(ligne.retiree_le ?? "")].join("|");
}

const jourFr = (t) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });

/** Le message vrai, daté, d'un retrait qu'une vérification de plus de 72 h retient. */
export function messageRetraitBeebsVerificationLongue(depuis) {
  return `Beebs garde cette annonce en vérification depuis le ${jourFr(depuis)} : elle n'est ni visible ni achetable, `
    + "et Beebs ne permet pas de la supprimer pendant la vérification. FillSell la retire dès que Beebs la met en ligne — rien à faire.";
}

/**
 * get-pending-jobs : ce retrait doit-il attendre (true) au lieu d'être servi ?
 * Seulement un retrait Beebs marqué « vérification longue » par update-job-status ; servi si la ligne du relevé
 * a changé depuis le dernier essai, ou si ce dernier essai a 12 h ou plus.
 * @param {any} job  cross_post_jobs (platform_fields.retrait_en_attente_verification)
 * @param {any} ligne la ligne annonces_plateforme la plus récente de ce numéro (ou null)
 */
export function retenirRetraitVerificationLongue(job, ligne, maintenant = Date.now()) {
  if (job?.platform !== "beebs" || job?.action !== "delete") return false;
  const a = job?.platform_fields?.retrait_en_attente_verification;
  if (!a || typeof a !== "object" || a.longue !== true) return false;
  if (!verificationLongue(a.en_verification_depuis, maintenant)) return false;
  if (String(a.signature ?? "") !== signatureAnnonceBeebs(ligne)) return false; // la ligne a bougé : on essaie
  const derniere = ms(a.derniere);
  return Number.isFinite(derniere) && maintenant - derniere < RELECTURE_VERIFICATION_LONGUE_MS;
}
