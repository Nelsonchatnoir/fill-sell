// `npm run selftest:content-scripts` — chaque script de l'extension est lu tel
// que Chrome le charge, et on vérifie qu'il ne référence aucun identifiant
// défini nulle part dans son monde d'exécution.
//
// POURQUOI (2026-09-09) : la 0.6.22 appelait `askBackground` depuis beebs.js
// alors que cette fonction n'était définie que dans vinted.js. Un content
// script ne voit que les scripts injectés AVEC lui sur le même site — sur
// beebs.app : ReferenceError, canal executeScript déclaré « indisponible », et
// la nouvelle branche « pas de catégorie sans pont » a refusé 100 % des
// publications Beebs du parc. Le lint du projet ne pouvait pas le voir :
// `eslint .` porte 227 erreurs no-undef de bruit sur chrome-extension/
// (`chrome`, `FILLSELL_CONFIG`), un identifiant absent de plus s'y noie.
//
// LE MONDE D'UN SCRIPT, lu dans manifest.json (jamais deviné) :
//   · content_scripts[i].js — les fichiers d'une même entrée sont injectés dans
//     le MÊME monde isolé, dans l'ordre : consentement.js et beebs.js se
//     voient, beebs.js et vinted.js ne se voient pas ;
//   · background.service_worker — importScripts("config.js") lui apporte
//     FILLSELL_CONFIG ;
//   · popup.js — config.js est chargé par <script> avant lui (popup.html).
// Deux fautes détectées : un identifiant ABSENT du monde, et une COLLISION
// (deux fichiers du même monde déclarent le même nom au niveau global — en
// scripts classiques, la seconde déclaration let/const/class lève une
// SyntaxError à l'injection).
//
// Usage :
//   node scripts/content-scripts-selftest.mjs            → tout le manifest
//   node scripts/content-scripts-selftest.mjs <fichiers>  → ces fichiers, lus
//     SEULS (utile pour juger un fichier isolé, ex. un beebs.js d'un autre commit)
// Sortie 0 si propre, 1 sinon (package:extension s'arrête dessus).
import { ESLint } from 'eslint';
import globals from 'globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'chrome-extension');
const COMMUNS = { ...globals.browser, ...globals.webextensions };

// Déclarations GLOBALES d'un script classique : function / const / let / var /
// class au début de ligne (niveau module). Suffisant pour les scripts du
// projet, qui n'ont pas de déclarations globales indirectes.
function declarationsGlobales(source) {
  const noms = new Set();
  const re = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(source))) noms.add(m[1] ?? m[2]);
  return noms;
}

async function identifiantsAbsents(fichier, source, extraGlobals) {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true, // ignore eslint.config.js : ce test a SES règles
    overrideConfig: [{
      files: ['**/*.js'],
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script', // chargés par Chrome comme des scripts classiques
        globals: { ...COMMUNS, ...extraGlobals },
      },
      rules: { 'no-undef': 'error' },
    }],
  });
  // lintText, pas lintFiles : un fichier hors du dépôt (ou ignoré) serait
  // silencieusement sauté — c'est exactement ce qui a rendu un premier essai
  // faussement vert sur la 0.6.22.
  const [res] = await eslint.lintText(source, { filePath: path.join(EXT, 'content-scripts', path.basename(fichier)) });
  return [...new Set(
    (res?.messages ?? []).filter((m) => m.ruleId === 'no-undef')
      .map((m) => `${(m.message.match(/'([^']+)'/) || [])[1] ?? m.message} (l.${m.line})`),
  )];
}

// ── Les mondes, lus dans le manifest ─────────────────────────────────────────
function mondesDuManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const mondes = [];
  for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
    mondes.push({
      nom: `content_scripts[${i}] ${(cs.matches ?? []).join(' ')}`,
      fichiers: (cs.js ?? []).map((f) => path.join(EXT, f)),
      extras: {},
    });
  }
  const sw = manifest.background?.service_worker;
  if (sw) {
    mondes.push({
      nom: 'background.service_worker',
      fichiers: [path.join(EXT, sw)],
      extras: { importScripts: 'readonly', FILLSELL_CONFIG: 'readonly', ...globals.serviceworker },
    });
  }
  if (fs.existsSync(path.join(EXT, 'popup.js'))) {
    mondes.push({ nom: 'popup.html', fichiers: [path.join(EXT, 'config.js'), path.join(EXT, 'popup.js')], extras: {} });
  }
  return mondes;
}

const argFichiers = process.argv.slice(2);
const mondes = argFichiers.length
  ? [{ nom: 'fichiers isolés (lus SEULS)', fichiers: argFichiers.map((f) => path.resolve(ROOT, f)), extras: {}, isoles: true }]
  : mondesDuManifest();

let fautes = 0;
for (const monde of mondes) {
  console.log(`\n▸ ${monde.nom}`);
  const sources = new Map(monde.fichiers.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const decls = new Map([...sources].map(([f, s]) => [f, declarationsGlobales(s)]));

  // Collisions : un nom déclaré globalement par deux fichiers du même monde.
  if (!monde.isoles && monde.fichiers.length > 1) {
    const vus = new Map();
    for (const [f, noms] of decls) {
      for (const n of noms) {
        if (vus.has(n)) {
          fautes++;
          console.error(`✗ collision : « ${n} » déclaré dans ${path.relative(ROOT, vus.get(n))} ET ${path.relative(ROOT, f)}`);
        } else vus.set(n, f);
      }
    }
  }

  for (const f of monde.fichiers) {
    // Ce que les AUTRES fichiers du monde lui apportent.
    const freres = {};
    if (!monde.isoles) {
      for (const [g, noms] of decls) if (g !== f) for (const n of noms) freres[n] = 'readonly';
    }
    const manquants = await identifiantsAbsents(f, sources.get(f), { ...monde.extras, ...freres });
    const rel = path.relative(ROOT, f);
    if (manquants.length) {
      fautes += manquants.length;
      console.error(`✗ ${rel} — identifiant(s) absent(s) de son monde : ${manquants.join(', ')}`);
    } else {
      console.log(`✓ ${rel}`);
    }
  }
}

if (fautes) {
  console.error(`\n[selftest:content-scripts] ÉCHEC — ${fautes} faute(s) : identifiant absent du monde qui l'appelle, ou nom déclaré deux fois dans un même monde.`);
  process.exit(1);
}
console.log('\n[selftest:content-scripts] OK — chaque script trouve tout ce qu\'il appelle dans son monde, sans collision.');
