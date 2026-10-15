// ═══════════════════════════════════════════════════════════════════════════
// REFONTE (16/10) — LE PARCOURS D'UN NOUVEL INSCRIT, CAPTURÉ ÉCRAN PAR ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════
// Playwright (Chromium headless, profil ISOLÉ : jamais le Chrome de Nico) sur
// https://fillsell.app, avec le compte de TEST de la refonte (gratuit, marqué
// test, désinscrit des mails). Deux formats : téléphone (390 px) et ordinateur
// (1280 px). Chaque écran = une capture PNG + le texte visible + les boutons,
// dans docs/refonte/captures/<format>/ et un journal JSON.
//
// ⛔ Ce script ne clique JAMAIS « M'envoyer le lien » (un mail partirait), ne
//    publie rien, ne relie aucune plateforme : il lit des écrans vides.
//
// Usage : node scripts/refonte/parcours-nouvel-inscrit.mjs --format=telephone|ordinateur
//         [--compte=<chemin json {email,password}>] [--branche=plateformes|debut]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const FORMAT = args.format === 'ordinateur' ? 'ordinateur' : 'telephone';
const BRANCHE = args.branche === 'debut' ? 'debut' : 'plateformes';
const COMPTE = JSON.parse(fs.readFileSync(args.compte || 'C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-fill-and-sell/233a5a5d-4406-4bc5-ab18-f427b85873dc/scratchpad/compte-test.json', 'utf8'));
const BASE = 'https://fillsell.app';
const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const OUT = path.join(RACINE, 'docs', 'refonte', 'captures', FORMAT + (BRANCHE === 'debut' ? '-debut' : ''));
fs.mkdirSync(OUT, { recursive: true });
const journal = [];
let n = 0;

const viewport = FORMAT === 'telephone' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport, deviceScaleFactor: FORMAT === 'telephone' ? 2 : 1, isMobile: FORMAT === 'telephone', hasTouch: FORMAT === 'telephone',
  locale: 'fr-FR', timezoneId: 'Europe/Paris',
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

const texteVisible = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
const boutons = async () => {
  const l = await page.locator('button:visible, a:visible, [role=button]:visible, [role=checkbox]:visible').allInnerTexts();
  return [...new Set(l.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean))];
};
async function capture(nom, note = '') {
  n += 1;
  const fichier = `${String(n).padStart(2, '0')}-${nom}.png`;
  await page.waitForTimeout(600);
  try { await page.screenshot({ path: path.join(OUT, fichier), fullPage: true }); }
  catch (e) { try { await page.screenshot({ path: path.join(OUT, fichier) }); } catch { /* tant pis */ } }
  const texte = await texteVisible().catch(() => '');
  const btns = await boutons().catch(() => []);
  journal.push({ n, nom, fichier, url: page.url(), note, texte: texte.slice(0, 2500), boutons: btns.slice(0, 60) });
  console.log(`${fichier} — ${btns.slice(0, 8).join(' | ')}`);
}
// Clic « humain » d'abord ; si Playwright juge l'élément inatteignable (couche
// animée, portail), on envoie l'événement click directement — le but est de
// LIRE les écrans, pas de prouver l'ergonomie du pointeur.
async function cliquer(texte, { exact = false, role = null, attente = 800, dernier = false } = {}) {
  const base = role ? page.getByRole(role, { name: texte, exact }) : page.getByText(texte, { exact });
  const loc = dernier ? base.last() : base.first();
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  try { await loc.click({ timeout: 4000 }); }
  catch { await loc.dispatchEvent('click'); }
  await page.waitForTimeout(attente);
}
async function essayer(nom, f) {
  try { await f(); } catch (e) { console.log(`  (${nom} : ${String(e.message).split('\n')[0].slice(0, 160)})`); journal.push({ nom, erreur: String(e.message).slice(0, 300) }); }
}
// Le titre du PARCOURS (portail aria-modal), jamais celui de l'écran du dessous.
const h1 = async () => (await page.locator('[role=dialog][aria-modal=true] h1:visible').first().innerText({ timeout: 3000 }).catch(() => '')).trim();

// ── 1. Public : connexion, inscription, attente de confirmation ─────────────
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await capture('login-bandeau-consentement', 'Première chose vue : le bandeau traceurs, avant même la carte de connexion');
await essayer('refuser traceurs', () => cliquer('Refuser', { exact: true }));
await capture('login', 'Carte de connexion');
await essayer('onglet inscription', () => cliquer('Créer mon compte', { exact: true }));
await capture('inscription', 'Formulaire de création de compte');
await page.evaluate(() => localStorage.setItem('fs_attente_confirmation', JSON.stringify({ email: 'toi@exemple.fr', depuis: new Date().toISOString() })));
await page.reload({ waitUntil: 'networkidle' });
await capture('attente-confirmation', 'Écran après l’inscription par e-mail : « Regarde ta boîte mail »');
await page.evaluate(() => localStorage.removeItem('fs_attente_confirmation'));
await page.reload({ waitUntil: 'networkidle' });

// ── 2. Connexion avec le compte de test ─────────────────────────────────────
await page.locator('input[type=email]').first().fill(COMPTE.email);
await page.locator('input[type=password]').first().fill(COMPTE.password);
// « Se connecter » existe deux fois (l'onglet du formulaire ET le bouton) :
// c'est le DERNIER bouton qui envoie — Entrée dans le mot de passe fait pareil.
await essayer('se connecter', async () => { await page.getByRole('button', { name: 'Se connecter', exact: true }).last().click(); await page.waitForTimeout(1500); });
await page.waitForURL(/\/app/, { timeout: 30000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
// L'app charge son compte (fetchAll) puis ouvre le parcours d'entrée ou l'écran.
await page.locator('[role=dialog][aria-modal=true], nav, [class*=tabbar], button[aria-label="Réglages"]').first().waitFor({ timeout: 40000 }).catch(() => {});
await page.waitForTimeout(2500);
await capture('arrivee-app', 'Ce qui s’affiche à la première connexion');

// ── 3. Le parcours d'entrée (onboarding) ────────────────────────────────────
const dansParcours = async () => /Où tu vends|eBay|ordinateur|ressaisis|remontent|appelle|À toi de jouer|première annonce/i.test(await h1());
if (await dansParcours()) {
  // Étape 1 — plateformes
  if (BRANCHE === 'debut') {
    await essayer('rien en ligne', () => cliquer("Je n'ai encore rien en ligne"));
    await capture('entree-1-plateformes-rien-en-ligne', 'Réponse « Je n’ai encore rien en ligne »');
  } else {
    for (const p of ['Vinted', 'Leboncoin', 'eBay', 'Beebs']) {
      await essayer(`cocher ${p}`, async () => { await page.locator('[role=dialog] [role=checkbox]', { hasText: p }).first().click(); await page.waitForTimeout(300); });
    }
    await capture('entree-1-plateformes', 'Étape 1 : où tu vends ? (4 plateformes proposées, Depop absente)');
  }
  await essayer('continuer 1', () => cliquer('Continuer', { exact: true, role: 'button' }));

  // Étape eBay (seulement si eBay cochée)
  if (/eBay/i.test(await h1())) {
    await capture('entree-2-ebay', 'Étape eBay : relier le compte (ne pas relier ici)');
    await essayer('ebay plus tard', () => cliquer('Plus tard', { exact: false }));
  }
  // Étape extension
  if (/ordinateur/i.test(await h1())) {
    await capture('entree-3-extension', 'Étape extension : le mail du lien (téléphone) ou l’installation (ordinateur)');
    if (FORMAT === 'ordinateur') {
      await essayer('ouvrir pitch extension', () => cliquer("Installer l'extension", { exact: true, role: 'button' }));
      await capture('entree-3b-extension-feuille', 'Feuille « L’extension FillSell, dans Chrome »');
      await essayer('fermer feuille', async () => { await page.mouse.click(8, 8); await page.waitForTimeout(600); });
    }
    await essayer('passer extension', () => cliquer('Passer', { exact: true, role: 'button' }));
  }
  // Étape relevé ou « je débute »
  if (/ressaisis/i.test(await h1())) {
    await capture('entree-4-releve', 'Étape synchronisation : « Tu ne ressaisis rien »');
    await essayer('synchroniser', () => cliquer('Synchroniser mes annonces', { exact: true, role: 'button', attente: 1500 }));
    await capture('entree-4b-releve-en-file', 'Après le tap sans extension : la demande est gardée');
    await essayer('continuer relevé', () => cliquer('Continuer', { exact: true, role: 'button' }));
  } else if (/première annonce/i.test(await h1())) {
    await capture('entree-4-debut', 'Étape « Je débute » : on part de ta première annonce');
    await essayer('passer début', () => cliquer('Passer', { exact: true, role: 'button' }));
  }
  // Étape republication
  if (/remontent/i.test(await h1())) {
    await capture('entree-5-republication', 'Étape republication automatique');
    await essayer('compris', () => cliquer('Compris', { exact: true, role: 'button' }));
  }
  // Étape pseudo
  if (/appelle/i.test(await h1())) {
    await capture('entree-6-pseudo', 'Étape pseudo');
    await essayer('passer pseudo', () => cliquer('Passer', { exact: true, role: 'button' }));
  }
  // Fin
  if (/À toi de jouer/i.test(await h1())) {
    await capture('entree-7-fin', 'Récapitulatif de sortie');
    await essayer('entrer', () => cliquer('Entrer dans FillSell', { exact: true, role: 'button', attente: 2500 }));
  }
}
await page.waitForTimeout(1500);
await capture('app-apres-entree', 'Première page de l’app après le parcours');

// ── 4. Chaque onglet, vide ──────────────────────────────────────────────────
// La barre d'onglets : un bouton par onglet, nommé par son libellé.
const onglet = async (o) => { await page.getByRole('button', { name: new RegExp(`^\\s*${o}\\s*$`) }).last().click(); await page.waitForTimeout(2500); };
const ongletsTel = ['Tableau', 'Stock IA', 'Lens', 'Ventes', 'Stats'];
for (const o of ongletsTel) {
  await essayer(`onglet ${o}`, async () => { await onglet(o); await capture(`onglet-${o.toLowerCase().replace(/\s+/g, '-')}`, `Onglet « ${o } » sans aucune donnée`); });
}
// Lens : la feuille photo, puis l'aide « ? »
await essayer('lens', async () => {
  await onglet('Lens');
  const viseur = page.getByText('Touche pour scanner un article').first();
  if (await viseur.count()) { await viseur.click(); await page.waitForTimeout(900); await capture('lens-feuille-photo', 'Après le tap sur le viseur : « Prendre une photo / Choisir »'); await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
});
// Stock : l'entrée « Ajouter un article »
await essayer('stock ajouter', async () => {
  await onglet('Stock IA');
  const b = page.getByText('Ajouter un article').first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(900); await capture('stock-feuille-ajouter', 'Feuille « Ajouter un article » du Stock vide'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  const sync = page.getByRole('button', { name: /^Synchroniser|Extension requise/ }).first();
  if (await sync.count()) { journal.push({ nom: 'stock-bouton-synchroniser', texte: (await sync.innerText()).trim(), desactive: await sync.isDisabled() }); }
  const pts = page.getByText(/point(s)? à régler/).first();
  if (await pts.count()) { await pts.click(); await page.waitForTimeout(900); await capture('stock-points-a-regler', 'Feuille « points à régler » du bloc Synchroniser'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
});

// ── 5. Réglages et sous-pages ───────────────────────────────────────────────
await essayer('réglages', async () => {
  await page.getByRole('button', { name: 'Réglages' }).first().click();
  await page.waitForTimeout(1500);
  await capture('reglages', 'Page Réglages');
  const entrees = await page.locator('[role=dialog] button:visible, [role=dialog] a:visible').allInnerTexts().catch(() => []);
  journal.push({ nom: 'reglages-entrees', boutons: entrees.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean) });
  const ENTREES = [
    ['Comptes connectés', 'plateformes'], ['Gérer mon abonnement', 'abonnement'], ['Adresse de remise', 'expedition'],
    ['Mes transporteurs', 'transporteurs'], ['Republication automatique', 'republication'], ['Mon profil', 'profil'],
    ['Mon compte et mes données', 'compte'],
  ];
  for (const [texte, cle] of ENTREES) {
    await essayer(`réglages › ${texte}`, async () => {
      const b = page.locator('[role=dialog] button, [role=dialog] [role=button]', { hasText: texte }).first();
      if (!(await b.count())) throw new Error('entrée absente');
      await b.click(); await page.waitForTimeout(1500);
      await capture(`reglages-${cle}`, `Réglages › ${texte}`);
      // Un écran posé par-dessus (republication) se ferme par Échap ; une
      // sous-page par son bouton « retour ».
      const retour = page.getByRole('button', { name: /retour/i }).last();
      if (await retour.count()) { await retour.click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape')); }
      else await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
    });
  }
});

fs.writeFileSync(path.join(OUT, 'journal.json'), JSON.stringify({ format: FORMAT, branche: BRANCHE, compte: COMPTE.email, le: new Date().toISOString(), ecrans: journal }, null, 2));
console.log(`\n${n} captures → ${OUT}`);
await browser.close();
