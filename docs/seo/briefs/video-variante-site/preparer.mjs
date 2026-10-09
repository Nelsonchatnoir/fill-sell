// Prépare le dossier de travail de la variante « site » (09/10/2026, compte « Camille »).
// Lit SEULEMENT : C:\Users\nicol\fillsell-video (sources Remotion d'origine) et ce worktree
// (photos libres public/landing/*.webp, captures site/medias/captures/*.png). N'écrit QUE dans
// <dossier> (jamais dans fillsell-video).
//
//   node docs/seo/briefs/video-variante-site/preparer.mjs <dossier>
//
// Puis, dans <dossier> : `patch -p1 < <ce dossier>/variante-site.patch` (src/ui.tsx : logos de
// l'app dont Depop, cinq étapes, fondus courts, légendes).
// Les quatre autres fichiers sont RÉÉCRITS en entier et copiés depuis <ce dossier>/src/ (data.ts,
// scenesA.tsx, scenesB.tsx, scenesC.tsx) : un correctif les aurait portés avec les lignes retirées
// de l'original — les données du compte de Nico —, qu'on ne recopie nulle part.
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE = path.resolve(ICI, '..', '..', '..', '..');
const ORIGINE = 'C:/Users/nicol/fillsell-video';
const require = createRequire(path.join(WORKTREE, 'package.json'));
const sharp = require('sharp');

const dossier = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage : node preparer.mjs <dossier>');
if (path.resolve(dossier).toLowerCase().startsWith(path.resolve(ORIGINE).toLowerCase())) throw new Error('jamais dans fillsell-video');

fs.mkdirSync(dossier, {recursive: true});
// 1. Sources Remotion d'origine (lecture seule) : src, scripts, package.json, polices, logos.
//    PAS public/articles, public/ecrans ni music.wav : photos, captures et musique du compte de Nico.
for (const d of ['src', 'scripts']) fs.cpSync(path.join(ORIGINE, d), path.join(dossier, d), {recursive: true});
fs.copyFileSync(path.join(ORIGINE, 'package.json'), path.join(dossier, 'package.json'));
for (const d of ['fonts', 'logo', 'logos']) fs.cpSync(path.join(ORIGINE, 'public', d), path.join(dossier, 'public', d), {recursive: true});
// Les scènes et les données de la variante (compte « Camille ») remplacent celles d'origine.
for (const f of ['data.ts', 'scenesA.tsx', 'scenesB.tsx', 'scenesC.tsx']) fs.copyFileSync(path.join(ICI, 'src', f), path.join(dossier, 'src', f));

// 2. Photos du compte « Camille » : photos produit libres du dépôt (aucune donnée personnelle).
const articles = path.join(dossier, 'public', 'articles');
fs.mkdirSync(articles, {recursive: true});
for (const f of ['sweat-redbull', 'sweat-ohlins', 'short-polo', 'chaussures-cyrillus', 'casquette-volcom', 'tshirt-graphique']) {
  fs.copyFileSync(path.join(WORKTREE, 'public', 'landing', `${f}.webp`), path.join(articles, `${f}.webp`));
}

// 3. Découpes des VRAIES captures « Camille » du site (harnais scripts/apercu, 1170 × 2532).
const CAP = path.join(WORKTREE, 'site', 'medias', 'captures');
const ecrans = path.join(dossier, 'public', 'ecrans');
fs.mkdirSync(ecrans, {recursive: true});
const DECOUPES = {
  // « Ce mois 1268,00 € · 62 ventes » et « Marge moy. 68.5% » (rangée du haut des tuiles)
  'accueil-tuiles.png': ['accueil-tableau-de-bord.png', {left: 30, top: 1035, width: 1110, height: 430}],
  // carte « Ventes par plateforme » (Vinted, eBay, Depop, Leboncoin, Beebs ; « Meilleure marge : Depop »)
  'ventes-par-plateforme.png': ['statistiques-ventes-par-plateforme.png', {left: 30, top: 745, width: 1110, height: 875}],
  // carte « Meilleurs vendeurs » (2 j, 1 j, 3 j en stock)
  'meilleurs-vendeurs.png': ['statistiques-meilleurs-vendeurs.png', {left: 30, top: 180, width: 1110, height: 1010}],
};
for (const [sortie, [source, zone]] of Object.entries(DECOUPES)) {
  await sharp(path.join(CAP, source)).extract(zone).png().toFile(path.join(ecrans, sortie));
}
console.log('prêt :', dossier);
