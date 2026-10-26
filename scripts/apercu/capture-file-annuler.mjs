// Capture et PREUVE de « Ta file » : Tout annuler, annulation par ligne (26/10, Nico).
// Outil de relecture, jamais livré — même patron que capture-barres.mjs.
//
//     node scripts/apercu/capture-file-annuler.mjs
//
// À 390 px (téléphone, tactile) et 1280 px (ordinateur) :
//   · aucune erreur de page, aucun défilement horizontal ;
//   · « Tout annuler » rouge à côté de « Mettre en pause », dans la barre ;
//   · une croix sur chaque ligne annulable, AUCUNE sur l'en cours, la republication déjà retirée, le retrait ;
//   · la confirmation dit le nombre exact et ce qui continue ;
//   · la croix demande « Annuler ? » dans la ligne ; glisser révèle « Annuler » (téléphone) ;
//   · après « Tout annuler », les lignes annulées disparaissent et seules elles ont été écrites.
// PNG dans screenshots-review/file-annuler/.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'file-annuler');
const PORT = 5211;
const BASE = `http://localhost:${PORT}/scripts/apercu/file-annuler.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
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

try {
  await attendreServeur();
  const navigateur = await chromium.launch();
  for (const largeur of [390, 1280]) {
    const tel = largeur < 500;
    console.log(`\n— ${largeur} px${tel ? ' (téléphone, tactile)' : ''}`);
    const contexte = await navigateur.newContext({ viewport: { width: largeur, height: tel ? 844 : 900 }, deviceScaleFactor: tel ? 2 : 1, hasTouch: tel, isMobile: tel });
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByText('Tout annuler').first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(400);
    const dialogue = page.locator('[role="dialog"]').first();
    const debord = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    verifier(!debord, 'aucun défilement horizontal');
    const barre = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')];
      const pause = b.find((x) => x.textContent.trim() === 'Mettre en pause');
      const tout = b.find((x) => x.textContent.trim() === 'Tout annuler');
      if (!pause || !tout) return null;
      const rp = pause.getBoundingClientRect(); const rt = tout.getBoundingClientRect();
      return { memeLigne: Math.abs(rp.top - rt.top) < 4, aDroite: rt.left > rp.left, fond: getComputedStyle(tout).backgroundColor, memeParent: pause.parentElement === tout.parentElement };
    });
    verifier(barre && barre.memeLigne && barre.aDroite && barre.memeParent, '« Tout annuler » à côté de « Mettre en pause »', JSON.stringify(barre));
    verifier(barre?.fond === 'rgb(185, 28, 28)', '« Tout annuler » en rouge', barre?.fond);
    const croix = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Annuler "]')].map((b) => b.getAttribute('aria-label')));
    verifier(croix.length === 5, `une croix sur les 5 lignes annulables (${croix.length})`);
    const titresSansCroix = await page.evaluate(() => {
      const lignes = [...document.querySelectorAll('[role="dialog"] div')].filter((d) => /Jean Lee Carol|Montre noire/.test(d.textContent) && d.children.length > 1);
      return lignes.some((d) => d.querySelector('button[aria-label^="Annuler "]') && !/Maillot|Robe|T-shirt|Bouilloire|Sac cabas/.test(d.textContent));
    });
    verifier(!titresSansCroix, 'aucune croix sur la republication déjà retirée ni sur le retrait');
    await dialogue.screenshot({ path: path.join(SORTIE, `1-file-${largeur}.png`) });

    // La croix d'une ligne : confirmation dans la ligne.
    await page.locator('button[aria-label="Annuler cette republication"]').first().click();
    await page.getByText('Rien de ce qui est en ligne ne bouge.').first().waitFor({ timeout: 5000 });
    verifier(true, 'la croix demande « Annuler ? » dans la ligne');
    await dialogue.screenshot({ path: path.join(SORTIE, `2-croix-${largeur}.png`) });
    await page.getByRole('button', { name: 'Garder', exact: true }).click();

    if (tel) {
      // Glisser vers la gauche une ligne (événements tactiles réels).
      const cible = page.locator('button[aria-label="Annuler cette publication"]').first();
      const boite = await cible.evaluate((b) => { const r = b.parentElement.getBoundingClientRect(); return { x: r.left + r.width * 0.7, y: r.top + r.height / 2 }; });
      await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const t = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x)], bubbles: true, cancelable: true }));
        for (let k = 1; k <= 8; k++) el.dispatchEvent(new TouchEvent('touchmove', { touches: [t(x - k * 15)], bubbles: true, cancelable: true }));
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x - 120)], bubbles: true, cancelable: true }));
      }, boite);
      await page.waitForTimeout(400);
      const revele = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Annuler' && getComputedStyle(b).opacity === '1' && b.getBoundingClientRect().width > 60));
      verifier(revele, 'glisser vers la gauche révèle « Annuler »');
      await dialogue.screenshot({ path: path.join(SORTIE, `3-glisser-${largeur}.png`) });
    }

    // Tout annuler : confirmation, puis écriture.
    await page.getByRole('button', { name: 'Tout annuler', exact: true }).first().click();
    const q = page.locator('[role="alertdialog"]');
    await q.waitFor({ timeout: 5000 });
    const texte = await q.innerText();
    verifier(/Annuler les 5 publications et republications en attente \?/.test(texte), 'la question dit le nombre exact', texte.split('\n')[0]);
    verifier(/3 tâches continuent/.test(texte), 'et ce qui continue (en cours, retirée, retrait)', texte);
    await page.screenshot({ path: path.join(SORTIE, `4-confirmation-${largeur}.png`) });
    await q.getByRole('button', { name: 'Tout annuler' }).click();
    await page.getByText(/5 annulées\. Rien de ce qui est en ligne n'a bougé\./).waitFor({ timeout: 5000 });
    const ecr = await page.evaluate(() => window.__ecritures.map((e) => ({ id: e.id.slice(-2), status: e.status, hq: e.platform_fields?.hors_quota === true, arret: Boolean(e.platform_fields?.arret_utilisateur) })));
    verifier(ecr.length === 5 && ecr.every((e) => e.status === 'cancelled' && e.arret), `5 écritures, toutes « cancelled » + arret_utilisateur (${ecr.length})`);
    verifier(ecr.filter((e) => e.hq).length === 2, 'hors_quota sur les 2 republications seulement');
    const restantes = await page.evaluate(() => document.querySelectorAll('button[aria-label^="Annuler "]').length);
    verifier(restantes === 0, 'les annulées ont disparu de la file');
    await dialogue.screenshot({ path: path.join(SORTIE, `5-apres-${largeur}.png`) });
    verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
    await contexte.close();
  }
  await navigateur.close();
} catch (e) {
  echecs.push(String(e?.message ?? e));
  console.error(e);
} finally {
  stop();
}
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : `\n✓ tout passe — PNG dans ${path.relative(RACINE, SORTIE)}`);
process.exit(echecs.length ? 1 : 0);
