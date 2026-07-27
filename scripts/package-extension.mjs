// `npm run package:extension` — produit le zip prêt à téléverser au Chrome Web
// Store, et REFUSE de le produire si l'artefact n'est pas celui qu'on croit.
//
// Existe à cause du 24/07 : le paquet livré au Web Store portait le BUILD_ID
// 2026-07-24T19:08:11Z+94c189e-dirty alors que le fix Beebs df6ebc1 était déjà
// sur main. Le zip n'était pas périmé au moment où il a été fait (écrit 53 s
// après son build) — il n'a simplement jamais été refait après le fix, et rien
// dans le processus manuel ne le disait. Deux jours d'utilisateurs sur du code
// d'avant les fixes.
//
// Ce que le script garantit, dans cet ordre :
//   1. répertoire de travail propre — sinon le BUILD_ID sort en -dirty et
//      l'artefact n'est plus rattachable à un commit (--allow-dirty pour forcer) ;
//   2. build depuis chrome-extension/ (la SOURCE), jamais depuis un
//      build/extension/ potentiellement périmé : build:extension le reconstruit
//      from scratch ;
//   3. le BUILD_ID du paquet contient bien le hash de HEAD, n'est pas -dirty, et
//      le jeton __FILLSELL_BUILD_ID__ a été substitué dans TOUS les .js ;
//   4. l'horodatage du build est >= EXTENSION_MIN_BUILD, sinon le paquet neuf
//      serait lui-même flaggé « extension pas à jour » par l'app web (vécu le
//      26/07 : constante bumpée à un horodatage postérieur au build) ;
//   5. la version du manifest n'a pas déjà été publiée — le Web Store rejette un
//      renvoi de la même version. La liste ci-dessous est tenue à la main : la
//      compléter à CHAQUE publication acceptée ;
//   6. manifest.json est à la RACINE du zip. Le Web Store rejette un zip qui
//      enveloppe l'extension dans un dossier — piège : le zip public de
//      fillsell.app (dist/fillsell-extension.zip) a volontairement un dossier
//      fillsell-extension/ parce qu'il est fait pour être décompressé et chargé
//      en « Load unpacked ». Les deux zips ne sont PAS interchangeables.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { EXTENSION_MIN_BUILD } from './build-id.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'build', 'extension');
const ZIP_DIR = path.join(ROOT, 'build');

// Versions déjà acceptées par le Chrome Web Store.
// 0.4.1 n'y figure PAS : jamais soumise (sautée au profit de la 0.4.2).
// 0.4.4 ajoutée le 27/07 : paquet remis à Nico pour téléversement — la 0.4.5
// la remplace, la re-packager ne servirait qu'à se faire rejeter par le CWS.
const ALREADY_PUBLISHED = ['0.4.0', '0.4.2', '0.4.3', '0.4.4'];

const allowDirty = process.argv.includes('--allow-dirty');
const git = cmd => execSync(`git ${cmd}`, { cwd: ROOT }).toString().trim();
const die = msg => { console.error(`\n[package:extension] REFUS — ${msg}\n`); process.exit(1); };

// 1. propreté du répertoire de travail
const porcelain = git('status --porcelain');
if (porcelain && !allowDirty) {
  die(`répertoire de travail sale : le BUILD_ID sortirait en -dirty et le paquet ne
  serait rattachable à aucun commit. Commite (ou .gitignore) ceci, puis relance :
${porcelain.split('\n').map(l => '    ' + l).join('\n')}
  (--allow-dirty pour forcer un paquet non traçable — à éviter pour le Web Store)`);
}
const head = git('rev-parse --short HEAD');
console.log(`[package:extension] HEAD = ${head}${porcelain ? ' (SALE, forcé)' : ''}`);

// 2. build depuis la source, jamais un dossier de sortie réutilisé
console.log('[package:extension] npm run build:extension (reconstruction from scratch)…');
execSync('npm run build:extension', { cwd: ROOT, stdio: 'inherit' });

// 3. le paquet porte bien HEAD, et le jeton est substitué partout
const bgPath = path.join(OUT_DIR, 'background.js');
const bg = fs.readFileSync(bgPath, 'utf8');
const m = /FILLSELL_BUILD_ID\s*=\s*"([^"]+)"/.exec(bg);
if (!m) die(`BUILD_ID introuvable dans ${path.relative(ROOT, bgPath)}`);
const buildId = m[1];

const jsFiles = [];
(function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) collect(abs);
    else if (/\.js$/i.test(e.name)) jsFiles.push(abs);
  }
})(OUT_DIR);
for (const f of jsFiles) {
  if (fs.readFileSync(f, 'utf8').includes('__FILLSELL_BUILD_ID__')) {
    die(`jeton __FILLSELL_BUILD_ID__ non substitué dans ${path.relative(OUT_DIR, f)}`);
  }
}
if (!buildId.includes(head)) die(`le BUILD_ID (${buildId}) ne contient pas le hash de HEAD (${head})`);
if (buildId.includes('-dirty') && !allowDirty) die(`BUILD_ID -dirty : ${buildId}`);

// 4. le paquet neuf ne doit pas être flaggé par sa propre constante
const iso = buildId.split('+')[0];
if (Date.parse(iso) < Date.parse(EXTENSION_MIN_BUILD)) {
  die(`le build (${iso}) est ANTÉRIEUR à EXTENSION_MIN_BUILD (${EXTENSION_MIN_BUILD}) :
  l'app web afficherait « extension pas à jour » sur le paquet neuf lui-même.
  Corrige la constante dans scripts/build-id.mjs, ou attends que l'heure passe.`);
}

// 5. version jamais publiée
const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8'));
if (ALREADY_PUBLISHED.includes(manifest.version)) {
  die(`manifest en ${manifest.version}, déjà téléversée : le Chrome Web Store rejettera
  le paquet. Bumpe "version" dans chrome-extension/manifest.json (et
  EXTENSION_MIN_BUILD dans le même commit), puis ajoute l'ancienne version à
  ALREADY_PUBLISHED ici.`);
}

// 6. zip avec manifest.json à la racine
const zip = new JSZip();
let count = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { walk(abs); continue; }
    zip.file(path.relative(OUT_DIR, abs).split(path.sep).join('/'), fs.readFileSync(abs));
    count += 1;
  }
})(OUT_DIR);
if (!zip.files['manifest.json']) die('manifest.json absent de la racine du zip');

const zipPath = path.join(ZIP_DIR, `fillsell-extension-${manifest.version}-cws.zip`);
fs.writeFileSync(zipPath, await zip.generateAsync({
  type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 },
}));

console.log(`\n[package:extension] PAQUET PRÊT`);
console.log(`  version manifest : ${manifest.version}`);
console.log(`  BUILD_ID         : ${buildId}`);
console.log(`  HEAD             : ${head}   (${git('log -1 --format=%cI')})`);
console.log(`  entrées          : ${count} (manifest.json à la racine)`);
console.log(`  taille           : ${(fs.statSync(zipPath).size / 1024).toFixed(0)} Ko`);
console.log(`  chemin           : ${zipPath}`);
console.log(`\n  Après une publication ACCEPTÉE : ajouter "${manifest.version}" à ALREADY_PUBLISHED.`);
