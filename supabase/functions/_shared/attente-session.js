// ── L'ATTENTE DE SESSION S'ESPACE (2026-09-24, Deborah / geronimo0550) ───────
// Un job dont la plateforme demande une connexion reste `pending`, sans
// consommer de tentative, et re-sonde la page. Jusqu'ici : toutes les heures,
// indéfiniment — 101 passages sur beebs.app chez Deborah depuis le 17/09, une
// page chargée jour et nuit pour une session que personne n'a rouverte.
// Barème : 1 h pour les trois premières observations, 3 h de la 4e à la 6e,
// 6 h ensuite. Jamais abandonné, jamais rouge : la levée se fait sur preuve
// (sonde « connecté » postérieure — handler-watch ; compte vu sur la page —
// extension 0.6.66).
// ⛔ MÊME barème dans chrome-extension/background.js (delaiAttenteSessionMin).
export const ATTENTE_SESSION_RE = /^En attente de ta connexion à /i;

export function delaiAttenteSessionMin(observations) {
  const n = Number(observations) || 0;
  return n >= 7 ? 360 : n >= 4 ? 180 : 60;
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
