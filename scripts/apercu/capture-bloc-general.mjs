// Capture PNG de l'aperçu « bloc général » (2026-09-21). Outil de relecture,
// jamais livré — même patron que capture.mjs, même arbre de processus tué.
//
//     node scripts/apercu/capture-bloc-general.mjs
//
// Ce qu'il PROUVE, en plus de montrer :
//   · le bloc tient dans 400 px sans débordement horizontal ;
//   · la description est repliée sur deux lignes au premier rendu ;
//   · dissocier une carte puis changer la valeur générale ne la touche pas ;
//   · « Rétablir » la ramène sous la valeur générale.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5201;
const URL = `http://localhost:${PORT}/scripts/apercu/bloc-general.html`;

fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
});
vite.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));

const stop = () => {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' });
    else vite.kill();
  } catch { /* déjà mort */ }
};
process.on('exit', stop);

async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    try { const r = await fetch(URL); if (r.ok) return; } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite n’a pas répondu dans le délai');
}

const TITRE_LOUIS = 'Rangement Blanc et Orange pour 12 pots et 12 couvercles pour yaourtière Multidélices';
const echecs = [];
const verifier = (cond, quoi) => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}`); if (!cond) echecs.push(quoi); };

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  const page = await navigateur.newPage({ viewport: { width: 440, height: 1500 }, deviceScaleFactor: 2 });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (erreurs.length) { console.error('ERREURS DE PAGE :\n' + erreurs.join('\n')); echecs.push('erreurs de page'); }

  await page.screenshot({ path: path.join(SORTIE, 'bloc-general-replie.png'), fullPage: true });
  console.log('écrit : screenshots-review/bloc-general-replie.png');

  // 400 px sans débordement horizontal.
  const deborde = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  verifier(!deborde, 'aucun débordement horizontal à 440 px de fenêtre (contenu 400 px)');

  // La description est repliée : pas de <textarea> au premier rendu.
  verifier((await page.locator('textarea').count()) === 0, 'description repliée au premier rendu (aucun textarea)');

  // Déplier / replier.
  await page.getByRole('button', { name: 'Modifier' }).first().click();
  await page.waitForTimeout(300);
  verifier((await page.locator('textarea').count()) === 1, '« Modifier » ouvre la description');
  await page.screenshot({ path: path.join(SORTIE, 'bloc-general-deplie.png'), fullPage: true });
  console.log('écrit : screenshots-review/bloc-general-deplie.png');
  await page.getByRole('button', { name: 'Replier' }).first().click();
  await page.waitForTimeout(200);

  // ── LA GARDE DU LOT, JOUÉE À L'ÉCRAN ────────────────────────────────────
  await page.locator('[data-dissocier="ebay"]').click();
  await page.waitForTimeout(200);
  const titreEbay = await page.locator('[data-titre="ebay"]').innerText();
  verifier(/(à part)/.test(titreEbay), 'le titre eBay porte bien la modification locale');

  // On passe l'état général au palier le plus bas : chaque plateforme doit
  // recevoir SON libellé, pas la recopie du vocabulaire de référence.
  await page.getByRole('button', { name: 'Satisfaisant', exact: true }).first().click();
  await page.waitForTimeout(250);
  verifier(/(à part)/.test(await page.locator('[data-titre="ebay"]').innerText()),
    'eBay garde son titre après un changement de valeur générale');
  verifier((await page.locator('[data-etat="beebs"]').innerText()).trim() === 'État moyen',
    'Beebs reçoit « État moyen » — son vocabulaire, pas la recopie');
  verifier((await page.locator('[data-etat="leboncoin"]').innerText()).trim() === 'État satisfaisant',
    'Leboncoin reçoit « État satisfaisant »');
  verifier((await page.locator('[data-etat="vinted"]').innerText()).trim() === 'Satisfaisant',
    'Vinted reçoit « Satisfaisant »');

  await page.screenshot({ path: path.join(SORTIE, 'bloc-general-dissocie.png'), fullPage: true });
  console.log('écrit : screenshots-review/bloc-general-dissocie.png');

  // Rétablir : eBay reprend la valeur générale.
  await page.locator('[data-retablir="ebay:titre"]').click();
  await page.waitForTimeout(250);
  const apresRetablir = await page.locator('[data-titre="ebay"]').innerText();
  verifier(!/(à part)/.test(apresRetablir), '« Rétablir » ramène eBay sur le titre général');
  verifier(TITRE_LOUIS.startsWith(apresRetablir.trim().replace(/…$/, '')),
    'et ce titre est un PRÉFIXE du titre général (eBay plafonne à 80, il ne reformule pas)');

  await navigateur.close();
  if (echecs.length) { console.error(`\n❌ ${echecs.length} vérification(s) en échec`); process.exitCode = 1; }
  else console.log('\n✅ aperçu bloc général : tout passe');
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
