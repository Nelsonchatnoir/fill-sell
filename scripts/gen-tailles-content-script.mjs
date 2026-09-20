// ═══════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE DES TAILLES, PORTÉ DANS L'EXTENSION (2026-09-20, passe 4)
// ═══════════════════════════════════════════════════════════════════════════
// POURQUOI CE GÉNÉRATEUR EXISTE. Le pré-vol Opla comparait la taille de
// l'article à la grille de la feuille avec `grille.indexOf(taille)` — une
// égalité de CHAÎNES. Résultat mesuré : « 5 ans » refusé par
// LEGGINGS_GIRLS_NEW, dont la grille contient `5Y` dont le titre est
// littéralement « 5 ans ». Le module qui sait traduire ça existe depuis le
// 18/09 (`supabase/functions/_shared/tailles.js`) — mais il vit côté serveur,
// et le content script ne pouvait pas l'appeler.
//
// ⛔ ON NE RÉÉCRIT PAS LA RÈGLE. Deux copies d'un vocabulaire, c'est la
//    garantie qu'une des deux dérivera. Ce script RECOPIE le module, à
//    l'octet près, en remplaçant seulement les `export` par une publication
//    sur globalThis (les content scripts MV3 ne sont pas des modules ES).
//    `selftest:tailles-content-script` refuse toute divergence.
//
//   node scripts/gen-tailles-content-script.mjs
import fs from 'node:fs';

const SOURCE = 'supabase/functions/_shared/tailles.js';
const CIBLE = 'chrome-extension/content-scripts/tailles-vocabulaire.js';

const src = fs.readFileSync(SOURCE, 'utf8');
// Les deux seules formes exportées par le module. Tout `export` non reconnu
// ferait planter le content script (les scripts MV3 ne sont pas des modules) :
// on le dit ici plutôt que de le découvrir dans Chrome.
const corps = src
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ');
const restant = corps.match(/^export\b.*$/m);
if (restant) {
  console.error(`⛔ forme d'export non gérée par le générateur : ${restant[0]}`);
  process.exit(1);
}

const entete = [
  '// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.',
  '//   node scripts/gen-tailles-content-script.mjs',
  `// Source : ${SOURCE} (recopiée à l'octet près, seuls les \`export\` tombent).`,
  '//',
  '// Les content scripts MV3 ne sont pas des modules ES : le vocabulaire se',
  '// publie sur globalThis, comme opla-prevol.js le fait pour ses propres',
  '// fonctions. Injecté par OPLA_SCRIPTS (background.js), AVANT opla-prevol.js.',
  '',
].join('\n');

const pied = [
  '',
  '// ── PUBLICATION ────────────────────────────────────────────────────────',
  'globalThis.taillesVocabulaire = {',
  '  memeTaille, tailleDansGrille, diagnosticTaille, TAILLE_FEMME_LETTRE_PAR_NOMBRE,',
  '};',
  '',
].join('\n');

fs.writeFileSync(CIBLE, entete + corps + pied);
console.log(`${CIBLE} régénéré depuis ${SOURCE} (${corps.length} caractères de règle recopiés).`);
