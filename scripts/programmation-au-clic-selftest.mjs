// selftest:programmation-au-clic — (03/11 soir, gjehly) la programmation d'une publication se décide au clic, jamais
// par la tâche d'avant : 80 publications Vinted envoyées « tout de suite » le 03/11 à 10:49 sont nées marquées
// programmee (marque recopiée de la carte de la fiche, lot du 01/11 arrêté) et ont été retenues dans le créneau du soir.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const { champsDuJob } = await import(pathToFileURL(join(ROOT, 'src/publication/moteur/regles.js')).href);
const PP = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/publication-programmee.js')).href);

// La carte de gjehly : le platform_fields de la tâche du 01/11, marques de file comprises.
const herite = { categoryPath: ['Hobbies'], programmee: true, programmee_le: '2026-11-01T20:10:43.755Z', taille: 'U' };
const tout_de_suite = champsDuJob(herite, false);
ok(!('programmee' in tout_de_suite) && !('programmee_le' in tout_de_suite) && !('programmee_servie_le' in tout_de_suite),
  'envoi « tout de suite » : aucune marque héritée');
ok(!PP.estProgrammee({ action: 'publish', platform_fields: tout_de_suite }), 'get-pending-jobs ne la retient plus (estProgrammee faux)');
ok(tout_de_suite.categoryPath?.[0] === 'Hobbies' && tout_de_suite.taille === 'U', 'les autres champs passent tels quels');
const avant = Date.now();
const programme = champsDuJob({ ...herite, programmee_servie_le: '2026-11-02T18:00:00Z' }, true);
ok(programme.programmee === true && Date.parse(programme.programmee_le) >= avant - 1000 && !('programmee_servie_le' in programme),
  'envoi programmé : la marque du clic, jamais la date ni le « servie » d\'avant');
ok(PP.estProgrammee({ action: 'publish', platform_fields: programme }), 'et elle est retenue dans le créneau, comme voulu');
ok(Object.keys(champsDuJob(undefined, false)).length === 0, 'sans champs : un objet vide, jamais une erreur');
ok(herite.programmee === true, 'la carte d\'origine n\'est pas modifiée');
const src = fs.readFileSync(join(ROOT, 'src/publication/moteur/regles.js'), 'utf8');
ok(src.includes('platform_fields: champsDuJob(pf, programmee),') && !/programmee \? \{ \.\.\.pf, programmee: true/.test(src),
  'construireJobs passe par champsDuJob, seul chemin des marques');

console.log(`\n✓ programmation-au-clic : ${n} contrôles verts`);
