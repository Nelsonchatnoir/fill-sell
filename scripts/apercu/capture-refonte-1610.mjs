// Captures et contrôles de la refonte Tableau · Ventes · Stats (16/10/2026).
// Outil de relecture, jamais livré — même patron que capture-stock-refonte.mjs.
//
//   APERCU_PORT=5216 node scripts/apercu/capture-refonte-1610.mjs
//   (serveur : npx vite --config scripts/apercu/vite-stock-refonte.config.mjs --port 5216)
//
// Ce qu'il PROUVE, à 390 px (téléphone), sur les données réelles du compte de
// Nico relues en lecture seule (build/apercu-refonte-1610/donnees.json) :
//   · aucun débordement horizontal, aucune erreur de page, aucune écriture tentée ;
//   · aucun émoji dans le texte affiché des nouveaux écrans ;
//   · la carte « PROFIT NET » est IDENTIQUE au pixel près avant / après ;
//   · Vinted n'apparaît qu'UNE fois dans « Ventes par plateforme », la ligne
//     « Sans plateforme » existe et la somme des lignes = le revenu ;
//   · aucune marge « 100 % » née d'un prix d'achat à 0 € ;
//   · la liste des ventes est triée par date de vente décroissante ;
//   · « Temps pour vendre » n'écrit jamais « 0j » ;
//   · « réduire les animations » : rien ne bouge, tout est visible.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'refonte-1610');
const PORT = Number(process.env.APERCU_PORT || 5216);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/refonte-1610.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const EMOJI = /\p{Extended_Pictographic}/u;

const navigateur = await chromium.launch({ headless: true });
async function ouvrir(ecran, { reduit = false } = {}) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: reduit ? 'reduce' : 'no-preference' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => (/\/storage\/v1\/object\/public\//.test(r.request().url()) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.goto(`${BASE}?ecran=${ecran}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(reduit ? 600 : 3200);
  return { ctx, page, erreurs };
}
async function mesures(page) {
  return page.evaluate(() => ({
    debordement: document.documentElement.scrollWidth - window.innerWidth,
    texte: document.body.innerText,
    // Le texte SANS ce que la personne a saisi (titres de ventes et d'articles) :
    // un émoji dans un titre est le sien, pas celui de l'écran.
    texteEcran: (() => { const c = document.body.cloneNode(true); c.querySelectorAll('style, script, .vc-titre').forEach((n) => n.remove()); return c.textContent; })(),
    ecritures: (window.__ecrituresRefusees || []).length,
  }));
}

const ECRANS = ['tableau', 'ventes', 'stats', 'ventes-gratuit', 'tableau-avant', 'ventes-avant', 'stats-avant'];
for (const ecran of ECRANS) {
  console.log(`\n── ${ecran}`);
  const { ctx, page, erreurs } = await ouvrir(ecran);
  await page.screenshot({ path: path.join(SORTIE, `${ecran}.png`), fullPage: true });
  const m = await mesures(page);
  verifier(m.debordement <= 0, `${ecran} : aucun débordement horizontal`, `${m.debordement} px`);
  verifier(erreurs.length === 0, `${ecran} : aucune erreur de page`, erreurs.join(' | ').slice(0, 300));
  verifier(m.ecritures === 0, `${ecran} : aucune écriture tentée`, String(m.ecritures));
  if (!ecran.endsWith('-avant')) {
    const emo = [...m.texteEcran].filter((c) => EMOJI.test(c));
    verifier(emo.length === 0, `${ecran} : aucun émoji affiché`, emo.join(' '));
  }
  fs.writeFileSync(path.join(SORTIE, `${ecran}.txt`), m.texte);
  await ctx.close();
}

// ── Contrôles de contenu (après) ────────────────────────────────────────────
{
  console.log('\n── contenu');
  const { ctx, page } = await ouvrir('stats');
  const plateformes = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.trim() === 'Ventes par plateforme');
    const carte = h?.closest('div[class*="fsx-rise"]') ?? h?.parentElement?.parentElement;
    return carte ? carte.innerText : '';
  });
  const nbVinted = (plateformes.match(/^Vinted$/gm) || []).length;
  verifier(nbVinted === 1, 'Ventes par plateforme : Vinted une seule fois', `${nbVinted} fois\n${plateformes}`);
  verifier(/Sans plateforme/.test(plateformes), 'Ventes par plateforme : ligne « Sans plateforme »', plateformes);
  const nombre = (t) => Number(String(t).replace(/[\s  €]/g, '').replace(',', '.'));
  const montants = [...plateformes.matchAll(/([\d\s  ]+,\d{2})\s?€\s*·\s*(\d+)/g)].map((x) => ({ ca: nombre(x[1]), nb: Number(x[2]) }));
  const total = montants.pop();
  const somme = montants.reduce((a, x) => a + x.ca, 0);
  const revenu = await page.evaluate(() => {
    const l = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === 'Revenu');
    return l?.parentElement?.querySelector('.fsx-sr')?.textContent ?? '';
  });
  verifier(total && Math.abs(somme - total.ca) < 0.005, 'Σ plateformes = total de la période', `${somme} ≠ ${total?.ca}`);
  verifier(total && Math.abs(nombre(revenu) - total.ca) < 0.005, 'total des plateformes = carte « Revenu »', `${total?.ca} ≠ ${revenu}`);
  fs.writeFileSync(path.join(SORTIE, 'stats-plateformes.txt'), plateformes);
  const texte = await page.evaluate(() => document.body.innerText);
  verifier(!/\b0j\b/.test(texte), 'Stats : jamais « 0j »');
  verifier(!/100,0\s?%/.test(texte), 'Stats : aucune marge à 100,0 %');
  await ctx.close();
}
{
  const { ctx, page } = await ouvrir('ventes');
  // Ordre des mois : décroissant.
  const mois = await page.evaluate(() => [...document.querySelectorAll('.ventes-v2 span')].map((s) => s.textContent.trim()).filter((t) => /^(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre) \d{4}$/.test(t)));
  const NOMS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const cle = (t) => { const [m, a] = t.split(' '); return Number(a) * 12 + NOMS.indexOf(m); };
  const trie = mois.every((t, i) => i === 0 || cle(mois[i - 1]) > cle(t));
  verifier(mois.length > 0 && trie, `Ventes : mois en ordre décroissant (${mois.join(', ')})`);
  await page.getByRole('button', { name: /Voir plus/ }).click();
  await page.waitForTimeout(800);
  const tous = await page.evaluate(() => [...document.querySelectorAll('.ventes-v2 span')].map((s) => s.textContent.trim()).filter((t) => /^(Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre) \d{4}$|^Date inconnue$/.test(t)));
  const tousTrie = tous.filter((t) => t !== 'Date inconnue').every((t, i, l) => i === 0 || cle(l[i - 1]) > cle(t));
  verifier(tousTrie, `Ventes (toutes) : mois en ordre décroissant (${tous.length} mois)`, tous.join(', '));
  await page.screenshot({ path: path.join(SORTIE, 'ventes-toutes.png'), fullPage: true });
  const texte = await page.evaluate(() => document.body.innerText);
  verifier(!/100,0\s?%/.test(texte), 'Ventes : aucune marge à 100,0 % (prix d\'achat à 0 €)');
  // Compléter en série : la saisie s'ouvre sur la première vente sans prix d'achat.
  await page.getByRole('button', { name: /Compléter en série/ }).click();
  await page.waitForTimeout(600);
  const focus = await page.evaluate(() => document.activeElement?.id || '');
  verifier(/^pa-/.test(focus), '« Compléter en série » ouvre la saisie de la première vente', focus);
  await page.screenshot({ path: path.join(SORTIE, 'ventes-serie.png'), fullPage: false });
  // Filtre « Vinted » : seules des ventes Vinted.
  await page.getByRole('button', { name: /Revenir à toutes les ventes/ }).click();
  await page.getByRole('button', { name: /^(Vinted ?)+$/ }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SORTIE, 'ventes-filtre-vinted.png'), fullPage: false });
  await ctx.close();
}

// ── La carte « PROFIT NET » : identique au pixel près, avant / après ────────
{
  console.log('\n── carte PROFIT NET');
  const images = {};
  for (const ecran of ['tableau-avant', 'tableau']) {
    const { ctx, page } = await ouvrir(ecran, { reduit: true });
    const carte = page.locator('div.db-anim', { hasText: 'Profit net' }).first();
    images[ecran] = await carte.screenshot({ path: path.join(SORTIE, `profit-net-${ecran}.png`) });
    await ctx.close();
  }
  verifier(Buffer.compare(images['tableau-avant'], images.tableau) === 0, 'carte « PROFIT NET » identique au pixel près (avant = après)');
}

// ── Réduire les animations ──────────────────────────────────────────────────
for (const ecran of ['tableau', 'ventes', 'stats']) {
  const { ctx, page } = await ouvrir(ecran, { reduit: true });
  const anim = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  verifier(anim === 0, `${ecran} : réduire les animations → aucune animation`, String(anim));
  await page.screenshot({ path: path.join(SORTIE, `${ecran}-reduit.png`), fullPage: true });
  await ctx.close();
}

await navigateur.close();
console.log(echecs.length ? `\n${echecs.length} échec(s) :\n- ${echecs.join('\n- ')}` : '\nTout est vert.');
process.exit(echecs.length ? 1 : 0);
