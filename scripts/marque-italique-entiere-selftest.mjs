// ═══════════════════════════════════════════════════════════════════════════
// LE LOGO TEXTE EN ITALIQUE N'EST JAMAIS ROGNÉ — `npm run selftest:marque-italique-entiere`
// ═══════════════════════════════════════════════════════════════════════════
// 11/10/2026 (Nico) : sur fillsell.app, le dernier « l » de « FillSell » était
// coupé dans l'en-tête. Cause : un texte peint en dégradé
// (`background-clip: text`, remplissage transparent) n'est visible QUE dans la
// boîte de l'élément, et l'italique penche au-delà de cette boîte, à droite.
// La marge droite valait 2 px (site), 4 px (blog, cartes de partage), 6 px
// (app) : des pixels fixes, trop courts dès que la police est penchée par le
// navigateur (Space Grotesk n'a pas d'italique dessiné).
//
// LA RÈGLE : toute déclaration qui met un texte en italique ET le peint en
// dégradé porte une marge droite EN EM, d'au moins .25em (elle suit la taille
// du texte, donc toutes les largeurs d'écran). Contrôlé dans les feuilles de
// l'app, du site, du blog, du générateur des cartes de partage, et dans les
// styles en ligne des composants React. Un texte italique en couleur PLEINE
// (mails, landing) n'est pas concerné : sa pente reste visible hors de sa boîte.
//
// Preuve visuelle : node scripts/apercu/capture-entete-marque.mjs.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINIMUM_EM = 0.25;

function fichiers(dossier, extensions) {
  const sortie = [];
  for (const nom of readdirSync(dossier)) {
    if (nom === 'node_modules' || nom.startsWith('.')) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin, extensions));
    else if (extensions.some((e) => nom.endsWith(e))) sortie.push(chemin);
  }
  return sortie;
}

const echecs = [];
let controles = 0;
const ok = (cond, quoi) => { controles++; if (!cond) echecs.push(quoi); };

// 1. Règles CSS (feuilles, et CSS écrit dans des gabarits .mjs/.ts) : chaque
//    bloc le plus intérieur `sélecteur { déclarations }`.
function blocsCss(texte) {
  const blocs = [];
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(texte))) blocs.push({ selecteur: m[1].trim().split('\n').pop().trim(), corps: m[2] });
  return blocs;
}
function margeDroiteEm(corps) {
  const m = /padding-right\s*:\s*([0-9.]+)\s*em\b/i.exec(corps);
  return m ? Number(m[1]) : null;
}
function verifierCss(fichier, texte) {
  for (const { selecteur, corps } of blocsCss(texte)) {
    if (!/font-style\s*:\s*italic/i.test(corps)) continue;
    if (!/background-clip\s*:\s*text/i.test(corps)) continue;
    const em = margeDroiteEm(corps);
    ok(em != null && em >= MINIMUM_EM,
      `${relative(RACINE, fichier)} « ${selecteur} » : italique en dégradé sans padding-right ≥ ${MINIMUM_EM}em (lu : ${(/padding-right\s*:\s*([^;]+)/i.exec(corps) || [])[1] ?? 'aucun'})`);
  }
}

// 2. Styles en ligne React : objets `style={{ … }}` (accolades équilibrées).
function objetsStyle(texte) {
  const objets = [];
  let i = 0;
  while ((i = texte.indexOf('style={{', i)) !== -1) {
    let profondeur = 0;
    let j = i + 'style={'.length;
    for (; j < texte.length; j++) {
      if (texte[j] === '{') profondeur++;
      else if (texte[j] === '}') { profondeur--; if (profondeur === 0) break; }
    }
    objets.push({ debut: i, corps: texte.slice(i, j + 1) });
    i = j;
  }
  return objets;
}
function verifierJsx(fichier, texte) {
  for (const { debut, corps } of objetsStyle(texte)) {
    if (!/fontStyle\s*:\s*['"]italic['"]/.test(corps)) continue;
    if (!/backgroundClip\s*:\s*['"]text['"]/.test(corps)) continue;
    const m = /paddingRight\s*:\s*['"]([0-9.]+)em['"]/.exec(corps);
    const ligne = texte.slice(0, debut).split('\n').length;
    ok(m && Number(m[1]) >= MINIMUM_EM,
      `${relative(RACINE, fichier)}:${ligne} : style en ligne italique en dégradé sans paddingRight ≥ '${MINIMUM_EM}em'`);
  }
}

const feuilles = [
  ...fichiers(join(RACINE, 'src'), ['.css']),
  ...fichiers(join(RACINE, 'site', 'styles'), ['.css']),
  join(RACINE, 'scripts', 'site', 'og.mjs'),
  join(RACINE, 'supabase', 'functions', '_shared', 'email-template.ts'),
];
for (const f of feuilles) verifierCss(f, readFileSync(f, 'utf8'));
for (const f of fichiers(join(RACINE, 'src'), ['.jsx', '.js'])) verifierJsx(f, readFileSync(f, 'utf8'));

// 3. Les logos connus sont bien VUS par le contrôle (un renommage ne doit pas
//    le rendre aveugle).
const vus = (fichier, motif) => motif.test(readFileSync(join(RACINE, fichier), 'utf8'));
ok(vus('site/styles/site.css', /\.wordmark\s*\{[^}]*font-style:\s*italic[^}]*padding-right:\s*\.25em/), 'site : .wordmark introuvable ou sans .25em');
ok(vus('src/components/BrandMark.css', /\.tb-logo \.name\s*\{[^}]*font-style:\s*italic[^}]*padding-right:\s*\.3em/), 'app : .tb-logo .name introuvable ou sans .3em');
ok(vus('src/pages/blog.css', /\.blog-brand-name\s*\{[^}]*font-style:\s*italic[^}]*padding-right:\s*\.3em/), 'blog : .blog-brand-name introuvable ou sans .3em');
ok(vus('scripts/site/og.mjs', /\.marque b\s*\{[^}]*font-style:\s*italic[^}]*padding-right:\s*\.25em/), 'cartes de partage : .marque b introuvable ou sans .25em');

// 4. Le contrôle attrape bien une marge en pixels (témoin).
const avant = echecs.length;
verifierCss(join(RACINE, 'témoin.css'), '.x { font-style: italic; background-clip: text; padding-right: 6px; }');
verifierJsx(join(RACINE, 'témoin.jsx'), "<b style={{ fontStyle: 'italic', backgroundClip: 'text', paddingRight: 4 }}>x</b>");
const attrapes = echecs.splice(avant).length;
ok(attrapes === 2, `témoins : 2 fautes attendues, ${attrapes} attrapée(s)`);

if (echecs.length) {
  console.error(`✗ marque-italique-entiere : ${echecs.length} faute(s) sur ${controles} contrôles`);
  for (const e of echecs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`✓ marque-italique-entiere : ${controles} contrôles, aucun logo italique rogné`);
