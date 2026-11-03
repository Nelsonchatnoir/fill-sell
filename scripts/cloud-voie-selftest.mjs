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
// (02/11 soir) L'app (écrans de suivi d'un compte Cloud) porte sa propre copie de la liste : la même, toujours.
const { PLATEFORMES_CLOUD: deLApp, parLeCloud } = await import('../src/cloud/voieCloud.js');
ok(JSON.stringify(deLApp) === JSON.stringify(PLATEFORMES_CLOUD_VOIE), 'src/cloud/voieCloud.js : la même liste de plateformes que le serveur');
ok(parLeCloud({ platform: 'beebs', voie: 'extension' }, true) && !parLeCloud({ platform: 'ebay', voie: 'api' }, true)
  && !parLeCloud({ platform: 'vinted', voie: 'extension' }, false) && !parLeCloud({ platform: 'opla' }, true),
  'parLeCloud : compte Cloud et plateforme du Cloud seulement (eBay par l\'API, Opla, compte ordinaire : non)');
// (02/11 soir, Nico) Un message de tâche du Cloud ne renvoie jamais vers le navigateur ni l'ordinateur de la personne.
{
  const { texteTacheCloud } = await import('../src/cloud/voieCloud.js');
  const lbc = texteTacheCloud("La page de dépôt Leboncoin ne s'est pas affichée comme attendu (ni formulaire vierge, ni dépôt en cours). Ouvre leboncoin.fr/deposer-une-annonce dans ton navigateur pour voir ce qu'elle montre, puis relance la publication. Nouvel essai automatique (tentative 1/5), rien à faire.", 'Leboncoin');
  ok(!/navigateur|ordinateur|Chrome/.test(lbc) && /Nouvel essai automatique \(tentative 1\/5\), rien à faire\./.test(lbc) && /page de dépôt Leboncoin/.test(lbc),
    'le message Leboncoin du 02/11 : plus « ouvre … dans ton navigateur », le constat et l\'essai automatique gardés');
  ok(/Reconnecte Leboncoin à FillSell Cloud/.test(texteTacheCloud('Connexion Leboncoin requise : se connecter sur leboncoin.fr dans Chrome, le job repartira.', 'Leboncoin')),
    'une connexion à reprendre : la reconnecter à FillSell Cloud');
  ok(/Résoudre la vérification/.test(texteTacheCloud('Beebs affiche une vérification anti-robot. Ouvre Beebs sur ton ordinateur et valide-la maintenant.', 'Beebs')),
    'une vérification : « Résoudre la vérification » dans l\'app');
  ok(texteTacheCloud('En attente : ton annonce a été retirée.', 'Depop') === 'En attente : ton annonce a été retirée.', 'un message sans renvoi au navigateur : inchangé');
  const { humanizeJobError } = await import('../src/utils/shared.js');
  const brut = { platform: 'leboncoin', voie: 'extension', status: 'pending', error: "La page de dépôt Leboncoin ne s'est pas affichée comme attendu (ni formulaire vierge, ni dépôt en cours). Ouvre leboncoin.fr/deposer-une-annonce dans Chrome pour voir ce qu'elle montre, puis relance la publication." };
  ok(/dans Chrome/.test(humanizeJobError(brut, 'fr')), 'compte ordinaire (aucun compte Cloud noté) : le texte de l\'extension, inchangé');
}

// (03/11, point 3 de Nico) Le build de l'exécutant Cloud : la prise atomique prendre_job enfin appelée.
console.log('\n3. Le poste Cloud reconnu par update-job-status (prendre_job)');
{
  const { estPosteCloud } = await import('../supabase/functions/_shared/cloud-voie.js');
  ok(estPosteCloud('2026-11-01T23:02:16Z+dd69fbb-cloud · v0.6.164') === true, 'copie Cloud « …-cloud · v0.6.164 » (le build réellement envoyé, lu en base le 03/11) : vrai');
  ok(estPosteCloud('2026-11-02T20:41:27Z+d426d23-cloud') === true, 'BUILD_ID « …-cloud » seul : vrai');
  ok(estPosteCloud('2026-10-31T09:31:55Z+3876dc8 · v0.6.169') === false, 'extension d’un ordinateur : faux');
  ok(estPosteCloud('') === false && estPosteCloud(null) === false && estPosteCloud(undefined) === false, 'vide : faux');
  ok(estPosteCloud('2026-11-01T23:02:16Z+dd69fbb-cloudy · v1') === false && estPosteCloud('x-cloud-test · v1') === false, 'un mot qui commence par « cloud » ailleurs : faux');
  ok(estPosteCloud('2026-11-02T20:41:27Z+d426d23-cloud · sync-dressing') === true, 'relevé de la copie Cloud : vrai');
  const ujs = readFileSync(path.join(racine, 'supabase', 'functions', 'update-job-status', 'index.ts'), 'utf8');
  ok(ujs.includes('import { estPosteCloud } from "../_shared/cloud-voie.js";'), 'update-job-status importe estPosteCloud');
  ok(/if \(status === "processing" && estPosteCloud\(body\.handler_build\)\) \{/.test(ujs), 'la branche Cloud (prendre_job) passe par estPosteCloud');
  ok(!/\/-cloud\$\//.test(ujs), 'plus aucun /-cloud$/ dans update-job-status');
  const iBranche = ujs.indexOf('estPosteCloud(body.handler_build)');
  const iPrendre = ujs.indexOf('rpc("prendre_job"');
  const iMaj = ujs.indexOf('reservation.statut = "processing";');
  const iEcriture = ujs.indexOf('p_reservation: reservation.reservation, p_avant: reservation.statut');
  ok(iBranche > 0 && iBranche < iPrendre && iPrendre < iMaj && iMaj < iEcriture,
    'après prendre_job, l’écriture finale part de « processing » (sinon : 409 « le job a changé ») ');
}

console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
