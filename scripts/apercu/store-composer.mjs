// ═══════════════════════════════════════════════════════════════════════════
// VISUELS DES STORES — la composition (06/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil, jamais livré. Prend les écrans bruts de store-capture.mjs
// (build/visuels-stores/ecrans/<langue>/<appareil>/<clé>.png : les VRAIS
// composants, compte de démonstration) et les pose dans le gabarit unique des
// fiches : fond teal profond FillSell, surtitre pêche, titre blanc en Space
// Grotesk, un mot en menthe, l'appareil qui déborde par le bas. Écrit des PNG
// SANS transparence aux tailles exigées par Apple et Google dans
// build/visuels-stores/<store>/<langue>/<taille>/NN-<clé>.png.
//
//     node scripts/apercu/store-composer.mjs              (tout)
//     node scripts/apercu/store-composer.mjs fr 1          (filtres : langue, numéro, taille)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'build', 'visuels-stores');
const ECRANS = path.join(SORTIE, 'ecrans');
const TMP = path.join(SORTIE, '_html');
fs.mkdirSync(TMP, { recursive: true });
const FILTRES = process.argv.slice(2);

// ── La direction artistique (une seule, déclinée partout) ───────────────────
export const DA = {
  fond: 'radial-gradient(120% 70% at 50% 0%, #22806F 0%, #155C51 38%, #0E3F37 72%, #0A2F29 100%)',
  lueur: 'radial-gradient(closest-side, rgba(249,162,108,0.20), rgba(249,162,108,0) 100%)',
  peche: '#F9A26C',
  menthe: '#8FE3D3',
  blanc: '#FFFFFF',
  sous: 'rgba(255,255,255,0.80)',
  encre: '#10201B',
  police: "'Space Grotesk', system-ui, sans-serif",
};

// ── Les huit visuels, dans l'ordre de la fiche ──────────────────────────────
// titre : lignes séparées par « \n » ; le mot entre [crochets] passe en menthe.
export const VISUELS = [
  {
    n: 1, cle: 'ou-publier',
    fr: { sur: 'Crosslisting', titre: 'Publie [partout]\nen un seul geste', sous: 'Vinted, Leboncoin, eBay, Beebs et Depop.' },
    en: { sur: 'Crosslisting', titre: 'Post [everywhere]\nin one go', sous: 'Vinted, eBay and Depop.' },
  },
  {
    n: 2, cle: 'cloud',
    fr: { sur: 'FillSell Cloud · en France', titre: 'Même ordi éteint,\n[tout continue]', sous: 'FillSell publie pour toi. Tout se pilote du téléphone.' },
    en: { sur: 'FillSell Cloud · available in France', titre: 'Computer off.\n[FillSell on.]', sous: 'Your listings run on our servers, all from your phone.' },
  },
  {
    n: 3, cle: 'synchro',
    fr: { sur: '5 plateformes connectées', titre: '[Vinted, Leboncoin,]\n[eBay, Beebs, Depop]', sous: 'FillSell relit tes annonces sur chacune.' },
    en: { sur: 'Your marketplaces, connected', titre: '[Vinted, eBay]\n[and Depop]', sous: 'FillSell reads your listings on each one.' },
  },
  {
    n: 4, cle: 'lens',
    fr: { sur: 'IA · Lens', titre: 'Une photo,\n[l’IA] écrit tout', sous: 'Titre, description et prix conseillé.' },
    en: { sur: 'AI · Lens', titre: 'One photo.\n[AI] writes the rest.', sous: 'Title, description and a suggested price.' },
  },
  {
    n: 5, cle: 'retrait',
    fr: { sur: 'Vente détectée', titre: 'Vendu une fois,\n[retiré partout]', sous: 'Les copies encore en ligne sont retirées.' },
    en: { sur: 'Sale detected', titre: 'Sold once,\n[removed everywhere]', sous: 'The copies still online come down.' },
  },
  {
    n: 6, cle: 'remonter',
    fr: { sur: 'Republication', titre: 'Tes annonces\n[remontent] en tête', sous: 'Automatiquement, aux heures que tu choisis.' },
    en: { sur: 'Reposting', titre: 'Your listings,\n[back on top]', sous: 'Automatically, at the times you choose.' },
  },
  {
    n: 7, cle: 'stock-cartes',
    fr: { sur: 'Stock unifié', titre: 'Tout ton stock,\n[au même endroit]', sous: 'Un article sur deux plateformes = une fiche.' },
    en: { sur: 'One stock', titre: 'Your whole stock,\n[in one place]', sous: 'One item on two marketplaces = one card.' },
  },
  {
    n: 8, cle: 'accueil',
    fr: { sur: 'Tes chiffres', titre: 'Tes marges,\n[enfin claires]', sous: 'Ventes, bénéfice et stock, sans tableur.' },
    en: { sur: 'Your numbers', titre: 'Your margins,\n[at a glance]', sous: 'Sales, profit and stock, no spreadsheet.' },
  },
];

// ── Les tailles ─────────────────────────────────────────────────────────────
export const TAILLES = [
  { store: 'apple', nom: 'iphone-6.9', w: 1320, h: 2868, appareil: 'telephone' },
  { store: 'apple', nom: 'iphone-6.5', w: 1284, h: 2778, appareil: 'telephone' },
  { store: 'apple', nom: 'iphone-6.3', w: 1206, h: 2622, appareil: 'telephone' },
  { store: 'apple', nom: 'ipad-13', w: 2064, h: 2752, appareil: 'tablette' },
  { store: 'google', nom: 'telephone', w: 1080, h: 1920, appareil: 'telephone' },
];

const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const titreHtml = (t) => t.split('\n').map((l) => echapper(l).replace(/\[([^\]]+)\]/g, `<span style="color:${DA.menthe}">$1</span>`)).join('<br>');

async function couleurHaut(fichier) {
  const { data } = await sharp(fichier).extract({ left: 0, top: 0, width: 40, height: 6 }).raw().toBuffer({ resolveWithObject: true });
  return `rgb(${data[0]},${data[1]},${data[2]})`;
}

/** La barre d'état (heure et icônes), en SVG — comme sur un iPhone ou un iPad à 9:41. */
export function barreEtat(largeur, hauteur, tablette = false, lang = 'fr') {
  const t = hauteur * 0.36;
  const y = tablette ? hauteur * 0.62 : hauteur * 0.6;
  const g = tablette ? largeur * 0.022 : largeur * 0.075;
  const icones = (x) => `
    <g transform="translate(${x - t * 4.6},${y - t * 0.78})" fill="${DA.encre}">
      <rect x="0" y="${t * 0.55}" width="${t * 0.18}" height="${t * 0.25}" rx="${t * 0.05}"/>
      <rect x="${t * 0.27}" y="${t * 0.38}" width="${t * 0.18}" height="${t * 0.42}" rx="${t * 0.05}"/>
      <rect x="${t * 0.54}" y="${t * 0.2}" width="${t * 0.18}" height="${t * 0.6}" rx="${t * 0.05}"/>
      <rect x="${t * 0.81}" y="0" width="${t * 0.18}" height="${t * 0.8}" rx="${t * 0.05}"/>
      <path transform="translate(${t * 1.35},${t * 0.02}) scale(${t / 24})" d="M12 18.5a1.9 1.9 0 1 0 0 .01zM4.6 10.9a10.6 10.6 0 0 1 14.8 0l-1.6 1.6a8.3 8.3 0 0 0-11.6 0zM8.1 14.4a5.6 5.6 0 0 1 7.8 0l-1.6 1.6a3.3 3.3 0 0 0-4.6 0zM1.2 7.5a15.4 15.4 0 0 1 21.6 0l-1.6 1.6a13.1 13.1 0 0 0-18.4 0z"/>
      <rect x="${t * 2.55}" y="${t * 0.02}" width="${t * 1.7}" height="${t * 0.8}" rx="${t * 0.24}" fill="none" stroke="${DA.encre}" stroke-opacity="0.45" stroke-width="${t * 0.07}"/>
      <rect x="${t * 2.66}" y="${t * 0.13}" width="${t * 1.35}" height="${t * 0.58}" rx="${t * 0.15}"/>
      <rect x="${t * 4.32}" y="${t * 0.28}" width="${t * 0.1}" height="${t * 0.28}" rx="${t * 0.05}" fill-opacity="0.45"/>
    </g>`;
  return `<svg width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:0;top:0">
    <text x="${g}" y="${y}" font-family="${DA.police}" font-weight="600" font-size="${t * 1.12}" fill="${DA.encre}">9:41${tablette ? (lang === 'en' ? '  Fri 30 Oct' : '  ven. 30 oct.') : ''}</text>
    ${icones(largeur - g)}
  </svg>`;
}

/** Le téléphone (ou la tablette) avec son écran, posé en absolu. */
export function appareilHtml({ tablette, x, y, largeur, image, haut, decalage = 0, lang = 'fr' }) {
  const b = Math.round(largeur * (tablette ? 0.022 : 0.034));        // bord
  const sw = largeur - 2 * b;
  const sh = Math.round(sw * (tablette ? 2752 / 2064 : 2556 / 1179));
  const hauteur = sh + 2 * b;
  const r = Math.round(largeur * (tablette ? 0.05 : 0.155));
  const rs = r - b;
  const sb = Math.round(sw * (tablette ? 24 / 1032 : 0.118));          // barre d'état
  const ile = tablette ? '' : `<div style="position:absolute;left:50%;top:${Math.round(sw * 0.03)}px;width:${Math.round(sw * 0.31)}px;height:${Math.round(sw * 0.092)}px;transform:translateX(-50%);background:#000;border-radius:999px"></div>`;
  const camera = tablette ? `<div style="position:absolute;left:50%;top:${Math.round(b * 0.42)}px;width:${Math.round(b * 0.32)}px;height:${Math.round(b * 0.32)}px;transform:translateX(-50%);background:#1d2321;border-radius:50%"></div>` : '';
  return `
  <div style="position:absolute;left:${x}px;top:${y}px;width:${largeur}px;height:${hauteur}px;border-radius:${r}px;
    background:linear-gradient(145deg,#2B3230 0%,#0B0E0D 30%,#050606 70%,#262C2A 100%);
    box-shadow:0 ${largeur * 0.06}px ${largeur * 0.14}px rgba(0,0,0,0.45), 0 ${largeur * 0.012}px ${largeur * 0.03}px rgba(0,0,0,0.35), inset 0 0 0 ${Math.max(2, largeur * 0.0025)}px rgba(255,255,255,0.10)">
    ${camera}
    <div style="position:absolute;left:${b}px;top:${b}px;width:${sw}px;height:${sh}px;border-radius:${rs}px;overflow:hidden;background:${haut}">
      <img src="${pathToFileURL(image).href}" style="position:absolute;left:0;top:${sb - decalage}px;width:${sw}px;display:block">
      <div style="position:absolute;left:0;top:0;width:${sw}px;height:${sb}px;background:${haut}">${barreEtat(sw, sb, tablette, lang)}</div>
      ${ile}
    </div>
  </div>`;
}

const PAGE = (w, h, corps) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=block">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden}</style></head>
<body><div id="v" style="position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${DA.fond};font-family:${DA.police}">${corps}</div></body></html>`;

/** Un visuel d'une fiche : texte en haut, appareil qui déborde par le bas. */
export async function visuelHtml({ v, lang, taille }) {
  const { w, h } = taille;
  const tablette = taille.appareil === 'tablette';
  const T = v[lang];
  // Sur iPad, un visuel peut montrer un autre écran (v.tablette) : celui qui porte le même message à cette largeur.
  const image = path.join(ECRANS, lang, taille.appareil, `${tablette && v.tablette ? v.tablette : v.cle}.png`);
  const haut = await couleurHaut(image);
  const u = tablette ? w * 0.62 : w;                           // l'unité typographique
  const pad = Math.round(u * (tablette ? 0.115 : 0.1));
  const fSur = Math.round(u * 0.036);
  const fTitre = Math.round(u * (tablette ? 0.1 : 0.094));
  const fSous = Math.round(u * 0.041);
  const lignes = T.titre.split('\n').length;
  const yTitre = pad + fSur * 1.25 + u * 0.03;
  const ySous = yTitre + lignes * fTitre * 1.04 + u * 0.034;
  // Place pour deux lignes de sous-titre, partout la même : l'appareil est au même endroit sur les huit images.
  const yApp = ySous + 2 * fSous * 1.3 + u * (h / w < 1.9 ? 0.055 : 0.07);
  const largeurApp = Math.round(tablette ? w * 0.84 : w * (h / w < 1.9 ? 0.74 : 0.8));
  const texte = `
    <div style="position:absolute;left:0;right:0;top:${pad}px;text-align:center;color:${DA.peche};font-size:${fSur}px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase">${echapper(T.sur)}</div>
    <div style="position:absolute;left:${u * 0.05}px;right:${u * 0.05}px;top:${yTitre}px;text-align:center;color:${DA.blanc};font-size:${fTitre}px;font-weight:700;line-height:1.04;letter-spacing:-0.028em;white-space:nowrap" data-ajuster>${titreHtml(T.titre)}</div>
    <div style="position:absolute;left:${u * 0.08}px;right:${u * 0.08}px;top:${ySous}px;text-align:center;color:${DA.sous};font-size:${fSous}px;font-weight:500;line-height:1.3;letter-spacing:-0.005em;text-wrap:balance">${echapper(T.sous)}</div>`;
  const lueur = `<div style="position:absolute;width:${w * 1.1}px;height:${w * 1.1}px;left:${w * 0.25}px;top:${h - w * 0.55}px;background:${DA.lueur}"></div>`;
  const app = appareilHtml({ tablette, x: Math.round((w - largeurApp) / 2), y: Math.round(yApp), largeur: largeurApp, image, haut, decalage: 0, lang });
  return PAGE(w, h, lueur + texte + app);
}

export async function rendre(page, html, w, h, fichier) {
  const tmp = path.join(TMP, `${path.basename(fichier, '.png')}-${w}x${h}.html`);
  fs.writeFileSync(tmp, html);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Un titre plus large que sa boîte rapetisse jusqu'à y tenir : jamais une 3e ligne.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-ajuster]')) {
      let f = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 1 && f > 20) { f -= 2; el.style.fontSize = `${f}px`; }
    }
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  const brut = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await sharp(brut).flatten({ background: '#0A2F29' }).removeAlpha().png({ compressionLevel: 9 }).toFile(fichier);
}

// ── La bannière de fiche Google Play (1024 × 500) ───────────────────────────
// Texte à gauche, deux téléphones à droite : le centre reste libre pour le bouton
// « lecture » que Google pose dessus quand la fiche a une vidéo.
export const BANNIERE = {
  fr: { sur: 'FillSell – Crosslisting', titre: 'Crée une fois.\n[Vends partout.]', sous: 'Vinted, Leboncoin, eBay, Beebs et Depop' },
  en: { sur: 'FillSell – Crosslisting', titre: 'List once.\n[Sell everywhere.]', sous: 'Vinted, eBay and Depop' },
};
export async function banniereHtml(lang) {
  const w = 1024; const h = 500;
  const T = BANNIERE[lang];
  const icone = pathToFileURL(path.join(RACINE, 'public', 'icon_1024x1024.png')).href;
  const e1 = path.join(ECRANS, lang, 'telephone', 'ou-publier.png');
  const e2 = path.join(ECRANS, lang, 'telephone', 'stock-cartes.png');
  const t1 = appareilHtml({ tablette: false, x: 0, y: 0, largeur: 230, image: e1, haut: await couleurHaut(e1) });
  const t2 = appareilHtml({ tablette: false, x: 0, y: 0, largeur: 230, image: e2, haut: await couleurHaut(e2) });
  const corps = `
    <div style="position:absolute;width:900px;height:900px;left:420px;top:-120px;background:${DA.lueur}"></div>
    <div style="position:absolute;left:64px;top:92px;display:flex;align-items:center;gap:14px">
      <img src="${icone}" style="width:52px;height:52px;border-radius:13px;box-shadow:0 6px 18px rgba(0,0,0,0.30)">
      <div style="color:${DA.peche};font-size:17px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase">${echapper(T.sur)}</div>
    </div>
    <div style="position:absolute;left:64px;top:168px;width:470px;color:${DA.blanc};font-size:${lang === 'en' ? 54 : 62}px;font-weight:700;line-height:1.02;letter-spacing:-0.03em">${titreHtml(T.titre)}</div>
    <div style="position:absolute;left:64px;top:312px;width:430px;color:${DA.sous};font-size:20px;font-weight:500;line-height:1.35">${echapper(T.sous)}</div>
    <div style="position:absolute;left:600px;top:70px;transform:rotate(-7deg);transform-origin:50% 0">${t1}</div>
    <div style="position:absolute;left:790px;top:40px;transform:rotate(5deg);transform-origin:50% 0">${t2}</div>`;
  return PAGE(w, h, corps);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const navigateur = await chromium.launch({ channel: 'chrome' });
  const page = await navigateur.newPage({ deviceScaleFactor: 1 });
  let n = 0;
  try {
    for (const lang of ['fr', 'en']) {
      if (FILTRES.some((f) => ['fr', 'en'].includes(f)) && !FILTRES.includes(lang)) continue;
      if (!FILTRES.length || FILTRES.includes('banniere')) {
        const fichier = path.join(SORTIE, 'google', lang, 'banniere', 'banniere-1024x500.png');
        await rendre(page, await banniereHtml(lang), 1024, 500, fichier);
        n += 1;
        console.log('✓', path.relative(RACINE, fichier));
        if (FILTRES.includes('banniere')) continue;
      }
      for (const taille of TAILLES) {
        if (FILTRES.some((f) => TAILLES.some((t) => t.nom === f)) && !FILTRES.includes(taille.nom)) continue;
        for (const v of VISUELS) {
          if (FILTRES.some((f) => /^\d$/.test(f)) && !FILTRES.includes(String(v.n))) continue;
          const fichier = path.join(SORTIE, taille.store, lang, taille.nom, `${String(v.n).padStart(2, '0')}-${v.cle}.png`);
          await rendre(page, await visuelHtml({ v, lang, taille }), taille.w, taille.h, fichier);
          n += 1;
          console.log('✓', path.relative(RACINE, fichier));
        }
      }
    }
  } finally {
    await navigateur.close();
  }
  console.log(`${n} visuels`);
}
