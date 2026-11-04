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
import { chargerRegles } from './regles.js';
import { creerGardeSocle } from './socle.js';
import { creerEndurance } from './endurance.js';
import { creerVerifications } from './verifications.js';
import { creerFlotte, capaciteServeur } from './flotte.js';
import { tailleEnMo } from './navigateur.js';
import { creerEnregistrementFond } from './enregistrementFond.js';

const configLue = lireConfig();
// (03/11, point 1) LA CAPACITÉ : NAVIGATEURS_MAX s'il est réglé ; sinon ⌊(mémoire de l'hôte − socle) / plafond d'un
// navigateur⌋ (flotte.js, capaciteServeur) — un serveur neuf de la flotte se règle seul.
const config = Object.freeze({ ...configLue, navigateursMaxAuto: configLue.navigateursMaxRegle == null,
  navigateursMax: capaciteServeur({ totalMo: totalmem() / 1048576, socleMo: configLue.socleMo, plafondMo: tailleEnMo(configLue.memoireNavigateur),
    reglage: configLue.navigateursMaxRegle, repli: configLue.navigateursMax }) });
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const docker = creerDocker({ socket: config.socketDocker });
const navigateurs = creerNavigateurs({ config, docker, journal });
const coffre = creerCoffre({ base, cle: config.cleCoffre, cleVersion: config.cleCoffreVersion, anciennes: config.clesCoffreAnciennes });
const sessions = creerSessionsFillsell({ config, base, journal });
const alertes = creerAlertes({ config, base, journal });
const iproyal = creerIproyal({ jeton: config.iproyalJeton, achatsAutorises: config.iproyalAchatsAutorises, journal });
const controles = creerControles({ config, docker, journal });
// (30/10, lot D) LE module fournisseur d'IP : seul point de contact pour la sortie des navigateurs et le solde.
const fournisseurIp = creerFournisseurIp({ config, base, iproyal, journal, alertes });
const regles = await chargerRegles();

let connexions = null;
let endurance = null;
// (04/11 soir, essai GPU) L'enregistrement de fond : actif sur ENREGISTREMENT_FOND=1 seulement (sinon il ne fait rien).
const enregistrementFond = creerEnregistrementFond({ config, journal });
const postes = creerPostes({ config, base, navigateurs, coffre, sessions, journal, alertes, fournisseurIp, enregistrementFond,
  connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set(), arretEndurance: () => endurance?.arretee() ?? null });
// (02/11) Les vérifications anti-robot : une règle du PRODUIT, toujours active (verifications.js) — un blocage n'arrête
// que sa plateforme ; « Résoudre la vérification » la rouvre ; l'essai de 48 h en garde seulement le journal.
const verifications = creerVerifications({ config, base, navigateurs, postes, coffre, journal, alertes,
  connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set() });
// (01/11) Une connexion vérifiée (compte lu) est notée dans le journal de l'essai de 48 h : ses heures partent de là.
// (02/11) Et elle rouvre sa plateforme si elle était en vérification (verifications.resolue, par l'essai ou sans lui).
connexions = creerConnexions({ config, base, postes, navigateurs, coffre, journal, verifications,
  surVerifiee: (e) => {
    if (endurance) endurance.connexionVerifiee(e).catch(() => {});
    else verifications.resolue(e.user, e.plateforme, { par: 'connexion', le: e.le }).catch(() => {});
  } });
// (03/11, points 1 et 5) La flotte : battement, places, montée en charge (création COUPÉE sans le GO de Nico).
const flotte = creerFlotte({ config, base, navigateurs, journal, alertes });
const entretien = creerEntretien({ config, base, navigateurs, coffre, sessions, iproyal, controles, alertes, regles, journal, fournisseurIp });
// (01/11) L'essai de 48 h (ENDURANCE=1) : mesures toutes les 10 min, arrêt au premier blocage.
if (config.endurance) {
  endurance = creerEndurance({ config, base, docker, navigateurs, postes, journal, verifications, connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set() });
  await endurance.charger();
} else await verifications.charger();
const serveur = creerServeur({ config, connexions, navigateurs, journal, dossierPublic: fileURLToPath(new URL('../public', import.meta.url)) });

// Le réseau des navigateurs (le pare-feu de l'hôte filtre br-fillsell).
if (!(await docker.reseau(config.reseauDocker))) await docker.creerReseau(config.reseauDocker, process.env.RESEAU_SOUS_RESEAU || '172.31.0.0/24');
// Un navigateur resté d'une vie précédente de l'orchestrateur est arrêté : il
// repartira proprement (coffre, session) au prochain tour.
for (const c of await docker.lister()) {
  const nom = c.Names?.[0]?.replace(/^\//, '') ?? c.Id;
  if (c.Labels?.['fillsell.controle']) await docker.supprimer(nom).catch(() => {});   // contrôle d'IP interrompu
  else if (c.State === 'running') await docker.arreter(nom).catch(() => {});
}

await serveur.ecouter();
journal.info('demarrage', { serveur: config.serveurNom, port: config.port, comptes_autorises: config.comptesAutorises.length || 'tous',
  capacite: config.navigateursMax, capacite_auto: config.navigateursMaxAuto });

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
async function tourEntretien() {
  if (entretienEnCours || gardeEntretien.passer()) return;
  entretienEnCours = true;
  try { await entretien.tour(); gardeEntretien.present(); } catch (e) {
    if (!gardeEntretien.noter(e)) journal.erreur('entretien_echec', { erreur: e.message });
  } finally { entretienEnCours = false; }
}

const t1 = setInterval(tourPlanificateur, config.tickPlanificateurS * 1000);
const t2 = setInterval(tourEntretien, config.tickEntretienMin * 60_000);
// (02/11) Chaque minute, essai ou pas : les cadres DataDome, les pauses de l'app, l'essai des 24 h d'un accès restreint.
const t3 = setInterval(() => (endurance ? endurance.releveCadres() : verifications.releve()).catch((e) => journal.alerte('verifications_releve_echec', { erreur: e.message })), 60_000);
// (03/11) La flotte : décision toutes les 10 min (plan à blanc tant que les interrupteurs sont coupés).
const t5 = setInterval(() => flotte.tour().catch((e) => journal.alerte('flotte_tour_echec', { erreur: e.message })), 10 * 60_000);
const t4 = endurance ? setInterval(() => endurance.mesure().catch((e) => journal.alerte('endurance_mesure_echec', { erreur: e.message })), 10 * 60_000) : null;
if (endurance) setTimeout(() => endurance.mesure().catch(() => {}), 120_000);
setTimeout(tourPlanificateur, 5_000);
setTimeout(tourEntretien, 60_000);

async function arreter(signal) {
  journal.info('arret', { signal });
  clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4); clearInterval(t5);
  connexions.fermerTout();
  for (const u of navigateurs.ouverts()) await postes.fermer(u, 'arret_orchestrateur').catch(() => {});
  await serveur.fermer().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
process.on('unhandledRejection', (e) => journal.erreur('rejet_non_traite', { erreur: String(e?.message ?? e) }));
