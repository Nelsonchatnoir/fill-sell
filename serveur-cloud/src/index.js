// FILLSELL CLOUD — l'orchestrateur. Un processus par serveur Hetzner :
//   · toutes les minutes, le planificateur allume / éteint les navigateurs ;
//   · toutes les heures, l'entretien du pool (purges prouvées, contrôles, alertes) ;
//   · en continu, l'écran « Me connecter » (WebSocket, derrière Caddy).
// Arrêt propre (SIGTERM) : chaque navigateur sauvegarde son coffre et sa
// session FillSell, puis s'éteint.
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
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
import { creerControles } from './controle.js';
import { creerEntretien } from './entretien.js';
import { chargerRegles } from './regles.js';

const config = lireConfig();
const base = createClient(config.supabaseUrl, config.cleService, { auth: { persistSession: false, autoRefreshToken: false } });
const docker = creerDocker({ socket: config.socketDocker });
const navigateurs = creerNavigateurs({ config, docker, journal });
const coffre = creerCoffre({ base, cle: config.cleCoffre, cleVersion: config.cleCoffreVersion });
const sessions = creerSessionsFillsell({ config, base, journal });
const alertes = creerAlertes({ config, base, journal });
const iproyal = creerIproyal({ jeton: config.iproyalJeton, achatsAutorises: config.iproyalAchatsAutorises, journal });
const controles = creerControles({ config, docker, journal });
const regles = await chargerRegles();

let connexions = null;
const postes = creerPostes({ config, base, navigateurs, coffre, sessions, journal, alertes,
  connexionsOuvertes: () => connexions?.connexionsOuvertes() ?? new Set() });
connexions = creerConnexions({ config, base, postes, navigateurs, coffre, journal });
const entretien = creerEntretien({ config, base, navigateurs, coffre, sessions, iproyal, controles, alertes, regles, journal });
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
journal.info('demarrage', { serveur: config.serveurNom, port: config.port, comptes_autorises: config.comptesAutorises.length || 'tous' });

let enCours = false;
async function tourPlanificateur() {
  if (enCours) return;
  enCours = true;
  try {
    const r = await postes.tour();
    if (r.ouvrir.length || r.fermer.length || r.refuses.length) journal.info('planificateur', { ...r });
  } catch (e) { journal.erreur('planificateur_echec', { erreur: e.message }); } finally { enCours = false; }
}
let entretienEnCours = false;
async function tourEntretien() {
  if (entretienEnCours) return;
  entretienEnCours = true;
  try { await entretien.tour(); } catch (e) { journal.erreur('entretien_echec', { erreur: e.message }); } finally { entretienEnCours = false; }
}

const t1 = setInterval(tourPlanificateur, config.tickPlanificateurS * 1000);
const t2 = setInterval(tourEntretien, config.tickEntretienMin * 60_000);
setTimeout(tourPlanificateur, 5_000);
setTimeout(tourEntretien, 60_000);

async function arreter(signal) {
  journal.info('arret', { signal });
  clearInterval(t1); clearInterval(t2);
  connexions.fermerTout();
  for (const u of navigateurs.ouverts()) await postes.fermer(u, 'arret_orchestrateur').catch(() => {});
  await serveur.fermer().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => arreter('SIGTERM'));
process.on('SIGINT', () => arreter('SIGINT'));
process.on('unhandledRejection', (e) => journal.erreur('rejet_non_traite', { erreur: String(e?.message ?? e) }));
