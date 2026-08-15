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
//   4. l'horodatage du build est >= EXTENSION_LAST_COMMIT, c'est-à-dire que le
//      paquet contient bien le dernier commit touchant chrome-extension/ —
//      c'est LA garantie qui manquait le 24/07. (Avant le 29/07 la comparaison
//      portait sur EXTENSION_MIN_BUILD, qui désigne depuis la scission le
//      dernier build PUBLIÉ : la comparer ici ne garantissait plus rien.) ;
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
import { EXTENSION_LAST_COMMIT, EXTENSION_MIN_BUILD } from './build-id.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'build', 'extension');
const ZIP_DIR = path.join(ROOT, 'build');

// Versions déjà acceptées par le Chrome Web Store.
// 0.4.1 n'y figure PAS : jamais soumise (sautée au profit de la 0.4.2).
// 0.4.4 ajoutée le 27/07 : paquet remis à Nico pour téléversement — la 0.4.5
// la remplace, la re-packager ne servirait qu'à se faire rejeter par le CWS.
// 0.4.5 ajoutée le 30/07 : en ligne au CWS, la 0.4.6 la remplace (fix marque
// Vinted 1f31a04 + observatoire).
// 0.4.6 ajoutée le 31/07 — geste POST-PUBLICATION oublié en son temps, rattrapé
// ici : la preuve qu'elle est bien en ligne est en base, 3 installs du parc
// remontent son build (profiles.extension_build = 2026-07-29T22:15:21Z+fcffcfe,
// handler_build « … · v0.4.6 »). Sans cette ligne, rien n'empêchait de
// re-packager une 0.4.6 que le Web Store aurait rejetée.
// 0.4.7, 0.4.8 et 0.5.0 ajoutées le 06/08 : les zips 0.4.7/0.4.8 existaient
// sans avoir jamais été inscrits ici (la liste ne protégeait plus contre un
// re-téléversement) ; la 0.5.0 est acceptée et servie par le CWS ce jour.
// 0.5.1 ajoutée le 07/08 : acceptée et SERVIE par le CWS — preuve en base, un
// utilisateur externe (inscrit 01/08, jamais en unpacked) remonte
// extension_version='0.5.1' / build 2026-08-06T16:16:49Z+e35053b, vu le 07/08.
// 0.5.2 et 0.5.3 ajoutées le 09/08 : la 0.5.3 est acceptée et SERVIE par le
// CWS ce jour (elle porte les 2 fixes Vinted d'Ornella — « Sans marque »
// natif + garde photos) ; la 0.5.2, empaquetée le 07/08, a été remplacée par
// la 0.5.3 avant d'aller au bout — la re-packager ne servirait qu'à se faire
// rejeter. La 0.5.4 les remplace.
// 0.5.6, 0.5.7 et 0.5.8 ajoutées le 10/08 — RATTRAPAGE, même nature que celui
// de la 0.4.6 : la liste était en retard de TROIS versions et ne protégeait
// donc plus de rien. Preuve en base, relevé sur 7 jours de heartbeats
// (profiles.extension_version / extension_build) :
//   0.5.8 → 5 comptes, build 2026-08-09T19:39:31Z+f6a00c5 (dont un utilisateur
//           externe installé depuis le CWS 4 min après son inscription) ;
//   0.5.6 → 1 compte, build 2026-08-09T14:16:20Z+349d45a.
// La 0.5.7 n'a pas d'install au compteur : empaquetée puis remplacée par la
// 0.5.8 avant d'aller au bout — inscrite ici par prudence, la re-packager ne
// servirait qu'à se faire rejeter.
// Sans ces trois lignes, la garde « version jamais publiée » laissait passer un
// paquet 0.5.8 et c'est le Chrome Web Store qui refusait, APRÈS coup.
// 0.6.1 : publiée et acceptée par le CWS le 12/08 (23 comptes dessus le soir
// même, vérifié en base par Nico) — le manifest passe en 0.6.2 du même geste.
// 0.6.2 : publiée et acceptée par le CWS (confirmé par Nico le 13/08) — le
// manifest passe en 0.6.3 du même geste (branche ext-0.6.3-cause403, basée
// sur 7971dc4 = la 0.6.2 publiée, SANS les commits matière/selectSizeByIds
// de main : seul le prouvé part en circulation, consigne du 13/08).
// 0.6.3 et 0.6.4 ajoutées le 14/08 (rattrapage, même nature que 0.5.2/0.5.7) :
// paquets construits sur la branche ext-0.6.3-cause403, remplacés avant
// d'aller au bout — les re-packager ne servirait qu'à se faire rejeter.
// 0.6.5 ajoutée le 15/08 SANS avoir été téléversée : le zip
// fillsell-extension-0.6.5-dff6cdd.zip (livré le 14/08, écarté en
// anciens-zips) reste le seul 0.6.5 légitime — un second zip 0.6.5 serait
// indiscernable de lui, et un zip pris sur MAIN embarquerait F1 (1fc9beb).
// Le paquet courant est la 0.6.6 (branche ext-0.6.5-sans-f1, d235bc3 :
// vérification Vinted réparée + stampVintedItemId + fixes Marque/eBay, sans
// F1). Tout paquet DEPUIS MAIN exige un bump de version ET une décision
// explicite sur F1.
const ALREADY_PUBLISHED = ['0.4.0', '0.4.2', '0.4.3', '0.4.4', '0.4.5', '0.4.6', '0.4.7', '0.4.8', '0.5.0', '0.5.1', '0.5.2', '0.5.3', '0.5.5', '0.5.6', '0.5.7', '0.5.8', '0.5.9', '0.6.1', '0.6.2', '0.6.3', '0.6.4', '0.6.5'];

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

// 4. le paquet contient bien le dernier code extension committé
const iso = buildId.split('+')[0];
if (Date.parse(iso) < Date.parse(EXTENSION_LAST_COMMIT)) {
  die(`le build (${iso}) est ANTÉRIEUR à EXTENSION_LAST_COMMIT (${EXTENSION_LAST_COMMIT}) :
  le paquet ne contient pas le dernier commit touchant chrome-extension/ —
  exactement le 24/07 (deux jours d'utilisateurs sur du code d'avant le fix).
  Rebuild, ou corrige la constante dans scripts/build-id.mjs si elle est en avance.`);
}

// 5. version jamais publiée
const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8'));
if (ALREADY_PUBLISHED.includes(manifest.version)) {
  die(`manifest en ${manifest.version}, déjà téléversée : le Chrome Web Store rejettera
  le paquet. Bumpe "version" dans chrome-extension/manifest.json (et
  EXTENSION_LAST_COMMIT dans le même commit), puis ajoute l'ancienne version à
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
console.log(`\n  Après une publication ACCEPTÉE, DEUX gestes dans scripts/ :`);
console.log(`    1. ajouter "${manifest.version}" à ALREADY_PUBLISHED (package-extension.mjs) ;`);
console.log(`    2. dans build-id.mjs, recopier EXTENSION_LAST_COMMIT (${EXTENSION_LAST_COMMIT})`);
console.log(`       dans EXTENSION_MIN_BUILD (actuellement ${EXTENSION_MIN_BUILD}) puis pousser`);
console.log(`       le web : c'est CE geste qui allume la bannière « extension obsolète ».`);
console.log(`       Tant qu'il n'est pas fait, personne n'est prévenu ; fait trop tôt, tout`);
console.log(`       le parc voit un bandeau sans version à installer (vécu le 29/07).`);
