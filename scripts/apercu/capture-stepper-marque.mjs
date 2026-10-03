// La marque redemandée (cas Ornella, 03/10) — le stepper RÉEL sur la fiche
// RÉELLE, Supabase factice, aucun réseau. Outil de relecture, jamais livré.
//
//     node scripts/apercu/capture-stepper-marque.mjs
//
// Ce qu'il PROUVE (cf. stepper-marque.jsx) :
//   · sans-marque  : « Marque · Vinted » est posée à Confirmer, « Continuer
//     sans Vinted » est offert, la réponse « Bonobo » LÈVE la question (avant
//     le 03/10 : la copie Vinted verrouillée restait sur « B », question
//     éternelle) ; la question est journalisée (champ_requis_bloquant) ;
//   · fiche-bonobo : la marque de la fiche comble la copie « B » : aucune
//     question de marque ;
//   · carte        : écran 2, carte Vinted, « Déjà rempli » : la Marque est un
//     champ texte (suggestions facultatives), on l'efface et on tape une
//     marque inventée lettre à lettre sans que le champ disparaisse.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'stepper-marque');
const PORT = 5207;
const BASE = `http://localhost:${PORT}/scripts/apercu/stepper-marque.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => { try { if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' }); else vite.kill(); } catch { /* déjà mort */ } };
process.on('exit', stop);
let viteMort = null;
vite.on('exit', (code) => { viteMort = code ?? 'signal'; });
async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (viteMort !== null) throw new Error(`vite s'est arrêté au démarrage (code ${viteMort})`);
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite n'a pas répondu dans le délai");
}
const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const filtre = (erreurs) => erreurs.filter((x) => !/favicon|fonts\.g|net::ERR|ERR_INTERNET|Download the React DevTools|Failed to load resource/.test(x));

async function ouvrir(navigateur, scenario) {
  const page = await navigateur.newPage({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 });
  const erreurs = [];
  await page.route((url) => url.hostname !== 'localhost', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    if (u.hostname.endsWith('.supabase.co')) {
      if (u.pathname.startsWith('/rest/v1/') && route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.fulfill({ status: 204, body: '' });
    }
    return route.abort();
  });
  page.on('pageerror', (x) => erreurs.push(String(x)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); if (/COMBLE|DBGMARQUE/.test(m.text())) console.log('    [page]', m.text().slice(0, 400)); });
  await page.goto(`${BASE}?scenario=${scenario}`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForTimeout(2500);
  return { page, erreurs };
}
const texte = (page) => page.locator('body').innerText();
const cta = (page) => page.locator('.fsn-foot .fsn-col > button').first();
async function versEcran(page, n) {
  for (let i = 0; i < 4; i++) {
    const ecran = Number(await page.locator('.fsn').getAttribute('data-ecran'));
    if (ecran >= n) return ecran;
    await cta(page).click();
    await page.waitForTimeout(1800);
  }
  return Number(await page.locator('.fsn').getAttribute('data-ecran'));
}

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });

  // ── 1. La fiche sans marque : la question est posée, et la réponse passe ──
  {
    console.log("\nscénario « sans-marque » (fiche réelle d'Ornella, copie Vinted « B » verrouillée)");
    const { page, erreurs } = await ouvrir(navigateur, 'sans-marque');
    const ecran = await versEcran(page, 3);
    verifier(ecran === 3, "l'écran « Confirmer » est atteint", `écran ${ecran}`);
    let t = await texte(page);
    await page.screenshot({ path: path.join(SORTIE, '1-sans-marque-question.png'), fullPage: true });
    const question = page.locator('.fsn-q', { hasText: 'Marque' }).first();
    verifier(await question.count() === 1 && /Vinted/.test(await question.innerText()), 'la question « Marque · Vinted » est posée', t.slice(0, 300));
    verifier(/Continuer sans Vinted/.test(t), '« Continuer sans Vinted » est offert (une issue autre que Quitter)');
    const champ = question.locator('input[type="text"]').first();
    await champ.click();
    await champ.fill('');
    await champ.pressSequentially('Bonobo', { delay: 60 });
    await page.waitForTimeout(1200);
    t = await texte(page);
    await page.screenshot({ path: path.join(SORTIE, '2-sans-marque-repondue.png'), fullPage: true });
    verifier(await champ.inputValue() === 'Bonobo', 'le champ garde « Bonobo »', await champ.inputValue());
    verifier(!/Une question avant de publier|questions avant de publier/.test(t), 'la question est LEVÉE après « Bonobo »', t.slice(0, 400));
    verifier(/Tout est complété/.test(t), "l'encart dit « Tout est complété »");
    verifier(!/Réponds à la question ci-dessus/.test(t), 'le pied ne réclame plus de réponse');
    const logs = await page.evaluate(() => window.__usageLogs);
    const marqueLog = logs.find((l) => l?.feature === 'champ_requis_bloquant' && l?.metadata?.partage === 'marque' && l?.metadata?.platform === 'vinted');
    verifier(Boolean(marqueLog) && marqueLog.metadata.inventaire_id === 1791047123870, 'la question est journalisée (champ_requis_bloquant, partage marque, article)', JSON.stringify(logs).slice(0, 300));
    verifier(filtre(erreurs).length === 0, 'aucune erreur de page', filtre(erreurs).join(' | ').slice(0, 400));
    await page.close();
  }

  // ── 2. La fiche porte « Bonobo » : jamais redemandée ──────────────────────
  {
    console.log("\nscénario « fiche-bonobo » (même fiche, l'article porte la marque Bonobo)");
    const { page, erreurs } = await ouvrir(navigateur, 'fiche-bonobo');
    const ecran = await versEcran(page, 3);
    verifier(ecran === 3, "l'écran « Confirmer » est atteint", `écran ${ecran}`);
    const t = await texte(page);
    await page.screenshot({ path: path.join(SORTIE, '3-fiche-bonobo-confirmer.png'), fullPage: true });
    verifier(await page.locator('.fsn-q', { hasText: 'Marque' }).count() === 0, 'aucune question « Marque »', t.slice(0, 300));
    verifier(filtre(erreurs).length === 0, 'aucune erreur de page', filtre(erreurs).join(' | ').slice(0, 400));
    await page.close();
  }

  // ── 3. La carte Vinted : la marque se tape, le champ reste sous les doigts ─
  {
    console.log('\nscénario « carte » (écran 2, carte Vinted, « Déjà rempli »)');
    const { page, erreurs } = await ouvrir(navigateur, 'fiche-bonobo');
    const ecran = await versEcran(page, 2);
    verifier(ecran === 2, "l'écran « Ce qui va partir » est atteint", `écran ${ecran}`);
    // La ligne Vinted se reconnaît à son rayon (« Femmes › … › Pulls d'hiver »).
    await page.locator('.fsn-scroll').getByText(/Pulls d.hiver/).first().click();
    await page.waitForTimeout(800);
    const deja = page.getByText(/Déjà rempli|déjà là|Déjà renseigné/i).first();
    if (await deja.count()) { await deja.click(); await page.waitForTimeout(500); }
    await page.screenshot({ path: path.join(SORTIE, '4-carte-vinted-ouverte.png'), fullPage: true });
    let champ = null;
    const tous = page.locator('input[type="text"]');
    for (let i = 0; i < await tous.count(); i++) { if (await tous.nth(i).inputValue() === 'Bonobo') { champ = tous.nth(i); break; } }
    verifier(Boolean(champ), 'la Marque de la carte Vinted est un champ TEXTE portant « Bonobo » (pas un menu fermé)');
    if (champ) {
      const handle = await champ.elementHandle();
      await champ.click();
      await champ.press('Control+A');
      await champ.press('Backspace');
      await page.waitForTimeout(400);
      const encoreLa = await handle.evaluate((el) => document.activeElement === el && el.isConnected);
      verifier(encoreLa, 'champ vidé : il reste à sa place, sous les doigts');
      console.log('    valeur après effacement :', JSON.stringify(await handle.evaluate((el) => el.value)));
      await page.keyboard.type('Z', { delay: 50 }); await page.waitForTimeout(400);
      console.log('    après Z :', JSON.stringify(await handle.evaluate((el) => el.value)));
      await page.keyboard.press('Backspace'); await page.waitForTimeout(400);
      console.log('    après effacement de Z :', JSON.stringify(await handle.evaluate((el) => el.value)));
      await page.keyboard.type('Zorglub Atelier', { delay: 50 });
      await page.waitForTimeout(600);
      const valeur = await handle.evaluate((el) => el.value);
      verifier(valeur === 'Zorglub Atelier', 'la marque inventée est tapée en entier', valeur);
    }
    await page.screenshot({ path: path.join(SORTIE, '5-carte-vinted-marque-libre.png'), fullPage: true });
    verifier(filtre(erreurs).length === 0, 'aucune erreur de page', filtre(erreurs).join(' | ').slice(0, 400));
    await page.close();
  }

  await navigateur.close();
  if (echecs.length) { console.error(`\n❌ ${echecs.length} vérification(s) en échec`); process.exitCode = 1; }
  else console.log("\n✅ la marque n'est plus jamais une impasse : tout passe");
} catch (e) {
  console.error("\n❌ le banc n'a pas pu tourner :", e?.stack ?? e);
  process.exitCode = 2;
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
