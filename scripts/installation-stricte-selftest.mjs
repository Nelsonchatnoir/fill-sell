// selftest:installation-stricte (06/11/2026) — l'installation des builds ne réécrit JAMAIS package-lock.json.
// Incident du 06/11 : package.json passé à 2.9.161 sans son lock ; `npm install` (installation par défaut de Vercel,
// et celle de Codemagic) a réécrit le lock, l'arbre est devenu « sale » et la garde d'arbre propre (vite.config.js) a
// refusé de servir — Vercel fbb309f 12:11 et 6cd8b6e 12:25 en ERREUR, Codemagic 172 en échec ; le site est resté sur
// 8bd22d6 (05/11 23:04) jusqu'à a61d0ec (12:30). La garde a fait son travail : on ne la touche pas.
// Règle : `npm ci` partout où un build s'installe (il n'écrit jamais le lock, et s'arrête net, message clair, si le
// lock ne suit pas package.json) ; le lock porte la version et les dépendances de package.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const pkg = JSON.parse(lire('package.json'));
const lock = JSON.parse(lire('package-lock.json'));
const racine = lock.packages?.[''] ?? {};

// 1. Le lock suit package.json : version (deux endroits) et dépendances déclarées.
ok(lock.version === pkg.version, `package-lock.json « version » ${lock.version} ≠ package.json ${pkg.version} (npm i --package-lock-only)`);
ok(racine.version === pkg.version, `package-lock.json packages[""].version ${racine.version} ≠ package.json ${pkg.version}`);
for (const champ of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  ok(JSON.stringify(racine[champ] ?? {}) === JSON.stringify(pkg[champ] ?? {}), `package-lock.json ${champ} ≠ package.json ${champ} (npm i --package-lock-only)`);
}

// 2. Vercel installe par `npm ci` (vercel.json, installCommand) — jamais l'installation par défaut (`npm install`).
const vercel = JSON.parse(lire('vercel.json'));
ok(vercel.installCommand === 'npm ci', `vercel.json installCommand = ${JSON.stringify(vercel.installCommand)}, attendu "npm ci"`);
ok(vercel.buildCommand === 'npm run build:vercel', 'vercel.json buildCommand inchangé (npm run build:vercel)');

// 3. Codemagic (binaire iOS) aussi : aucune étape « npm install ».
const codemagic = lire('codemagic.yaml');
ok(/script:\s*npm ci\b/.test(codemagic), 'codemagic.yaml : l\'étape « Install dependencies » lance npm ci');
ok(!/^\s*(?:-\s*)?(?:script:\s*)?npm (?:install|i)\b/m.test(codemagic), 'codemagic.yaml : plus aucun npm install');

// 4. La garde d'arbre propre reste en place (on ne la contourne pas).
const vite = lire('vite.config.js');
ok(/if \(command === 'build'\) assertArbrePropre\(\)/.test(vite), 'vite.config.js garde son refus d\'arbre sale (assertArbrePropre au build)');

console.log(`✓ selftest:installation-stricte — ${n} vérifications`);
