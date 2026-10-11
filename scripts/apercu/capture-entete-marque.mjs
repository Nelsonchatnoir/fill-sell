// Preuves visuelles du 11/10/2026 (Nico) — outil de relecture, jamais livré.
//
//   npm run site:apercu -- --sans-serveur   (construit build/site-apercu, pour la partie « site »)
//   node scripts/apercu/capture-entete-marque.mjs
//
// 1. EN-TÊTE DE L'APP (entete-marque.html, vraies feuilles, vrais composants) :
//    · grande largeur : le bloc « profit / ventes ce mois » est centré sur
//      l'en-tête ET sur l'onglet « Lens » (écart ≤ 1 px), quels que soient le
//      compteur (31 ou 1000 annonces) et la pastille (Pro, Business, Premium, aucune) ;
//      faute de place (769-900 px), il se décale mais ne chevauche JAMAIS ;
//    · mobile (320-768 px) : rien ne se chevauche, rien ne déborde de l'en-tête.
// 2. LOGO TEXTE EN ITALIQUE jamais rogné : app (.tb-logo .name), blog
//    (.blog-brand-name) et site construit (.wordmark de l'en-tête et du pied) :
//    l'encre la plus à droite du texte tel qu'il est rendu = celle du même texte
//    avec 1,5em de marge (rien ne peut y être coupé), à 1 px près.
// Thèmes clair et sombre (prefers-color-scheme émulé). Captures dans
// screenshots-review/entete-marque/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'entete-marque');
const PORT = 5231;
const PORT_SITE = 4329;
const SITE = path.join(RACINE, 'build', 'site-apercu');
fs.mkdirSync(SORTIE, { recursive: true });

const serveurs = [];
const stop = () => { for (const s of serveurs.splice(0)) { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* déjà arrêté */ } } };
process.on('exit', stop);
const vite = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
serveurs.push(vite);

let serveurSite = null;
if (fs.existsSync(path.join(SITE, 'index.html'))) {
  const { creerServeur } = await import('../site/serveur-apercu.mjs');
  serveurSite = creerServeur(SITE, { racine: RACINE });
  await new Promise((r) => serveurSite.listen(PORT_SITE, '127.0.0.1', r));
}

async function attendre(u, ms = 180000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { const r = await fetch(u); if (r.ok) return; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error(`pas de réponse : ${u}`);
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${detail ? `   (${detail})` : ''}`); if (!cond) echecs.push(quoi); };

const URL_APP = (p = '') => `http://127.0.0.1:${PORT}/scripts/apercu/entete-marque.html${p}`;
await attendre(URL_APP());

const navigateur = await chromium.launch({ channel: 'chrome' });

async function page(largeur, hauteur, theme, url, zoom = 2) {
  const ctx = await navigateur.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: zoom, locale: 'fr-FR', colorScheme: theme });
  const p = await ctx.newPage();
  p.__erreurs = [];
  p.on('pageerror', (e) => p.__erreurs.push(e.message));
  await p.route(/https?:\/\/[^/]*(supabase\.co|fillsell\.app)\//, (r) => r.abort());
  await p.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  return p;
}

// Encre la plus à droite d'une zone (pixels plus sombres que le blanc).
async function encreDroite(tampon) {
  const { data, info } = await sharp(tampon).raw().toBuffer({ resolveWithObject: true });
  let max = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    if ((255 - data[i]) + (255 - data[i + 1]) + (255 - data[i + 2]) > 60 && x > max) max = x;
  }
  return max;
}
// Le texte tel qu'il est rendu vs le même texte avec 1,5em de marge droite :
// tout le reste de la page masqué, fond blanc, texte peint en NOIR par le même
// mécanisme (background-clip: text gardé : seule l'image de fond change, jamais
// le raccourci « background », qui remettrait le clip à la boîte). Tolérance
// ZÉRO : le 11/10, la prod (marge 2 px) perdait 1 à 3 px d'écran selon le zoom,
// une tolérance d'un pixel l'aurait laissée passer.
async function logoEntier(p, selecteur, nom) {
  const el = p.locator(selecteur).first();
  if (!(await el.isVisible())) return null;
  // Défilement instantané (le site défile en douceur) puis lecture de la boîte.
  await p.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const masque = await p.addStyleTag({ content: 'html,body{background:#fff !important} body *{visibility:hidden !important;transition:none !important;animation:none !important} .__cible{visibility:visible !important;background-image:linear-gradient(#000,#000) !important}' });
  await el.evaluate((n) => n.classList.add('__cible'));
  const r = await el.boundingBox();
  const zone = { x: Math.max(0, r.x - 4), y: Math.max(0, r.y - 6), width: r.width + 40, height: r.height + 12 };
  const a = await encreDroite(await p.screenshot({ clip: zone }));
  await el.evaluate((n) => { n.style.setProperty('padding-right', '1.5em', 'important'); });
  const r2 = await el.boundingBox();
  const b = await encreDroite(await p.screenshot({ clip: zone }));
  await el.evaluate((n) => { n.style.removeProperty('padding-right'); n.classList.remove('__cible'); });
  await masque.evaluate((n) => n.remove());
  const memeDepart = Math.abs(r2.x - r.x) < 0.5;
  verifier(memeDepart && a >= b && a > 0, `${nom} : dernier caractère entier`, `encre à droite ${a} contre ${b} px d'écran sans limite${memeDepart ? '' : ', départ déplacé'}`);
  return { a, b };
}

const boite = (p, s) => p.locator(s).first().boundingBox();
async function mesuresEnTete(p) {
  return p.evaluate(() => {
    const r = (el) => el && el.getBoundingClientRect();
    const tb = document.querySelector('.topbar');
    const centre = document.querySelector('.header-centre');
    const gauche = document.querySelector('.tb-left');
    const droite = document.querySelector('.tb-right');
    const enfants = (el) => [...el.children].filter((c) => getComputedStyle(c).display !== 'none').map(r);
    const g = enfants(gauche); const d = enfants(droite);
    const lens = document.querySelector('[data-onglet="Lens"]');
    const cv = centre && getComputedStyle(centre).display !== 'none';
    return {
      topbar: r(tb).toJSON(), centreVisible: cv, centre: cv ? r(centre).toJSON() : null,
      gaucheFin: Math.max(...g.map((x) => x.right)), droiteDebut: Math.min(...d.map((x) => x.left)),
      gaucheDebut: Math.min(...g.map((x) => x.left)), droiteFin: Math.max(...d.map((x) => x.right)),
      lens: lens && getComputedStyle(lens.closest('.desktop-nav')).display !== 'none' ? r(lens).toJSON() : null,
      largeur: document.documentElement.clientWidth, debordement: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

console.log('\n1. En-tête de l\'app — grande largeur (centre = milieu de l\'en-tête = onglet Lens)');
const VARIANTES = [
  { nom: '31 annonces, Pro', q: '?compteur=31&palier=pro' },
  { nom: '1000 annonces, Business', q: '?compteur=1000&palier=business' },
  { nom: '5 annonces, Premium', q: '?compteur=5&palier=premium' },
  { nom: 'sans compteur, sans pastille', q: '?compteur=aucun&palier=aucun' },
];
for (const theme of ['light', 'dark']) {
  for (const largeur of [1920, 1440, 1280, 1100, 1024, 900, 820, 769]) {
    for (const v of VARIANTES) {
      if (theme === 'dark' && v.nom !== '31 annonces, Pro') continue;
      const p = await page(largeur, 700, theme, URL_APP(v.q));
      const m = await mesuresEnTete(p);
      const tbCx = m.topbar.left + m.topbar.width / 2;
      const cx = m.centre.left + m.centre.width / 2;
      const lensCx = m.lens.left + m.lens.width / 2;
      const place = (m.topbar.width - m.centre.width) / 2 - 10 - 16; // part de chaque côté
      const tient = Math.max(m.gaucheFin - m.gaucheDebut, m.droiteFin - m.droiteDebut) <= place;
      const chevauche = m.centre.left < m.gaucheFin - 0.5 || m.centre.right > m.droiteDebut + 0.5;
      if (tient) verifier(Math.abs(cx - tbCx) <= 1 && Math.abs(cx - lensCx) <= 1, `${theme} ${largeur} px, ${v.nom} : centré`, `centre ${cx.toFixed(1)}, en-tête ${tbCx.toFixed(1)}, Lens ${lensCx.toFixed(1)}`);
      else verifier(!chevauche, `${theme} ${largeur} px, ${v.nom} : pas la place de centrer → décalé sans chevaucher`, `écart au milieu ${(cx - tbCx).toFixed(1)} px`);
      verifier(!chevauche && !m.debordement, `${theme} ${largeur} px, ${v.nom} : aucun chevauchement, aucun débordement`);
      verifier(p.__erreurs.length === 0, `${theme} ${largeur} px, ${v.nom} : aucune erreur de page`, p.__erreurs.join(' | '));
      if ([1440, 900, 769].includes(largeur) && (v.nom === '31 annonces, Pro' || largeur === 900)) {
        await p.screenshot({ path: path.join(SORTIE, `app-${theme}-${largeur}-${v.q.includes('1000') ? 'business-1000' : v.q.includes('premium') ? 'premium-5' : v.q.includes('aucun') ? 'nu' : 'pro-31'}.png`), clip: { x: 0, y: 0, width: largeur, height: 130 } });
      }
      if (largeur >= 769 && v.nom === '31 annonces, Pro') await logoEntier(p, '.tb-logo .name', `app ${theme} ${largeur} px, logo texte`);
      await p.context().close();
    }
  }
}

console.log('\n2. En-tête de l\'app — mobile (le bloc du milieu est masqué ≤ 768 px)');
for (const theme of ['light', 'dark']) {
  for (const largeur of [768, 600, 481, 430, 414, 390, 375, 360, 320]) {
    for (const v of VARIANTES.slice(0, 2)) {
      if (theme === 'dark' && v.nom !== '31 annonces, Pro') continue;
      const p = await page(largeur, 800, theme, URL_APP(v.q));
      const m = await mesuresEnTete(p);
      verifier(m.gaucheFin <= m.droiteDebut - 4, `${theme} ${largeur} px, ${v.nom} : compteur et pastille ne se touchent pas`, `fin gauche ${m.gaucheFin.toFixed(1)}, début droite ${m.droiteDebut.toFixed(1)}${m.centreVisible ? ', centre VISIBLE' : ''}`);
      // L'ANCIEN rendu (avant le 11/10 : centre flex 1 entre ses voisins), rejoué
      // par une feuille ajoutée : le contenu de l'en-tête ne déborde jamais PLUS qu'avant.
      const ancien = await p.addStyleTag({ content: '.tb-left{display:contents !important} .tb-right{flex:0 0 auto !important;justify-content:normal !important} .header-centre{flex:1 1 0% !important}' });
      const mAncien = await mesuresEnTete(p);
      await ancien.evaluate((n) => n.remove());
      const deborde = Math.max(0, m.droiteFin - m.largeur);
      const debordeAvant = Math.max(0, mAncien.droiteFin - mAncien.largeur);
      verifier(!m.debordement && m.gaucheDebut >= 0 && deborde <= debordeAvant + 0.5, `${theme} ${largeur} px, ${v.nom} : jamais plus de débordement qu'avant`, deborde > 0 ? `PRÉEXISTANT : réglages coupés de ${deborde.toFixed(1)} px, avant ${debordeAvant.toFixed(1)} px` : 'rien ne déborde');
      if ([390, 320].includes(largeur) || (largeur === 768 && v.nom === '31 annonces, Pro')) await p.screenshot({ path: path.join(SORTIE, `app-${theme}-${largeur}-${v.q.includes('1000') ? 'business-1000' : 'pro-31'}.png`), clip: { x: 0, y: 0, width: largeur, height: 110 } });
      if (v.nom === '31 annonces, Pro') {
        // ≤ 480 px avec compteur, le mot « FillSell » cède la place (App.css) ; ailleurs il doit être entier.
        const nomVisible = await p.locator('.tb-logo .name').first().isVisible();
        if (nomVisible) await logoEntier(p, '.tb-logo .name', `app ${theme} ${largeur} px, logo texte`);
      }
      await p.context().close();
    }
  }
}
// Mobile sans compteur : le logo texte reste affiché jusqu'à 320 px.
for (const largeur of [480, 390, 320]) {
  const p = await page(largeur, 800, 'light', URL_APP('?compteur=aucun&palier=pro'));
  await logoEntier(p, '.tb-logo .name', `app ${largeur} px sans compteur, logo texte`);
  await p.context().close();
}

console.log('\n2 bis. Logo texte de l\'app aux zooms Windows (100, 125, 150 %)');
for (const zoom of [1, 1.25, 1.5]) for (const largeur of [1440, 390]) {
  const p = await page(largeur, 700, 'light', URL_APP('?compteur=aucun&palier=pro'), zoom);
  await logoEntier(p, '.tb-logo .name', `app ${largeur} px zoom ${zoom * 100} %, logo texte`);
  await p.context().close();
}

console.log('\n3. Logo texte du blog');
for (const theme of ['light', 'dark']) {
  const p = await page(800, 200, theme, URL_APP('?vue=blog'));
  await p.screenshot({ path: path.join(SORTIE, `blog-${theme}.png`), clip: { x: 0, y: 0, width: 260, height: 90 } });
  await logoEntier(p, '.blog-brand-name', `blog ${theme}, logo texte`);
  await p.context().close();
}

if (serveurSite) {
  console.log('\n4. Site construit (build/site-apercu) — en-tête et pied de page');
  const pages = ['/', '/comment-ca-marche/', '/en/'];
  for (const theme of ['light', 'dark']) {
    for (const largeur of [1920, 1440, 1024, 760, 560, 390, 360, 320]) {
      for (const chemin of pages) {
        if (theme === 'dark' && chemin !== '/') continue;
        const url = `http://127.0.0.1:${PORT_SITE}${chemin}`;
        const r = await fetch(url);
        if (!r.ok) { verifier(false, `site ${chemin} : servi`, `HTTP ${r.status}`); continue; }
        const p = await page(largeur, 900, theme, url);
        if (chemin === '/' && [1440, 390, 320].includes(largeur)) {
          await p.screenshot({ path: path.join(SORTIE, `site-${theme}-${largeur}-entete.png`), clip: { x: 0, y: 0, width: largeur, height: 90 } });
        }
        await logoEntier(p, '.entete .wordmark', `site ${theme} ${largeur} px ${chemin}, en-tête`);
        if (chemin === '/' && largeur === 1440) {
          await p.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
          await p.locator('.logo-clair').first().scrollIntoViewIfNeeded();
          await p.waitForTimeout(300);
          const pied = await boite(p, '.logo-clair');
          if (pied) await p.screenshot({ path: path.join(SORTIE, `site-${theme}-1440-pied.png`), clip: { x: Math.max(0, pied.x - 20), y: Math.max(0, pied.y - 20), width: 300, height: pied.height + 40 } });
        }
        await logoEntier(p, '.logo-clair .wordmark', `site ${theme} ${largeur} px ${chemin}, pied de page`);
        await p.context().close();
      }
    }
  }
  // Zooms Windows (100, 125, 150 %) : le rendu de la police penchée change avec eux.
  for (const zoom of [1, 1.25, 1.5]) for (const largeur of [1440, 390]) {
    const p = await page(largeur, 900, 'light', `http://127.0.0.1:${PORT_SITE}/`, zoom);
    await logoEntier(p, '.entete .wordmark', `site ${largeur} px zoom ${zoom * 100} %, en-tête`);
    await logoEntier(p, '.logo-clair .wordmark', `site ${largeur} px zoom ${zoom * 100} %, pied de page`);
    await p.context().close();
  }
} else {
  console.log('\n4. Site : build/site-apercu absent — lancer « npm run site:apercu -- --sans-serveur » d\'abord');
  echecs.push('site non vérifié');
}

await navigateur.close();
if (serveurSite) serveurSite.close();
stop();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s) :\n  - ${echecs.join('\n  - ')}` : '\n✓ tout est vert');
console.log(`captures : ${SORTIE}`);
process.exit(echecs.length ? 1 : 0);
