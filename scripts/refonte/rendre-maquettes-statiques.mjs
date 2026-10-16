// ═══════════════════════════════════════════════════════════════════════════
// REFONTE (16/10) — VERSION FIXE DES MAQUETTES, SANS JAVASCRIPT
// ═══════════════════════════════════════════════════════════════════════════
// Le 16/10 au matin, la visionneuse d'artefacts de l'app Claude iOS a refusé la
// page (« This browser isn't supported ») et la prévisualisation Vercel n'a pas pu
// être créée depuis la session. Ce script rend les 25 écrans de
// docs/refonte/maquettes/ (index.html + maquettes.js) en UN seul fichier HTML
// statique, lisible sans JavaScript (aperçu de fichier sur téléphone, pièce
// jointe, double-clic) : docs/refonte/maquettes/maquettes-statique.html.
// Les écrans y sont à la suite, chacun dans son cadre de téléphone, avec sa ligne
// « Ce qui change » ; l'accueil et Précédent/Suivant sont des ancres.
//
//   node scripts/refonte/rendre-maquettes-statiques.mjs
//   puis vérification sans JavaScript (390 px) intégrée : 25 écrans, aucun
//   débordement, aucun temps estimé, aucun ancien mot d'état.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const DOSSIER = path.join(RACINE, 'docs', 'refonte', 'maquettes');
const SOURCE = path.join(DOSSIER, 'index.html');
const SORTIE = path.join(DOSSIER, 'maquettes-statique.html');
const ESTIMATION_RE = /\b(dans|d'ici|sous|vers|pendant|environ|avant)\s+(~\s*)?\d+\s*(s|sec|secondes?|min|minutes?|h|heures?|j|jours?)\b|~\s*\d+\s*(min|h)\b|\b(quelques|deux|trois|cinq|dix|vingt)\s+(secondes|minutes|heures)\b|\bvers\s+\d{1,2}[:h]\d{2}\b|\bà\s+\d{1,2}:\d{2}\b|\bcompte à rebours\b|\btemps restant\b|\bEnviron\b/i;
const ANCIENS = /\bEn attente\b|\bDans la file\b|\bEn file d'attente\b|\bÉchec\b|\bErreur\b|\bFailed\b|\bPending\b/;

const source = fs.readFileSync(SOURCE, 'utf8');
const style = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const adresse = 'file:///' + SOURCE.replace(/\\/g, '/');

// 1. Rendu de chaque écran par la page vivante (même code que les maquettes).
const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(adresse, { waitUntil: 'load' });
await page.waitForSelector('.accueil');
const groupes = await page.evaluate(() => GROUPES.map(([titre, cles]) => [titre, cles.map((c) => ({ cle: c, titre: E[c].titre, change: E[c].change }))]));
const ordre = groupes.flatMap((g) => g[1]);
const ecrans = [];
for (const e of ordre) {
  await page.evaluate((h) => { location.hash = '#' + h; }, e.cle);
  await page.waitForFunction((c) => document.querySelector(`.ecran[key="${c}"]`), e.cle, { timeout: 5000 });
  ecrans.push({ ...e, html: await page.evaluate(() => document.querySelector('.ecran').innerHTML) });
}
const sous = await page.evaluate(() => { location.hash = ''; return new Promise((r) => setTimeout(() => r(document.querySelector('.accueil .sous').textContent), 50)); });
await ctx.close();

// 2. Assemblage : accueil (ancres) puis les écrans à la suite.
const html = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tuiles = groupes.map(([titre, cles]) => `<h2>${html(titre)}</h2><div class="grille">${cles.map((e, i) => `<a class="tuile" href="#${e.cle}"><span class="num">${i + 1} / ${cles.length}</span><b>${html(e.titre)}</b><span>${html(e.change)}</span></a>`).join('')}</div>`).join('');
const sections = ecrans.map((e, i) => {
  const prec = i > 0 ? ecrans[i - 1].cle : null, suiv = i < ecrans.length - 1 ? ecrans[i + 1].cle : null;
  return `<section class="scene fixe" id="${e.cle}"><div class="barre-haut"><a href="#accueil">‹ Toutes les maquettes</a><span class="spacer"></span><span>${i + 1} / ${ecrans.length} · ${html(e.titre)}</span></div>
<div class="tel"><div class="ecran">${e.html}</div></div>
<div class="change"><b>Ce qui change :</b> ${html(e.change)}</div>
<div class="nav-ecran">${prec ? `<a href="#${prec}">‹ Précédent</a>` : '<span style="flex:1"></span>'}${suiv ? `<a href="#${suiv}">Suivant ›</a>` : '<a href="#accueil">Fin · retour à la liste</a>'}</div></section>`;
}).join('\n');
const sortie = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Maquettes FillSell (version fixe)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap">
<style>${style}
/* Version fixe : les écrans se suivent, chacun à la hauteur d'un téléphone. */
.fixe{scroll-margin-top:0;padding-bottom:24px;border-bottom:1px solid var(--border)}
.fixe .tel{min-height:760px}
@media (min-width:700px){.fixe .tel{min-height:860px}}
.accueil .note{font-size:13px;color:var(--ink2);line-height:1.5;margin:0 0 6px}
</style>
</head>
<body>
<main class="accueil" id="accueil"><h1>Maquettes de la refonte</h1>
<p class="sous">${html(sous)}</p>
<p class="note">Version fixe, sans JavaScript : les ${ecrans.length} écrans se suivent sous cette liste. Touche une tuile pour y aller, « Suivant › » pour enchaîner. Généré par scripts/refonte/rendre-maquettes-statiques.mjs depuis index.html + maquettes.js.</p>
${tuiles}
</main>
${sections}
</body>
</html>
`;
fs.writeFileSync(SORTIE, sortie);
console.log(`${path.relative(RACINE, SORTIE)} : ${ecrans.length} écrans, ${Buffer.byteLength(sortie)} octets`);

// 3. Vérification SANS JavaScript, 390 px.
const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', isMobile: true, hasTouch: true, javaScriptEnabled: false });
const p2 = await ctx2.newPage();
await p2.goto('file:///' + SORTIE.replace(/\\/g, '/'), { waitUntil: 'load' });
let ko = 0;
const dit = (ok, msg) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };
const nTel = await p2.locator('.tel').count();
const nTuiles = await p2.locator('a.tuile').count();
dit(nTel === ecrans.length, `${nTel} cadres de téléphone rendus sans JavaScript`);
dit(nTuiles === ecrans.length, `${nTuiles} tuiles sur l'accueil`);
const largeur = await p2.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
dit(largeur[0] <= largeur[1], `aucun débordement horizontal (${largeur[0]} ≤ ${largeur[1]})`);
// Comme maquettes-verif.mjs : le texte des ÉCRANS (les lignes « Ce qui change » citent l'ancien texte, c'est voulu).
const texte = (await p2.$$eval('.tel', (els) => els.map((e) => e.innerText).join(' '))).replace(/\s+/g, ' ');
dit(!ESTIMATION_RE.test(texte), `aucun temps estimé dans les écrans${ESTIMATION_RE.test(texte) ? ' — vu : « ' + texte.match(ESTIMATION_RE)[0] + ' »' : ''}`);
dit(!ANCIENS.test(texte), 'aucun ancien mot d\'état dans les écrans');
const ancres = await p2.$$eval('a[href^="#"]', (as) => as.map((a) => a.getAttribute('href').slice(1)));
const ids = new Set(await p2.$$eval('[id]', (els) => els.map((e) => e.id)));
const cassees = ancres.filter((a) => a && !ids.has(a));
dit(cassees.length === 0, `toutes les ancres mènent quelque part${cassees.length ? ' — cassées : ' + [...new Set(cassees)].join(', ') : ''}`);
for (const e of ecrans) {
  const vide = await p2.evaluate((c) => (document.querySelector(`#${c} .tel`)?.innerText || '').trim().length < 60, e.cle);
  if (vide) dit(false, `${e.cle} : écran vide`);
}
await p2.screenshot({ path: path.join(RACINE, 'docs', 'refonte', 'captures', 'maquettes', 'statique-390.png'), fullPage: false });
await ctx2.close();
await nav.close();
console.log(ko ? `\n${ko} point(s) ROUGE` : '\nTout est vert (version fixe, sans JavaScript).');
process.exit(ko ? 1 : 0);
