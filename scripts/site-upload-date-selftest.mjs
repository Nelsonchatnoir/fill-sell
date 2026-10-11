// Autotest : VideoObject.uploadDate = ISO 8601 COMPLET AVEC FUSEAU (11/10/2026).
//
//     npm run selftest:site-upload-date
//
// Search Console (Vidéos, https://fillsell.app/) : « fuseau horaire manquant »
// et « valeur de date et heure incorrecte » sur uploadDate (« 2026-10-09 »).
// Ce qu'il prouve, sans réseau :
//   1. dateHeureParis : le jour seul → midi, heure de Paris, décalage du jour
//      (+02:00 l'été, +01:00 l'hiver) ; une date-heure complète est gardée ;
//      une valeur illisible → null (jamais une date inventée) ;
//   2. le gabarit JSON-LD passe par dateHeureParis et arrête le build sinon ;
//   3. le vérificateur du site refuse un uploadDate sans heure ni fuseau, sur
//      TOUTE page qui porte un VideoObject.
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const D = await import(pathToFileURL(join(ROOT, 'scripts/site/lib/dates.mjs')).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

console.log('1. dateHeureParis');
ok(D.dateHeureParis('2026-10-09') === '2026-10-09T12:00:00+02:00', '« 2026-10-09 » → 2026-10-09T12:00:00+02:00 (heure d’été)');
ok(D.dateHeureParis('2026-12-01') === '2026-12-01T12:00:00+01:00', '« 2026-12-01 » → +01:00 (heure d’hiver)');
ok(D.dateHeureParis('2026-10-25') === '2026-10-25T12:00:00+01:00', 'jour du passage à l’heure d’hiver : +01:00 à midi');
ok(D.dateHeureParis('2026-10-09T08:30:00+02:00') === '2026-10-09T08:30:00+02:00', 'date-heure complète avec fuseau : gardée');
ok(D.dateHeureParis('2026-10-09T08:30:00Z') === '2026-10-09T08:30:00Z', '« Z » est un fuseau : gardée');
ok(D.dateHeureParis('2026-10-09T08:30:00') === null, 'date-heure SANS fuseau : refusée');
ok(D.dateHeureParis('2026-02-31') === null && D.dateHeureParis('') === null && D.dateHeureParis(null) === null, 'date qui n’existe pas, vide, null : refusées');
ok(D.dateHeureFuseauValide('2026-10-09T12:00:00+02:00') && !D.dateHeureFuseauValide('2026-10-09'), 'dateHeureFuseauValide : complet oui, jour seul non');

console.log('2. le gabarit JSON-LD');
const g = lire('site/gabarits/donnees-structurees.mjs');
ok(/const uploadDate = dateHeureParis\(v\.miseEnLigne\);/.test(g) && /\n    uploadDate,\n/.test(g), 'VideoObject.uploadDate passe par dateHeureParis');
ok(/if \(!uploadDate\) throw new Error/.test(g), 'illisible : le build s’arrête (jamais un uploadDate faux en ligne)');

console.log('3. le vérificateur du site');
const v = lire('scripts/site/verify-site.mjs');
ok(/if \(n\.uploadDate && !dateHeureFuseauValide\(n\.uploadDate\)\) err\(/.test(v), 'tout VideoObject : uploadDate sans heure ni fuseau = erreur de build');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
