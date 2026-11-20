// ═══════════════════════════════════════════════════════════════════════════
// LE FREE A 30 REMONTÉES (republications) PAR MOIS, PARTOUT (20/11/2026 soir, bloc E de Nico)
//     npm run selftest:quota-free-30
// ═══════════════════════════════════════════════════════════════════════════
// La règle : une seule source pour le chiffre du Free, la jauge du palier (grilleDuPalier(K, 'free').remontees,
// clé coin_config.jauge_remontees_free, repli GRILLE_REPLI = 30) — la même que le calcul serveur
// quota_remontees_plafond('free'). Le cas : le 20/11, le serveur appliquait 30 mais la landing, la carte Free de la
// modale des offres (interrupteur de la grille à 0), le mur « Tes N republications… » sans chiffre du serveur et
// les CGU 3.4 disaient encore 50 (coin_config.quota_republication_free, et des replis à 50).
// Ce que le selftest interdit à l'avenir :
//   1. un repli à 50 (GRILLE_REPLI, COIN_CONFIG_FALLBACK, GRANTS_FALLBACK de la landing) ;
//   2. un écran qui relit quota_republication_free pour le Free (landing, carte Free, mur) au lieu de la jauge ;
//   3. « 50 republications / remontées / repostings / bumps » dans le CODE des écrans (commentaires exclus), les
//      CGU ou le site vitrine (site/contenu, site/donnees hors concurrents.yml, src/blog) ;
//   4. rendu réel (Vite SSR) : avec quota_republication_free = 50 et jauge_remontees_free = 30 en config, la carte
//      Free et le mur disent 30, jamais 50 ;
//   5. le script de réparation coin_config (sauvegarde, garde « seulement si 50 », inverse) existe.
// Les paliers payants ne bougent pas : Premium et Pro lisent toujours quota_republication_<palier>.
import fs from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};
// Le code sans ses commentaires (blocs /* */, {/* */} et lignes //) : un commentaire d'historique peut citer
// « 50 republications » (le 05/10), jamais un texte servi.
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
  .map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');
const CINQUANTE = /\b50\s*(?:&nbsp;| | )?\s*(?:republications?|remontées?|repostings?|reposts?|bumps?)\b/i;

// ── 1. Les replis ───────────────────────────────────────────────────────────
console.log('1. Les replis disent 30');
const J = await import('../src/utils/jauges.js');
ok(J.GRILLE_REPLI.free.remontees === 30, 'GRILLE_REPLI.free.remontees = 30');
ok(J.grilleDuPalier(null, 'free').remontees === 30 && J.grilleDuPalier({}, 'free').remontees === 30, 'grilleDuPalier sans config → 30');
ok(J.grilleDuPalier({ jauge_remontees_free: 30, quota_republication_free: 50 }, 'free').remontees === 30,
  'grilleDuPalier lit jauge_remontees_free, jamais quota_republication_free');
ok(J.grilleDuPalier({ jauge_remontees_premium: 1500 }, 'premium').remontees === 1500, 'Premium : sa jauge, inchangée');
const modale = lire('src/components/ConversionModal.jsx');
ok(/\n  quota_republication_free: 30,\n/.test(modale), 'COIN_CONFIG_FALLBACK.quota_republication_free = 30');
ok(/quota_republication_premium: 1500, quota_republication_pro: 5000,/.test(modale), 'COIN_CONFIG_FALLBACK : Premium 1500 et Pro 5000 inchangés');
const landing = lire('src/pages/LandingPage.jsx');
ok(/REPUB_FREE: grilleDuPalier\(null, 'free'\)\.remontees, REPUB_PREMIUM: 1500, REPUB_PRO: 5000,/.test(landing),
  'GRANTS_FALLBACK de la landing : REPUB_FREE = repli de la jauge (30), Premium/Pro inchangés');
ok(!/REPUB_FREE:\s*50\b/.test(landing), 'landing : aucun REPUB_FREE à 50');

// ── 2. Une seule source : la jauge du palier ────────────────────────────────
console.log('2. Les écrans lisent la jauge du Free');
const landingCode = sansCommentaires(landing);
ok(/import \{ grilleDuPalier \} from '\.\.\/utils\/jauges';/.test(landing), 'landing : importe grilleDuPalier');
ok(/'jauge_remontees_free'/.test(landingCode) && !/quota_republication_free/.test(landingCode),
  'landing : lit jauge_remontees_free, plus jamais quota_republication_free');
ok(/REPUB_FREE: +grilleDuPalier\(parKey, 'free'\)\.remontees,/.test(landingCode), 'landing : REPUB_FREE = grilleDuPalier(parKey, \'free\').remontees');
ok(/REPUB_PREMIUM: +parKey\.quota_republication_premium/.test(landingCode) && /REPUB_PRO: +parKey\.quota_republication_pro/.test(landingCode),
  'landing : Premium et Pro lisent toujours leur clé (paliers payants intouchés)');
const modaleCode = sansCommentaires(modale);
ok(/const repubVolume = palier === 'free'\s*\? grilleDuPalier\(K, 'free'\)\.remontees\s*: \(K\[`quota_republication_\$\{palier\}`\] \?\? 0\);/.test(modaleCode),
  'carte Free (lignesDiff) : grilleDuPalier(K, \'free\').remontees ; Premium/Pro : leur clé');
ok((modaleCode.match(/plafondRepub\?\.plafond \?\? grilleDuPalier\(K, 'free'\)\.remontees/g) ?? []).length === 2,
  'mur « Tes N republications du mois » (FR et EN) : chiffre du serveur, sinon la jauge du Free');
ok(!/K\.quota_republication_free|K\[['"]quota_republication_free['"]\]/.test(modaleCode), 'modale : plus aucune lecture de K.quota_republication_free');

// ── 3. Aucun « 50 » de remontées Free servi ─────────────────────────────────
console.log('3. Aucun « 50 republications » servi (écrans, CGU, site vitrine)');
const ECRANS = ['src/components/ConversionModal.jsx', 'src/components/PlanDetailsModal.jsx', 'src/pages/LandingPage.jsx',
  'src/pages/Legal.jsx', 'src/App.jsx', 'src/tabs/StockTab.jsx', 'src/stock/Haut.jsx', 'src/utils/jourRemise.js',
  'src/utils/republication.js', 'src/utils/jauges.js', 'src/reglages/textes.js', 'src/reglages/ReglagesUI.jsx',
  'src/entree/EtapeCloud.jsx', 'src/entree/regles.js'].filter((f) => fs.existsSync(join(ROOT, f)));
for (const f of ECRANS) {
  const m = sansCommentaires(lire(f)).match(CINQUANTE);
  ok(!m, `${f} : aucun « 50 republications » dans le code`, m?.[0]);
}
const legal = lire('src/pages/Legal.jsx');
ok(/Free<\/span> : 5 annonces générées par IA et publiées sur les plateformes prises en charge et 30 republications par cycle ;/.test(legal)
  && /Free<\/span>: 5 AI-generated listings published to the 5 supported platforms and 30 repostings per cycle;/.test(legal),
  'CGU 3.4 : Free = 30 republications par cycle (FR) / 30 repostings per cycle (EN)');
ok(/Premium<\/span> : 40 annonces générées par IA, 1 500 republications/.test(legal) && /Pro<\/span> : 120 annonces générées par IA, 5 000 republications/.test(legal),
  'CGU 3.4 : Premium et Pro inchangés');
const VITRINE = [];
const parcourir = (d) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (/\.(md|ya?ml|json|txt|html|jsx?|mjs)$/.test(e.name) && e.name !== 'concurrents.yml') VITRINE.push(p);
  }
};
for (const d of ['site/contenu', 'site/donnees', 'src/blog']) parcourir(join(ROOT, d));
const fautifs = VITRINE.filter((p) => CINQUANTE.test(fs.readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p));
ok(VITRINE.length > 0 && fautifs.length === 0, `site vitrine (${VITRINE.length} fichiers, concurrents.yml exclu : il décrit un concurrent) : aucun « 50 republications »`, fautifs.join(' · '));

// ── 4. Rendu réel : la carte Free et le mur disent 30 ───────────────────────
console.log('4. Rendu (Vite SSR) : quota_republication_free = 50 en config ne s’affiche jamais');
globalThis.document ??= { body: {} };
const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: [{ find: /^react-dom$/, replacement: join(ROOT, 'scripts/lib/portail-en-place.mjs') }] },
  ssr: { noExternal: [] },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const h = React.createElement;
  const CM = await vite.ssrLoadModule('/src/components/ConversionModal.jsx');
  const REPLI = CM.COIN_CONFIG_FALLBACK;
  const texte = (html) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/&nbsp;| | /g, ' ').replace(/\s+/g, ' ').trim();
  const avecConfig = (cfg, f) => {
    const avant = Object.keys(cfg).filter((k) => k in REPLI).map((k) => [k, REPLI[k]]);
    Object.assign(REPLI, cfg);
    try { return f(); } finally { for (const k of Object.keys(cfg)) delete REPLI[k]; Object.assign(REPLI, Object.fromEntries(avant)); }
  };
  const base = { isOpen: true, onClose() {}, onUpgrade() {}, userId: 'compte-ordinaire' };
  const rendre = (props, lang = 'fr') => texte(renderToStaticMarkup(h(CM.default, { ...base, lang, ...props })));
  const futur = new Date(Date.now() + 12 * 86_400_000).toISOString();
  // La config de prod d'avant la réparation : la vieille clé à 50, la jauge à 30.
  const PROD_AVANT = { quota_republication_free: 50, jauge_remontees_free: 30 };
  for (const [nom, cfg] of [['interrupteur à 0', { ...PROD_AVANT, grille_trois_jauges: 0 }], ['repli sans clé jauge', { quota_republication_free: 50 }]]) {
    const free = avecConfig(cfg, () => rendre({}));
    ok(/30 republications par mois/.test(free) && !CINQUANTE.test(free), `${nom} : carte Free « 30 republications par mois », jamais 50`, free.slice(0, 400));
    const en = avecConfig(cfg, () => rendre({}, 'en'));
    ok(/30 repostings a month/.test(en) && !CINQUANTE.test(en), `${nom} (en) : « 30 repostings a month »`, en.slice(0, 400));
    const mur = avecConfig(cfg, () => rendre({ trigger: 'republish_cap', plafondRepub: { plafond: null, faites: null, remise_le: futur } }));
    ok(/Tes 30 republications du mois sont toutes utilisées/.test(mur) && !CINQUANTE.test(mur), `${nom} : mur sans chiffre du serveur → « Tes 30 republications du mois »`, mur.slice(0, 400));
    // La feuille du Free porte aussi les cartes Premium et Pro : leurs volumes ne bougent pas.
    ok(/1 500 republications par mois/.test(free) && /5 000 republications par mois/.test(free), `${nom} : cartes Premium (1 500) et Pro (5 000) inchangées`, free.slice(0, 600));
  }
  const murServeur = avecConfig({ ...PROD_AVANT, grille_trois_jauges: 0 }, () => rendre({ trigger: 'republish_cap', plafondRepub: { plafond: 30, faites: 30, remise_le: futur } }));
  ok(/Tes 30 republications du mois/.test(murServeur), 'mur avec le chiffre du serveur : il prime (30)');
  const grille = avecConfig({ ...PROD_AVANT, grille_trois_jauges: 1 }, () => rendre({}));
  ok(/30 remontées/.test(grille) && !CINQUANTE.test(grille), 'grille à 1 : la carte Free dit 30 remontées', grille.slice(0, 400));
} finally {
  await vite.close();
}

// ── 5. La config : le script de réparation (joué après feu vert de Nico) ────
console.log('5. La config : scripts/reparations/20261120_quota_republication_free_30.sql');
const rep = lire('scripts/reparations/20261120_quota_republication_free_30.sql');
const inv = lire('scripts/reparations/20261120_quota_republication_free_30_INVERSE.sql');
ok(/CREATE TABLE public\._backup_2011_quota_republication_free AS/.test(rep) && /REVOKE ALL ON public\._backup_2011_quota_republication_free/.test(rep),
  'sauvegarde de la ligne (_backup_2011_quota_republication_free), fermée à anon/authenticated');
ok(/IS DISTINCT FROM 50 THEN\s*RAISE EXCEPTION/.test(rep) && /SET value = 30, updated_at = now\(\) WHERE key = 'quota_republication_free' AND value = 50;/.test(rep),
  'garde : seulement si la valeur actuelle est 50, puis 30');
ok(!/quota_republication_(premium|pro|business)'/.test(rep.replace(/^--.*$/gm, '')), 'aucun palier payant touché');
ok(/FROM public\._backup_2011_quota_republication_free b WHERE c\.key = b\.key AND c\.key = 'quota_republication_free'/.test(inv), 'inverse : la valeur sauvegardée revient');

console.log(`\n${rouges ? '✗' : '✓'} quota-free-30 : ${verts} verts, ${rouges} rouges`);
if (rouges) process.exit(1);
