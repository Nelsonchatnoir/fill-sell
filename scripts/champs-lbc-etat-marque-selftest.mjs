// selftest:champs-lbc-etat-marque — l'état choisi pour une publication Leboncoin
// n'est plus remplacé par celui de la fiche ; « État satisfaisant » trouve la
// grille Électronique ; une marque devinée par Leboncoin qui n'est pas celle de
// l'article n'est plus gardée (15/10, P8 — DeadRoz, Louis, Ornella).
//
//   npm run selftest:champs-lbc-etat-marque
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const LBC = lire('chrome-extension/content-scripts/leboncoin.js');

let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `   ← ${d}` : ''}`); };

// Le correspondant EXACT de get-pending-jobs, exécuté tel qu'écrit.
const i0 = GPJ.indexOf('const normEtatLbc = (v: unknown): string =>');
const i1 = GPJ.indexOf('const grillesEtatCache');
const code = GPJ.slice(i0, i1).replace(/\(v: unknown\): string =>/, '(v) =>')
  .replace(/\(valeur: string, grille: string\[\]\): string \| null =>/, '(valeur, grille) =>')
  .replace(/ as \[string, string\]/g, '');
// eslint-disable-next-line no-new-func
const { etatLeboncoinExact } = new Function(`${code}; return { etatLeboncoinExact };`)();
ok(i0 > 0 && i1 > i0, '0. le correspondant d\'état est trouvé');

const ELECTRONIQUE = ['État neuf', 'Très bon état', 'Bon état', 'État satisfaisant - fonctionnel', 'Pour pièces'];
const MAISON = ['État neuf', 'Très bon état', 'Bon état', 'État satisfaisant', 'Pour pièces'];
const MODE = ['Neuf avec étiquette', 'Neuf sans étiquette', 'Très bon état', 'Bon état', 'État satisfaisant'];
ok(etatLeboncoinExact('État satisfaisant', ELECTRONIQUE) === 'État satisfaisant - fonctionnel', '1a. Louis 150c7da9 : « État satisfaisant » → « État satisfaisant - fonctionnel » (même code)');
ok(etatLeboncoinExact('État satisfaisant', MAISON) === 'État satisfaisant', '1b. grille sans suffixe : inchangé');
ok(etatLeboncoinExact('Neuf', MODE) === null, '1c. « Neuf » nu sur la grille Mode : jamais deviné (avec/sans étiquette)');
ok(etatLeboncoinExact('Bon état', ELECTRONIQUE) === 'Bon état', '1d. valeur exacte : inchangée');

// L'extension (republication : l'état relu sur l'annonce) : même équivalence.
{
  const i = LBC.indexOf('function etatLeboncoinExactParmi(candidats, grille) {');
  const j = LBC.indexOf('function trouverOptionEtatExacte', i);
  const n0 = LBC.indexOf('const normEtatLbc');
  const norm = n0 >= 0 ? LBC.slice(n0, LBC.indexOf('\n', LBC.indexOf('=>', n0)) + 1) : '';
  // eslint-disable-next-line no-new-func
  const parmi = new Function(`${norm}\n${LBC.slice(i, j)}; return etatLeboncoinExactParmi;`)();
  ok(i > 0 && parmi(['État satisfaisant'], ELECTRONIQUE) === 'État satisfaisant - fonctionnel', '1e. extension : même équivalence sur la liste relevée en direct');
}

// L'ordre des sources (DeadRoz) : le job, puis la fiche.
ok(/const candidatsEtat = \[\.\.\.new Set\(\[resolu, brut, precis\]\.filter\(Boolean\)\)\];/.test(GPJ),
  '2a. ordre : réponse de la personne, état choisi pour la publication, puis la fiche');
{
  const choisir = (resolu, brut, precis, grille) => {
    for (const c of [...new Set([resolu, brut, precis].filter(Boolean))]) { const m = etatLeboncoinExact(c, grille); if (m) return m; }
    return null;
  };
  ok(choisir('', 'Bon état', 'Très bon état', MAISON) === 'Bon état', '2b. DeadRoz : « Bon état » choisi au stepper reste « Bon état » (la fiche disait « Très bon état »)');
  ok(choisir('', 'Neuf', 'Neuf avec étiquette', MODE) === 'Neuf avec étiquette', '2c. MeMiniandMove (17/09) : « Neuf » aplati → la fiche précise (inchangé)');
}
ok(/const brutAmbigu = !brut \|\| \/\^\(etat \)\?neuf\$\/\.test\(normEtatLbc\(brut\)\);/.test(GPJ)
  && /if \(precis && brutAmbigu && !pf\.lbc_etat_precis/.test(GPJ),
  '2d. l\'état précis de la fiche n\'est servi à l\'extension que si l\'état du job est vide ou « Neuf » nu');

// La marque devinée par Leboncoin
ok(/const marqueDevineeFausse = fieldName === "marque" && !estMarqueConsole && prefilled\s+&& !prefilledMatchesTarget\(prefilled, rawValue\) && !marqueCiteeDansLArticle\(prefilled\);/.test(LBC)
  && /if \(!match && \(!prefilled \|\| marqueDevineeFausse\)\) \{/.test(LBC), '3a. marque devinée ≠ marque de l\'article (et que l\'article ne nomme pas) : le repli « Autre » est tenté');
// (15/10, 0.6.113 — point 7) Ornella « Canon » : le repli générique ne garde
// plus une marque que l'article ne nomme pas ; console_brand (jeux vidéo) garde
// toujours son pré-rempli (« Sony » déduit de PS4 — régression de la 0.6.112).
ok(/const marquePreRemplieNonCitee = fieldName === "marque" && !estMarqueConsole && !!prefilled\s+&& !estValeurGenerique\(prefilled\) && !marqueCiteeDansLArticle\(prefilled\);/.test(LBC)
  && /!REJOUE_ANNONCE_D_ORIGINE && !marquePreRemplieNonCitee\) \{/.test(LBC),
  '3c. « Sans marque » remplace une marque pré-remplie que l\'article ne nomme pas (Ornella, « Canon »)');
ok(/function marqueConsole\(labelSelector\) \{[\s\S]{0,200}console_brand\$\/i/.test(LBC) && /const estMarqueConsole = fieldName === "marque" && marqueConsole\(labelSelector\);/.test(LBC),
  '3d. la marque de la console (console_brand) n\'est jamais remplacée par « Autre »');
ok(/TEXTE_ARTICLE_LBC = normalizeFuzzy\(`\$\{job\.title \?\? ""\} \$\{job\.description \?\? ""\}`\);/.test(LBC), '3e. le texte de l\'article (titre + description) est posé à chaque remplissage');
// (18/10) le même repli vaut pour toute vraie marque hors liste (marqueReelle).
ok(/\(marqueDevineeFausse \|\| marqueReelle\) \? fallbackValues\.filter\(\(v\) => !\/\^sans marque\$\/i\.test\(String\(v\)\)\) : fallbackValues/.test(LBC),
  '3b. jamais « Sans marque » à la place d\'une marque devinée (l\'article en a une)');

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
