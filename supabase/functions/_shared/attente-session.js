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

// ── (06/11, Nico, point 10 — Guillaume JEHLY, 122 republications Leboncoin muettes) UNE TÂCHE RETENUE PAR UNE
// DÉCONNEXION PORTE LE MESSAGE, TOUJOURS ─────────────────────────────────────────────────────────────────────────────
// get-pending-jobs retient (« session plateforme connue morte ») les tâches d'une plateforme dont la session est vue
// morte — « pending, intactes, aucune écriture » : rien ne le disait sur la tâche, et l'alerte de compte de l'app
// s'efface dès que la sonde a plus de 3 h (utils/sessionsPlateformes, fraîcheur) alors que la retenue continue. Résultat :
// des tâches à l'arrêt depuis la veille, sans un mot. LA RÈGLE : une tâche retenue pour cette cause reçoit le message et
// le marqueur de l'attente de session de l'extension (même ancre « En attente de ta connexion à », attente_session) —
// l'app le montre sur l'article, et handler-watch l'efface seul dès que la session est revue connectée. Une tâche qui le
// porte déjà n'est jamais réécrite. Pur (Deno + Node).
const LABELS_SESSION = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", depop: "Depop", opla: "Opla" };
export const ATTENTE_SESSION_POSE_PAR_SERVEUR = "get-pending-jobs (session connue morte)";
// (07/11 soir, Goulvenk) La pause Leboncoin dont la visite de contrôle a vu la page de connexion (_shared/blocage-leboncoin.js,
// blocageSessionFermee) : même message, même marqueur — l'app dit « À toi de jouer : connecte-toi à Leboncoin sur ton
// ordinateur ». Ce marqueur-ci n'est PAS levé par handler-watch sur une simple sonde : seule la levée de la pause (visite
// passée, relevé ou dépôt réussi) le retire (get-pending-jobs).
export const ATTENTE_SESSION_POSE_PAR_PAUSE_LBC = "get-pending-jobs (pause Leboncoin : session fermée)";
/** Le marqueur posé par la pause Leboncoin sur une session fermée ? */
export function attentePoseeParLaPauseLbc(pf) {
  const att = pf && typeof pf === "object" ? pf.attente_session : null;
  return !!att && typeof att === "object" && att.pose_par === ATTENTE_SESSION_POSE_PAR_PAUSE_LBC;
}

/**
 * L'attente posée par le serveur (sans échéance) ? handler-watch la lève comme celle de l'extension dès que la sonde revoit
 * la session connectée — sans quoi les tâches qui attendent leur créneau après la reconnexion garderaient le message.
 */
export function attentePoseeParLeServeur(pf) {
  const att = pf && typeof pf === "object" ? pf.attente_session : null;
  return !!att && typeof att === "object" && att.pose_par === ATTENTE_SESSION_POSE_PAR_SERVEUR;
}

/**
 * Le message et les champs d'une tâche retenue par une session connue morte, ou null (déjà marquée : rien à écrire).
 * @param {{ action?: string, platform?: string, error?: string|null, platform_fields?: Record<string, unknown>|null }} job
 * @param {{ observeeLe?: string|null, navigateur?: string|null, maintenantIso?: string, posePar?: string, motif?: string }} [o]
 */
export function attenteSessionServeur(job, { observeeLe = null, navigateur = null, maintenantIso = new Date().toISOString(),
  posePar = ATTENTE_SESSION_POSE_PAR_SERVEUR, motif = "session connue morte (relevée par l'extension) — tâche retenue par le serveur" } = {}) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (ATTENTE_SESSION_RE.test(String(job?.error ?? "")) && pf.attente_session && typeof pf.attente_session === "object") return null;
  const pfm = String(job?.platform ?? "");
  const label = LABELS_SESSION[pfm] ?? pfm;
  const nav = String(navigateur ?? "").trim() || "ton navigateur";
  const quoi = job?.action === "delete" ? "le retrait de l'annonce" : job?.action === "republish" ? "la republication" : "la publication";
  const error = job?.action === "delete"
    ? `En attente de ta connexion à ${label} dans ${nav} : ton article est vendu mais son annonce est encore en ligne sur ` +
      `${label} (risque de double vente). Connecte-toi à ${label} sur ton ordinateur : le retrait repartira tout seul.`
    : `En attente de ta connexion à ${label} dans ${nav} : ${label} est déconnecté sur ton ordinateur. Connecte-toi à ` +
      `${label} : ${quoi} repartira toute seule. Aucune tentative consommée.`;
  const prec = pf.attente_session && typeof pf.attente_session === "object" ? pf.attente_session : null;
  return {
    error,
    platform_fields: {
      ...pf,
      attente_session: {
        platform: pfm,
        depuis: typeof prec?.depuis === "string" ? prec.depuis : (observeeLe ?? maintenantIso),
        observations: Number(prec?.observations) || 0,
        derniere: maintenantIso,
        motif,
        pose_par: posePar,
      },
    },
  };
}
