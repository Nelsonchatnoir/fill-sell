// ══════════════════════════════════════════════════════════════════════════
// LEBONCOIN N'OFFRE PLUS QUE « VALIDER ET PAYER » À UN COMPTE PRO : UNE CARTE
// PAR COMPTE, UN ÉCLAIREUR, PLUS AUCUN ENVOI SUR LE MÊME MUR (17/10)
// ══════════════════════════════════════════════════════════════════════════
// DeadRoz, 14/10 : son compte Leboncoin est devenu PRO (formulaire pro :
// « Vos conditions générales de vente », « Référence », « Type d'article
// neuf », « Poids du colis »). Hors forfait, l'écran /deposer-une-annonce/options
// n'offre plus que « Voir détail » et « Valider et payer » (états du bundle
// Leboncoin relevés le 21/09 : out_of_bundle, out_of_subscription_quota_*).
// En une nuit, 26 dépôts ont buté sur ce mur et 5 sont passés, intercalés,
// avec les mêmes 10 photos : ni le pack photos ni l'annonce, le COMPTE.
// FillSell continuait d'envoyer (chaque essai, un dépôt inachevé chez
// Leboncoin) et 12 murs gardaient le motif « champ à choisir » d'une question
// déjà répondue.
//
// LA RÈGLE (une seule source, lue par l'app ET le serveur) :
//   · le mur est nommé par l'extension : last_diagnostic.quoi EXACTEMENT
//     `lbc_options_payant_seulement` (leboncoin.js, attenteMotif) — jamais un
//     mot pris dans le message ; il n'hérite jamais d'une question passée
//     (update-job-status, toutes versions d'extension) ;
//   · un compte est PRO quand l'un de ses jobs Leboncoin porte un champ du SEUL
//     formulaire pro (`general_sales_condition`, `custom_ref` — preuve de la
//     porte pro de get-pending-jobs : 18/18 pro, 0/7 particuliers), dans son
//     erreur ou ses erreurs archivées. Un particulier n'entre JAMAIS ici : son
//     mur payant est le pack photos, il se règle annonce par annonce ;
//   · compte prouvé pro + mur VU depuis moins de 30 j + aucune publication
//     Leboncoin du compte passée depuis ce mur : get-pending-jobs ne sert plus
//     ses publications, ni ses republications pas encore retirées (elles
//     retireraient l'annonce en ligne sans pouvoir la redéposer) — elles
//     passent en attente (needs_user, motif du mur, « retenue avant essai »,
//     forfait_lbc.retenue_le, aucune tentative consommée). Une retenue ne
//     compte JAMAIS comme un mur vu ;
//   · l'app les rassemble en UNE carte par compte (« À régler ») ;
//   · reprise : UN éclaireur à la fois — la plus ancienne PUBLICATION en
//     attente, jamais une republication —, sur le « C'est fait » de la carte ou
//     tout seul au plus une fois toutes les 12 h (handler-watch, poste vu
//     < 24 h). Dès qu'une publication Leboncoin du compte passe après le
//     dernier mur vu (l'éclaireur, ou une autre), toutes les attentes repartent,
//     espacées de 45 s ; sinon l'éclaireur revient au mur et rien d'autre ne
//     part. Jamais soldées à 72 h tant qu'elles ont moins de 30 j.
// Pur (Deno + Node + Vite), sans import. Jumeau de lbc-identite.js.

export const MOTIF_LBC_PAYANT = "lbc_options_payant_seulement";
export const ECLAIREUR_FORFAIT_INTERVALLE_MS = 12 * 3_600_000;
export const ESPACEMENT_REPRISE_FORFAIT_MS = 45_000;
export const FENETRE_FORFAIT_MS = 30 * 86_400_000;
export const URL_LEBONCOIN = "https://www.leboncoin.fr/";

/** Les champs que seul le formulaire d'un compte PRO porte (relevés du 10/09). */
export const PREUVE_PRO_RE = /general_sales_condition|custom_ref/;
/** Le même relevé en filtre PostgREST (erreur courante ou archivée d'un job). */
export const FILTRE_PREUVE_PRO =
  "error.ilike.*general_sales_condition*,error.ilike.*custom_ref*," +
  "platform_fields->>erreurs_archivees.ilike.*general_sales_condition*,platform_fields->>erreurs_archivees.ilike.*custom_ref*";
/** « Mise à jour de ligne d'adressage requise » : un geste de COMPTE que Leboncoin réclame sur son écran (14/10). */
export const ADRESSAGE_RE = /ligne d[’']adressage/i;
/** Les marqueurs d'une question passée : un mur de paiement n'en garde aucun. */
export const MARQUEURS_QUESTION_PASSEE = Object.freeze([
  "needsUserField", "needsUserFields", "champs_a_completer", "server_required_fields", "serverRequired", "needsUserBoucle",
]);

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : 0; };

/** Le motif posé par l'extension sur cette tâche (last_diagnostic.quoi), ou null. */
export function motifDiagnostic(job) {
  const d = pfDe(job).last_diagnostic;
  return d && typeof d === "object" ? String(d.quoi ?? "") || null : null;
}

/** Ce job Leboncoin prouve-t-il que son compte est PRO (erreur courante ou archivée) ? */
export function jobProuvePro(job) {
  if (!job || job.platform !== "leboncoin") return false;
  if (PREUVE_PRO_RE.test(String(job.error ?? ""))) return true;
  const arch = pfDe(job).erreurs_archivees;
  return Array.isArray(arch) && arch.length > 0 && PREUVE_PRO_RE.test(JSON.stringify(arch));
}

/** Le compte est-il prouvé PRO par l'un de ses jobs Leboncoin ? */
export function compteProuvePro(jobs) {
  return (Array.isArray(jobs) ? jobs : []).some(jobProuvePro);
}

/** Le mur VU par l'extension sur ce job (sa date, en ms) — 0 pour une retenue avant essai ou un autre motif. */
export function murVuLe(job) {
  if (motifDiagnostic(job) !== MOTIF_LBC_PAYANT) return 0;
  const d = pfDe(job).last_diagnostic;
  if (d && d.retenue_avant_essai === true) return 0;
  return ms(d && d.at);
}

/** Le dernier mur VU parmi ces jobs (ms), 0 s'il n'y en a aucun. */
export function dernierMurForfait(jobs) {
  return (Array.isArray(jobs) ? jobs : []).reduce((m, j) => Math.max(m, murVuLe(j)), 0);
}

/** Une publication Leboncoin est-elle passée après ce mur ? (la preuve que le forfait couvre de nouveau les dépôts) */
export function publicationApresMur(publications, mur) {
  return (Array.isArray(publications) ? publications : [])
    .some((p) => String(p?.status ?? "") === "published" && ms(p?.published_at) > mur);
}

/** Cette tâche attend-elle que le compte PRO retrouve un dépôt sans paiement ? */
export function attendForfaitLbc(job, comptePro) {
  if (!comptePro || !job || job.platform !== "leboncoin" || job.status !== "needs_user") return false;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return false;
  const pf = pfDe(job);
  if (pf.needsUserField || pf.needsUserFields) return false; // une vraie question de champ garde sa ligne
  if (job.action === "republish" && pf.republish_step === "deleted") return false; // recréation : son propre circuit
  return motifDiagnostic(job) === MOTIF_LBC_PAYANT;
}

/** Les tâches d'un compte qui attendent ce geste, la plus ancienne d'abord. */
export function attentesForfaitLbc(jobs, comptePro) {
  return (Array.isArray(jobs) ? jobs : []).filter((j) => attendForfaitLbc(j, comptePro))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));
}

/** Un job que get-pending-jobs retient avant tout essai quand le compte est au mur. */
export function candidatRetenueForfait(job) {
  if (!job || job.platform !== "leboncoin") return false;
  const action = String(job.action ?? "publish");
  if (action === "publish") return true;
  return action === "republish" && pfDe(job).republish_step !== "deleted";
}

/** L'éclaireur relancé APRÈS le dernier mur vu (une publication seulement). */
export function estEclaireurForfait(job, mur) {
  if (String(job?.action ?? "publish") !== "publish") return false;
  const e = ms(pfDe(job).forfait_lbc?.eclaireur_le);
  return e > 0 && e > mur;
}

/** Le partage d'un poll : au plus UN éclaireur servi, toutes les autres retenues. */
export function partagerCandidatsForfait(candidats, mur) {
  const servis = [];
  const retenus = [];
  for (const j of Array.isArray(candidats) ? candidats : []) {
    if (!servis.length && estEclaireurForfait(j, mur)) servis.push(j);
    else retenus.push(j);
  }
  return { servis, retenus };
}

/** L'éclaireur à relancer : la plus ancienne PUBLICATION en attente, sauf si un essai a eu lieu il y a moins de `intervalle`. */
export function eclaireurForfaitLbc(jobs, comptePro, maintenant = Date.now(), intervalle = ECLAIREUR_FORFAIT_INTERVALLE_MS, dernierLance = 0) {
  const l = attentesForfaitLbc(jobs, comptePro).filter((j) => String(j.action ?? "publish") === "publish");
  if (!l.length) return null;
  const dernier = l.reduce((m, j) => Math.max(m, ms(pfDe(j).forfait_lbc?.eclaireur_le)), Number(dernierLance) || 0);
  if (dernier && maintenant - dernier < intervalle) return null;
  return l[0];
}

/** Les platform_fields d'une tâche retenue avant tout essai (get-pending-jobs). */
export function champsRetenueForfait(pf, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of MARQUEURS_QUESTION_PASSEE) delete out[k];
  delete out.processing_since;
  out.needs_user_source = "relancer";
  out.last_diagnostic = {
    quoi: MOTIF_LBC_PAYANT, at: maintenantIso, retenue_avant_essai: true,
    detail: "retenue avant tout essai : le compte Leboncoin (pro) est au mur du paiement",
  };
  out.forfait_lbc = { ...(out.forfait_lbc ?? {}), retenue_le: maintenantIso };
  return out;
}

/** Les platform_fields de l'éclaireur relancé (geste de la carte ou passage serveur). */
export function champsEclaireurForfait(pf, par, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
    "next_action_after", "processing_since"]) delete out[k];
  out.needsUserAttempts = 0;
  out.forfait_lbc = { ...(out.forfait_lbc ?? {}), eclaireur_le: maintenantIso, par, n: (Number(out.forfait_lbc?.n) || 0) + 1 };
  return out;
}

/** Les platform_fields d'une tâche relâchée quand une publication est passée (rang k : 45 s × k). */
export function champsRepriseForfait(pf, k, maintenantMs) {
  const out = { ...(pf ?? {}) };
  for (const c of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "processing_since"]) delete out[c];
  out.needsUserAttempts = 0;
  out.next_action_after = new Date(maintenantMs + k * ESPACEMENT_REPRISE_FORFAIT_MS).toISOString();
  out.forfait_lbc = { ...(out.forfait_lbc ?? {}), reprise_le: new Date(maintenantMs).toISOString(), par: "publication_passee" };
  return out;
}

/** Un mur de ce compte porte-t-il la demande de « ligne d'adressage » ? */
export function adressageDemande(jobs) {
  return (Array.isArray(jobs) ? jobs : []).some((j) => ADRESSAGE_RE.test(String(j?.error ?? "")));
}

/** Le message d'une tâche retenue avant tout essai (aucune durée, aucun mot technique). */
export const MSG_FORFAIT_LBC_RETENUE =
  "Pas encore envoyée : ton compte Leboncoin est un compte pro, et hors forfait Leboncoin fait payer chaque nouvelle annonce " +
  "(son dernier écran n'offre plus que « Valider et payer »). FillSell ne paie jamais à ta place et n'envoie plus rien sur ce mur : " +
  "vérifie ton forfait dans ton espace pro Leboncoin, puis appuie sur « C'est fait » dans « À régler ».";
