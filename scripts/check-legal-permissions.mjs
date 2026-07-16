#!/usr/bin/env node
// Garde-fou build : vérifie que le tableau des permissions de l'extension sur
// la page /legal (const `extensionPermissions` dans src/pages/Legal.jsx) reste
// aligné 1:1 avec chrome-extension/manifest.json (permissions + host_permissions).
//
// Objectif : au moment de soumettre l'extension au Chrome Web Store, la page de
// confidentialité doit justifier CHAQUE permission déclarée — ni oubli, ni
// entrée fantôme. Ce script casse le build si les deux listes divergent.
//
// Lancé automatiquement avant `vite build` (script `prebuild` de package.json),
// et manuellement via `npm run check:legal-permissions`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'chrome-extension', 'manifest.json');
const LEGAL = path.join(ROOT, 'src', 'pages', 'Legal.jsx');

function fail(msg) {
  console.error('\n❌ check:legal-permissions — désynchronisation détectée\n');
  console.error(msg);
  console.error('\n→ Corrige la const `extensionPermissions` dans src/pages/Legal.jsx');
  console.error('  pour qu\'elle corresponde exactement à chrome-extension/manifest.json,');
  console.error('  puis relance le build.\n');
  process.exit(1);
}

// 1) Clés déclarées dans le manifest.
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  fail(`Impossible de lire/parser ${path.relative(ROOT, MANIFEST)} : ${e.message}`);
}
const manifestKeys = [
  ...(manifest.permissions || []),
  ...(manifest.host_permissions || []),
];
if (manifestKeys.length === 0) {
  fail('Aucune permission trouvée dans le manifest — vérifie le fichier manifest.json.');
}

// 2) Clés listées dans la const extensionPermissions de Legal.jsx.
const legalSrc = readFileSync(LEGAL, 'utf8');
const blockMatch = legalSrc.match(/const extensionPermissions = \[([\s\S]*?)\n\];/);
if (!blockMatch) {
  fail(
    "Bloc `const extensionPermissions = [ ... ];` introuvable dans src/pages/Legal.jsx.\n" +
    'Le format a peut-être changé : adapte ce script (scripts/check-legal-permissions.mjs).'
  );
}
const legalKeys = [...blockMatch[1].matchAll(/key:\s*(['"])(.*?)\1/g)].map((m) => m[2]);
if (legalKeys.length === 0) {
  fail("Aucune entrée `key: '...'` trouvée dans la const extensionPermissions.");
}

// 3) Comparaison bidirectionnelle.
const manifestSet = new Set(manifestKeys);
const legalSet = new Set(legalKeys);

const missingInLegal = manifestKeys.filter((k) => !legalSet.has(k)); // dans le manifest, absent du tableau
const extraInLegal = legalKeys.filter((k) => !manifestSet.has(k)); // dans le tableau, absent du manifest

// Doublons éventuels dans le tableau (source de faux positifs / oublis).
const dupes = legalKeys.filter((k, i) => legalKeys.indexOf(k) !== i);

if (missingInLegal.length || extraInLegal.length || dupes.length) {
  const parts = [];
  if (missingInLegal.length) {
    parts.push(
      `Clé(s) du manifest ABSENTE(S) du tableau /legal :\n  - ${missingInLegal.join('\n  - ')}`
    );
  }
  if (extraInLegal.length) {
    parts.push(
      `Entrée(s) du tableau /legal sans clé correspondante dans le manifest :\n  - ${extraInLegal.join('\n  - ')}`
    );
  }
  if (dupes.length) {
    parts.push(`Doublon(s) dans le tableau /legal :\n  - ${[...new Set(dupes)].join('\n  - ')}`);
  }
  fail(parts.join('\n\n'));
}

console.log(
  `✅ check:legal-permissions — ${manifestKeys.length} clés du manifest alignées 1:1 avec le tableau /legal.`
);
