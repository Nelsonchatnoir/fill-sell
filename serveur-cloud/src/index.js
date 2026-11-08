// FILLSELL CLOUD — l'orchestrateur. Un processus par serveur Hetzner :
//   · toutes les minutes, le planificateur allume / éteint les navigateurs ;
//   · toutes les heures, l'entretien du pool (purges prouvées, contrôles, alertes) ;
//   · en continu, l'écran « Me connecter » (WebSocket, derrière Caddy).
// Arrêt propre (SIGTERM) : chaque navigateur sauvegarde son coffre et sa
// session FillSell, puis s'éteint.
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { totalmem } from 'node:os';
import { lireConfig } from './config.js';
import * as journal from './journal.js';
import { creerDocker } from './docker.js';
import { creerNavigateurs } from './navigateur.js';
import { creerCoffre } from './coffre.js';
import { creerSessionsFillsell } from './sessionFillsell.js';
import { creerPostes } from './postes.js';
import { creerConnexions } from './connexion.js';
import { creerServeur } from './serveur.js';
import { creerAlertes } from './alertes.js';
import { creerIproyal } from './iproyal.js';
import { creerFournisseurIp } from './fournisseurIp.js';
import { creerControles } from './controle.js';
import { creerEntretien } from './entretien.js';
import { creerSante } from './sante.js';
import { chargerRegles } from './regles.js';
import { creerGardeSocle } from './socle.js';
import { creerEndurance } from './endurance.js';
import { creerVerifications } from './verifications.js';
import { creerFlotte, capaciteServeur } from './flotte.js';
import { tailleEnMo } from './navigateur.js';
import { creerEnregistrementFond } from './enregistrementFond.js';
import { creerPausesMessagerie } from './pausesMessagerie.js';
import { creerRelanceTaches } from './relanceTaches.js';
import { creerVidange } from './vidange.js';
import { idExtensionDepuisCle } from './sessionFillsell.js';
import { creerCloisonnement } from './cloisonnement.js';
import { readFile, appendFile, mkdir } from 'node:fs/promises';

const configLue = lireConfig();
// (03/11, point 1) LA CAPACITÉ : NAVIGATEURS_MAX s'il est réglé (FIXE) ; sinon AUTOMATIQUE. (07/11, décision 4 de Nico)
// Automatique = mesurée : elle part de CAPACITE_DEPART (15) et monte seule sur les mesures réelles (flotte.js,
// capaciteMesuree), jamais au-delà de CAPACITE_PLAFOND (30) ni de la capacité THÉORIQUE ⌊(mémoire de l'hôte − socle) /
// plafond d'un navigateur⌋ (capaciteServeur) — un serveur neuf de la flotte se règle seul.
const capaciteTheorique = capaciteServeur({ totalMo: totalmem() / 1048576, socleMo: configLue.socleMo, plafondMo: tailleEnMo(configLue.memoireNavigateur),
  reglage: null, repli: configLue.navigateursMax });
const capaciteAuto = configLue.navigateursMaxRegle == null;
const config = Object.freeze({ ...configLue, navigateursMaxAuto: capaciteAuto, capaciteTheorique,
  navigateursMax: capaciteAuto ? Math.max(1, Math.min(configLue.capaciteDepart, configLue.capacitePlafond, capaciteTheorique))
    : capaciteServeur({ reglage: configLue.navigateursMaxRegle }) });
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const docker = creerDocker({ socket: config.socketDocker });
const alertes = creerAlertes({ config, base, journal });
// (07/11 soir, étanchéité entre clients) Le cloisonnement du réseau des navigateurs : vérifié au démarrage (plus bas) et
// gardé à chaque ouverture à côté d'un autre compte (cloisonnement.js).
const cloisonnement = creerCloisonnement({ config, docker, journal, alertes });
const navigateurs = creerNavigateurs({ config, docker, journal, cloisonnement });
const coffre = creerCoffre({ base, cle: config.cleCoffre, cleVersion: config.cleCoffreVersion, anciennes: config.clesCoffreAnciennes });
const sessions = creerSessionsFillsell({ config, base, journal });
const iproyal = creerIproyal({ jeton: config.iproyalJeton, achatsAutorises: config.iproyalAchatsAutorises, journal });
const controles = creerControles({ config, docker, journal });
// (30/10, lot D) LE module fournisseur d'IP : seul point de contact pour la sortie des navigateurs et le solde.
const fournisseurIp = creerFournisseurIp({ config, base, iproyal, journal, alertes });
const regles = await chargerRegles();

let connexions = null;
let endurance = null;
// (04/11 soir, essai GPU) L'enregistrement de fond : complet sur ENREGISTREMENT_FOND=1. (05/11 soir, point 9) Sinon, son
// MODE LÉGER, toujours actif : seules les réponses DataDome sont lues, rien n'est écrit ; une « Vérification de l'appareil »
// passée seule rouvre sa plateforme (verifications.verificationPassee : pauses levées, tâches relancées).
let verificationsRef = null;
const enregistrementFond = creerEnregistrementFond({ config, journal,
  surDataDome: (user, d) => (d?.issue === 'passee' ? verificationsRef?.verificationPassee(user, d.plateforme, { le: d.le }) : null),
  // (06/11 soir) Chaque défi DataDome qui s'ouvre, dit dans le journal : l'agent de mesure le compte par compte et par jour.
  surDefiDataDome: (user, d) => journal.info('datadome_vu', { user, plateforme: d?.plateforme ?? null, defi: d?.defi ?? null }) });
// (04/11 soir, règle de Nico) Les pauses de la messagerie et de la veille des commandes : levées par une résolution réussie
// (verifications.js) et par un changement de machine ou d'IP (postes.js).
const pausesMessagerie = creerPausesMessagerie({ config, base, navigateurs, journal });
// (03/11, points 1 et 5) La flotte : battement, places, montée en charge (création COUPÉE sans le GO de Nico).
// (07/11, décision 4) Elle tient aussi la CAPACITÉ DU MOMENT (mesurée), lue par le planificateur à chaque tour.
const flotte = creerFlotte({ config, base, navigateurs, journal, alertes });
const postes = creerPostes({ config, base, navigateurs, coffre, sessions, journal, alertes, fournisseurIp, enregistrementFond, pausesMessagerie,
  capacite: () => flotte.capacite(),
  connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set(), arretEndurance: () => endurance?.arretee() ?? null });
// (02/11) Les vérifications anti-robot : une règle du PRODUIT, toujours active (verifications.js) — un blocage n'arrête
// que sa plateforme ; « Résoudre la vérification » la rouvre ; l'essai de 48 h en garde seulement le journal.
// (05/11 soir, point 9) Une plateforme rouverte : ses tâches espacées par l'anti-robot repartent tout de suite.
let idExtensionCloud = null;
const relanceTaches = creerRelanceTaches({ base, navigateurs, journal, idExtension: async () => {
  if (idExtensionCloud) return idExtensionCloud;
  const man = JSON.parse(await readFile(`${config.dossierExtension}/manifest.json`, 'utf8'));
  idExtensionCloud = man.key ? idExtensionDepuisCle(man.key) : null;
  return idExtensionCloud;
} });
const verifications = creerVerifications({ config, base, navigateurs, postes, coffre, journal, alertes, pausesMessagerie, relanceTaches,
  connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set() });
verificationsRef = verifications;
// (05/11 soir, point 12) La vidange à l'arrêt : plus aucune nouvelle tâche, celles en cours vont au bout (vidange.js).
const vidange = creerVidange({ base, navigateurs, journal, idExtension: relanceTaches.idExtension,
  connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set() });
// (01/11) Une connexion vérifiée (compte lu) est notée dans le journal de l'essai de 48 h : ses heures partent de là.
// (02/11) Et elle rouvre sa plateforme si elle était en vérification (verifications.resolue, par l'essai ou sans lui).
connexions = creerConnexions({ config, base, postes, navigateurs, coffre, journal, verifications, alertes,
  surVerifiee: (e) => {
    if (endurance) endurance.connexionVerifiee(e).catch(() => {});
    else verifications.resolue(e.user, e.plateforme, { par: 'connexion', le: e.le }).catch(() => {});
  } });
// (07/11 soir, ordre 4 de Nico) Le contrôle de santé des IP libres : un Chrome jetable de l'image des comptes (sante.js).
const sante = creerSante({ config, docker, journal });
const entretien = creerEntretien({ config, base, navigateurs, coffre, sessions, iproyal, controles, alertes, regles, journal, fournisseurIp, sante });
// (01/11) L'essai de 48 h (ENDURANCE=1) : mesures toutes les 10 min, arrêt au premier blocage.
if (config.endurance) {
  endurance = creerEndurance({ config, base, docker, navigateurs, postes, journal, verifications, connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set() });
  await endurance.charger();
} else await verifications.charger();
const serveur = creerServeur({ config, connexions, navigateurs, journal, dossierPublic: fileURLToPath(new URL('../public', import.meta.url)) });

// Le réseau des navigateurs (le pare-feu de l'hôte filtre br-fillsell). (07/11 soir) Créé CLOISONNÉ (enable_icc=false) ;
// un réseau déjà là est VÉRIFIÉ : une couche du cloisonnement absente = journal + alerte support@ — jamais recréé ici (la
// bascule arrête les navigateurs : procédure docs/cloud/ETANCHEITE-CLOUD2.md).
if (!(await docker.reseau(config.reseauDocker))) await docker.creerReseau(config.reseauDocker, process.env.RESEAU_SOUS_RESEAU || '172.31.0.0/24');
await cloisonnement.verifierAuDemarrage().catch((e) => journal.alerte('cloisonnement_verification_echec', { erreur: e.message }));
// Un navigateur resté d'une vie précédente de l'orchestrateur est arrêté : il
// repartira proprement (coffre, session) au prochain tour.
for (const c of await docker.lister()) {
  const nom = c.Names?.[0]?.replace(/^\//, '') ?? c.Id;
  if (c.Labels?.['fillsell.controle']) await docker.supprimer(nom).catch(() => {});   // contrôle d'IP interrompu
  else if (c.State === 'running') await docker.arreter(nom).catch(() => {});
}

await serveur.ecouter();
// (07/11, décision 4) La capacité mesurée AVANT le premier tour du planificateur : après un redémarrage, jamais moins de
// places que de comptes déjà servis (les mesures des 24 h précédentes comptent).
await flotte.evaluerCapacite().catch((e) => journal.alerte('capacite_evaluation_echec', { erreur: e.message }));
journal.info('demarrage', { serveur: config.serveurNom, port: config.port, comptes_autorises: config.comptesAutorises.length || 'tous',
  capacite: flotte.capacite(), capacite_auto: config.navigateursMaxAuto, capacite_theorique: config.capaciteTheorique,
  reappro_rapide_min: config.reapproRapideMin });

// (05/10) Serveur déployé AVANT la migration du socle (GO de Nico) : dit une
// fois, puis une tentative toutes les 10 min au lieu de chaque minute (socle.js).
const gardePlanificateur = creerGardeSocle({ journal, nom: 'planificateur' });
const gardeEntretien = creerGardeSocle({ journal, nom: 'entretien' });

let enCours = false;
async function tourPlanificateur() {
  if (enCours || gardePlanificateur.passer()) return;
  enCours = true;
  try {
    // (03/11) Le battement d'abord : les places et l'attribution des comptes lisent la capacité de ce tour-ci.
    await flotte.battre().catch((e) => journal.alerte('flotte_battement_echec', { erreur: e.message }));
    const r = await postes.tour();
    gardePlanificateur.present();
    if (r.ouvrir.length || r.fermer.length || r.refuses.length) journal.info('planificateur', { ...r });
  } catch (e) {
    if (!gardePlanificateur.noter(e)) journal.erreur('planificateur_echec', { erreur: e.message });
  } finally { enCours = false; }
}
let entretienEnCours = false;
let reprise = null;
async function tourEntretien() {
  if (entretienEnCours || gardeEntretien.passer()) return;
  entretienEnCours = true;
  try {
    const r = await entretien.tour();
    gardeEntretien.present();
    // (07/11) Le réapprovisionnement rapide tenait le verrou (un achat attend sa livraison) : l'entretien repasse dans
    // 3 minutes, jamais sauté pour une heure.
    if (r?.occupe && !reprise) reprise = setTimeout(() => { reprise = null; tourEntretien(); }, 3 * 60_000);
  } catch (e) {
    if (!gardeEntretien.noter(e)) journal.erreur('entretien_echec', { erreur: e.message });
  } finally { entretienEnCours = false; }
}
// (07/11, décision 1 de Nico) LE RÉAPPROVISIONNEMENT RAPIDE DES IP : toutes les REAPPRO_RAPIDE_MIN minutes, une lecture de
// trois petites tables (rien du tout sans IPROYAL_ACHATS_AUTORISES=1 et cloud_ip_achats_auto = 1), un achat seulement s'il
// manque des IP à la marge. Même verrou que l'entretien (entretien.js) ; une erreur est journalisée, jamais rejouée en boucle.
async function tourReappro() {
  if (entretienEnCours || gardeEntretien.passer()) return;
  try {
    const r = await entretien.reapprovisionnerVite();
    if (r?.achat) journal.info('reappro_rapide_achat', { achat: r.achat, aCommander: r.aCommander });
  } catch (e) { journal.alerte('reappro_rapide_echec', { erreur: e.message }); }
}

// (07/11 soir, ordre 4 de Nico) LE CONTRÔLE DE SANTÉ DES IP LIBRES : toutes les SANTE_IP_MIN minutes, une lecture de
// coin_config (rien d'autre tant que cloud_ip_sante_controle = 0) ; sinon UNE IP due, sous le verrou de l'entretien.
async function tourSante() {
  if (entretienEnCours || gardeEntretien.passer()) return;
  try { await entretien.controlerSante(); } catch (e) { journal.alerte('sante_ip_echec', { erreur: e.message }); }
}

const t1 = setInterval(tourPlanificateur, config.tickPlanificateurS * 1000);
const t2 = setInterval(tourEntretien, config.tickEntretienMin * 60_000);
const t7 = config.reapproRapideMin > 0 ? setInterval(tourReappro, config.reapproRapideMin * 60_000) : null;
const t8 = config.santeIpMin > 0 ? setInterval(tourSante, config.santeIpMin * 60_000) : null;
// (02/11) Chaque minute, essai ou pas : les cadres DataDome, les pauses de l'app, l'essai des 24 h d'un accès restreint.
const t3 = setInterval(() => (endurance ? endurance.releveCadres() : verifications.releve()).catch((e) => journal.alerte('verifications_releve_echec', { erreur: e.message })), 60_000);
// (03/11) La flotte : décision toutes les 10 min (plan à blanc tant que les interrupteurs sont coupés).
const t5 = setInterval(() => flotte.tour().catch((e) => journal.alerte('flotte_tour_echec', { erreur: e.message })), 10 * 60_000);
// (05/11 soir, point 11) LA MESURE DES COUPURES DU RELAIS : chaque heure, une ligne par compte ouvert (compteurs du jour
// et des 6 précédents, par plateforme : echecs rendus à Chrome, reprises au réessai, secours) dans etat/coupures-relais.jsonl.
async function noterCoupuresRelais() {
  const lignes = [];
  for (const u of navigateurs.ouverts()) {
    const e = await navigateurs.etatRelais?.(u).catch(() => null);
    if (e?.coupures) lignes.push(JSON.stringify({ le: new Date().toISOString(), user: String(u).slice(0, 8), coupures: e.coupures }));
  }
  if (!lignes.length) return;
  await mkdir(config.dossierEtat, { recursive: true }).catch(() => {});
  await appendFile(`${config.dossierEtat}/coupures-relais.jsonl`, `${lignes.join('\n')}\n`, { mode: 0o600 });
}
const t6 = setInterval(() => noterCoupuresRelais().catch((e) => journal.alerte('coupures_relais_echec', { erreur: e.message })), 60 * 60_000);
const t4 = endurance ? setInterval(() => endurance.mesure().catch((e) => journal.alerte('endurance_mesure_echec', { erreur: e.message })), 10 * 60_000) : null;
if (endurance) setTimeout(() => endurance.mesure().catch(() => {}), 120_000);
setTimeout(tourPlanificateur, 5_000);
setTimeout(tourEntretien, 60_000);

async function arreter(signal) {
  journal.info('arret', { signal });
  clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4); clearInterval(t5); clearInterval(t6); clearInterval(t7); clearInterval(t8);
  if (reprise) clearTimeout(reprise);
  await noterCoupuresRelais().catch(() => {});
  // (05/11 soir, point 12) Un déploiement ne coupe rien en cours : la vidange d'abord, la fermeture ensuite.
  await vidange.vider({ maxMs: config.drainMaxS * 1000 }).catch((e) => journal.alerte('vidange_echec', { erreur: String(e?.message ?? e) }));
  connexions.fermerTout();
  for (const u of navigateurs.ouverts()) await postes.fermer(u, 'arret_orchestrateur').catch(() => {});
  await serveur.fermer().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
process.on('unhandledRejection', (e) => journal.erreur('rejet_non_traite', { erreur: String(e?.message ?? e) }));
