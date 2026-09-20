// ═══════════════════════════════════════════════════════════════════════════
// UN CHAMP ISBN ABSENT N'ARRÊTE PLUS UNE REPUBLICATION (2026-09-20, passe 3)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS : laforge.vinted@gmail.com, « Black Clover tome 2 – Yûki Tabata »,
// republication du 20/09 à 14:02, build v0.6.47 → needs_user sur
// « Élément introuvable: #isbn, [data-testid="isbn--input"] ».
// Le MÊME après-midi, le MÊME compte, le MÊME build et la MÊME série ont
// republié SEPT mangas sans un accroc — Black Clover tome 1 compris.
//
// RELEVÉ LIVE SUR VINTED, formulaire de dépôt réel, 20/09 :
//   · formulaire frais, aucune catégorie → `#isbn` N'EXISTE PAS ;
//   · catégorie « Bandes dessinées, mangas et romans graphiques » (celle du
//     job, catalog 5425) → `#isbn` apparaît en 186 ms, avec `id="isbn"` ET
//     `data-testid="isbn--input"`.
//   Les deux sélecteurs sont BONS. Le plafond n'a jamais été le problème.
//
// LA VRAIE CAUSE, lue dans les champs du job : `last_diagnostic` = « photos:
// 3 injectée(s), 0 vignette(s) posée(s), 0 POST /api/v2/photos 2xx, budget
// 15000 ms épuisé » et `erreurs_archivees` = « Reprise après interruption
// (bloqué 15 min en cours de traitement) ». La page n'était pas dans l'état
// attendu ; l'ISBN est seulement le premier champ dépendant de la catégorie,
// donc le premier à s'en apercevoir.
//
// ET C'ÉTAIT FATAL POUR RIEN : `etape()` n'avale les erreurs qu'en
// RECRÉATION. En une-passe, le throw arrêtait toute la republication.
//
//   node scripts/isbn-champ-absent-selftest.mjs
import fs from 'node:fs';

let echecs = 0;
const dit = (ok, quoi) => { if (!ok) echecs++; console.log(`${ok ? '  ok  ' : ' ÉCHEC'}  ${quoi}`); };
const vinted = fs.readFileSync('chrome-extension/content-scripts/vinted.js', 'utf8');

console.log('1. Le champ absent ne casse plus rien');
dit(/const ISBN_ATTENTE_MS = 15_000;/.test(vinted),
  'un plafond d\'attente nommé (15 s), pas le défaut de waitForElement');
dit(/waitForElement\('#isbn, \[data-testid="isbn--input"\]', ISBN_ATTENTE_MS\)\.catch\(\(\) => null\)/.test(vinted),
  'l\'attente du champ ISBN ne lève plus : elle rend null');
const apresAttente = vinted.slice(vinted.indexOf('ISBN_ATTENTE_MS).catch'));
dit(apresAttente.indexOf('if (!el)') >= 0
    && apresAttente.indexOf('return;') > apresAttente.indexOf('if (!el)')
    && apresAttente.indexOf('return;') - apresAttente.indexOf('if (!el)') < 900,
  'champ absent ⇒ on SAUTE l\'étape et on continue');
dit(/aucun ISBN inventé/.test(vinted), 'le message dit qu\'on n\'invente rien (G5)');

console.log('\n2. Les deux sélecteurs relevés en vrai sont toujours là');
dit(/#isbn, \[data-testid="isbn--input"\]/.test(vinted),
  '#isbn ET [data-testid="isbn--input"] — les deux existent sur le formulaire réel');

console.log('\n3. Ce qui ne doit PAS avoir bougé');
dit(/if \(!recreation\) throw e;/.test(vinted),
  '`etape()` reste bloquante en une-passe pour toutes les AUTRES étapes');
dit(/traité comme ISBN ABSENT/.test(vinted),
  'un ISBN illisible vaut toujours ISBN absent (correctif du matin, cas « 00 »)');
const ujs = fs.readFileSync('supabase/functions/update-job-status/index.ts', 'utf8');
dit(/livres_isbn_garde/.test(ujs),
  'la garde `livres_isbn_garde` vit toujours côté serveur — elle n\'est pas touchée');
dit((vinted.match(/livres_isbn_garde/g) || []).length === 1
    && /N'EST PAS TOUCHÉE/.test(vinted),
  'l\'extension ne fait que la NOMMER dans un commentaire — elle ne la réimplémente pas');

console.log(`\n${echecs === 0 ? '✅ Un champ ISBN absent saute l\'étape ; la garde des livres, elle, tient toujours.' : `❌ ${echecs} échec(s).`}`);
process.exit(echecs === 0 ? 0 : 1);
