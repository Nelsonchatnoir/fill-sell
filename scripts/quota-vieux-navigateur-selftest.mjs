// ═══════════════════════════════════════════════════════════════════════════
// VERROU — « TES QUOTAS DU MOIS » NE CASSE JAMAIS, MÊME SUR UN NAVIGATEUR INTÉGRÉ ANCIEN (16/11/2026, nuit, Nico)
//                                         npm run selftest:quota-vieux-navigateur
// ═══════════════════════════════════════════════════════════════════════════
// Constaté le 16/11 (usage_logs, action_app_ratee, action exception_js) : « TypeError: e.at is not a function », 3 fois
// (15:02, 15:43, 22:35), toutes sur le compte des examinateurs de Google Play (953c1ca6), Android, 3 appareils
// (en-GB, en-SG, en-PH), juste après quota_detail_open. La pile minifiée (App-*.js:1231:5966 → 1231:7307 → 1240:349),
// relue dans le bundle reconstruit : Z8 = `liste` de utils/detailQuota.js (`morceaux.at(-1)`), bYe = resumeQuota,
// NYe = FeuilleQuota. `morceaux` est un tableau construit sur place (`const finies = []`) et `morceaux.slice(0,-1).join`
// passe juste avant : c'est bien un VRAI tableau → c'est Array.prototype.at qui manque (Chrome < 92, WebView ancienne des
// appareils d'examen), pas une donnée du serveur. La feuille est née le 13/11 au soir (bloc B1) : le compte de Google,
// utilisé les 06, 07, 08, 09 et 12/11, ne pouvait pas la rencontrer avant ; l'exception démontait toute l'app.
//
// Ce que ce verrou fait tomber :
//   1. un .at() (ou une autre méthode d'après Chrome 92 : findLast, toSorted, structuredClone, Object.hasOwn…) dans le
//      code de l'app — src/ et les modules partagés qu'il importe ;
//   2. une feuille des quotas qui lève sur un navigateur sans Array.prototype.at (on l'enlève ici, comme sur ces
//      appareils), ou sur une donnée de quotas mal formée : elle s'affiche alors SANS le morceau illisible ;
//   3. une feuille montée sans barrière d'erreur (une exception de rendu y reste, l'app ne tombe plus).
import fs from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 700)}` : ''}`); }
};
const ESP = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const net = (s) => String(s ?? '').replace(ESP, ' ');
const texte = (html) => net(String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').replace(/ ([,.])/g, '$1').trim();
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .split('\n').map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, '$1')).join('\n');

// ── 1. Le code de l'app : aucune méthode d'après Chrome 92 ──────────────────────────────────────────────────────
console.log('1. Le code de l\'app (src/ et les modules partagés qu\'il importe)');
const INTERDITS = [
  [/\.at\(/, '.at() (Chrome 92)'], [/\.findLast(Index)?\(/, 'findLast (Chrome 97)'], [/\.to(Sorted|Reversed|Spliced)\(/, 'toSorted/toReversed/toSpliced (Chrome 110)'],
  [/\bstructuredClone\(/, 'structuredClone (Chrome 98)'], [/\bObject\.hasOwn\(/, 'Object.hasOwn (Chrome 93)'], [/\b(Object|Map)\.groupBy\(/, 'groupBy (Chrome 117)'],
  [/\bPromise\.withResolvers\(/, 'Promise.withResolvers (Chrome 119)'],
];
const EXT = ['.js', '.jsx', '.mjs'];
const fichiers = new Set();
const parcourir = (dossier) => {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = join(dossier, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (EXT.includes(extname(e.name))) fichiers.add(p);
  }
};
parcourir(join(ROOT, 'src'));
// Les modules hors de src/ que l'app importe (supabase/functions/_shared/palier.js…), de proche en proche.
const aVoir = [...fichiers];
while (aVoir.length) {
  const f = aVoir.pop();
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    let cible = resolve(dirname(f), m[1]);
    if (!fs.existsSync(cible) || fs.statSync(cible).isDirectory()) cible = EXT.map((x) => cible + x).find((x) => fs.existsSync(x)) ?? null;
    if (cible && EXT.includes(extname(cible)) && !fichiers.has(cible)) { fichiers.add(cible); aVoir.push(cible); }
  }
}
const horsSrc = [...fichiers].filter((f) => !relative(ROOT, f).startsWith('src'));
ok(fichiers.size > 300 && horsSrc.some((f) => /_shared[\\/]palier\.js$/.test(f)), `le parcours lit tout le code de l'app (${fichiers.size} fichiers, dont ${horsSrc.length} hors de src/)`);
const trouves = [];
for (const f of fichiers) {
  const lignes = sansCommentaires(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).split('\n');
  lignes.forEach((l, i) => { for (const [re, nom] of INTERDITS) if (re.test(l)) trouves.push(`${relative(ROOT, f)}:${i + 1} ${nom}`); });
}
ok(trouves.length === 0, 'aucun .at(), findLast, toSorted, structuredClone, Object.hasOwn… dans le code de l\'app (dernier() de utils/dernier.js à la place)', trouves.join('\n           '));

// ── 2. La feuille, sur un navigateur sans Array.prototype.at, et avec des données mal formées ─────────────────
// Array.prototype.at est retiré APRÈS le chargement des modules (Vite et React s'en servent pour compiler), puis rendu.
const atTableau = Array.prototype.at, atTexte = String.prototype.at;
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const charger = async (p) => { try { return await vite.ssrLoadModule(p); } catch (e) { return { __erreur: e?.message ?? String(e) }; } };
const REMISE = '2026-12-03T23:30:00.000Z';
// Le compte des examinateurs (16/11 22:35) : palier premium, jauge annonces à 40 — la forme que rend quotas_etat.
const PREMIUM = {
  grille: 'trois_jauges', palier: 'premium', annonces_mode: 'mensuel', remise_le: REMISE,
  annonces: { plafond: 40, consommes: 3, restantes: 37 },
  publications: { mode: 'mensuel', plafond: 400, consommes: 12, restantes: 388 },
  republication: { mode: 'mensuel', plafond: 200, faites: 5, restantes: 195, remise_le: REMISE },
  retouches: { plafond: 10, consommes: 0, restantes: 10 }, scans: { plafond: null, consommes: 0, restantes: null }, lens: null,
};
const PRO_SANS_GRILLE = { palier: 'pro', annonces: { plafond: 120, consommes: 4, restantes: 116 }, republication: { mode: 'mensuel', plafond: 300, faites: 2, restantes: 298 } };
const MAL_FORMEES = {
  'jauges en texte, null, tableau': { grille: 'trois_jauges', palier: 'premium', remise_le: REMISE, annonces: 'x', publications: null, republication: [] },
  'jauges vides ({})': { grille: 'trois_jauges', palier: 'free', annonces: {}, publications: {}, republication: {} },
  'chiffres illisibles': { grille: 'trois_jauges', palier: 'premium', remise_le: { pas: 'une date' }, annonces: { plafond: 'quarante', consommes: {} }, publications: { mode: 'mensuel', plafond: [], consommes: 'x' }, republication: { mode: 'mensuel', plafond: 30, faites: 'abc' }, lens: { plafond: 'x' } },
  'palier et date en objet': { grille: 'trois_jauges', palier: { nom: 'premium' }, remise_le: 12, annonces: { plafond: 5, consommes: 1 }, publications: { mode: 'illimite' }, republication: { mode: 'illimite' } },
  'sans grille, compteurs tordus': { palier: 'premium', annonces: { plafond: 40, restantes: 'trente' }, republication: { mode: 'mensuel', plafond: 30, restantes: null } },
  'tableau à la place de l\'objet': [{ grille: 'trois_jauges' }],
  'texte à la place de l\'objet': 'trois_jauges',
};
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const DQ = await charger('/src/utils/detailQuota.js');
  const FQ = await charger('/src/components/FeuilleQuota.jsx');
  const BE = await charger('/src/components/BarriereErreur.jsx');
  const DE = await charger('/src/utils/dernier.js');
  delete Array.prototype.at;   // la WebView des appareils d'examen (Chrome < 92)
  delete String.prototype.at;

  console.log('\n2. Sans Array.prototype.at (WebView d\'avant Chrome 92) : la feuille des examinateurs de Google');
  ok(typeof [].at === 'undefined' && typeof ''.at === 'undefined', 'Array.prototype.at et String.prototype.at sont bien absents pendant ce test');
  let rp = null, err = null;
  try { rp = DQ.resumeQuota?.(PREMIUM, { lang: 'fr' }); } catch (e) { err = e; }
  ok(!err && net(rp?.phrase) === 'Il te reste 37 annonces, 388 publications et 195 remontées jusqu\'au 4 décembre.',
    'Premium (953c1ca6, 16/11) : la phrase « Il te reste … » se dit, sans exception', err ? `${err.name}: ${err.message}` : JSON.stringify(rp));
  let ren = null; err = null;
  try { ren = DQ.resumeQuota?.(PREMIUM, { lang: 'en' }); } catch (e) { err = e; }
  ok(!err && net(ren?.phrase) === 'You have 37 listings, 388 publications and 195 bumps left until 4 December.', 'la même en anglais (en-GB, en-SG, en-PH)', err ? `${err.name}: ${err.message}` : ren?.phrase);
  let html = ''; err = null;
  try { html = renderToStaticMarkup(h(FQ.default, { quotas: PREMIUM, lang: 'fr', palier: 'premium', onFermer() {}, onOffres() {}, lireConfig: null })); } catch (e) { err = e; }
  const lu = texte(html);
  ok(!err && /Tes quotas du mois Formule Premium Il te reste 37 annonces, 388 publications et 195 remontées/.test(lu) && /Ce qui compte, ce qui ne compte pas/.test(lu),
    'la feuille entière s\'affiche (titre, ce qui reste, jauges, ce qui compte)', err ? `${err.name}: ${err.message}` : lu.slice(0, 300));
  err = null;
  try { html = renderToStaticMarkup(h(FQ.default, { quotas: PRO_SANS_GRILLE, lang: 'fr', palier: 'pro', onFermer() {}, onOffres() {}, lireConfig: null })); } catch (e) { err = e; }
  ok(!err && /Il te reste 116 annonces et 298 remontées/.test(texte(html)), 'sans la grille (compteurs d\'avant) : pareil', err ? `${err.name}: ${err.message}` : texte(html).slice(0, 300));

  console.log('\n3. Une donnée de quotas mal formée : la feuille s\'affiche sans le morceau illisible, jamais d\'exception');
  for (const [nom, q] of Object.entries(MAL_FORMEES)) {
    let r = null, e1 = null, e2 = null, rendu = '';
    try { r = DQ.resumeQuota?.(q, { lang: 'fr', palier: q?.palier }); } catch (e) { e1 = e; }
    try { rendu = renderToStaticMarkup(h(FQ.default, { quotas: q, lang: 'fr', palier: q?.palier ?? null, onFermer() {}, onOffres() {}, lireConfig: null })); } catch (e) { e2 = e; }
    const t = texte(rendu);
    const sansFaux = !/NaN|undefined|\[object Object\]|Infinity/.test(`${JSON.stringify(r)} ${t}`);
    ok(!e1 && !e2 && sansFaux && (r == null ? rendu === '' : /Tes quotas du mois/.test(t) && /Ce qui compte/.test(t)),
      `${nom} : aucune exception, aucun « NaN / undefined » affiché`, (e1 || e2) ? `${(e1 || e2).name}: ${(e1 || e2).message}` : `${JSON.stringify(r)?.slice(0, 200)} | ${t.slice(0, 300)}`);
  }
  let rm = null; err = null;
  try { rm = DQ.resumeQuota?.(MAL_FORMEES['jauges en texte, null, tableau'], { lang: 'fr' }); } catch (e) { err = e; }
  ok(!err && rm && rm.phrase == null && /illimit/.test(rm.illimitees ?? '') && rm.titre === 'Tes quotas du mois',
    'une jauge illisible ne fabrique aucun chiffre (jamais un faux zéro) : la feuille garde son titre et ce qu\'elle sait', err ? err.message : JSON.stringify(rm));

  console.log('\n4. dernier() et la barrière d\'erreur');
  ok(typeof DE.dernier === 'function' && DE.dernier([1, 2, 3]) === 3 && DE.dernier([]) === undefined && DE.dernier(null) === undefined
    && DE.dernier('abc') === undefined && DE.dernier({ length: 2 }) === undefined, 'dernier(liste) : le dernier élément d\'un VRAI tableau, sinon undefined (jamais d\'exception)', DE.__erreur);
  const B = BE.default;
  const etat = B?.getDerivedStateFromError?.(new TypeError('e.at is not a function'));
  const b = B ? new B({ secours: null, children: 'enfant' }) : null;
  if (b) b.state = etat;
  ok(etat?.erreur instanceof Error && b?.render() === null, 'BarriereErreur : une exception de rendu remplace le morceau par son secours (rien), le reste continue');
  const srcFQ = sansCommentaires(lire('src/components/FeuilleQuota.jsx'));
  const barrieres = srcFQ.match(/<BarriereErreur\b/g) ?? [];
  ok(/import BarriereErreur from '\.\/BarriereErreur'/.test(srcFQ) && barrieres.length >= 3
    && /<BarriereErreur[^>]*nom="feuille-quota resume"[\s\S]*?data-quota-resume[\s\S]*?<\/BarriereErreur>/.test(srcFQ)
    && /<BarriereErreur[^>]*nom="feuille-quota jauges"[\s\S]*?ConsommationGrille[\s\S]*?<\/BarriereErreur>/.test(srcFQ)
    && /<BarriereErreur[^>]*nom="feuille-quota ce-qui-compte"[\s\S]*?data-quota-ce-qui-compte[\s\S]*?<\/BarriereErreur>/.test(srcFQ),
    'la feuille : ce qui reste, les jauges et « ce qui compte » ont chacun leur barrière (un morceau qui lève disparaît seul)');
  ok(/try\s*\{\s*r\s*=\s*resumeQuota\(/.test(srcFQ), 'la feuille ne laisse jamais resumeQuota lever');
  const app = sansCommentaires(lire('src/App.jsx'));
  const montage = app.slice(app.indexOf('{detailQuota&&('), app.indexOf('{detailQuota&&(') + 900);
  ok(/<BarriereErreur nom="feuille-quota"[\s\S]*?<FeuilleQuota[\s\S]*?<\/BarriereErreur>/.test(montage) && /setDetailQuota\(null\)/.test(montage)
    && /signalerActionRatee\(\{action:'feuille_quota_rattrapee'/.test(montage) && /import BarriereErreur from '\.\/components\/BarriereErreur'/.test(app),
    'App : la feuille entière sous une barrière — elle se ferme et l\'échec est tracé (feuille_quota_rattrapee), l\'app reste debout', montage.slice(0, 600));
} finally {
  await vite.close();
  if (atTableau) Array.prototype.at = atTableau;
  if (atTexte) String.prototype.at = atTexte;
}

console.log(`\n${rouges ? `✗ quota-vieux-navigateur : ${rouges} rouge(s), ${verts} vert(s)` : `✓ quota-vieux-navigateur : ${verts} vert(s), 0 rouge`}`);
process.exit(rouges ? 1 : 0);
