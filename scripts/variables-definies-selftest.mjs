#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// AUCUNE VARIABLE NON DÉFINIE DANS L'APP — LE BUILD REFUSE (10/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Du 09/10 22:13 (2.9.70) au 10/10, toute publication EN LOT finissait en page
// blanche à la fin de la préparation : EcranAvant lisait `userId` puis
// `exclusDepop`, deux variables de l'écran parent qu'il ne recevait pas
// (« ReferenceError: userId is not defined »). Vite compile sans broncher une
// variable inconnue : le build était vert, l'erreur n'existait qu'à l'écran,
// et seulement quand la ligne s'exécutait. ESLint (`no-undef`) la voyait — mais
// personne ne lance `npm run lint` avant un push.
//
// Ce contrôle joue la SEULE règle `no-undef` sur src/ (mêmes globales que
// eslint.config.js, lues dans ce fichier : une constante `define` ajoutée là
// vaut ici) et échoue en nommant fichier, ligne et variable. Il tourne :
//   · avant chaque `npm run build` (hook prebuild : Vercel, OTA) ;
//   · à la main : `npm run selftest:variables-definies`.
// Mesuré le 10/10 : 0 variable non définie dans src/ après le correctif (2
// avant : LotPublication.jsx, userId et exclusDepop).
import { ESLint } from 'eslint';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const debut = Date.now();

// Les globales de l'app, telles que eslint.config.js les déclare pour **/*.{js,jsx}.
const config = (await import(pathToFileURL(path.join(RACINE, 'eslint.config.js')).href)).default;
const blocsApp = config.filter((c) => Array.isArray(c?.files) && c.files.includes('**/*.{js,jsx}'));
const globales = Object.assign({}, ...blocsApp.map((c) => c.languageOptions?.globals ?? {}));
if (!Object.keys(globales).length) {
  console.error('[variables-definies] globales introuvables dans eslint.config.js (bloc **/*.{js,jsx}) — contrôle impossible');
  process.exit(1);
}

const eslint = new ESLint({
  cwd: RACINE,
  overrideConfigFile: true, // la configuration ci-dessous SEULE : une règle, aucun plugin
  overrideConfig: [{
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globales,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { 'no-undef': 'error' },
  }],
});

const resultats = await eslint.lintFiles(['src/**/*.{js,jsx}']);
const fautes = [];
for (const r of resultats) {
  for (const m of r.messages) {
    if (m.ruleId === 'no-undef' || m.fatal) fautes.push(`${path.relative(RACINE, r.filePath)}:${m.line}:${m.column}  ${m.message}`);
  }
}
const duree = ((Date.now() - debut) / 1000).toFixed(1);
if (fautes.length) {
  console.error(`\n[variables-definies] ✗ ${fautes.length} variable(s) non définie(s) dans src/ — l'écran tomberait en page blanche à l'exécution de ces lignes :\n`);
  for (const f of fautes) console.error(`  ${f}`);
  console.error('\nPasser la valeur en prop (ou la déclarer) ; une globale du build va dans eslint.config.js.\n');
  process.exit(1);
}
console.log(`[variables-definies] ✓ ${resultats.length} fichiers de src/, aucune variable non définie (${duree} s)`);
