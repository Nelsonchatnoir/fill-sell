// selftest:republication-retenue-dite — une tâche servie est démarrable, ou
// retenue AVANT d'être servie, avec son motif ; plus jamais une tâche servie
// 60 fois en silence (11/10, A3 — jonathanrabany, ltouze).
//
//   npm run selftest:republication-retenue-dite
//
// Contrôles (hors ligne) :
//   1. get-pending-jobs : une republication à l'étape 'captured' n'est pas
//      servie quand une AUTRE republication du compte, même plateforme, est à
//      l'étape 'deleted' (même lecture que l'invariant de l'extension) ; motif
//      écrit une fois, réservation remise à zéro, restriction Vinted nommée ;
//   2. ce qui est servi en mémoire (copie d'annonce depuis la capture) ne
//      s'écrit plus jamais en base : toute écriture après le service passe par
//      pfAPersister ;
//   3. la mise de côté « tâche sans démarrage » reste pour les vrais cas,
//      jamais pour une tâche retenue (elle n'est plus servie) ;
//   4. l'extension 0.6.107 écrit la même retenue, reconnaît
//      /selling-restriction et borne la capture (ltouze) ;
//   5. le rattrapage par la règle : relance des seules tâches mises de côté à
//      tort, copie servie retirée, erreurs archivées.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0;
const ok = (cond, quoi, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`);
  if (!cond) echecs += 1;
};
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const BG = lire('chrome-extension/background.js');
const VJS = lire('chrome-extension/content-scripts/vinted.js');
const RATT = lire('scripts/reparations/20261011_republications_retenues_relance.sql');

console.log('1. La retenue, avant le service');
const iRegle = GPJ.indexOf('// ══ (11/10, A3) UNE TÂCHE SERVIE EST DÉMARRABLE');
const iPointC = GPJ.indexOf('// Point C : seule la file d\'exécution réserve.');
const regle = GPJ.slice(iRegle, iPointC);
ok(iRegle > 0 && iRegle < iPointC, 'la règle tourne AVANT la réservation (Point C)');
ok(/\.eq\("action", "republish"\)\.in\("status", \["pending", "processing"\]\)\s*\.eq\("platform_fields->>republish_step", "deleted"\)/.test(regle), 'même lecture que l\'extension : republish, pending/processing, étape deleted');
ok(/String\(h\["platform"\]\) === String\(j\.platform\) && String\(h\["id"\]\) !== String\(j\.id\)/.test(regle), 'même plateforme, un AUTRE job');
ok(/String\(pfJ\["republish_step"\] \?\? ""\) !== "captured"/.test(regle), 'seulement l\'étape « captured » (le retrait qui allait partir)');
ok(/if \(prec && typeof prec === "object" && String\(prec\["job"\] \?\? ""\) === String\(frere\["id"\]\)\) continue; \/\/ déjà dit/.test(regle), 'motif écrit UNE fois (pas une écriture par passage)');
ok(/jobs_reservations_extension"\)\.delete\(\)\.eq\("job_id", String\(j\.id\)\)/.test(regle), 'réservation remise à zéro : jamais « servie 60 fois »');
ok(/if \(retenus\.size\) out = out\.filter\(\(j\) => !retenus\.has\(String\(j\.id\)\)\);/.test(regle), 'la tâche retenue n\'est PAS servie');
ok(/\.eq\("id", j\.id as string\)\.eq\("status", "pending"\)/.test(regle), 'écriture en compare-and-swap sur pending');
ok(/selling-restriction/.test(regle) && /Vinted a restreint les mises en vente de ton compte/.test(GPJ), 'restriction Vinted du compte nommée (jamais « rien à faire »)');
ok(/catch \(e\) \{\n\s+console\.warn\(`\[get-pending-jobs\] retenue « une annonce hors ligne »/.test(regle), 'lecture impossible → servi comme avant (l\'extension garde sa garde)');

console.log('\n2. Ce qui est servi ne s\'écrit pas');
const fn = GPJ.slice(GPJ.indexOf('function pfAPersister('), GPJ.indexOf('function pfAPersister(') + 600);
ok(/delete p\["republish_copie_servie"\]/.test(fn) && /snap\["servi_par_le_serveur"\] === true\) delete p\["republish_snapshot"\]/.test(fn), 'la copie servie et sa trace sont retirées avant écriture');
ok(/!\("republish_copie_servie" in pf\)\) return pf;/.test(fn), 'sans copie servie : rien ne change');
const apresService = GPJ.slice(GPJ.indexOf('republish_snapshot: copieRepublishDepuisCapture(pf, cap),'));
const ecritures = apresService.match(/\.update\(\{[^}]*platform_fields: [a-zA-Z]+[^}]*\}\)/g) ?? [];
const nues = ecritures.filter((e) => !/platform_fields: pfAPersister\(/.test(e) && !/platform_fields: pfPersiste/.test(e) && !/platform_fields: pfW/.test(e));
ok(nues.length === 0, `toutes les écritures de platform_fields après le service passent par pfAPersister (${ecritures.length} vues)`, nues.join(' | '));
const { pfAPersister } = await (async () => {
  const src = fn.slice(0, fn.indexOf('\n}\n') + 3)
    .replace(/ as Record<string, unknown> \| null \| undefined/g, '')
    .replace(/: Record<string, unknown>/g, '');
  return import(`data:text/javascript,${encodeURIComponent(`export ${src}`)}`);
})();
const servi = { a: 1, republish_copie_servie: { capture_id: 9 }, republish_snapshot: { servi_par_le_serveur: true, titre: 'x' } };
const r = pfAPersister(servi);
ok(!('republish_copie_servie' in r) && !('republish_snapshot' in r) && r.a === 1 && 'republish_snapshot' in servi, 'exécuté : copie servie retirée, l\'objet servi intact');
const ext = { a: 1, republish_copie_servie: { capture_id: 9 }, republish_snapshot: { titre: 'de l\'extension' } };
ok(pfAPersister(ext).republish_snapshot?.titre === 'de l\'extension', 'exécuté : une copie de l\'extension n\'est jamais retirée');
const neutre = { a: 1 };
ok(pfAPersister(neutre) === neutre, 'exécuté : sans copie servie, le même objet');

console.log('\n3. La mise de côté reste pour les vrais cas');
ok(/if \(!tacheAMettreDeCote\(j, resa\)\) continue;/.test(GPJ), '« tâche sans démarrage » : règle inchangée pour le reste');

console.log('\n4. L\'extension 0.6.107');
ok(/async function retenirDerriereAnnonceHorsLigne\(/.test(BG) && (BG.match(/await retenirDerriereAnnonceHorsLigne\(accessToken, job, pf, horsLigne\[0\]\)/g) ?? []).length === 2, 'retenue écrite (Vinted et LBC/Beebs/Depop) au lieu du silence');
const txtExt = BG.slice(BG.indexOf('async function retenirDerriereAnnonceHorsLigne('), BG.indexOf('async function retenirDerriereAnnonceHorsLigne(') + 1500);
ok(txtExt.includes("Les autres republications attendent sa remise en ligne, pour ne jamais laisser deux annonces hors ligne. Rien n'a été retiré.")
  && GPJ.includes("Les autres republications attendent sa remise en ligne, pour ne jamais laisser deux annonces hors ligne. Rien n'a été retiré."), 'même texte côté serveur et côté extension');
ok(/selling-restriction/.test(VJS), 'vinted.js reconnaît /selling-restriction');
ok(/CAPTURE_VINTED_BORNE_MS\s*=\s*90/.test(BG) || /CAPTURE_VINTED_BORNE_MS = 90_000/.test(BG), 'capture de republication bornée à 90 s (ltouze)');
// (11/10) La 0.6.108 embarque la 0.6.107 (jamais téléversée) : 0.6.107 OU PLUS.
ok((() => {
  const v = (lire('chrome-extension/manifest.json').match(/"version": "(\d+)\.(\d+)\.(\d+)"/) || []).slice(1).map(Number);
  return v.length === 3 && v[0] * 1e6 + v[1] * 1e3 + v[2] >= 6107;
})(), 'manifest 0.6.107 ou plus');

console.log('\n5. Le rattrapage, par la règle');
ok(/platform_fields ->> 'needs_user_source' = 'tache_sans_demarrage'/.test(RATT) && /platform_fields ->> 'republish_step' = 'captured'/.test(RATT)
  && /f\.platform_fields ->> 'republish_step' = 'deleted'/.test(RATT), 'seules les tâches mises de côté à tort (frère à l\'étape « deleted »)');
ok(/SET status = 'pending', error = NULL/.test(RATT) && /erreurs_archivees/.test(RATT), 'relance : en file, erreur archivée');
ok(/- 'republish_copie_servie'/.test(RATT) && /servi_par_le_serveur'\) = 'true' THEN 'republish_snapshot'/.test(RATT), 'la copie servie figée par erreur est retirée (nouvelle capture avant tout retrait)');
ok(/_backup_1110_republications_retenues/.test(RATT), 'sauvegarde avant');

console.log(echecs ? `\n✗ ${echecs} échec(s)` : '\nTOUT PASSE');
process.exit(echecs ? 1 : 0);
