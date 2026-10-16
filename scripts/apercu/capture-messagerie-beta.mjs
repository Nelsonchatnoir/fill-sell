// Captures et contrôles des écrans de la bêta « messages + bordereaux » (16/10/2026).
// Outil de relecture, jamais livré — même patron que capture-refonte-1610.mjs.
//
//   npx vite --config scripts/apercu/vite-stock-refonte.config.mjs --port 5218
//   APERCU_PORT=5218 node scripts/apercu/capture-messagerie-beta.mjs
//
// Ce qu'il PROUVE, à 390 px, sur des données SYNTHÉTIQUES (aucun message réel) :
//   · aucune erreur de page, aucun débordement horizontal ;
//   · aucun émoji dans le texte affiché ;
//   · la réponse verrouillée le dit (« liste blanche ») ;
//   · le bouton « Bordereau » est désactivé partout ;
//   · ouvrir une conversation appelle messagerie_vue (FillSell seulement) et
//     n'appelle AUCUN « marquer lu » d'une plateforme ;
//   · la carte n'affiche l'indicateur que s'il y a des messages non lus.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'messagerie-beta-1610');
const PORT = Number(process.env.APERCU_PORT || 5218);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/messagerie-beta.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const EMOJI = /\p{Extended_Pictographic}/u;

const navigateur = await chromium.launch({ headless: true });
async function ouvrir(ecran) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  // Tout ce qui n'est pas le serveur local est coupé (aucune requête ne part).
  await ctx.route((url) => !url.href.startsWith(`http://127.0.0.1:${PORT}/`), (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.goto(`${BASE}?ecran=${ecran}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page, erreurs };
}
const mesures = (page) => page.evaluate(() => ({
  debordement: document.documentElement.scrollWidth - window.innerWidth,
  texte: document.body.innerText,
}));

for (const ecran of ['barre', 'messages', 'expedier', 'carte']) {
  const { ctx, page, erreurs } = await ouvrir(ecran);
  const m = await mesures(page);
  console.log(`— ${ecran}`);
  verifier(erreurs.length === 0, `${ecran} : aucune erreur de page`, erreurs.join(' | '));
  verifier(m.debordement <= 0, `${ecran} : aucun débordement horizontal`, `${m.debordement} px`);
  verifier(!EMOJI.test(m.texte), `${ecran} : aucun émoji`);
  if (ecran === 'expedier') {
    const boutons = await page.$$eval('button', (bs) => bs.filter((b) => /Bordereau/.test(b.textContent)).map((b) => b.disabled));
    verifier(boutons.length === 3 && boutons.every(Boolean), 'À expédier : 3 boutons « Bordereau », tous désactivés', JSON.stringify(boutons));
    verifier(/Disponibilité à confirmer/.test(m.texte) && /À expédier/.test(m.texte), 'À expédier : états lisibles');
    verifier(/s’achète dans eBay/.test(m.texte), 'À expédier : eBay dit où se prend le bordereau');
  }
  if (ecran === 'carte') {
    const n = await page.$$eval('[data-messages-non-lus]', (els) => els.map((e) => e.getAttribute('data-messages-non-lus')));
    verifier(n.length === 1 && n[0] === '2', 'carte : indicateur seulement sur l’article qui a des non-lus', JSON.stringify(n));
  }
  if (ecran === 'messages') {
    verifier(/@acheteuse_a/.test(m.texte) && /@Marc/.test(m.texte), 'messages : pseudos et non-lus visibles');
    await page.screenshot({ path: path.join(SORTIE, 'messages-liste.png') });
    await page.getByText('@acheteuse_a').first().click();
    await page.waitForTimeout(600);
    const t2 = (await mesures(page)).texte;
    verifier(/liste blanche/.test(t2), 'conversation : la réponse verrouillée le dit (liste blanche)');
    verifier(/Offre/.test(t2), 'conversation : l’offre reçue est affichée');
    const appels = await page.evaluate(() => window.__appels);
    verifier(appels.some((a) => a.rpc === 'messagerie_vue'), 'conversation : messagerie_vue appelée (FillSell seulement)');
    verifier(!appels.some((a) => /mark|read/i.test(JSON.stringify(a)) && a.rpc !== 'messagerie_vue'), 'conversation : aucun « marquer lu » de plateforme');
    await page.screenshot({ path: path.join(SORTIE, 'messages-conversation.png') });
    await page.fill('textarea', 'Oui, toujours disponible.');
    await page.click('button[aria-label="Enregistrer la réponse"]');
    await page.waitForTimeout(400);
    const appels2 = await page.evaluate(() => window.__appels);
    const rep = appels2.find((a) => a.rpc === 'messagerie_repondre');
    verifier(Boolean(rep) && typeof rep.params?.p_cle === 'string' && rep.params.p_cle.length >= 8, 'réponse : enregistrée avec une clé d’envoi (idempotence)');
  } else {
    await page.screenshot({ path: path.join(SORTIE, `${ecran}.png`) });
  }
  await ctx.close();
}
await navigateur.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
process.exit(echecs.length ? 1 : 0);
