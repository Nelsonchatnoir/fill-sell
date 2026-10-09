// selftest:site-balises — parité des balises de mesure app ↔ site (09/10/2026).
//
// Les pages vitrine recopient d'index.html, entre les marqueurs
// <!-- site:balises:<nom>:debut/fin -->, GTM, Vercel Insights, le gtag Google
// Ads et le noscript GTM (revue A I6, revue C I4). Ce test prouve :
//   1. les quatre blocs sont dans index.html, une fois chacun, avec les bons
//      identifiants (GTM-TJNKL6T5, AW-16622098460) ;
//   2. AUCUNE balise de mesure d'index.html ne vit HORS d'un bloc marqué : une
//      balise ajoutée demain (Clarity, pixel) sans marqueur manquerait sur tout
//      le site — le test tombe et le dit ;
//   3. le gabarit du site écrit les blocs IDENTIQUES à ceux d'index.html, et
//      les liens d'icônes / de manifeste de l'app ;
//   4. un marqueur absent ou en double fait échouer la lecture (build rouge) ;
//   5. le site rendu À L'INSTANT (générateur en mode « dater », dossier
//      jetable du système) : chaque page porte les blocs d'index.html. Avant
//      le 09/10, cette partie relisait build/site-apercu s'il existait,
//      éventuellement périmé (revue de la fondation M-10).
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireBlocsBalises, formeComparable, BLOCS_BALISES, RELS_PARTAGES } from './site/lib/balises.mjs';
import { balisesOuvrantes } from './site/lib/html.mjs';
import { layout } from '../site/gabarits/layout.mjs';
import { genererSite } from './site/build-site.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
let passes = 0;
function ok(cond, message) {
  if (cond) { passes++; return; }
  echecs++;
  console.error(`  ✗ ${message}`);
}

const index = readFileSync(path.join(racine, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const blocs = lireBlocsBalises(index, 'index.html');
ok(BLOCS_BALISES.every((n) => blocs[n]), 'les quatre blocs sont lus');
ok(blocs.gtm.includes("'GTM-TJNKL6T5'") && blocs.gtm.includes('googletagmanager.com/gtm.js'), 'bloc gtm : conteneur GTM-TJNKL6T5');
ok(blocs['gtag-aw'].includes('gtag/js?id=AW-16622098460') && blocs['gtag-aw'].includes("gtag('config', 'AW-16622098460')"), 'bloc gtag-aw : AW-16622098460 chargé et configuré');
ok(blocs.insights.includes('/_vercel/insights/script.js'), 'bloc insights : Vercel Web Analytics');
ok(blocs['gtm-noscript'].includes('ns.html?id=GTM-TJNKL6T5'), 'bloc gtm-noscript : iframe GTM');
ok(!Object.values(blocs).some((b) => b.includes('<!--')), 'les blocs recopiés ne portent plus de commentaires');

// 2. Aucune balise de mesure hors d'un bloc marqué.
let horsBlocs = index;
for (const m of index.matchAll(/<!--\s*site:balises:([\w-]+):debut[\s\S]*?<!--\s*site:balises:\1:fin\s*-->/g)) horsBlocs = horsBlocs.replace(m[0], '');
horsBlocs = horsBlocs.replace(/<!--[\s\S]*?-->/g, '');
const scriptsHors = balisesOuvrantes(horsBlocs, 'script').filter((s) =>
  !(s.attrs.type === 'module' && s.attrs.src === '/src/main.jsx') && s.attrs.type !== 'application/ld+json');
ok(scriptsHors.length === 0, `balise(s) <script> d'index.html HORS des blocs site:balises — elles manqueraient sur tout le site vitrine : ${scriptsHors.map((s) => s.brut).join(' ')}`);
ok(!/<noscript|<iframe/i.test(horsBlocs), '<noscript>/<iframe> hors des blocs site:balises');
// (Le JSON-LD cite le profil TikTok de la marque : un lien, pas un traceur.)
const horsBlocsSansDonnees = horsBlocs
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  .replace(/<link rel="dns-prefetch" href="\/\/www\.googletagmanager\.com" \/>/, '');
ok(!/googletagmanager|gtag\(|fbq\(|clarity|tiktok|connect\.facebook/i.test(horsBlocsSansDonnees),
  'référence à un traceur hors des blocs site:balises');

// 4. Marqueur absent ou en double : la lecture lève.
const leve = (html) => { try { lireBlocsBalises(html, 'essai'); return false; } catch { return true; } };
ok(leve(index.replace('<!-- site:balises:gtag-aw:fin -->', '')), 'marqueur de fin absent → erreur');
ok(leve(index.replace(/<!-- site:balises:insights:debut -->[\s\S]*?<!-- site:balises:insights:fin -->/, '')), 'bloc absent → erreur');
ok(leve(index + '\n<!-- site:balises:gtm:debut -->x<!-- site:balises:gtm:fin -->'), 'bloc en double → erreur');

// 3. Le gabarit écrit les mêmes blocs et les mêmes liens d'icônes.
const liensIcones = balisesOuvrantes(index.replace(/<!--[\s\S]*?-->/g, ''), 'link')
  .filter((l) => RELS_PARTAGES.includes(l.attrs.rel)).map((l) => l.brut.replace(/\s*\/>$/, '>')).join('\n');
const page = {
  id: 'essai', type: 'page', lang: 'fr', chemin: '/essai', url: 'https://fillsell.app/essai', racine: false, robots: 'index, follow',
  title: 'Essai', description: 'Essai', alternates: [], fil: [], ogImage: 'https://fillsell.app/og.png', ogType: 'website', jsonld: [],
};
const site = {
  balises: blocs, liensIcones, aiguillage: '/* aiguillage */', cssPour: () => 'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}', logo: '/assets/site/fillsell-icone-64.0.png',
  police: '/assets/site/p.woff2', siteJs: '/assets/site/site.0.js',
  chemin: (id, lang) => (id === 'accueil' ? (lang === 'en' ? '/en' : '/') : `/${id}`), nomCourt: (id) => id,
  perimetre: () => 'Au 9 octobre 2026, FillSell fonctionne avec Vinted.',
  nonAffiliation: () => 'Vinted est une marque de son propriétaire ; FillSell n’est affilié à aucune de ces plateformes.',
  navigation: () => [{ libelle: 'FAQ', chemin: '/faq' }],
  pied: () => [{ titre: 'Produit', liens: [{ libelle: 'Accueil', chemin: '/' }] }],
};
const rendu = layout({ site, page, principal: '<h1>Essai</h1>' });
const blocsRendus = lireBlocsBalises(rendu, 'gabarit');
for (const n of BLOCS_BALISES) ok(formeComparable(blocsRendus[n]) === formeComparable(blocs[n]), `gabarit : bloc ${n} différent d'index.html`);
for (const l of balisesOuvrantes(liensIcones, 'link')) {
  ok(balisesOuvrantes(rendu, 'link').some((r) => r.attrs.rel === l.attrs.rel && r.attrs.href === l.attrs.href), `gabarit : lien ${l.attrs.rel} ${l.attrs.href} absent`);
}
ok(rendu.indexOf('<script>/* aiguillage */') < rendu.indexOf('site:balises:gtm:debut'), 'gabarit : l\'aiguillage en ligne passe AVANT GTM');
ok(!/user-scalable|maximum-scale/.test(rendu), 'gabarit : viewport sans blocage du zoom');

// 5. Le site rendu à l'instant, dans un dossier jetable (jamais dans l'arbre).
{
  const temp = mkdtempSync(path.join(tmpdir(), 'fs-balises-'));
  try {
    await genererSite({ dossier: temp, racine, mode: 'dater', journal: { log() {}, warn() {} }, env: {} });
    const pages = [];
    const parcourir = (d) => {
      for (const nom of readdirSync(d)) {
        const p = path.join(d, nom);
        if (statSync(p).isDirectory()) { if (nom !== 'assets') parcourir(p); } else if (nom.endsWith('.html')) pages.push(p);
      }
    };
    parcourir(temp);
    ok(pages.length >= 10, `site rendu (${pages.length} pages)`);
    for (const p of pages) {
      const b = lireBlocsBalises(readFileSync(p, 'utf8'), p);
      for (const n of BLOCS_BALISES) ok(formeComparable(b[n]) === formeComparable(blocs[n]), `${path.relative(temp, p)} : bloc ${n} ≠ index.html`);
    }
    console.log(`  (site rendu à l'instant : ${pages.length} pages comparées à index.html)`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

console.log(`selftest:site-balises — ${passes} vérifications passées, ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
