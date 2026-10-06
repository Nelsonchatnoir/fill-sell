// ═══════════════════════════════════════════════════════════════════════════
// « SYNCHRONISER » : CE QUI PART, PAR OÙ, ET CE QU'ON DIT (06/10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas Laura (inscrite le 06/10 à 10:27, 0.6.100, n'a choisi que Vinted) : deux
// clics, chacun « voie directe » puis, 30 s plus tard, « l'extension n'a pas
// démarré » — aucun relevé Vinted, jamais. Au même clic, Leboncoin, Beebs et
// eBay partaient en file : trois « absente » sur des plateformes qu'elle
// n'avait pas choisies. Le même relevé, demandé par la file serveur
// (demander_sync_dressing), a lu ses 61 annonces en dix secondes.
// Cas julien : connecté à aucune plateforme dans Chrome ; ses republications
// attendaient sans un mot, et « Synchroniser » répondait « occupée ».
//
// Quatre règles, PURES (aucune requête ici, testées par
// scripts/synchroniser-repli-file-selftest.mjs) :
//   1. le canal direct muet n'est jamais un échec : passé SYNC_REPLI_FILE_MS
//      sans relevé visible, le MÊME geste repart par la file serveur ;
//   2. un clic ne relève que les plateformes choisies (« Où tu vends ? »),
//      connectées ou déjà relevées — les choisies d'abord ;
//   3. une plateforme sans session se dit « Connecte-toi à X sur ton
//      ordinateur », à la synchro comme à la republication ;
//   4. des republications en file ne bloquent pas la synchro : elle part par
//      la file, que le serveur sert AVANT les jobs (get-pending-jobs, « LA
//      SYNC PASSE DEVANT »).
// ⛔ Le repli n'est pas un relevé automatique : c'est la suite du clic
//    (déclencheur `bouton_distant`, un geste pour releve_est_geste).
import { etatSession } from '../utils/sessionsPlateformes.js';

export const LABEL_PF = { vinted: 'Vinted', leboncoin: 'Leboncoin', beebs: 'Beebs', ebay: 'eBay', opla: 'Opla' };

// Le relevé direct pose sa ligne en quelques secondes quand l'extension est
// libre. Au-delà, on n'attend plus : la file serveur prend le relais.
export const SYNC_REPLI_FILE_MS = 10 * 1000;

/**
 * Après un clic « voie directe » : attendre encore, ou repartir par la file ?
 * Jamais « échec » : l'extension qui tarde n'est pas une panne.
 */
export function decisionDemarrage({ depuisClicMs, runVu = false, questionBoutique = false }) {
  if (runVu) return 'suivre';
  if (!(depuisClicMs > SYNC_REPLI_FILE_MS)) return 'attendre';
  if (questionBoutique) return 'question';
  return 'repli_file';
}

/** Le relevé Vinted s'est arrêté sur une boutique pas encore suivie. */
export function runPoseQuestionBoutique(run) {
  return run?.status === 'failed' && String(run?.erreur ?? '').includes('[boutique_a_confirmer]');
}

/**
 * (06/10, nerema75 : 75 appuis refusés en silence) Un appui sur
 * « Synchroniser » alors que le dernier relevé pose la question de boutique :
 *   'aucune'                     → pas de question, la synchro part ;
 *   'relancer_boutique_changee'  → Chrome est sur une AUTRE boutique depuis le
 *                                  refus (sonde ou relevé de moins de 30 min) :
 *                                  la synchro part, l'extension tranche ;
 *   'relancer_ecartee'           → la personne a dit « pas la mienne » pour ce
 *                                  relevé et rien ne dit que Chrome y est
 *                                  encore : la synchro part ;
 *   'feuille' / 'feuille_rappel' → la confirmation s'ouvre (« Ajouter @x » /
 *                                  « Ce n'est pas ma boutique ») ; « rappel » :
 *                                  déjà écartée, Chrome toujours dessus.
 * Jamais de rattachement ici : seul le clic « Ajouter » écrit la boutique.
 */
export function decisionQuestionBoutique({ run, connectee = null, ecarteeRunId = null }) {
  if (!runPoseQuestionBoutique(run)) return 'aucune';
  const fraiche = connectee?.fraiche === true && !!connectee?.userId;
  const meme = fraiche && String(connectee.userId) === String(run.vinted_user_id);
  const ecartee = ecarteeRunId != null && ecarteeRunId === (run.id ?? null);
  if (fraiche && !meme) return 'relancer_boutique_changee';
  if (ecartee && !meme) return 'relancer_ecartee';
  return ecartee ? 'feuille_rappel' : 'feuille';
}

/**
 * Les plateformes qu'un clic « Synchroniser » relève, dans l'ordre.
 * - `plateformes` : ce que le bloc sait relever (Vinted compris), dans l'ordre
 *   d'affichage ;
 * - `choisies` : platform_settings.plateformes_vendeur (« Où tu vends ? ») ;
 * - `sessions` : profiles.extension_sessions (etatSession 'ok' = connectée) ;
 * - `dejaRelevees` : plateformes où le compte a déjà des annonces relevées.
 * Rien de connu (aucun choix, aucune session, aucune annonce) : on relève
 * tout, comme avant — un clic ne doit jamais rester sans effet.
 */
export function ciblesReleve({ plateformes = [], choisies = null, sessions = null, dejaRelevees = [] }) {
  const liste = plateformes.filter((p, i) => plateformes.indexOf(p) === i);
  const ch = Array.isArray(choisies) ? choisies.filter((p) => liste.includes(p)) : [];
  const garde = new Set(ch);
  for (const p of liste) {
    if (etatSession(sessions, p) === 'ok') garde.add(p);
    if (dejaRelevees.includes(p)) garde.add(p);
  }
  if (garde.size === 0) return liste;
  return [...ch, ...liste.filter((p) => !ch.includes(p) && garde.has(p))];
}

/** La phrase, la même pour chaque plateforme. */
export function texteConnecteToi(platform, lang = 'fr') {
  const nom = LABEL_PF[platform] ?? platform;
  return lang === 'en' ? `Sign in to ${nom} on your computer.` : `Connecte-toi à ${nom} sur ton ordinateur.`;
}

/**
 * Le job attend-il que la personne se connecte ? Posé par update-job-status
 * (`attente_connexion`) ou, avant lui, par l'extension (vérification de
 * boutique impossible faute de session).
 */
export function jobAttendConnexion(job) {
  if (!job || job.status !== 'pending') return null;
  const pf = job.platform_fields ?? {};
  if (pf.attente_connexion?.platform) return String(pf.attente_connexion.platform);
  if (pf.verification_boutique_vinted?.motif === 'session_inconnue') return 'vinted';
  return null;
}

/** Les plateformes dont des jobs attendent une connexion, avec leur nombre. */
export function attentesDeConnexion(jobs = []) {
  const par = {};
  for (const j of jobs) {
    const pf = jobAttendConnexion(j);
    if (pf) par[pf] = (par[pf] ?? 0) + 1;
  }
  return par;
}
