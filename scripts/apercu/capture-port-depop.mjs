// Captures téléphone du champ « Frais de port Depop » et de la feuille
// « Envoi suivi en France » (09/10/2026 soir). Outil de relecture, jamais livré.
//
//     node scripts/apercu/capture-port-depop.mjs
//
// Ce qu'il PROUVE, en plus de montrer (iPhone 390 × 844, et 360 px) :
//   · le champ : « € » visible, clavier numérique (inputmode decimal), message
//     simple si vide ou hors limites (100 €) ;
//   · la feuille monte du BAS, au même endroit, entièrement dans l'écran ;
//     croix visible ; le fond est figé tant qu'elle est ouverte ;
//   · les trois sorties : la croix, toucher en dehors, glisser vers le bas ;
//   · toucher un prix remplit le champ et referme la feuille ;
//   · chaque prix se touche au doigt (≥ 44 px), aucun débordement horizontal ;
//   · contraste ≥ 4,5:1 des textes, en clair ET en sombre.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'port-depop');
const PORT = 5207;
const BASE = `http://localhost:${PORT}/scripts/apercu/port-depop.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-modale-free.config.mjs', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);

async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('vite n’a pas répondu');
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; const [r, g, b] = m.slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };

// Fond réel derrière un élément (premier ancêtre au fond opaque).
const FOND = `(el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/[\\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.95)) return c; n = n.parentElement; } return 'rgb(255,255,255)'; }`;

async function glisser(page, selecteur, dy) {
  await page.evaluate(async ({ sel, dy }) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2; const y0 = r.top + r.height / 2;
    const t = (y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(y0)], targetTouches: [t(y0)], changedTouches: [t(y0)], bubbles: true, cancelable: true }));
    for (let i = 1; i <= 8; i++) {
      await new Promise((res) => setTimeout(res, 16));
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(y0 + (dy * i) / 8)], targetTouches: [t(y0 + (dy * i) / 8)], changedTouches: [t(y0 + (dy * i) / 8)], bubbles: true, cancelable: true }));
    }
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [t(y0 + dy)], bubbles: true, cancelable: true }));
  }, { sel: selecteur, dy });
  await page.waitForTimeout(350);
}

try {
  await attendreServeur();
  const nav = await chromium.launch({ channel: 'chrome' });
  for (const [largeur, hauteur] of [[390, 844], [360, 740]]) {
    for (const theme of ['clair', 'sombre']) {
      console.log(`\n── ${largeur} × ${hauteur}, ${theme} ──`);
      const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));
      const suffixe = `${largeur}-${theme}`;
      const url = (scene) => `${BASE}?scene=${scene}${theme === 'sombre' ? '&theme=dark' : ''}`;

      // 1. Le champ, sans prix par défaut : à remplir avant l'envoi.
      await page.goto(url('vide'), { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | ').slice(0, 300));
      const champ = page.locator('input.fpd-input').first();
      verifier(await champ.getAttribute('inputmode') === 'decimal', 'clavier numérique (inputmode decimal)');
      verifier(await page.locator('.fpd-euro').first().isVisible(), '« € » visible dans le champ');
      verifier(/Indique le prix de livraison/.test(await page.locator('.fpd-message').first().innerText()), 'vide : message simple « Indique le prix… »');
      await page.screenshot({ path: path.join(SORTIE, `1-champ-vide-${suffixe}.png`) });

      // Hors limites.
      await champ.fill('120');
      await champ.blur();
      verifier(/moins de 100 €/.test(await page.locator('.fpd-message').first().innerText()), 'hors limites : « Depop accepte moins de 100 € »');
      await champ.fill('');

      // 2. La feuille, ouverte depuis le lien sous le champ.
      await page.locator('.fpd-lien').first().click();
      await page.waitForTimeout(450);
      const feuille = page.locator('.fpd-feuille');
      verifier(await feuille.isVisible(), 'la feuille s’ouvre');
      const bf = await feuille.boundingBox();
      verifier(Math.abs(bf.y + bf.height - hauteur) <= 1, 'elle monte du BAS de l’écran (collée au bord)', `bas=${bf.y + bf.height}`);
      verifier(bf.y >= 0 && bf.x >= 0 && bf.x + bf.width <= largeur + 0.5, 'entièrement dans l’écran');
      verifier(await page.locator('.fpd-croix').isVisible(), 'croix visible');
      verifier(await page.evaluate(() => document.documentElement.classList.contains('fs-modale-ouverte')), 'fond figé (useFondFige : html.fs-modale-ouverte, défilement du fond coupé)');
      const hauteursPrix = await page.locator('.fpd-prix').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      verifier(hauteursPrix.length === 10 && hauteursPrix.every((h) => h >= 44), '10 prix, chacun ≥ 44 px au doigt', hauteursPrix.join(','));
      verifier(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'aucun débordement horizontal');
      const phrase = await page.locator('.fpd-phrase').innerText();
      verifier(/pas d.étiquette/.test(phrase) && /envoi suivi/.test(phrase) && /numéro de suivi sur Depop/.test(phrase) && phrase.length < 200, 'la phrase : courte, en haut (étiquette, suivi, numéro)', `${phrase.length} car.`);
      // Contrastes des textes de la feuille.
      for (const sel of ['.fpd-titre', '.fpd-phrase', '.fpd-taille', '.fpd-poids', '.fpd-prix', '.fpd-sources', '.fpd-col-t']) {
        const { couleur, fond } = await page.locator(sel).first().evaluate((el, f) => ({ couleur: getComputedStyle(el).color, fond: (new Function(`return ${f}`))()(el) }), FOND);
        const r = contraste(couleur, fond);
        verifier(r >= 4.5, `contraste ${sel} ≥ 4,5:1`, `${r.toFixed(2)} (${couleur} sur ${fond})`);
      }
      await page.screenshot({ path: path.join(SORTIE, `2-feuille-ouverte-${suffixe}.png`) });

      // 3. Toucher un prix : le champ se remplit, la feuille se referme.
      await page.locator('.fpd-prix').nth(3).tap(); // Petit (500 g), Mondial Relay : 4,15 €
      await page.waitForTimeout(400);
      verifier(await page.locator('.fpd-feuille').count() === 0, 'toucher un prix referme la feuille');
      verifier(await champ.inputValue() === '4,15', 'le champ porte le prix touché (4,15)', await champ.inputValue());
      verifier(await page.locator('.fpd-message').count() === 0, 'plus aucun message d’erreur');
      verifier(await page.evaluate(() => !document.documentElement.classList.contains('fs-modale-ouverte')), 'le fond est libéré');
      await page.screenshot({ path: path.join(SORTIE, `3-champ-rempli-${suffixe}.png`) });

      // 4. Les sorties : toucher en dehors, glisser vers le bas, la croix.
      await page.locator('.fpd-lien').first().click(); await page.waitForTimeout(400);
      await page.mouse.click(largeur / 2, 20); await page.waitForTimeout(300);
      verifier(await page.locator('.fpd-feuille').count() === 0, 'toucher en dehors ferme');
      await page.locator('.fpd-lien').first().click(); await page.waitForTimeout(400);
      await glisser(page, '.fpd-tete', 160);
      verifier(await page.locator('.fpd-feuille').count() === 0, 'glisser vers le bas (160 px) ferme');
      await page.locator('.fpd-lien').first().click(); await page.waitForTimeout(400);
      await glisser(page, '.fpd-tete', 40);
      verifier(await page.locator('.fpd-feuille').count() === 1, 'un petit glissé (40 px) la laisse en place');
      await page.locator('.fpd-croix').click(); await page.waitForTimeout(300);
      verifier(await page.locator('.fpd-feuille').count() === 0, 'la croix ferme');
      verifier(await champ.inputValue() === '4,15', 'fermer sans choisir ne touche pas au champ');

      // 5. Le prix par défaut, pré-rempli.
      await page.goto(url('defaut'), { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      verifier(await page.locator('input.fpd-input').first().inputValue() === '4,50', 'pré-rempli avec le prix par défaut (4,50)');
      await page.screenshot({ path: path.join(SORTIE, `4-champ-prix-par-defaut-${suffixe}.png`) });
      await ctx.close();
    }
  }
  // 6. Téléphone en mode sombre, app claire : la feuille reste claire avec elle.
  const ctxS = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pS = await ctxS.newPage();
  await pS.goto(`${BASE}?scene=vide`, { waitUntil: 'networkidle' }); await pS.waitForTimeout(500);
  await pS.locator('.fpd-lien').first().click(); await pS.waitForTimeout(450);
  const fondS = await pS.locator('.fpd-feuille').evaluate((el) => getComputedStyle(el).backgroundColor);
  verifier(fondS === 'rgb(237, 234, 224)', 'téléphone en sombre : la feuille suit l’app (claire), jamais une tache noire', fondS);
  await pS.screenshot({ path: path.join(SORTIE, '5-telephone-sombre-app-claire-390.png') });
  await ctxS.close();
  await nav.close();
} catch (e) {
  console.error(e); echecs.push(String(e));
} finally {
  stop();
  console.log(`\n${echecs.length ? '✗' : '✓'} captures port Depop : ${echecs.length} échec(s) — ${SORTIE}`);
  process.exit(echecs.length ? 1 : 0);
}
