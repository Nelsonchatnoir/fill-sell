// Captures et contrôles des écrans « bordereau 10 × 15 / code de dépôt / tout
// imprimer » (16/10/2026). Outil de relecture, jamais livré.
//
//   npx vite --config scripts/apercu/vite-stock-refonte.config.mjs --port 5231
//   APERCU_PORT=5231 node scripts/apercu/capture-bordereau-impression.mjs
//
// Ce qu'il PROUVE, à 390 px, sur des bordereaux SYNTHÉTIQUES (aucun vrai) :
//   · aucune erreur de page, aucun débordement horizontal, aucun émoji, aucune
//     requête hors du serveur local, toutes les cibles ≥ 44 px ;
//   · l'étiquette 10 × 15 s'affiche (image rendue), « Ajuster le recadrage »
//     propose les secours, un choix est RETENU pour le transporteur (et
//     « Automatique » l'efface) ;
//   · l'original s'affiche tel que fourni ; le code de dépôt s'affiche en
//     grand et en plein écran ;
//   · « Tout imprimer » réunit 3 bordereaux en 3 pages, dans les deux formats ;
//   · les boutons suivent l'appareil : ordinateur « Télécharger » + « Imprimer »,
//     téléphone un seul bouton (« Partager ou imprimer » ou « Télécharger »).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'bordereau-impression-1610');
const PORT = Number(process.env.APERCU_PORT || 5231);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/bordereau-impression.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const EMOJI = /\p{Extended_Pictographic}/u;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const navigateur = await chromium.launch({ headless: true });
async function ouvrir(ecran, { mobile = false } = {}) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', ...(mobile ? { userAgent: IPHONE } : {}) });
  const dehors = [];
  await ctx.route((url) => !url.href.startsWith(`http://127.0.0.1:${PORT}/`), (r) => { dehors.push(r.request().url()); r.abort(); });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.goto(`${BASE}?ecran=${ecran}`, { waitUntil: 'networkidle' });
  return { ctx, page, erreurs, dehors };
}
const mesures = (page) => page.evaluate(() => ({
  debordement: document.documentElement.scrollWidth - window.innerWidth,
  texte: document.body.innerText,
  petites: [...document.querySelectorAll('[role="dialog"] button')].filter((b) => b.offsetParent !== null).map((b) => b.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length,
}));
const imageChargee = (page, sel) => page.waitForFunction((s) => { const i = document.querySelector(s); return Boolean(i && i.complete && i.naturalWidth > 0); }, sel, { timeout: 30_000 }).then(() => true).catch(() => false);

for (const [ecran, mobile] of [['apercu', false], ['apercu', true], ['original', false], ['code', true], ['tout', false]]) {
  const nom = `${ecran}${mobile ? '-telephone' : ''}`;
  const { ctx, page, erreurs, dehors } = await ouvrir(ecran, { mobile });
  console.log(`— ${nom}`);
  if (ecran === 'apercu') {
    verifier(await imageChargee(page, '[data-apercu="10x15"] img'), `${nom} : l’étiquette 10 × 15 s’affiche (image rendue)`);
    const m = await mesures(page);
    verifier(/Étiquette 10 × 15/.test(m.texte) && /Recadrage/.test(m.texte) && /Automatique/.test(m.texte), `${nom} : format 10 × 15 et recadrage automatique affichés`);
    verifier(/100 × 150 mm/.test(m.texte), `${nom} : l’aide dit le papier 100 × 150 mm`);
    if (mobile) {
      const partage = await page.evaluate(() => typeof navigator.share === 'function' && typeof navigator.canShare === 'function');
      if (partage) verifier(await page.locator('button[aria-label="Partager ou imprimer"]').count() === 1 && await page.locator('button[aria-label="Imprimer"]').count() === 0, `${nom} : téléphone qui sait partager → UN bouton « Partager ou imprimer »`);
      else verifier(await page.locator('button[aria-label="Télécharger"]').count() === 1 && await page.locator('button[aria-label="Imprimer"]').count() === 1, `${nom} : navigateur mobile sans partage → « Télécharger » + « Imprimer » (onglet)`);
    }
    else verifier(await page.locator('button[aria-label="Télécharger"]').count() === 1 && await page.locator('button[aria-label="Imprimer"]').count() === 1, `${nom} : ordinateur → « Télécharger » et « Imprimer »`);
    await page.screenshot({ path: path.join(SORTIE, `${nom}.png`) });
    if (!mobile) {
      await page.getByRole('button', { name: 'Ajuster le recadrage' }).click();
      const choix = await page.locator('[role="radiogroup"] [role="radio"]').count();
      verifier(choix === 10, 'ajuster : 10 recadrages proposés (automatique, page, moitiés, quarts)', String(choix));
      await page.screenshot({ path: path.join(SORTIE, 'apercu-ajuster.png') });
      await page.getByRole('radio', { name: 'Moitié basse' }).click();
      await page.waitForTimeout(300);
      verifier(await imageChargee(page, '[data-apercu="10x15"] img'), 'ajuster : l’aperçu est refait sur la moitié basse');
      const retenu = await page.evaluate(() => JSON.parse(localStorage.getItem('fillsell.bordereau.recadrage') ?? '{}'));
      verifier(retenu['vinted:mondial_relay'] === 'bas', 'ajuster : le choix est retenu pour Vinted · Mondial Relay (sur cet appareil)', JSON.stringify(retenu));
      verifier(/retenu sur cet appareil/.test((await mesures(page)).texte), 'ajuster : l’écran dit que le choix est retenu');
      await page.screenshot({ path: path.join(SORTIE, 'apercu-moitie-basse.png') });
      await page.getByRole('radio', { name: 'Automatique' }).click();
      await page.waitForTimeout(300);
      const apres = await page.evaluate(() => JSON.parse(localStorage.getItem('fillsell.bordereau.recadrage') ?? '{}'));
      verifier(!('vinted:mondial_relay' in apres), '« Automatique » efface le choix retenu', JSON.stringify(apres));
    }
  }
  if (ecran === 'original') {
    verifier(await imageChargee(page, '[data-apercu="origine"] img'), 'original : la page A4 s’affiche telle que fournie');
    const m = await mesures(page);
    verifier(/Tel que fourni par Vinted/.test(m.texte) && /papier A4/.test(m.texte), 'original : « tel que fourni », aide papier A4');
    verifier(!/Ajuster le recadrage/.test(m.texte), 'original : pas de recadrage proposé');
    await page.screenshot({ path: path.join(SORTIE, 'original.png') });
  }
  if (ecran === 'code') {
    verifier(await imageChargee(page, '[data-code-depot] img'), 'code : le code de dépôt s’affiche');
    const m = await mesures(page);
    verifier(/Montre ce code au point relais/.test(m.texte) && /luminosité/.test(m.texte), 'code : à montrer au point relais, luminosité');
    const taille = await page.$eval('[data-code-depot] img', (i) => i.getBoundingClientRect().width);
    verifier(taille >= 300, 'code : affiché en grand (≥ 300 px de large à 390 px)', String(taille));
    const rendu = await page.$eval('[data-code-depot] img', (i) => getComputedStyle(i).imageRendering);
    verifier(rendu === 'pixelated', 'code : pixels nets (aucun lissage des modules)', rendu);
    await page.screenshot({ path: path.join(SORTIE, 'code.png') });
    await page.getByRole('button', { name: 'Plein écran', exact: true }).click();
    await page.waitForTimeout(200);
    verifier(await page.locator('[role="dialog"][aria-label="Code de dépôt"]').count() === 1, 'code : plein écran blanc');
    await page.screenshot({ path: path.join(SORTIE, 'code-plein-ecran.png') });
  }
  if (ecran === 'tout') {
    const ok10 = await page.waitForFunction(() => /3 bordereaux · 3 pages/.test(document.body.innerText), null, { timeout: 30_000 }).then(() => true).catch(() => false);
    verifier(ok10 && await imageChargee(page, '[data-tout-imprimer] img'), 'tout imprimer 10 × 15 : 3 bordereaux → 3 pages, aperçu de la première');
    await page.screenshot({ path: path.join(SORTIE, 'tout-imprimer-10x15.png') });
    await page.getByRole('tab', { name: 'Format d’origine' }).click();
    const okO = await page.waitForFunction(() => /3 bordereaux · 3 pages/.test(document.body.innerText) && !/Préparation du fichier/.test(document.body.innerText), null, { timeout: 30_000 }).then(() => true).catch(() => false);
    verifier(okO, 'tout imprimer, format d’origine : 3 bordereaux → 3 pages');
    await page.screenshot({ path: path.join(SORTIE, 'tout-imprimer-origine.png') });
  }
  const m = await mesures(page);
  verifier(erreurs.length === 0, `${nom} : aucune erreur de page`, erreurs.join(' | '));
  verifier(m.debordement <= 0, `${nom} : aucun débordement horizontal`, `${m.debordement} px`);
  verifier(!EMOJI.test(m.texte), `${nom} : aucun émoji`);
  verifier(m.petites === 0, `${nom} : toutes les cibles font 44 px au moins`, `${m.petites} trop petite(s)`);
  verifier(dehors.length === 0, `${nom} : aucune requête hors du serveur local`, dehors.slice(0, 3).join(' '));
  await ctx.close();
}
await navigateur.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
process.exit(echecs.length ? 1 : 0);
