// ═══════════════════════════════════════════════════════════════════════════
// LA QUESTION « SOUS-CATÉGORIE » ATTEND LE MOTEUR AVANT DE PARTIR (25/10, audit N9)
// ═══════════════════════════════════════════════════════════════════════════
// Jobs 328c17f2 et 9de4f193 (compte 40e1122e, cartes Pokémon, 20-21/10) : Vinted a fait de « Cartes à
// collectionner » (4874) un niveau intermédiaire ; la feuille « Cartes à collectionner à l'unité » (4875)
// est dans l'arbre relevé, et le moteur (_shared/rayon-refuse-moteur.js) l'aurait choisie seul. Il n'a
// jamais tourné : handler-watch ne lit que les questions DÉJÀ posées (needs_user), toutes les 3 min, et la
// personne avait répondu avant (2 min). La règle, pour tous les comptes :
//   · update-job-status : une question « categoryLevelChoice » d'un job Vinted (publication, ou
//     republication à l'étape captured — rien n'est retiré) que le moteur sait juger (rayonRefuseDuJob) ne
//     part PAS tout de suite. Le job reste en file (pending), échéance +6 min (next_action_after : aucun
//     poste ne le reprend avant), la question mise de côté dans rayon_moteur_attendu ;
//   · handler-watch lit ces pauses : une feuille sûre → posée (pfApresRayon), le job repart aussitôt ; le
//     doute → la question part (les feuilles du moteur, sinon celle de l'extension telle quelle) ; IA
//     injoignable → nouvel essai au passage suivant jusqu'à l'échéance, puis la question part ;
//   · rien de tranché à l'échéance (handler-watch arrêté) : le poste rejoue le pré-vol, update-job-status
//     voit la pause déjà prise → la question part. UNE pause par job, jamais une boucle.
// ⛔ Jamais à l'étape « deleted » (l'annonce est hors ligne : la question part, comme avant), jamais après
//    une réponse de la personne, jamais quand le moteur est déjà passé sur ce job (rayon_moteur).
// Pur (Deno + Node).
import { rayonRefuseDuJob } from "./rayon-refuse-moteur.js";

export const ATTENTE_RAYON_MOTEUR_MIN = 6;
export const CLE_PAUSE_RAYON = "rayon_moteur_attendu";
const TICKS = ["needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"];
const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** Le message affiché pendant la pause (le job est en file, rien à faire). */
export function messagePauseRayonMoteur(action) {
  return action === "republish"
    ? "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted demande une catégorie plus précise : FillSell la choisit d'après ta fiche, rien à faire."
    : "Publication en attente : Vinted demande une catégorie plus précise. FillSell la choisit d'après ta fiche, rien à faire.";
}

/**
 * update-job-status, au needs_user rendu par l'extension. Rend :
 *   · null — la question part telle quelle (pas son cas) ;
 *   · { pause: true, pf, message, jusqu_a } — le job reste en file, la question mise de côté ;
 *   · { pause: false, pf } — la pause a déjà été prise : la question part, la pause est close (issue).
 * @param {{ platform?: string, action?: string, pfIn?: object|null, pfEnBase?: object|null, message?: string|null, maintenant?: Date }} p
 */
export function pauseRayonMoteur({ platform = "", action = "", pfIn = null, pfEnBase = null, message = null, maintenant = new Date() } = {}) {
  if (platform !== "vinted" || !["publish", "republish"].includes(action)) return null;
  const pf = objet(pfIn);
  const base = objet(pfEnBase) ?? {};
  const nf = objet(pf?.needsUserField);
  if (!pf || !nf || nf.field_key !== "categoryLevelChoice") return null;
  const att = objet(pf[CLE_PAUSE_RAYON]) ?? objet(base[CLE_PAUSE_RAYON]);
  if (att) {
    if (att.issue) return null;
    // Une ENTRÉE en needs_user ouvre un budget neuf (compteurs 72 h retirés, comme update-job-status le fait).
    const np = { ...pf, [CLE_PAUSE_RAYON]: { ...att, issue: "question_partie", partie_le: maintenant.toISOString() } };
    for (const k of TICKS) delete np[k];
    return { pause: false, pf: np };
  }
  if (action === "republish" && ((pf.republish_step ?? base.republish_step) !== "captured" || pf.deleted_at || base.deleted_at)) return null;
  if (objet(pf.rayon_moteur) || objet(base.rayon_moteur)) return null; // le moteur est déjà passé sur ce job
  if (String(pf.categoryLevelChoice ?? "").trim() || String(pf.needsUserResolved?.categoryLevelChoice ?? "").trim()) return null; // une réponse de la personne
  if (!rayonRefuseDuJob({ platform, action, status: "needs_user", platform_fields: pf })) return null;
  const jusquA = new Date(maintenant.getTime() + ATTENTE_RAYON_MOTEUR_MIN * 60_000).toISOString();
  const np = { ...pf };
  for (const k of ["needsUserField", "needsUserFields", "champs_a_completer", "needs_user_source", ...TICKS, "processing_since"]) delete np[k];
  // La pause n'est pas une tentative : le compteur reste celui de la base.
  np.needsUserAttempts = Number(base.needsUserAttempts ?? pf.needsUserAttempts ?? 0) || 0;
  np.next_action_after = jusquA;
  np[CLE_PAUSE_RAYON] = {
    le: maintenant.toISOString(), jusqu_a: jusquA, question: nf,
    champs_a_completer: Array.isArray(pf.champs_a_completer) ? pf.champs_a_completer : null,
    needs_user_source: pf.needs_user_source ?? null,
    message: typeof message === "string" ? message.slice(0, 600) : null,
    pose_par: "update-job-status (question « sous-catégorie » mise de côté pour le moteur)",
  };
  return { pause: true, pf: np, message: messagePauseRayonMoteur(action), jusqu_a: jusquA };
}

/**
 * handler-watch : une pause encore ouverte → le job vu comme sa question (pour rayonRefuseDuJob,
 * resoudreRayonRefuse, pfApresRayon), la pause, et si son échéance est passée. null = pas une pause à juger.
 */
export function jobDeLaPauseRayon(job, maintenantMs = Date.now()) {
  if (!job || job.platform !== "vinted" || job.status !== "pending" || !["publish", "republish"].includes(job.action)) return null;
  const pf = objet(job.platform_fields);
  const att = objet(pf?.[CLE_PAUSE_RAYON]);
  if (!pf || !att || att.issue || !objet(att.question)) return null;
  // La pause est la SIENNE : son échéance est toujours celle du job (sinon le job a vécu depuis — rien à juger).
  if (String(pf.next_action_after ?? "") !== String(att.jusqu_a ?? "")) return null;
  if (job.action === "republish" && (pf.republish_step !== "captured" || pf.deleted_at)) return null;
  if (String(pf.categoryLevelChoice ?? "").trim()) return null;
  const jq = {
    ...job, status: "needs_user",
    platform_fields: {
      ...pf, needsUserField: att.question,
      ...(Array.isArray(att.champs_a_completer) ? { champs_a_completer: att.champs_a_completer } : {}),
      ...(att.needs_user_source ? { needs_user_source: att.needs_user_source } : {}),
    },
  };
  const t = Date.parse(String(att.jusqu_a ?? ""));
  return { jq, att, echue: !Number.isFinite(t) || t <= maintenantMs };
}

/**
 * handler-watch : la question part (doute du moteur, échéance passée). `question` = celle du moteur (des
 * feuilles), sinon celle de l'extension mise de côté ; `message` = celui du moteur, sinon celui de l'extension.
 * @param {any} job
 * @param {Record<string, any>} att
 * @param {{ question?: Record<string, any> | null, message?: string | null, rayonMoteur?: Record<string, any> | null, maintenant?: Date }} [o]
 * @returns {{ pf: Record<string, any>, message: string | null }}
 */
export function pfQuestionApresPause(job, att, { question = null, message = null, rayonMoteur = null, maintenant = new Date() } = {}) {
  const pf = { ...(objet(job?.platform_fields) ?? {}) };
  delete pf.next_action_after;
  pf.needsUserField = question ?? att.question;
  if (question) {
    pf.champs_a_completer = [String(question.field_label ?? "Catégorie Vinted")];
    pf.needs_user_source = "champ_a_choisir";
    delete pf.categoryLevelChoice;
  } else {
    if (Array.isArray(att.champs_a_completer)) pf.champs_a_completer = att.champs_a_completer;
    pf.needs_user_source = att.needs_user_source ?? "prevol_negatif";
  }
  if (rayonMoteur) pf.rayon_moteur = rayonMoteur;
  pf[CLE_PAUSE_RAYON] = { ...att, issue: question ? "question_du_moteur" : "question_partie", partie_le: maintenant.toISOString() };
  return { pf, message: message ?? att.message ?? null };
}

/** L'entrée du moteur pour un job (même lecture que le balayage des questions posées, handler-watch). */
export function entreeMoteurDuJob(job, plan, fiche) {
  const pf = objet(job?.platform_fields) ?? {};
  const attrs = objet(fiche?.attributs) ?? {};
  const valeur = (x) => (x && typeof x === "object" ? x.v : x);
  const snap = objet(pf.republish_snapshot) ?? {};
  return {
    plateforme: plan.plateforme, base: plan.base, enfantsVivants: plan.enfantsVivants ?? null, exclure: plan.exclure ?? null,
    titre: String(job?.title || fiche?.titre || snap.titre || ""),
    description: String(job?.description || fiche?.description || snap.description || "").slice(0, 400),
    objet: String(pf.categorie_objet_ia ?? valeur(attrs.objet) ?? ""),
    marque: String(pf.marque ?? valeur(attrs.marque) ?? snap.marque ?? ""),
    genre: String(pf.genre ?? valeur(attrs.genre) ?? ""),
    taille: String(pf.taille ?? valeur(attrs.taille) ?? snap.taille ?? ""),
    user_id: String(job?.user_id ?? ""),
  };
}
