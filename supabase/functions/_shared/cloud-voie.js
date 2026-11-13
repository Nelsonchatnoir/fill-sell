// (01/11/2026, demande de Nico : « comme ebay_voie_api ») LE DRAPEAU CLOUD D'UN COMPTE — profiles.cloud_voie
// (migration 20261101180000, posé par script, jamais par le client).
//
// Vrai = le Cloud exécute les tâches Vinted, Leboncoin, Beebs et Depop du compte (publications, republications,
// retraits) ; l'ORDINATEUR n'en reçoit plus aucune, qu'il soit vivant ou non, que la plateforme soit connectée au Cloud
// ou non (une plateforme à reconnecter attend la reconnexion ; l'app la demande). Le poste Cloud garde sa règle à lui
// (ses plateformes connectées, get-pending-jobs). Faux (tout le parc) = rien ne change.
// Pur : testé par scripts/cloud-voie-selftest.mjs, appelé par get-pending-jobs.

// Les plateformes que le Cloud sait faire (même liste que la copie Cloud de l'extension).
export const PLATEFORMES_CLOUD_VOIE = Object.freeze(["vinted", "leboncoin", "beebs", "depop"]);

/** Faut-il lire le drapeau pour CE poll ? Seulement pour un ordinateur à qui l'on servirait une tâche du Cloud. */
export function drapeauALire({ cloudVoie, posteCloud, jobs }) {
  if (posteCloud || cloudVoie !== null) return false;
  return (jobs ?? []).some((j) => PLATEFORMES_CLOUD_VOIE.includes(String(j?.platform)));
}

/**
 * (03/11, point 3 de Nico) Ce build est-il celui de l'exécutant Cloud ? La copie Cloud de l'extension porte un
 * BUILD_ID « …-cloud » (scripts/cloud/build-extension-cloud.mjs) et l'envoie en `handler_build` suivi de sa version :
 * « 2026-11-01T23:02:16Z+dd69fbb-cloud · v0.6.164 ». Avant, update-job-status testait /-cloud$/ : jamais vrai avec
 * « · v… », et la prise atomique (prendre_job) n'était jamais appelée. Pur : testé par scripts/cloud-voie-selftest.mjs.
 */
export function estPosteCloud(handlerBuild) {
  return /-cloud(?:\s*·|\s|$)/.test(String(handlerBuild ?? "").trim());
}

/** Les tâches servies à CE poste une fois le drapeau appliqué (ne retire jamais rien au poste Cloud ni à un compte sans drapeau). */
export function jobsSelonDrapeauCloud(jobs, { cloudVoie, posteCloud }) {
  const liste = Array.isArray(jobs) ? jobs : [];
  if (posteCloud || cloudVoie !== true) return liste;
  return liste.filter((j) => !PLATEFORMES_CLOUD_VOIE.includes(String(j?.platform)));
}

/**
 * (05/11 soir, lot « Ouverture du Cloud », point 13 — le trou laissé ouvert le 03/11, REPRISE Cloud) LE POSTE CLOUD
 * D'UN COMPTE DONT LE CLOUD N'EST PLUS ACTIF NE REÇOIT RIEN. Le drapeau faux (fin d'essai sans paiement, période de
 * grâce, arrêt, impayé) rend les tâches à l'ordinateur ; le navigateur Cloud peut encore être ouvert pendant la grâce
 * (sessions gardées), il ne doit plus rien exécuter. Illisible (null) : comme avant (jamais un poste privé sur un doute).
 */
export function jobsPourPosteCloud(jobs, { cloudVoie }) {
  const liste = Array.isArray(jobs) ? jobs : [];
  return cloudVoie === false ? [] : liste;
}

/**
 * (09/11/2026 soir, Deborah — décision de Nico : « un seul exécutant, le Cloud ») UNE DEMANDE EN FILE d'un compte au
 * Cloud ACTIF (cloud_voie vrai) n'est JAMAIS servie à l'ORDINATEUR : relevé du dressing (Vinted) et relevé « annonces »
 * des plateformes du Cloud. Elle reste en file pour le poste Cloud (une plateforme à reconnecter attend la reconnexion,
 * comme les tâches). Preuve du 09/11 : l'extension de son PC (6d36bb4) prenait les relevés Leboncoin servis (19:43,
 * 20:04 — « page de connexion ») et le dressing Vinted (19:36) en parallèle du Cloud, qui réussissait les siens.
 * Inchangé : le poste Cloud, un compte sans drapeau (faux ou illisible), eBay et les demandes « connexion » (un geste de
 * la personne). Pur : testé par scripts/cloud-un-executant-selftest.mjs.
 */
export function commandeLaisseeAuCloud(commande, { cloudVoie, posteCloud }) {
  if (posteCloud || cloudVoie !== true) return false;
  const kind = String(commande?.kind ?? "");
  if (kind === "dressing") return true;
  if (kind === "annonces") return PLATEFORMES_CLOUD_VOIE.includes(String(commande?.platform));
  return false;
}

/** (09/11 soir) Les lectures de fond (textes Vinted, pages Beebs) d'un compte au Cloud actif : au seul poste Cloud. */
export function lectureFondPourCePoste({ cloudVoie, posteCloud }) {
  return posteCloud || cloudVoie !== true;
}

/**
 * (05/11 soir, point 13) Le ROUTAGE « une plateforme connectée au Cloud va au seul poste Cloud » ne vaut que si le
 * Cloud du compte est actif : drapeau faux → l'ordinateur garde toutes ses tâches (sinon, la tâche n'irait à personne).
 */
export function routageCloudActif({ cloudVoie }) {
  return cloudVoie !== false;
}

// ══ (12/11/2026, lot « zéro problème », complément de Nico à l'étape 1 — cas b695d990) ═══════════════════════════════
// UNE DEMANDE DE RELEVÉ D'UN CLIENT CLOUD A TOUJOURS UN EXÉCUTANT SERVEUR, OU UN GESTE CLAIR — JAMAIS « TON ORDINATEUR ».
// Le cas : client du Cloud (essai Stripe), ses relevés eBay demandés depuis l'app (12/11 09:35 et 15:38) ont expiré
// après 6 h avec « ton ordinateur n'avait pas Chrome ouvert avec l'extension FillSell ». Cause : la copie Cloud de
// l'extension ne porte QUE Vinted, Leboncoin, Beebs et Depop (PLATEFORMES_CLOUD_VOIE) — eBay d'un client Cloud passe par
// l'API d'eBay, et SON eBay n'était pas relié à FillSell (aucune ligne ebay_accounts) : la demande attendait un
// ordinateur, qui n'est jamais venu ; puis le POLL DU POSTE CLOUD l'a redemandée (« app:redemande ») — une demande qu'il
// ne sait pas faire — et elle a expiré une seconde fois.

/** La plateforme d'une demande (le dressing est Vinted). */
const plateformeDeDemande = (c) => (String(c?.kind ?? '') === 'dressing' ? 'vinted' : String(c?.platform ?? ''));

/**
 * Ce poste peut-il EXÉCUTER cette demande de relevé ? (pur) Le poste Cloud : seulement ses plateformes (jamais eBay ni
 * une demande « connexion », geste de l'ordinateur). L'ordinateur d'un compte au Cloud actif : jamais une demande
 * laissée au Cloud (commandeLaisseeAuCloud). Sert à ne REDEMANDER que ce que le poste qui poll sait faire.
 */
export function demandeExecutablePar(commande, { cloudVoie, posteCloud }) {
  if (posteCloud) return String(commande?.kind ?? '') !== 'connexion' && PLATEFORMES_CLOUD_VOIE.includes(plateformeDeDemande(commande));
  return !commandeLaisseeAuCloud(commande, { cloudVoie, posteCloud });
}

/**
 * Le texte d'une demande de relevé EXPIRÉE (6 h sans être prise) d'un client au Cloud ACTIF (cloud_voie) — jamais
 * l'ordinateur, jamais Chrome (pur). Le marqueur en tête est lu par l'app (src/annonces/finReleve.js) :
 *   [cloud:relier_ebay] — eBay non relié à FillSell : le geste est de le relier (Réglages › Mes plateformes › eBay) ;
 *   [cloud:ebay_api]    — eBay relié : il est relu par nos serveurs, rien à faire ;
 *   [cloud:connecter]   — plateforme du Cloud pas connectée au coffre du Cloud : la connecter ;
 *   [cloud:pas_pris]    — le Cloud ne l'a pas prise à temps : « Synchroniser » la relance.
 * p = { kind, platform, nom, ebayRelie: bool | null, connecteCloud: bool | null }
 */
export function texteDemandeExpireeCloud({ kind, platform, nom = null, ebayRelie = null, connecteCloud = null } = {}) {
  const pf = plateformeDeDemande({ kind, platform });
  const n = nom || (pf ? pf.charAt(0).toUpperCase() + pf.slice(1) : 'cette plateforme');
  if (pf === 'ebay') {
    if (ebayRelie === true) return "[cloud:ebay_api] eBay est relu depuis nos serveurs par sa connexion directe à FillSell, une fois par jour : rien à faire.";
    return "[cloud:relier_ebay] Avec FillSell Cloud, eBay se relit depuis nos serveurs par sa connexion directe : relie ton compte eBay à FillSell une seule fois (Réglages › Mes plateformes › eBay), puis appuie sur « Synchroniser ». Rien n'a été effacé.";
  }
  if (PLATEFORMES_CLOUD_VOIE.includes(pf) && connecteCloud === false) {
    return `[cloud:connecter] ${n} n'est pas connecté à FillSell Cloud : connecte-le (Réglages › Mes plateformes), puis appuie sur « Synchroniser ». Rien n'a été effacé.`;
  }
  return "[cloud:pas_pris] FillSell Cloud n'a pas pu prendre cette synchronisation à temps. Rien n'a été effacé : appuie sur « Synchroniser » pour la relancer.";
}

// ══ (12/11/2026, lot « zéro problème », N3 — reste de l'étape 1, famille des retraits) ═══════════════════════════════
// UNE TÂCHE eBay D'UN CLIENT CLOUD DONT L'eBay N'EST PAS RELIÉ : LE GESTE EST DE RELIER eBay, JAMAIS « TON ORDINATEUR ».
// Le trou : eBay d'un client Cloud passe par l'API d'eBay — seulement si SON eBay est relié à FillSell (drapeau
// profiles.ebay_voie_api ET une ligne ebay_accounts non révoquée : la voie API reprend alors publications et retraits,
// ebay-api-worker). Sinon, une tâche eBay « voie extension » partait vers l'ordinateur (jobsSelonDrapeauCloud garde
// eBay) : sans ordinateur, elle attendait sans fin, et l'app disait « ouvre Chrome sur ton ordinateur », réécrit pour le
// Cloud en « FillSell Cloud la retirera dès qu'il reprend » — faux : le Cloud ne fait pas eBay. Pour un RETRAIT d'article
// vendu, un risque de double vente que personne ne voyait (comptes b695d990 — 4 annonces eBay —, d607ba20, d0ac0538).
// LA RÈGLE (handler-watch, tous les comptes au Cloud actif) : une telle tâche en file (ou arrêtée sur un mur « Chrome »
// d'eBay) passe « à toi de jouer » avec le seul geste possible — relier eBay (Réglages › Mes plateformes › eBay) —, écrit
// une fois ; dès qu'eBay est relié, ou que le Cloud n'est plus actif, elle repart en file toute seule (levée tracée).
// Une tâche en cours, en voie API, d'une autre plateforme, ou arrêtée sur une autre question n'est jamais touchée.
import { archiverErreur } from './erreurs-archivees.js';

export const SOURCE_EBAY_A_RELIER_CLOUD = 'ebay_a_relier_cloud';
// Les murs « Chrome » d'eBay (posés par l'extension) que le vrai geste remplace pour un client Cloud.
const MURS_EBAY_ORDINATEUR = Object.freeze(['ebay_connexion_requise', 'ebay_compte_chrome', 'connexion']);
const ACTIONS_EBAY = Object.freeze(['publish', 'republish', 'delete']);
const pfDeJob = (job) => (job?.platform_fields && typeof job.platform_fields === 'object' ? job.platform_fields : {});

/** La tâche doit-elle passer « relie ton eBay » ? `ebayRelie` : drapeau ET liaison non révoquée (pur). */
export function ebayARelierPourLeCloud(job, { cloudVoie, ebayRelie }) {
  if (cloudVoie !== true || ebayRelie !== false) return false;
  if (String(job?.platform ?? '') !== 'ebay' || job?.voie === 'api') return false;
  if (!ACTIONS_EBAY.includes(String(job?.action ?? 'publish'))) return false;
  const pf = pfDeJob(job);
  if (job?.status === 'pending') return true;
  return job?.status === 'needs_user' && MURS_EBAY_ORDINATEUR.includes(String(pf.needs_user_source ?? ''));
}

/** Le texte dit à la personne (jamais l'ordinateur, jamais Chrome). */
export function texteEbayARelierCloud(action, lang = 'fr') {
  const fr = lang !== 'en';
  if (String(action ?? '') === 'delete') {
    return fr
      ? "Ton article est vendu, mais son annonce est encore en ligne sur eBay : FillSell Cloud ne peut la retirer que si ton compte eBay est relié à FillSell. Relie ton compte eBay à FillSell (Réglages › Mes plateformes › eBay) : le retrait partira tout seul — risque de double vente d'ici là."
      : "Your item is sold, but its listing is still live on eBay: FillSell Cloud can only remove it once your eBay account is connected to FillSell. Connect your eBay account to FillSell (Settings › My platforms › eBay): the removal will go through on its own — risk of selling twice until then.";
  }
  return fr
    ? "Avec FillSell Cloud, eBay passe par sa connexion directe à FillSell. Relie ton compte eBay à FillSell (Réglages › Mes plateformes › eBay) : cette tâche partira toute seule ensuite. Rien n'a été perdu."
    : "With FillSell Cloud, eBay goes through its direct connection to FillSell. Connect your eBay account to FillSell (Settings › My platforms › eBay): this task will then go through on its own. Nothing has been lost.";
}

/** L'écriture qui pose le geste (statut, message, marqueur daté), pur. */
export function patchEbayARelierCloud(job, { maintenant = new Date().toISOString(), lang = 'fr' } = {}) {
  const pf = { ...pfDeJob(job) };
  const texte = texteEbayARelierCloud(job?.action, lang);
  if (job?.error && job.error !== texte) pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error, job?.status ?? null, 'handler-watch (client Cloud : eBay à relier)');
  for (const k of ['next_action_after', 'processing_since', 'needsUserField', 'needs_user_tick_le', 'needs_user_actif_ms', 'needs_user_vu_le', 'needs_user_vu_erreur']) delete pf[k];
  pf.needs_user_source = SOURCE_EBAY_A_RELIER_CLOUD;
  pf[SOURCE_EBAY_A_RELIER_CLOUD] = { depuis: maintenant, statut_avant: job?.status ?? null, source_avant: pfDeJob(job).needs_user_source ?? null };
  return { status: 'needs_user', error: texte, platform_fields: pf };
}

/** Faut-il lever le geste ? eBay relié, ou Cloud plus actif ; un profil illisible ne bouge rien (pur). */
export function leveeEbayARelierCloud(job, { cloudVoie, ebayRelie }) {
  if (job?.status !== 'needs_user' || pfDeJob(job).needs_user_source !== SOURCE_EBAY_A_RELIER_CLOUD) return false;
  return ebayRelie === true || cloudVoie === false;
}

/** L'écriture de la levée : en file, message effacé, trace gardée (pur). */
export function patchLeveeEbayARelierCloud(job, { maintenant = new Date().toISOString(), motif = 'ebay_relie' } = {}) {
  const pf = { ...pfDeJob(job) };
  const pose = pf[SOURCE_EBAY_A_RELIER_CLOUD] ?? null;
  delete pf[SOURCE_EBAY_A_RELIER_CLOUD];
  delete pf.needs_user_source;
  pf.ebay_a_relier_cloud_leve = { le: maintenant, motif, pose };
  return { status: 'pending', error: null, platform_fields: pf };
}
