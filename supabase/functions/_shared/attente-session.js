// ── L'ATTENTE DE SESSION S'ESPACE (2026-09-24, Deborah / geronimo0550) ───────
// Un job dont la plateforme demande une connexion reste `pending`, sans
// consommer de tentative, et re-sonde la page. Jusqu'ici : toutes les heures,
// indéfiniment — 101 passages sur beebs.app chez Deborah depuis le 17/09, une
// page chargée jour et nuit pour une session que personne n'a rouverte.
// Barème : 1 h pour les trois premières observations, 3 h de la 4e à la 6e,
// 6 h ensuite. Jamais abandonné, jamais rouge : la levée se fait sur preuve
// (sonde « connecté » postérieure — handler-watch ; compte vu sur la page —
// extension 0.6.66).
// ── (2026-09-27, point 19 — faux « déconnecté ») QUELQUES MINUTES D'ABORD ──
// Louis : trois dépôts Vinted repoussés d'une heure à chaque essai alors que sa
// session était bonne. Barème : 3, 6, 10 min pour les trois premières
// observations, puis 1 h (4e-6e), 3 h (7e-9e), 6 h ensuite. Une vraie
// déconnexion reste affichée dès la première observation ; seule la cadence
// des premiers essais change. Et une preuve de session bonne (sonde, relevé)
// relance tout de suite (relancer_jobs_connexion, déclencheurs en base).
// ⚠️ chrome-extension/background.js (delaiAttenteSessionMin) porte encore
//    l'ancien barème : update-job-status réécrit l'échéance à chaque
//    observation, et get-pending-jobs tient celui-ci.
export const ATTENTE_SESSION_RE = /^En attente de ta connexion à /i;

export function delaiAttenteSessionMin(observations) {
  const n = Number(observations) || 0;
  if (n <= 1) return 3;
  if (n === 2) return 6;
  if (n === 3) return 10;
  return n >= 10 ? 360 : n >= 7 ? 180 : 60;
}

/**
 * Le job doit-il encore attendre (échéance espacée pas atteinte) ?
 * `sessions` = profiles.extension_sessions. Une preuve « connecté » pour la
 * plateforme, POSTÉRIEURE à la dernière observation d'attente, lève tout.
 */
export function attenteSessionEncoreEspacee(job, sessions, maintenant = Date.now()) {
  const pf = (job?.platform_fields ?? {});
  const att = pf.attente_session;
  if (!att || typeof att !== "object") return false;
  if (!ATTENTE_SESSION_RE.test(String(job?.error ?? ""))) return false;
  const derniere = Date.parse(String(att.derniere ?? att.depuis ?? ""));
  if (!Number.isFinite(derniere)) return false;
  const s = sessions && typeof sessions === "object" ? sessions : {};
  if (s[job.platform] === true) {
    const brut = (s.checked_at_par_plateforme ?? {})[job.platform] ?? s.checked_at ?? null;
    const vu = brut ? Date.parse(String(brut)) : NaN;
    if (Number.isFinite(vu) && vu > derniere) return false;
  }
  return maintenant < derniere + delaiAttenteSessionMin(att.observations) * 60_000;
}
