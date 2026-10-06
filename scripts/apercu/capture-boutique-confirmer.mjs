// Preuve du 06/10 : « Synchroniser » face à une boutique Vinted à confirmer.
//   node scripts/apercu/capture-boutique-confirmer.mjs
// Le VRAI bloc et la VRAIE ligne Vinted (boutique-confirmer.jsx), cliqués comme
// une personne, sur téléphone (390 px, sans extension → voie file) et sur
// ordinateur (1280 px, extension 0.6.100 → voie directe) :
//   · « Ajouter @celineetmarie » : boutique écrite par CE clic, puis synchro
//     partie SANS second appui et réussie ;
//   · « Ce n'est pas ma boutique » : la phrase seule, rien écrit, rien envoyé ;
//     un nouvel appui rouvre la confirmation (jamais un refus muet) ;
//   · la carte du point à régler mène au même endroit (« Choisir ma boutique ») ;
//   · zéro régression : une boutique, deux boutiques, une autre plateforme.
// Captures : screenshots-review/boutique-confirmer-0610/.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'boutique-confirmer-0610');
fs.mkdirSync(SORTIE, { recursive: true });
const PORT = 5219;
const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* arrêté */ } });
const base = `http://127.0.0.1:${PORT}/scripts/apercu/boutique-confirmer.html`;
for (let i = 0; i < 300; i += 1) { try { if ((await fetch(base)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const nav = await chromium.launch({ channel: 'chrome' });

async function ouvrir(cas) {
  const mobile = cas.startsWith('mobile');
  const ctx = await nav.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.route(/https?:\/\/[^/]*(supabase\.co|fillsell\.app)\//, (r) => r.abort());
  await page.goto(`${base}?cas=${cas}`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true, null, { timeout: 300000 });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Synchroniser'); return b && !b.disabled; }, null, { timeout: 30000 });
  await page.waitForTimeout(1500); // la ligne Vinted lit son dernier relevé
  return { page, erreurs, mobile };
}
const appuyer = (page) => page.getByRole('button', { name: 'Synchroniser', exact: true }).click();
const feuille = (page) => page.getByRole('dialog', { name: 'Boutique Vinted' });
const logs = (page) => page.evaluate(() => (window.__FIXTURE.tables.usage_logs ?? []).map((l) => ({ f: l.feature, ...l.metadata })));
const demandes = (page) => page.evaluate(() => ({
  directes: window.__commandesDirectes ?? 0,
  file: (window.__supabaseJournal ?? []).filter((j) => j.rpc === 'demander_sync_dressing').length,
}));
const pin = (page) => page.evaluate(() => window.__FIXTURE.tables.profiles[0].vinted_sync_pin);

for (const cas of ['web_ajouter', 'mobile_ajouter']) {
  console.log(`\nCas « ${cas} » — choix a) Ajouter`);
  const { page, erreurs, mobile } = await ouvrir(cas);
  if (!mobile) {
    // L'entrée par la CARTE du point à régler.
    const ligne = page.getByRole('button', { name: /point à régler/ });
    verifier(await ligne.isVisible(), 'le bloc annonce « 1 point à régler »');
    await ligne.click();
    const carte = page.getByText('Vinted : boutique à confirmer');
    await carte.waitFor({ timeout: 5000 });
    const texteCarte = await page.locator('article', { has: carte }).innerText();
    verifier(texteCarte.includes('@celineetmarie') && !/Chrome|onglet/i.test(texteCarte), 'la carte dit la boutique, sans parler de Chrome ni d\'onglets', texteCarte);
    await page.screenshot({ path: path.join(SORTIE, `${cas}-0-carte-point.png`) });
    await page.getByRole('button', { name: 'Choisir ma boutique' }).click();
  } else {
    await appuyer(page);
  }
  await feuille(page).waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(SORTIE, `${cas}-1-confirmation.png`) });
  const t = await feuille(page).innerText();
  verifier(t.includes('@celineetmarie'), 'la feuille nomme la boutique détectée', t);
  verifier(await page.getByRole('button', { name: 'Ajouter @celineetmarie à mes boutiques' }).isVisible(), 'choix a) « Ajouter @celineetmarie à mes boutiques »');
  verifier(await page.getByRole('button', { name: 'Ce n’est pas ma boutique' }).isVisible(), 'choix b) « Ce n’est pas ma boutique »');
  verifier(JSON.stringify(await pin(page)).includes('36325065') === false, 'rien n\'est rattaché avant le clic');
  verifier((await demandes(page)).directes + (await demandes(page)).file === 0, 'aucune synchro envoyée avant la réponse');
  await page.getByRole('button', { name: 'Ajouter @celineetmarie à mes boutiques' }).click();
  await feuille(page).waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => (window.__releveReussi ?? 0) >= 1, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SORTIE, `${cas}-2-apres-ajout.png`) });
  const p = await pin(page);
  const ajoutee = p?.boutiques?.find((b) => String(b.user_id) === '36325065');
  verifier(!!ajoutee && ajoutee.source === 'confirmation_app' && ajoutee.login === 'celineetmarie', 'la boutique est ajoutée PAR CE CLIC (source confirmation_app)', JSON.stringify(p));
  verifier(p?.boutiques?.length === 3, 'les deux boutiques déjà suivies sont gardées', JSON.stringify(p));
  const d = await demandes(page);
  verifier(mobile ? d.file === 1 : d.directes === 1, `la synchro part tout de suite, sans second appui (${mobile ? 'voie file' : 'voie directe'})`, JSON.stringify(d));
  verifier(await page.evaluate(() => (window.__releveReussi ?? 0) >= 1), 'le relevé de @celineetmarie réussit');
  const l = await logs(page);
  verifier(l.some((x) => x.f === 'confirmation_boutique' && x.etape === 'affichee'), 'mesure : confirmation affichée');
  verifier(l.some((x) => x.f === 'confirmation_boutique' && x.etape === 'acceptee' && x.boutique_login === 'celineetmarie'), 'mesure : confirmation acceptée');
  verifier(l.every((x) => x.app === undefined || x.app === (mobile ? 'mobile' : 'web')), 'mesure : support noté (mobile / web)');
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await page.context().close();
}

for (const cas of ['web_pas_la_mienne', 'mobile_pas_la_mienne']) {
  console.log(`\nCas « ${cas} » — choix b) Ce n'est pas ma boutique`);
  const { page, erreurs, mobile } = await ouvrir(cas);
  await appuyer(page);
  await feuille(page).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Ce n’est pas ma boutique' }).click();
  const phrase = page.getByText('Connecte-toi à ta boutique Vinted sur ton ordinateur', { exact: true });
  await phrase.waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(SORTIE, `${cas}-1-phrase.png`) });
  const t = await feuille(page).innerText();
  verifier(t.replace(/\s+/g, ' ').trim() === 'Boutique Vinted Connecte-toi à ta boutique Vinted sur ton ordinateur OK', 'la phrase seule, rien d\'autre', t);
  verifier(!/Chrome|onglet/i.test(t), 'aucune explication sur Chrome ni sur les onglets');
  verifier(!JSON.stringify(await pin(page)).includes('36325065'), 'rien n\'est rattaché');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await feuille(page).waitFor({ state: 'detached', timeout: 5000 });
  // Nouvel appui, Chrome toujours sur @celineetmarie : la confirmation revient.
  await appuyer(page);
  await feuille(page).waitFor({ timeout: 8000 });
  const t2 = await feuille(page).innerText();
  await page.screenshot({ path: path.join(SORTIE, `${cas}-2-nouvel-appui.png`) });
  verifier(t2.includes('Connecte-toi à ta boutique Vinted sur ton ordinateur') && t2.includes('Ajouter @celineetmarie'), 'nouvel appui : la confirmation revient (phrase en tête + les deux choix), jamais un refus muet', t2);
  const d = await demandes(page);
  verifier(d.directes + d.file === 0, 'aucune synchro envoyée vers la mauvaise boutique', JSON.stringify(d));
  const l = await logs(page);
  verifier(l.filter((x) => x.f === 'confirmation_boutique' && x.etape === 'affichee').length === 2, 'mesure : deux affichages');
  verifier(l.some((x) => x.f === 'confirmation_boutique' && x.etape === 'refusee'), 'mesure : confirmation refusée');
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await page.context().close();
}

for (const cas of ['normal_une', 'normal_multi', 'autres_plateformes']) {
  console.log(`\nCas « ${cas} » — zéro régression`);
  const { page, erreurs } = await ouvrir(cas);
  await appuyer(page);
  await page.waitForTimeout(1200);
  verifier(!(await feuille(page).count()), 'aucune confirmation de boutique');
  await page.waitForFunction(() => (window.__releveReussi ?? 0) >= 1, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SORTIE, `${cas}.png`) });
  const d = await demandes(page);
  verifier(d.directes === 1, 'la synchro Vinted part au premier appui (voie directe)', JSON.stringify(d));
  verifier(await page.evaluate(() => (window.__releveReussi ?? 0) >= 1), 'le relevé Vinted réussit');
  if (cas === 'autres_plateformes') {
    verifier((await page.evaluate(() => window.__relevesPlateforme ?? [])).includes('leboncoin'), 'Leboncoin part au même appui');
  }
  const l = await logs(page);
  verifier(!l.some((x) => x.f === 'confirmation_boutique'), 'aucun événement de confirmation');
  verifier(!l.some((x) => x.f === 'sync_click' && x.resultat === 'refusée'), 'aucun refus journalisé');
  verifier(erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await page.context().close();
}

await nav.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ preuve verte');
process.exit(echecs.length ? 1 : 0);
