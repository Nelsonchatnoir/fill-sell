// ═══════════════════════════════════════════════════════════════════════════
// VERROU DU POINT 9 DU LOT DU 16/11/2026 MIDI — LES PHOTOS PAR PLATEFORME DANS LA PUBLICATION DE PLUSIEURS ARTICLES
//     npm run selftest:photos-plateforme-lot-publication
// ═══════════════════════════════════════════════════════════════════════════
// Constat (rapport du matin, 7.6 — Marc) : la fiche d'un article du LOT de publication (publication/lot/FicheArticle.jsx)
// montrait les photos communes et l'ajout, jamais le choix par plateforme — qui existait à l'unité (carte de la plateforme,
// PhotosPlateforme, 30/10) et, depuis 17839af, dans la republication de plusieurs articles.
// Ce test prouve :
//   A. la fiche d'un article du lot porte, dans la section de CHAQUE plateforme, le même composant PhotosPlateforme, branché
//      sur le moteur (poserPhotosCopie) et sur toutes les photos de la fiche ;
//   B. le moteur expose poserPhotosCopie, qui écrit edited[p].photos (la place lue à l'unité ; null = choix par défaut) ;
//   C. la publication lit ce choix pour CETTE plateforme seulement (construireJobs → photosDuJob(edited[p].photos)) :
//      Vinted reçoit son choix, Leboncoin garde ses photos par défaut — jamais un mélange.
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };

console.log('\nA. La fiche d’un article du lot');
const fiche = lire('src/publication/lot/FicheArticle.jsx');
ok(/import PhotosPlateforme from "\.\.\/PhotosPlateforme";/.test(fiche), 'importe le MÊME composant que la publication à l’unité');
ok(/<PhotosPlateforme platform=\{p\} toutes=\{photosDeLaFicheLot\(m\)\} choix=\{m\.edited\?\.\[p\]\?\.photos \?\? null\}\s*onChange=\{\(urls\) => m\.poserPhotosCopie\(p, urls\)\}/.test(fiche),
  'dans la section de chaque plateforme : toutes les photos de la fiche, le choix de CETTE plateforme, écrit par le moteur');

console.log('\nB. Le moteur');
const lps = lire('src/components/ListingPreviewScreen.jsx');
ok(/poserPhotosCopie: \(p, urls\) => setEdited\(prev => \(prev\[p\] \? \{ \.\.\.prev, \[p\]: \{ \.\.\.prev\[p\], photos: urls \?\? undefined \} \} : prev\)\),/.test(lps),
  'poserPhotosCopie écrit edited[p].photos (la place de la carte à l’unité) ; null = le choix par défaut');

console.log('\nC. La publication lit le choix de chaque plateforme');
{
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, ssr: { noExternal: [] }, optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const PP = await vite.ssrLoadModule('/src/publication/photosParPlateforme.js');
    const toutes = ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg', 'https://x/4.jpg'];
    const entrees = toutes.map((url) => ({ type: 'url', url }));
    const vinted = PP.photosDuJob('vinted', entrees, ['https://x/3.jpg', 'https://x/1.jpg']);
    const lbc = PP.photosDuJob('leboncoin', entrees, undefined);
    ok(vinted?.choisies === true && JSON.stringify((vinted?.photos ?? []).map((x) => x.url)) === JSON.stringify(['https://x/3.jpg', 'https://x/1.jpg']),
      'Vinted : les 2 photos choisies, dans l’ordre choisi (3 puis 1)', JSON.stringify(vinted));
    ok(lbc?.choisies === false && (lbc?.photos ?? []).length === 4, 'Leboncoin sans choix : ses photos par défaut, jamais le choix de Vinted', JSON.stringify(lbc));
  } finally { await vite.close(); }
  ok(/const choix = photosDuJob\(platform, photosJob, edited\[platform\]\?\.photos\);/.test(lire('src/publication/moteur/regles.js')), 'construireJobs (commun au lot et à l’unité) lit edited[platform].photos');
}

console.log(`\n${verts} verts, ${rouges} rouges`);
process.exit(rouges ? 1 : 0);
