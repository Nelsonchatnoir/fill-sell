// ═══════════════════════════════════════════════════════════════════════════
// LA REPUBLICATION ARRÊTÉE SUR « LE PRIX MANQUE » REPART SEULE DÈS QU'UN PRIX EST SUR LA FICHE (07/11, famille 6a)
// ═══════════════════════════════════════════════════════════════════════════
// labrunettedu44 (d9a805cc), 28c40e78 « Coquillage nacré » : republication Leboncoin arrêtée le 02/11 AVANT tout retrait,
// « le prix manque dans la copie de ton annonce » — le pré-vol de l'extension a raison : ni la tâche ni la copie n'ont de
// prix (annonce de 2021 sans prix, relevé sans prix, fiche sans prix). get-pending-jobs reprend le prix de la FICHE au
// départ (« prix_repris_de_la_fiche », 07/11, point 7), mais une tâche needs_user n'est jamais servie : elle restait
// arrêtée même une fois le prix posé sur la fiche, et son message disait « relance » — un geste qui ne servait à rien
// tant que la fiche n'avait pas de prix.
//
// LA RÈGLE (handler-watch, bornée) — une republication needs_user dont le pré-vol n'a manqué QUE le prix
// (republish_prevol_manquants = ["le prix"]), sur une plateforme dont la recréation lit le prix de la tâche (Leboncoin,
// Beebs, Depop — jamais Vinted, qui recrée depuis la capture), sans prix sur la tâche :
//   · la fiche a un prix (> 0 ; Depop : ≥ 1, son minimum) → il est posé sur la tâche (même trace que get-pending-jobs :
//     prix_repris_de_la_fiche), la tâche repasse « pending » et repart seule — le pré-vol, avant tout retrait, rejuge ;
//   · sinon → le message VRAI, écrit UNE fois (jamais une ligne inchangée réécrite) : la plateforme exige un prix, ni la
//     copie ni la fiche n'en ont ; l'annonce est toujours en ligne ; la republication repartira seule dès qu'un prix est
//     sur la fiche.
// Fiche vendue, fusionnée, disparue ou illisible : rien (d'autres règles la tiennent).
// Pur (Deno + Node), sans import : scripts/prix-copie-republication-selftest.mjs.

export const PLATEFORMES_PRIX_DE_LA_TACHE = Object.freeze(["leboncoin", "beebs", "depop"]);
const NOMS = Object.freeze({ leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop" });
export const POSE_PAR_PRIX_COPIE = "handler-watch (republication arrêtée sur « le prix manque » : prix de la fiche)";

const nombre = (v) => {
  if (v == null || String(v).trim() === "") return NaN;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
};
/** Le prix minimum que la plateforme accepte à la recréation (même seuil que le pré-vol de l'extension). */
export const prixSuffisant = (platform, prix) => {
  const n = nombre(prix);
  return Number.isFinite(n) && (String(platform) === "depop" ? n >= 1 : n > 0);
};

/** La tâche relève-t-elle de la règle ? needs_user, republication, plateforme au prix de la tâche, seul « le prix » manque. */
export function estArretPrixCopie(job) {
  if (!job || job.status !== "needs_user" || String(job.action ?? "") !== "republish") return false;
  if (!PLATEFORMES_PRIX_DE_LA_TACHE.includes(String(job.platform ?? ""))) return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const m = Array.isArray(pf.republish_prevol_manquants) ? pf.republish_prevol_manquants.map((x) => String(x ?? "").trim()) : [];
  if (m.length !== 1 || m[0] !== "le prix") return false;
  return !prixSuffisant(job.platform, job.price);
}

/** Le message vrai quand ni la copie ni la fiche n'ont de prix. */
export function messagePrixAbsent(platform) {
  const nom = NOMS[String(platform ?? "")] ?? String(platform ?? "");
  return `Republication ${nom} en pause AVANT tout retrait : ${nom} exige un prix, et ni la copie de ton annonce ni la fiche de l'article n'en ont. ` +
    "Ton annonce est TOUJOURS en ligne, rien n'a été touché. Indique un prix sur la fiche de l'article : la republication repartira seule dès qu'il y est.";
}

/**
 * La décision pour une tâche arrêtée sur le prix.
 * @param {object} job  cross_post_jobs (status, action, platform, price, error, platform_fields)
 * @param {{ prix_vente?: unknown, statut?: unknown, quantite?: unknown, fusionne_dans?: unknown, disparu_le?: unknown } | null} fiche
 * @returns {null | { action: 'relancer', prix: number } | { action: 'message', message: string } | { action: 'rien', motif: string }}
 *   null : hors règle (ou fiche illisible / hors stock — rien n'est décidé ici).
 */
export function decisionPrixCopie(job, fiche) {
  if (!estArretPrixCopie(job)) return null;
  if (!fiche || typeof fiche !== "object") return null;
  if (fiche.fusionne_dans != null || fiche.disparu_le) return null;
  if (String(fiche.statut ?? "") === "vendu" || (fiche.quantite != null && String(fiche.quantite).trim() !== "" && Number(fiche.quantite) <= 0)) return null;
  if (prixSuffisant(job.platform, fiche.prix_vente)) return { action: "relancer", prix: nombre(fiche.prix_vente) };
  const message = messagePrixAbsent(job.platform);
  if (String(job.error ?? "") === message) return { action: "rien", motif: "message_deja_ecrit" };
  return { action: "message", message };
}

// Les marques d'un arrêt que la relance efface (même liste que les autres reprises de handler-watch).
const CLES_ARRET = ["needs_user_source", "needsUserField", "needsUserFields", "needs_user_tick_le", "needs_user_actif_ms",
  "needs_user_vu_le", "needs_user_vu_erreur", "needs_user_sans_motif", "next_action_after", "processing_since",
  "republish_prevol_manquants", "prix_absent_de_l_origine"];

/** Les platform_fields de la tâche relancée (l'archive de l'erreur est ajoutée par l'appelant). */
export function champsRelancePrixCopie(pf, prix, maintenant = new Date().toISOString()) {
  const out = { ...((pf && typeof pf === "object") ? pf : {}) };
  for (const k of CLES_ARRET) delete out[k];
  out.prix_repris_de_la_fiche = { avant: null, apres: prix, source: "fiche de l'article (aucun prix sur l'annonce ni la tâche)", le: maintenant, pose_par: POSE_PAR_PRIX_COPIE };
  return out;
}
