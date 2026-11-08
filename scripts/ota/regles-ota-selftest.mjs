// ═══════════════════════════════════════════════════════════════════════════
// GARDE DE L'ENVOI OTA — SELFTEST (08/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute les règles LIVRÉES (scripts/ota/regles-ota.mjs), les seules que lit `npm run ota`.
// Garantit :
//   1. la sortie RÉELLE de Capgo du 08/11 (updater 8.53.1 local / 8.51.2 au canal) est REFUSÉE, le module nommé ;
//   2. la sortie réelle après retour en 8.51.2 (9 modules OK) laisse passer ;
//   3. fermé par défaut : sortie vide, tronquée ou sans la phrase finale = refus ;
//   4. un module neuf (absent du canal, case vide au milieu) = refus ;
//   5. version ≤ canal, lock ≠ package.json, arbre sale, non poussé, worktree, autre branche = refus ;
//   6. le build doit porter le commit exact, jamais « -dirty ».
//
//   node scripts/ota/regles-ota-selftest.mjs

import { comparerVersions, lireCompatibilite, refusAvantEnvoi, buildConforme, CLI_CAPGO } from './regles-ota.mjs';

let ko = 0;
let n = 0;
const ok = (c, quoi) => { n++; if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

const ligne = (nom, local, distant, statut, detail) =>
  `│  │ ${nom.padEnd(30)} │ ${local.padEnd(6)} │ ${distant.padEnd(6)} │ ${statut.padEnd(6)} │ ${detail} │`;
const tete = ['┌  Check compatibility', '│', '◆  Compatibility Check Results', '│',
  '│  │ Package                        │ Local  │ Remote │ Status │ Details    │'];
const NEUF = [
  ['@capacitor/app', '8.1.0', '8.1.0'], ['@capacitor/browser', '8.0.3', '8.0.3'], ['@capacitor/camera', '8.2.0', '8.2.0'],
  ['@capacitor/haptics', '8.0.2', '8.0.2'], ['@capacitor/push-notifications', '8.1.3', '8.1.3'],
  ['@capacitor/splash-screen', '8.0.1', '8.0.1'], ['@capgo/capacitor-in-app-review', '8.2.4', '8.2.4'],
];
const sortieOk = [...tete, ...NEUF.map(([a, b, c]) => ligne(a, b, c, 'OK', 'Compatible')),
  ligne('@capgo/capacitor-updater', '8.51.2', '8.51.2', 'OK', 'Compatible'),
  ligne('@capgo/native-purchases', '8.3.3', '8.3.3', 'OK', 'Compatible'),
  '│', '◆', '│  All packages are compatible with channel "production"'].join('\n');
const sortieKo = [...tete, ...NEUF.map(([a, b, c]) => ligne(a, b, c, '✅', 'Compatible')),
  ligne('@capgo/capacitor-updater', '8.53.1', '8.51.2', '❌', 'version changed: 8.51.2 → 8.53.1, requested version changed: ^8.51.2 → ^8.53.1, iOS and Android native code changed'),
  ligne('@capgo/native-purchases', '8.3.3', '8.3.3', '✅', 'Compatible'),
  '│', '▲', '│  1 package(s) are incompatible with channel "production"'].join('\n');

console.log('1-2. Sorties réelles de Capgo');
const a = lireCompatibilite(sortieKo);
ok(a.lisible && !a.toutCompatible, '8.53.1 local / 8.51.2 au canal : incompatible');
ok(a.incompatibles.length === 1 && a.incompatibles[0].nom === '@capgo/capacitor-updater', 'le module fautif est nommé (updater)');
ok(a.incompatibles[0]?.local === '8.53.1' && a.incompatibles[0]?.distant === '8.51.2', 'versions locale et distante lues');
const b = lireCompatibilite(sortieOk);
ok(b.lisible && b.toutCompatible && b.modules.length === 9, 'après retour en 8.51.2 : 9 modules, tous compatibles');
ok(lireCompatibilite(`\x1b[1m${sortieOk}\x1b[0m`).toutCompatible, 'les codes couleur ne gênent pas la lecture');

console.log('3. Fermé par défaut');
ok(!lireCompatibilite('').lisible && !lireCompatibilite('').toutCompatible, 'sortie vide : illisible, refus');
ok(!lireCompatibilite(sortieOk.replace(/All packages are compatible[^\n]*/, '')).toutCompatible, 'sans la phrase finale : refus');
ok(!lireCompatibilite('│  All packages are compatible with channel "production"').toutCompatible, 'la phrase seule sans tableau : refus');
ok(!lireCompatibilite(sortieOk.replace('│ OK     │ Compatible │', '│ FAIL   │ native code changed │')).toutCompatible, 'un seul statut autre que OK : refus');

console.log('4. Module neuf, absent du canal');
const neuf = sortieOk.replace('│  All packages', `${ligne('@capacitor/geolocation', '8.0.0', '', 'FAIL', 'new native package')}\n│  All packages`);
const c = lireCompatibilite(neuf);
ok(!c.toutCompatible && c.incompatibles[0]?.nom === '@capacitor/geolocation' && c.incompatibles[0]?.distant === '', 'case vide au milieu gardée à sa place, module refusé');

console.log('5. Décision avant envoi');
const base = { branche: 'main', propre: true, poussee: true, worktree: false, versionPkg: '2.9.168', versionLock: '2.9.168', versionCanal: '2.9.166', versionsBinaires: ['2.9.167', '2.9.164'], compat: b };
ok(refusAvantEnvoi(base).length === 0, 'tout en ordre : voie libre');
ok(refusAvantEnvoi({ ...base, versionPkg: '2.9.167', versionLock: '2.9.167' }).some((r) => r.includes('binaire 2.9.167')), '2.9.167 = le binaire Android vc37 : refus (même au-dessus du canal 2.9.166)');
ok(refusAvantEnvoi({ ...base, versionsBinaires: ['x'] }).length === 1, 'version de binaire illisible : refus');
ok(refusAvantEnvoi({ ...base, compat: a }).some((r) => r.includes('@capgo/capacitor-updater 8.51.2 → 8.53.1')), 'updater changé : refus qui le nomme');
ok(refusAvantEnvoi({ ...base, compat: lireCompatibilite('') }).length === 1, 'compatibilité illisible : refus');
ok(refusAvantEnvoi({ ...base, versionPkg: '2.9.166', versionLock: '2.9.166' }).some((r) => r.includes('≤ canal 2.9.166')), 'version = canal : refus');
ok(refusAvantEnvoi({ ...base, versionPkg: '2.9.165', versionLock: '2.9.165' }).some((r) => r.includes('≤ canal 2.9.166')), 'version < canal : refus');
ok(refusAvantEnvoi({ ...base, versionPkg: '2.10.0', versionLock: '2.10.0' }).length === 0, '2.10.0 > 2.9.166 (comparaison numérique, pas texte)');
ok(refusAvantEnvoi({ ...base, versionLock: '2.9.167' }).length === 1, 'lock ≠ package.json : refus');
ok(refusAvantEnvoi({ ...base, propre: false }).length === 1, 'arbre sale : refus');
ok(refusAvantEnvoi({ ...base, poussee: false }).length === 1, 'non poussé : refus');
ok(refusAvantEnvoi({ ...base, worktree: true }).length === 1, 'worktree : refus');
ok(refusAvantEnvoi({ ...base, branche: 'feat/x' }).length === 1, 'autre branche : refus');
ok(refusAvantEnvoi({ ...base, versionCanal: 'inconnu' }).length === 1, 'canal illisible : refus');
ok(comparerVersions('2.9.10', '2.9.9') === 1 && comparerVersions('2.9.9', '2.9.10') === -1, '2.9.10 > 2.9.9');

console.log('6. Empreinte du build');
ok(buildConforme('2026-11-08T22:00:00Z+abc1234', 'abc1234'), 'commit exact : conforme');
ok(!buildConforme('2026-11-08T22:00:00Z+abc1234-dirty', 'abc1234'), '« -dirty » : refus');
ok(!buildConforme('2026-11-08T22:00:00Z+0000000', 'abc1234'), 'autre commit : refus');
ok(!buildConforme('', 'abc1234') && !buildConforme('x+abc1234', ''), 'empreinte ou commit absents : refus');
ok(/^@capgo\/cli@\d+\.\d+\.\d+$/.test(CLI_CAPGO), `CLI Capgo épinglé (${CLI_CAPGO})`);

console.log(`\n${n - ko}/${n} contrôles verts`);
if (ko) { console.log(`${ko} ROUGE(S)`); process.exit(1); }
