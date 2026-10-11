// ═══════════════════════════════════════════════════════════════════════════
// « INTROUVABLE » SOUS UNE IDENTITÉ ILLISIBLE : UNE ATTENTE DE BOUTIQUE (11/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Rémi (3 boutiques Vinted) : 10 republications de @celineetmarie en pause
// « introuvable_indetermine » le 07/10 et le 11/10, alors que leurs annonces
// étaient EN LIGNE (relevé complet du 10/10, vues en ligne, aucune vente).
// Chrome était sur @narema75 ; la sonde users/current rendait 403, donc
// l'identité était illisible : le serveur a servi, l'extension a capturé sous
// la mauvaise boutique, Vinted a répondu 404 (l'adresse d'édition ne connaît
// que les annonces de la boutique connectée), et au 5ᵉ 404 la tâche est
// passée en pause — sans aucune levée automatique (seule « boutique_etrangere »
// en avait une).
//
// Règle : une pause « introuvable » posée À LA CAPTURE (rien n'a été retiré),
// sous une identité illisible ou une autre boutique, pour un article dont la
// boutique est CONNUE, se lève toute seule dès que la bonne boutique est vue
// connectée (sonde, relevé du dressing ou capture — _shared/boutique-
// connectee.js, moins de 30 min). Jamais avant, jamais sur une autre. Au plus
// DEUX levées par tâche (jamais une boucle) ; une annonce vraiment disparue
// reste jugée par les deux relevés complets (get-pending-jobs) ou par la
// capture sous la BONNE boutique (extension).
// ES module sans import (Deno + node). Pur : scripts/files-repartent-selftest.mjs.
// ═══════════════════════════════════════════════════════════════════════════

export const LEVEES_INTROUVABLE_MAX = 2;
const VERDICTS_LEVABLES = new Set(["identite_inconnue", "mauvaise_boutique"]);

/**
 * La boutique d'origine de l'article, telle que la pause l'a notée
 * (introuvable_404.boutique_article), sinon celle de la fiche.
 */
export function boutiqueDeLaPause(pf, boutiqueFiche = null) {
  const p = pf && typeof pf === "object" ? pf : {};
  const i404 = p.introuvable_404 && typeof p.introuvable_404 === "object" ? p.introuvable_404 : {};
  const b = String(i404.boutique_article ?? boutiqueFiche ?? "").trim();
  return b || null;
}

/**
 * Faut-il lever cette pause maintenant ?
 * @param {{ status?: string, action?: string, platform?: string, platform_fields?: Record<string, any> }} job
 * @param {{ userId?: string, fraiche?: boolean, source?: string } | null} identite  boutique vue connectée
 * @param {string | null} [boutiqueFiche]  inventaire.vinted_account_id
 * @returns {{ lever: false, raison: string } | { lever: true, boutique: string }}
 */
export function leverPauseIntrouvable(job, identite, boutiqueFiche = null) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (job?.status !== "needs_user" || job?.platform !== "vinted" || job?.action !== "republish") return { lever: false, raison: "hors_perimetre" };
  if (String(pf.needs_user_source ?? "") !== "introuvable_indetermine") return { lever: false, raison: "autre_pause" };
  // Rien n'a été retiré : seulement à la capture.
  if (String(pf.republish_step ?? "") !== "a_capturer" || pf.deleted_at) return { lever: false, raison: "pas_a_la_capture" };
  const i404 = pf.introuvable_404 && typeof pf.introuvable_404 === "object" ? pf.introuvable_404 : {};
  const ind = pf.introuvable_indetermine && typeof pf.introuvable_indetermine === "object" ? pf.introuvable_indetermine : {};
  const verdict = String(i404.verdict ?? ind.verdict ?? "");
  if (!VERDICTS_LEVABLES.has(verdict)) return { lever: false, raison: "verdict_non_levable" };
  const deja = Number(pf.introuvable_leve?.n ?? 0);
  if (deja >= LEVEES_INTROUVABLE_MAX) return { lever: false, raison: "deja_levee" };
  const boutique = boutiqueDeLaPause(pf, boutiqueFiche);
  if (!boutique) return { lever: false, raison: "boutique_inconnue" };
  if (!identite || !identite.fraiche || String(identite.userId ?? "") !== boutique) return { lever: false, raison: "bonne_boutique_pas_vue" };
  return { lever: true, boutique };
}

/** Les champs de la tâche après la levée (pending, compteurs remis à zéro, trace). */
export function champsApresLevee(pf, boutique, identite, maintenant = new Date()) {
  const suite = { ...(pf ?? {}) };
  const avant = Number(suite.introuvable_leve?.n ?? 0);
  suite.introuvable_leve = {
    n: avant + 1,
    le: maintenant.toISOString(),
    boutique,
    vue_par: identite?.source ?? null,
    verdict_leve: String(suite.introuvable_404?.verdict ?? suite.introuvable_indetermine?.verdict ?? ""),
    pose_par: "get-pending-jobs (_shared/introuvable-boutique.js)",
  };
  delete suite.needs_user_source;
  delete suite.introuvable_indetermine;
  delete suite.introuvable_404;
  delete suite.next_action_after;
  delete suite.needs_user_vu_erreur;
  delete suite.needs_user_vu_le;
  return suite;
}
