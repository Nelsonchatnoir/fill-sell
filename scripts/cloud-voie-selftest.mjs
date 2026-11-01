// Autotest du DRAPEAU CLOUD par compte (01/11/2026) : profiles.cloud_voie (migration 20261101180000),
// supabase/functions/_shared/cloud-voie.js et son branchement dans get-pending-jobs.
//   · drapeau faux (tout le parc) : l'ordinateur reçoit exactement ce qu'il recevait ;
//   · drapeau vrai : l'ordinateur ne reçoit plus AUCUNE tâche Vinted, Leboncoin, Beebs, Depop (eBay et le reste
//     inchangés) ; le poste Cloud n'est jamais touché par cette règle ;
//   · le filtre passe AVANT la réservation des tâches (jamais réservé à l'ordinateur ce qu'il ne fera pas).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATEFORMES_CLOUD_VOIE, drapeauALire, jobsSelonDrapeauCloud } from '../supabase/functions/_shared/cloud-voie.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const ids = (l) => l.map((j) => j.id).join(',');

const jobs = [
  { id: 'v', platform: 'vinted' }, { id: 'l', platform: 'leboncoin' }, { id: 'b', platform: 'beebs' },
  { id: 'd', platform: 'depop' }, { id: 'e', platform: 'ebay' }, { id: 'o', platform: 'opla' },
];

console.log('1. La règle (pure)');
ok(PLATEFORMES_CLOUD_VOIE.join(',') === 'vinted,leboncoin,beebs,depop', 'Vinted, Leboncoin, Beebs, Depop');
ok(ids(jobsSelonDrapeauCloud(jobs, { cloudVoie: false, posteCloud: false })) === 'v,l,b,d,e,o', 'drapeau faux : l\'ordinateur reçoit tout, comme avant');
ok(ids(jobsSelonDrapeauCloud(jobs, { cloudVoie: null, posteCloud: false })) === 'v,l,b,d,e,o', 'drapeau illisible : comme avant');
ok(ids(jobsSelonDrapeauCloud(jobs, { cloudVoie: true, posteCloud: false })) === 'e,o', 'drapeau vrai : l\'ordinateur ne garde qu\'eBay et le reste');
ok(ids(jobsSelonDrapeauCloud(jobs, { cloudVoie: true, posteCloud: true })) === 'v,l,b,d,e,o', 'le poste Cloud n\'est jamais filtré par cette règle');
ok(jobsSelonDrapeauCloud(null, { cloudVoie: true, posteCloud: false }).length === 0, 'aucune tâche : liste vide, sans erreur');
ok(drapeauALire({ cloudVoie: null, posteCloud: false, jobs }) === true, 'lu quand une tâche du Cloud serait servie à l\'ordinateur');
ok(drapeauALire({ cloudVoie: null, posteCloud: false, jobs: [{ platform: 'ebay' }] }) === false, 'jamais lu pour des tâches eBay seules (aucune lecture de plus)');
ok(drapeauALire({ cloudVoie: false, posteCloud: false, jobs }) === false, 'jamais relu quand il est déjà connu');
ok(drapeauALire({ cloudVoie: null, posteCloud: true, jobs }) === false, 'jamais lu pour le poste Cloud');

console.log('\n2. Branchement dans get-pending-jobs');
const gpj = readFileSync(path.join(racine, 'supabase', 'functions', 'get-pending-jobs', 'index.ts'), 'utf8');
ok(gpj.includes('import { drapeauALire, jobsSelonDrapeauCloud } from "../_shared/cloud-voie.js";'), 'le module partagé est importé');
ok(gpj.includes('.select("extension_postes, cloud_voie")'), 'le drapeau est lu avec les postes (aucune lecture de plus par poll)');
const iVoie = gpj.indexOf('out = jobsSelonDrapeauCloud(out, { cloudVoie, posteCloud });');
const iReserve = gpj.indexOf('admin.rpc("reserver_jobs_extension"');
ok(iVoie > 0 && iReserve > 0 && iVoie < iReserve, 'le filtre passe AVANT la réservation des tâches');
ok(gpj.split('jobsSelonDrapeauCloud(').length === 2, 'appliqué une seule fois');
const mig = readFileSync(path.join(racine, 'supabase', 'migrations', '20261101180000_cloud_voie_drapeau.sql'), 'utf8');
ok(/ADD COLUMN IF NOT EXISTS cloud_voie boolean NOT NULL DEFAULT false/.test(mig), 'migration : faux par défaut pour tout le parc');
ok(/REVOKE UPDATE \(cloud_voie\) ON public\.profiles FROM anon, authenticated/.test(mig), 'migration : jamais modifiable par le client');

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
