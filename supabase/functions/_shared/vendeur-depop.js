// ══════════════════════════════════════════════════════════════════════════
// DEPOP DEMANDE DE TERMINER LA CONFIGURATION DE VENDEUR : UNE CARTE PAR
// COMPTE, UNE REPRISE SEULE (17/10, Nico)
// ══════════════════════════════════════════════════════════════════════════
// Romain (8 publications, 13/10), Héloïse (5, 16/10), Thibault (39, 15 et
// 16/10) : tant qu'aucun moyen de paiement n'est relié, Depop répond
// canSell = false (GET /api/v1/sellerOnboarding/sellerStatus/,
// content-scripts/depop.js). Chaque publication servie tapait le même mur,
// chacune devenait une ligne « relance la publication » (37 relances à la main
// chez Thibault le 16/10), et rien ne repartait seul une fois la configuration
// faite (deux publications de Thibault arrêtées le lendemain). C'est UN geste
// sur le COMPTE, pas un par article — même patron que _shared/lbc-identite.js
// (Leboncoin, nom et prénom).
//
// LA RÈGLE (une seule source, lue par l'app ET le serveur) :
//   · une tâche attend ce geste ⇔ Depop, publication ou republication,
//     needs_user, sans question de champ, et : soit le motif posé par
//     l'extension est EXACTEMENT `depop_vendeur_a_configurer`
//     (attenteMotif → platform_fields.last_diagnostic.quoi — le mur VU), soit
//     la source est `depop_vendeur` (nommée par update-job-status, ou posée par
//     get-pending-jobs sur une publication RETENUE) ;
//   · tant qu'il en existe une, get-pending-jobs ne sert AUCUNE publication ni
//     republication Depop du compte : elle passe en attente du même geste
//     (`vendeur_depop.retenue_le` — une retenue n'est jamais un mur VU), sauf
//     l'éclaireur ; les retraits ne sont jamais retenus ;
//   · l'app les rassemble en UNE carte par compte (« À régler ») ;
//   · reprise SANS geste par article : une preuve que le compte vend — une
//     publication Depop qui a passé le contrôle vendeur depuis le dernier mur
//     VU, ou la sonde de l'extension (canSell) — relâche toutes les tâches,
//     espacées de 45 s ; sinon UN éclaireur (la plus ancienne) repart, sur le
//     « C'est fait » de la carte ou tout seul au barème (handler-watch, poste
//     vu récemment) ; s'il revient au même mur, rien d'autre ne part.
// L'annonce n'est jamais touchée : le contrôle vendeur précède les photos, la
// création et, en republication, tout retrait.
// Pur (Deno + Node + Vite), sans import.

export const MOTIF_VENDEUR_DEPOP = "depop_vendeur_a_configurer";
export const SOURCE_VENDEUR_DEPOP = "depop_vendeur";
// Écart entre deux éclaireurs (minutes), selon le nombre déjà lancés pour le compte.
export const DELAIS_ECLAIREUR_MIN = Object.freeze([15, 30, 60, 60, 180, 180, 360]);
// (05/11 17:25, décision de Nico) Plus aucun espacement après la levée d'une pause : rythme normal (était 45 s par tâche).
export const ESPACEMENT_REPRISE_MS = 0;
export const FENETRE_VENDEUR_DEPOP_MS = 30 * 86_400_000;
// Un éclaireur relancé (geste, relance, handler-watch) reste servi malgré le mur pendant ce délai.
export const ECLAIREUR_FRAIS_MS = 30 * 60_000;
// handler-watch ne lance un éclaireur qu'à un poste vu récemment.
export const POSTE_RECENT_MS = 30 * 60_000;
export const URL_DEPOP = "https://www.depop.com/";

// Le message du compte : le même partout (extension, update-job-status,
// get-pending-jobs, l'app) — selftest:depop-vendeur-mur.
export const MESSAGE_VENDEUR_DEPOP =
  "Depop demande de terminer ta configuration de vendeur (ajouter un moyen de paiement) avant ta première mise en ligne. " +
  "Fais-le une seule fois sur depop.com, sur ton ordinateur : tes publications Depop repartiront toutes seules. Rien n'a été publié ni retiré.";

// ── (04/11, christophe.lanoux30) DEPOP REFUSE LA CRÉATION TANT QUE PAYPAL N'EST PAS RELIÉ ──────────────────────────
// Depop répond HTTP 400, code 1216 (« È necessario collegare un account PayPal prima di poter pubblicare questa
// inserzione. » — en italien chez tous les comptes) APRÈS les photos, alors que canSell vaut true. Le connecteur le
// rendait comme un échec inconnu : trois reprises de 15 min par tâche, et l'essai arrêté à l'étape « creation »
// passait pour la preuve que le compte vend → toutes les publications retenues du compte repartaient, montaient
// leurs photos et reprenaient le même refus. 60 jours en base : 6 tâches, 3 comptes, aucun autre refus de création.
// Règle : un refus de création Depop qui demande un geste sur le COMPTE (CODES_GESTE_COMPTE_DEPOP, ou le mot PayPal)
// est le même mur que la configuration vendeur — needs_user, une carte, aucune reprise, un éclaireur au barème —
// avec son propre message. Un essai arrêté sur ce refus ne prouve JAMAIS que le compte vend (paypal_le), et la sonde
// canSell non plus tant que ce mur tient.
export const MOTIF_PAYPAL_DEPOP = "depop_paypal_a_relier";
export const MESSAGE_PAYPAL_DEPOP =
  "Depop demande de relier un compte PayPal avant de mettre une annonce en ligne. " +
  "Relie ton compte PayPal sur depop.com (Réglages › Paiements), sur ton ordinateur : tes publications Depop repartiront toutes seules. Rien n'a été publié ni retiré.";
// Les codes de refus Depop qui demandent un geste du vendeur sur son compte (relevés en base, 60 jours au 04/11).
export const CODES_GESTE_COMPTE_DEPOP = Object.freeze({ 1216: MOTIF_PAYPAL_DEPOP });

/** Un refus de création Depop qui demande un geste sur le compte ? `texte` : l'erreur rendue par le connecteur. */
export function refusCompteDepop(texte) {
  const t = String(texte ?? "");
  if (!/Depop a refusé l'annonce \(HTTP 4\d\d\)/.test(t)) return null;
  const code = Number((/\\?"code\\?"\s*:\s*(\d{3,5})/.exec(t) ?? [])[1]) || null;
  if (code && CODES_GESTE_COMPTE_DEPOP[code]) return { code, motif: CODES_GESTE_COMPTE_DEPOP[code] };
  return /paypal/i.test(t) ? { code, motif: MOTIF_PAYPAL_DEPOP } : null;
}

/** Une des tâches en attente tient-elle sur le refus « PayPal à relier » ? (la sonde canSell ne prouve alors rien) */
export function murPaypalDepop(jobs) {
  return (Array.isArray(jobs) ? jobs : []).some((j) => Number.isFinite(paypalLe(j)));
}

/** Le message de la carte : PayPal quand c'est ce mur-là qui tient une des tâches, la configuration vendeur sinon. */
export function messageVendeurDepop(jobs) {
  return murPaypalDepop(jobs) ? MESSAGE_PAYPAL_DEPOP : MESSAGE_VENDEUR_DEPOP;
}

// Les étapes du connecteur APRÈS le contrôle vendeur (content-scripts/depop.js,
// depopEtape) : y arriver prouve que Depop accepte ce vendeur.
const ETAPES_APRES_VENDEUR = new Set(["prevol", "referentiels", "photos", "creation", "verification"]);
// Les sources d'attente sous lesquelles un mur VU peut se trouver (relancer :
// posée par défaut avant le 17/10).
const SOURCES_DU_MUR = new Set(["", "relancer", SOURCE_VENDEUR_DEPOP]);

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };
const estPublication = (job) => ["publish", "republish"].includes(String(job?.action ?? "publish"));

/** (04/11) La date (ms) du refus « PayPal à relier » sur ce job, NaN sinon. */
function paypalLe(job) {
  const pf = pfDe(job);
  const vd = pf.vendeur_depop && typeof pf.vendeur_depop === "object" ? pf.vendeur_depop : {};
  const d = pf.last_diagnostic;
  const vu = d && typeof d === "object" && d.quoi === MOTIF_PAYPAL_DEPOP ? ms(d.at) : NaN;
  const t = [ms(vd.paypal_le), vu].filter(Number.isFinite);
  return t.length ? Math.max(...t) : NaN;
}

/** La date (ms) du mur VU par l'extension sur ce job, NaN sinon (une retenue n'en est jamais un). */
export function murVuLe(job) {
  const d = pfDe(job).last_diagnostic;
  const vendeur = d && typeof d === "object" && d.quoi === MOTIF_VENDEUR_DEPOP ? ms(d.at) : NaN;
  const t = [vendeur, paypalLe(job)].filter(Number.isFinite);
  return t.length ? Math.max(...t) : NaN;
}

/**
 * Ce job Depop a-t-il PASSÉ le contrôle vendeur après `depuisMs` ? Une
 * publication faite par l'extension, ou une étape du connecteur au-delà de
 * « session » (work_window_state.at_end). Un relevé ne prouve rien.
 */
export function controleVendeurPasse(job, depuisMs = -Infinity) {
  if (!job || job.platform !== "depop" || !estPublication(job)) return false;
  if (String(job.handler_build ?? "") === "releve-annonces") return false;
  const depuis = Number.isFinite(depuisMs) ? depuisMs : -Infinity;
  if (["published", "sold"].includes(String(job.status ?? ""))) {
    const p = ms(job.published_at);
    if (Number.isFinite(p) ? p > depuis : depuis === -Infinity) return true;
  }
  const fin = pfDe(job).work_window_state?.at_end;
  if (!fin || typeof fin !== "object" || !ETAPES_APRES_VENDEUR.has(String(fin.fill_step ?? ""))) return false;
  const t = ms(fin.fill_step_at ?? fin.at);
  // (04/11) Arrêté sur le refus « PayPal à relier » (posé au retour de CET essai) : pas une preuve que le compte vend.
  const paypal = paypalLe(job);
  if (Number.isFinite(paypal) && Number.isFinite(t) && paypal >= t) return false;
  return Number.isFinite(t) && t > depuis;
}

/** Cette tâche attend-elle la configuration vendeur Depop (mur vu, ou publication retenue) ? */
export function attendVendeurDepop(job) {
  if (!job || job.platform !== "depop" || job.status !== "needs_user" || !estPublication(job)) return false;
  const pf = pfDe(job);
  if (pf.needsUserField || pf.needsUserFields) return false; // une vraie question de champ garde sa ligne
  const source = String(pf.needs_user_source ?? "");
  if (source === SOURCE_VENDEUR_DEPOP) return true;
  if (!SOURCES_DU_MUR.has(source)) return false; // connexion, autorisation, autre mur : pas celui-ci
  const vu = murVuLe(job);
  if (!Number.isFinite(vu)) return false;
  // Relâchée ou relancée APRÈS ce mur, puis arrêtée pour autre chose : plus ce mur.
  const vd = pf.vendeur_depop && typeof pf.vendeur_depop === "object" ? pf.vendeur_depop : {};
  const leve = Math.max(ms(vd.reprise_le) || -Infinity, ms(vd.eclaireur_le) || -Infinity);
  if (leve > vu) return false;
  return !controleVendeurPasse(job, vu);
}

/** Les tâches d'un compte qui attendent ce geste, la plus ancienne d'abord. */
export function attentesVendeurDepop(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter(attendVendeurDepop)
    .sort((a, b) => (ms(a.created_at) || 0) - (ms(b.created_at) || 0));
}

/** Le dernier mur VU par l'extension parmi ces tâches (ms), -Infinity sinon. Les retenues ne comptent jamais. */
export function derniereObservationMur(jobs) {
  const t = (Array.isArray(jobs) ? jobs : []).map(murVuLe).filter(Number.isFinite);
  return t.length ? Math.max(...t) : -Infinity;
}

/** La sonde de l'extension (≥ 0.6.123) a-t-elle lu canSell = true après `depuisMs` ? (profiles.extension_sessions) */
export function sondeVendeurDepopOk(sessions, depuisMs = -Infinity) {
  const s = sessions && typeof sessions === "object" ? sessions : {};
  if (s.depop_vendeur !== true) return false;
  const par = s.checked_at_par_plateforme && typeof s.checked_at_par_plateforme === "object" ? s.checked_at_par_plateforme : {};
  const vu = ms(par.depop ?? s.checked_at);
  return Number.isFinite(vu) && vu > (Number.isFinite(depuisMs) ? depuisMs : -Infinity);
}

/**
 * L'éclaireur à relancer : la plus ancienne, sauf si l'écart du barème n'est
 * pas encore passé. `autres` = les autres tâches Depop du compte (tout
 * statut) : un éclaireur EN COURS (pending, processing) compte comme lancé.
 */
export function eclaireurVendeurDepop(jobs, maintenant = Date.now(), autres = []) {
  const l = attentesVendeurDepop(jobs);
  if (!l.length) return null;
  const tous = [...l, ...(Array.isArray(autres) ? autres : [])];
  const n = Math.max(0, ...tous.map((j) => Number(pfDe(j).vendeur_depop?.n) || 0));
  const lances = tous.map((j) => ms(pfDe(j).vendeur_depop?.eclaireur_le)).filter(Number.isFinite);
  const dernier = Math.max(derniereObservationMur(l), ...lances);
  const ecart = DELAIS_ECLAIREUR_MIN[Math.min(n, DELAIS_ECLAIREUR_MIN.length - 1)] * 60_000;
  if (Number.isFinite(dernier) && maintenant - dernier < ecart) return null;
  return l[0];
}

/** get-pending-jobs : ce job vient-il d'être relancé (éclaireur, « C'est fait », relance de l'app) ? Il reste servi. */
export function estEclaireurFrais(job, maintenant = Date.now()) {
  if (!job || job.platform !== "depop") return false;
  const pf = pfDe(job);
  const t = Math.max(ms(pf.vendeur_depop?.eclaireur_le) || -Infinity, ms(pf.derniere_relance_manuelle) || -Infinity);
  return Number.isFinite(t) && maintenant - t < ECLAIREUR_FRAIS_MS;
}

const CLES_ATTENTE = ["needs_user_source", "needs_user_sans_motif", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le",
  "needs_user_vu_erreur", "next_action_after", "processing_since"];

/** Les platform_fields de l'éclaireur relancé (geste de la carte ou passage serveur). */
export function champsEclaireur(pf, par, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of CLES_ATTENTE) delete out[k];
  out.needsUserAttempts = 0;
  out.vendeur_depop = { ...(out.vendeur_depop ?? {}), eclaireur_le: maintenantIso, par, n: (Number(out.vendeur_depop?.n) || 0) + 1 };
  return out;
}

/** Les platform_fields d'une tâche relâchée (rang k : 45 s × k). */
export function champsReprise(pf, k, maintenantMs, par) {
  const out = { ...(pf ?? {}) };
  for (const c of CLES_ATTENTE) delete out[c];
  out.needsUserAttempts = 0;
  out.next_action_after = new Date(maintenantMs + k * ESPACEMENT_REPRISE_MS).toISOString();
  // La retenue est levée, et le barème des éclaireurs repart de zéro pour un mur futur.
  const { retenue_le: _retenue, n: _n, ...reste } = out.vendeur_depop && typeof out.vendeur_depop === "object" ? out.vendeur_depop : {};
  out.vendeur_depop = { ...reste, reprise_le: new Date(maintenantMs).toISOString(), par };
  return out;
}

/** Les platform_fields d'une publication RETENUE par get-pending-jobs (jamais un mur VU : last_diagnostic n'est pas touché). */
export function champsRetenue(pf, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["next_action_after", "processing_since"]) delete out[k];
  out.needs_user_source = SOURCE_VENDEUR_DEPOP;
  out.vendeur_depop = { ...(out.vendeur_depop ?? {}), retenue_le: maintenantIso };
  return out;
}
