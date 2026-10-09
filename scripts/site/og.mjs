#!/usr/bin/env node
// `npm run site:og` — cartes de partage du site vitrine (09/10/2026).
//
// Une carte 1200×630 par page et par langue (Open Graph, Twitter), rendue par
// le Chrome du poste (Playwright, channel « chrome » : aucun navigateur à
// télécharger) depuis un gabarit HTML aux couleurs du site — titre court de la
// page, plateformes EN TEXTE (jamais un logo), marque. Sortie :
// site/medias/og/<langue>/<id>.png (ou .jpg s'il est plus léger), ≤ 120 Ko,
// avec site/medias/og/manifeste.json — à COMMITER : le build ne lance jamais
// de navigateur, il publie ces fichiers et les pose en og:image / twitter:image
// (scripts/site/build-site.mjs, lib/og.mjs). Remplace les anciennes
// og-image-*.png de public/ pour le site.
//
// LOCAL SEULEMENT. Ne relance une carte que si ce qu'elle affiche a changé
// (empreinte) ; --tout pour tout refaire. Aucune connexion réseau : la police
// et l'icône sont lues sur le disque et mises en ligne dans le gabarit, toute
// requête externe est refusée.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { genererSite } from './build-site.mjs';
import { DOSSIER_OG, lireManifesteOg } from './lib/og.mjs';
import { esc } from './lib/html.mjs';
import { TEXTES } from '../../site/gabarits/textes.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dossierOg = path.join(racine, DOSSIER_OG);
const POIDS_MAX = 120 * 1024;
const tout = process.argv.includes('--tout');

function gabarit({ titre, surtitre, plateformes, lang }) {
  const t = TEXTES[lang];
  // Police et icône EN LIGNE (data:) : une page about:blank ne lit pas file://.
  // Ce gabarit ne sort jamais sur le site : seule la capture PNG/JPEG est publiée.
  const police = `data:font/woff2;base64,${readFileSync(path.join(racine, 'site', 'polices', 'space-grotesk-latin.woff2')).toString('base64')}`;
  const icone = `data:image/png;base64,${readFileSync(path.join(racine, 'public', 'icon-192x192.png')).toString('base64')}`;
  const taille = titre.length > 70 ? 64 : titre.length > 48 ? 74 : titre.length > 30 ? 86 : 96;
  const phrases = titre.match(/[^.!?]+[.!?]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [titre];
  const h1 = phrases.length > 1 ? phrases.map((x, i) => `<span${i === phrases.length - 1 ? ' class="fin"' : ''}>${esc(x)}</span>`).join(' ') : esc(titre);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face { font-family: SG; src: url(${police}) format('woff2'); font-weight: 300 700; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body { position: relative; overflow: hidden; font-family: SG, sans-serif; color: #10201B; background: #EDEAE0; padding: 64px 72px; display: flex; flex-direction: column; }
body::before { content: ""; position: absolute; top: -220px; right: -180px; width: 760px; height: 700px; border-radius: 50%; background: radial-gradient(closest-side, rgba(47,158,144,.34), transparent); }
body::after { content: ""; position: absolute; bottom: -260px; left: -160px; width: 640px; height: 600px; border-radius: 50%; background: radial-gradient(closest-side, rgba(232,149,109,.30), transparent); }
.haut, h1, .bas { position: relative; z-index: 1; }
.haut { display: flex; align-items: center; justify-content: space-between; }
.marque { display: flex; align-items: center; gap: 16px; }
.marque img { width: 64px; height: 64px; border-radius: 16px; }
.marque b { font-size: 44px; font-weight: 700; font-style: italic; letter-spacing: -.03em; background: linear-gradient(135deg, #2F9E90, #E8956D); -webkit-background-clip: text; color: transparent; padding-right: 4px; }
.surtitre { display: flex; align-items: center; gap: 12px; font-size: 26px; font-weight: 600; color: #1B6E62; }
.surtitre::before { content: ""; width: 16px; height: 16px; border-radius: 50%; box-shadow: inset 0 0 0 4px #E8956D; }
h1 { margin-top: auto; font-size: ${taille}px; line-height: 1.02; letter-spacing: -.045em; font-weight: 700; max-width: 1000px; }
h1 span { display: block; }
h1 .fin { color: #1B6E62; }
.bas { margin-top: 36px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; filter: drop-shadow(0 1px 0 #D8D3C6); }
li { position: relative; padding: 8px 18px 8px 32px; background: #fff; font-size: 24px; font-weight: 600; clip-path: polygon(15px 0, 100% 0, 100% 100%, 15px 100%, 0 50%); border-radius: 0 9px 9px 0; }
li::before { content: ""; position: absolute; left: 15px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: #EDEAE0; box-shadow: inset 0 0 0 2px #6E695D; }
.url { font-size: 26px; font-weight: 600; color: #5C6560; white-space: nowrap; }
</style></head><body>
<div class="haut"><div class="marque"><img src="${icone}" alt=""><b>FillSell</b></div>${surtitre ? `<p class="surtitre">${esc(surtitre)}</p>` : `<p class="surtitre">${esc(t.og.marque)}</p>`}</div>
<h1>${h1}</h1>
<div class="bas">${plateformes.length ? `<ul>${plateformes.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '<span></span>'}<p class="url">fillsell.app</p></div>
</body></html>`;
}

// Les pages, et ce que leurs cartes affichent : le générateur, en mode « og ».
const temp = mkdtempSync(path.join(os.tmpdir(), 'fillsell-og-'));
let pages;
try {
  ({ pages } = await genererSite({ dossier: temp, racine, mode: 'og', journal: { log() {}, warn() {} } }));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const ancien = lireManifesteOg(racine);
const manifeste = { cartes: {} };
const aFaire = [];
for (const p of pages) {
  const og = p.og;
  const prec = ancien.cartes?.[og.cle];
  if (!tout && prec && prec.empreinte === og.empreinte && existsSync(path.join(dossierOg, ...prec.fichier.split('/')))) {
    manifeste.cartes[og.cle] = prec;
  } else {
    aFaire.push(og);
  }
}

if (aFaire.length) {
  const { chromium } = await import('playwright');
  const navigateur = await chromium.launch({ channel: 'chrome' });
  try {
    const contexte = await navigateur.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    const page = await contexte.newPage();
    await page.route(/^https?:/, (r) => r.abort()); // aucune requête réseau
    for (const og of aFaire) {
      await page.setContent(gabarit(og), { waitUntil: 'load' });
      await page.evaluate(() => globalThis.document.fonts.ready);
      const png = await page.screenshot({ type: 'png' });
      const jpg = await page.screenshot({ type: 'jpeg', quality: 86 });
      const [ext, octets] = png.length <= jpg.length ? ['png', png] : ['jpg', jpg];
      if (octets.length > POIDS_MAX) throw new Error(`[site:og] ${og.cle} : ${octets.length} o, au-delà de ${POIDS_MAX} o`);
      const relatif = `${og.cle}.${ext}`;
      const cible = path.join(dossierOg, ...relatif.split('/'));
      mkdirSync(path.dirname(cible), { recursive: true });
      for (const autre of ['png', 'jpg']) {
        const f = path.join(dossierOg, ...`${og.cle}.${autre}`.split('/'));
        if (autre !== ext && existsSync(f)) rmSync(f);
      }
      writeFileSync(cible, octets);
      manifeste.cartes[og.cle] = { fichier: relatif, empreinte: og.empreinte, octets: octets.length };
      console.log(`[site:og] ${relatif} (${Math.round(octets.length / 1024)} Ko)`);
    }
  } finally {
    await navigateur.close();
  }
}

// Ménage : les cartes qui ne correspondent plus à aucune page.
const gardes = new Set(Object.values(manifeste.cartes).map((c) => path.join(dossierOg, ...c.fichier.split('/'))));
const balayer = (d) => {
  if (!existsSync(d)) return;
  for (const nom of readdirSync(d)) {
    const f = path.join(d, nom);
    if (statSync(f).isDirectory()) { balayer(f); if (!readdirSync(f).length) rmSync(f, { recursive: true }); continue; }
    if (/\.(png|jpg)$/.test(nom) && !gardes.has(f)) { rmSync(f); console.log(`[site:og] retirée : ${path.relative(dossierOg, f)}`); }
  }
};
balayer(dossierOg);
mkdirSync(dossierOg, { recursive: true });
const tri = Object.fromEntries(Object.entries(manifeste.cartes).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(path.join(dossierOg, 'manifeste.json'), JSON.stringify({ cartes: tri }, null, 2) + '\n');
console.log(`[site:og] ${Object.keys(tri).length} carte(s), ${aFaire.length} rendue(s) — à commiter avec site/medias/og/`);
