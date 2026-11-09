// ═══════════════════════════════════════════════════════════════════════════
// UN SEUL EXÉCUTANT, LE CLOUD — SELFTEST (09/11/2026 soir, Deborah, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Preuve en base : chez une cliente au Cloud actif (cloud_voie), l'extension de son PC (6d36bb4) prenait les relevés
// Leboncoin servis (19:43, 20:04 — « page de connexion ») et le dressing Vinted (19:36) en parallèle du Cloud. Garantit :
//   1. la règle pure (_shared/cloud-voie.js) : au Cloud actif, l'ordinateur ne reçoit ni le dressing ni les relevés
//      « annonces » des 4 plateformes du Cloud, ni les lectures de fond ; inchangé pour le poste Cloud, un compte sans
//      drapeau (faux ou illisible), eBay et les demandes « connexion » ;
//   2. get-pending-jobs : le filtre est posé À LA SOURCE (lireCommandesEnFile, lecture unique des demandes en file), le
//      drapeau est lu pour un poll sans session, les deux lectures de fond sont gardées ; les tâches gardent leur règle
//      d'avant (jobsSelonDrapeauCloud).
//   node scripts/cloud-un-executant-selftest.mjs
import { readFileSync } from 'node:fs';
import { commandeLaisseeAuCloud, lectureFondPourCePoste, jobsSelonDrapeauCloud } from '../supabase/functions/_shared/cloud-voie.js';

let n = 0;
let ko = 0;
const ok = (c, m) => { n++; if (!c) { ko++; console.log(`  ✗ ${m}`); } else console.log(`  ✓ ${m}`); };

console.log('1. la règle pure');
const PC_CLOUD = { cloudVoie: true, posteCloud: false };
const POSTE_CLOUD = { cloudVoie: true, posteCloud: true };
const SANS = { cloudVoie: false, posteCloud: false };
const ILLISIBLE = { cloudVoie: null, posteCloud: false };
const cmd = (kind, platform) => ({ id: `${kind}-${platform}`, kind, platform, queued_at: '2026-11-09T19:03:09Z' });
// Les demandes du 09/11 : relevé Leboncoin « reprise_connexion », dressing Vinted « bouton_distant ».
ok(commandeLaisseeAuCloud(cmd('annonces', 'leboncoin'), PC_CLOUD), 'PC d’un compte au Cloud : relevé Leboncoin laissé au Cloud (cas du 09/11)');
ok(commandeLaisseeAuCloud(cmd('dressing', 'vinted'), PC_CLOUD), 'PC d’un compte au Cloud : dressing Vinted laissé au Cloud (cas du 09/11)');
for (const p of ['vinted', 'beebs', 'depop']) ok(commandeLaisseeAuCloud(cmd('annonces', p), PC_CLOUD), `PC d’un compte au Cloud : relevé ${p} laissé au Cloud`);
ok(!commandeLaisseeAuCloud(cmd('annonces', 'ebay'), PC_CLOUD), 'eBay : inchangé (API ou ordinateur)');
ok(!commandeLaisseeAuCloud(cmd('connexion', 'leboncoin'), PC_CLOUD), 'une demande « connexion » (geste de la personne) : inchangée');
for (const [nom, ctx] of [['poste Cloud', POSTE_CLOUD], ['compte sans Cloud', SANS], ['drapeau illisible', ILLISIBLE]]) {
  ok(['vinted', 'leboncoin', 'beebs', 'depop'].every((p) => !commandeLaisseeAuCloud(cmd('annonces', p), ctx)) && !commandeLaisseeAuCloud(cmd('dressing', 'vinted'), ctx),
    `${nom} : tout servi comme avant`);
}
ok(!commandeLaisseeAuCloud(null, PC_CLOUD) && !commandeLaisseeAuCloud({}, PC_CLOUD), 'une ligne vide ne retient rien');
ok(!lectureFondPourCePoste(PC_CLOUD), 'PC d’un compte au Cloud : aucune lecture de fond');
ok(lectureFondPourCePoste(POSTE_CLOUD) && lectureFondPourCePoste(SANS) && lectureFondPourCePoste(ILLISIBLE), 'poste Cloud, compte sans Cloud, illisible : lectures de fond comme avant');
const jobs = ['vinted', 'leboncoin', 'beebs', 'depop', 'ebay'].map((platform, i) => ({ id: `j${i}`, platform }));
ok(JSON.stringify(jobsSelonDrapeauCloud(jobs, PC_CLOUD).map((j) => j.platform)) === '["ebay"]', 'les tâches : règle d’avant inchangée (seul eBay reste à l’ordinateur)');

console.log('2. get-pending-jobs');
const gpj = readFileSync(new URL('../supabase/functions/get-pending-jobs/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
ok(/import \{[^}]*commandeLaisseeAuCloud[^}]*lectureFondPourCePoste[^}]*\} from "\.\.\/_shared\/cloud-voie\.js";/.test(gpj), 'la règle est importée de _shared/cloud-voie.js');
const lecteur = gpj.slice(gpj.indexOf('const lireCommandesEnFile = async'), gpj.indexOf('const lireCommandesEnFile = async') + 1400);
ok(/commandesEnFile = lues\.filter\(\(c\) => !commandeLaisseeAuCloud\(c, \{ cloudVoie, posteCloud \}\)\);/.test(lecteur), 'le filtre est à la SOURCE : la lecture unique des demandes en file');
ok((gpj.match(/await lireCommandesEnFile\(/g) || []).length >= 3 && !/from\("vinted_sync_runs"\)\.select\("id, kind, platform, queued_at, declencheur"\)[\s\S]{0,40}\.in\("kind"/.test(gpj.replace(lecteur, '')), 'dressing, relevés et connexions passent tous par ce lecteur (aucune autre lecture des demandes en file)');
const avantLecteur = gpj.slice(gpj.indexOf('let commandesEnFile: CommandeEnFile[] | null = null;'), gpj.indexOf('const lireCommandesEnFile = async'));
ok(/if \(!posteCloud && cloudVoie === null\) \{[\s\S]*\.select\("cloud_voie"\)/.test(avantLecteur), 'un poll sans session lit le drapeau avant de servir une demande');
ok(/LECTURE_FOND_VERSION_MIN\) && !delegationLbc\s*&& lectureFondPourCePoste\(\{ cloudVoie, posteCloud \}\)\) \{/.test(gpj), 'lecture de fond Vinted : gardée');
ok(/LECTURE_FOND_BEEBS_VERSION_MIN\)\s*&& !syncCommandsAnnonces\.some\(\(c\) => c\.devant\) && !delegationLbc && lectureFondPourCePoste\(\{ cloudVoie, posteCloud \}\)\) \{/.test(gpj), 'lecture de fond Beebs : gardée');
ok(/out = jobsSelonDrapeauCloud\(out, \{ cloudVoie, posteCloud \}\);/.test(gpj), 'les tâches gardent leur filtre d’avant');

console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ROUGE(S)` : ' — tout est vert'}`);
process.exit(ko ? 1 : 0);
