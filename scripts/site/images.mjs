#!/usr/bin/env node
// `npm run site:images` — variantes AVIF/WebP des images du site (09/10/2026).
//
// LOCAL SEULEMENT, jamais au build Vercel (revue C M7 : 85 ms à 2 s par image
// et par largeur ; sharp est un module natif qui n'a rien à faire sur le
// chemin du déploiement de l'app). Les sorties sont COMMITÉES dans
// site/medias/generees/ avec un manifeste (largeur, hauteur, empreinte de la
// source) que le générateur lit — `width`/`height` ne s'écrivent jamais à la
// main, et une source retouchée sans régénération fait échouer le build.
//
// Sources : les images CITÉES par le contenu, et elles seules (un média posé
// dans site/medias sans être cité ne coûte rien au dépôt) —
//   · ![…](media:<chemin>) dans site/contenu → site/medias/<chemin>
//     (sous-dossiers permis : media:captures/stock-vue-ensemble.png) ;
//   · ![…](/og-image-….png) dans src/blog ou site/contenu → public/…
//     (le blog est partagé avec la SPA : ses chemins publics restent valables,
//     le site y ajoute seulement les variantes modernes).
// AVIF n'est gardé que s'il gagne au moins 20 % sur le WebP de même largeur.
// Le dossier s'appelle « medias » et non « assets » : `assets/` est ignoré par
// git à toute profondeur (.gitignore), les images ne partiraient jamais (revue C B1).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { empreinteSource } from './lib/actifs.mjs';
import { matter, MOTEURS } from './lib/yaml.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dossierMedias = path.join(racine, 'site', 'medias');
const dossierSorties = path.join(dossierMedias, 'generees');
const LARGEURS = [480, 720, 960, 1440]; // 720 : captures dans un cadre de téléphone (~290 px CSS) sur un écran ×2
const GAIN_AVIF_MIN = 0.2;

const { default: sharp } = await import('sharp');

function sourcesDuContenu() {
  const cles = new Set();
  const lire = (dossier) => {
    if (!existsSync(dossier)) return;
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const p = path.join(dossier, e.name);
      if (e.isDirectory()) lire(p);
      else if (e.name.endsWith('.md')) {
        const texte = readFileSync(p, 'utf8');
        for (const m of texte.matchAll(/!\[[^\]]*\]\(((?:media:|\/)[^)\s]+\.(?:png|jpe?g|webp|svg))(?:\s+"[^"]*")?\)/gi)) cles.add(m[1]);
        // Frontmatter du contrat (docs/seo/FORMAT-CONTENU.md § 2-3) : hero_media,
        // etapes[].media, fonctions[].media — chemins sous site/medias.
        if (p.startsWith(path.join(racine, 'site', 'contenu'))) {
          const { data } = matter(texte.replace(/\r\n/g, '\n'), { engines: MOTEURS });
          const champs = [data?.hero_media, ...(data?.etapes ?? []).map((x) => x?.media), ...(data?.fonctions ?? []).map((x) => x?.media)];
          for (const c of champs) if (typeof c === 'string' && /\.(png|jpe?g|webp)$/i.test(c)) cles.add(`media:${c}`);
        }
      }
    }
  };
  lire(path.join(racine, 'src', 'blog'));
  lire(path.join(racine, 'site', 'contenu'));
  return [...cles].sort().map((ref) => (ref.startsWith('media:')
    ? { cle: ref.slice(6), source: path.join(dossierMedias, ...ref.slice(6).split('/')) }
    : { cle: ref, source: path.join(racine, 'public', ...ref.split('/').filter(Boolean)) }));
}

const sources = sourcesDuContenu();

await mkdir(dossierSorties, { recursive: true });
const manifeste = { medias: {} };
const produits = new Set(['manifeste.json']);
const bases = new Set();
for (const { cle, source } of sources) {
  if (!existsSync(source)) throw new Error(`[site:images] ${cle} : source ${source} introuvable`);
  const octets = await readFile(source);
  const estSvg = /\.svg$/i.test(source);
  const meta = await sharp(octets, estSvg ? { density: 288 } : {}).metadata();
  const largeurSource = estSvg ? Math.round(meta.width / 4) : meta.width; // densité 288 = ×4 du viewBox
  const hauteurSource = estSvg ? Math.round(meta.height / 4) : meta.height;
  let base = path.basename(cle).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  for (let i = 2; bases.has(base); i++) base = `${base}-${i}`;
  bases.add(base);
  const largeurs = LARGEURS.filter((l) => l <= (estSvg ? LARGEURS.at(-1) : meta.width));
  if (!largeurs.length) largeurs.push(meta.width);
  const variantes = { webp: [], avif: [] };
  const tailles = { webp: 0, avif: 0 };
  for (const largeur of largeurs) {
    const image = () => sharp(octets, estSvg ? { density: 288 } : {}).resize({ width: largeur });
    const webp = await image().webp({ quality: 78, effort: 5 }).toBuffer();
    const avif = await image().avif({ quality: 50, effort: 5 }).toBuffer();
    tailles.webp += webp.length;
    tailles.avif += avif.length;
    variantes.webp.push({ largeur, fichier: `${base}-${largeur}.webp`, octets: webp });
    variantes.avif.push({ largeur, fichier: `${base}-${largeur}.avif`, octets: avif });
  }
  const garderAvif = tailles.avif <= tailles.webp * (1 - GAIN_AVIF_MIN);
  const entree = {
    source: path.relative(racine, source).split(path.sep).join('/'),
    empreinte: empreinteSource(source, octets),
    largeur: largeurSource,
    hauteur: hauteurSource,
    variantes: { webp: [], avif: [] },
  };
  for (const format of garderAvif ? ['avif', 'webp'] : ['webp']) {
    for (const v of variantes[format]) {
      await writeFile(path.join(dossierSorties, v.fichier), v.octets);
      produits.add(v.fichier);
      entree.variantes[format].push({ largeur: v.largeur, fichier: v.fichier });
    }
  }
  manifeste.medias[cle] = entree;
  console.log(`[site:images] ${cle} : ${largeurs.join(', ')} px — webp ${tailles.webp} o${garderAvif ? `, avif ${tailles.avif} o (gardé)` : `, avif écarté (${tailles.avif} o, gain < 20 %)`}`);
}
for (const nom of readdirSync(dossierSorties)) {
  if (!produits.has(nom)) await rm(path.join(dossierSorties, nom));
}
await writeFile(path.join(dossierSorties, 'manifeste.json'), JSON.stringify(manifeste, null, 2) + '\n');
console.log(`[site:images] ${Object.keys(manifeste.medias).length} média(s), manifeste écrit — à commiter avec site/medias/generees/`);
