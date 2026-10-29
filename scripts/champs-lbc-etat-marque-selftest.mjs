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

// ── (29/10, point 4.4 — boncoin59300) LE CHAMP MARQUE À RECHERCHE QUAND LEBONCOIN A PRÉ-REMPLI UNE AUTRE MARQUE ──
// Dépôts du 26/10 : 3295898405 « manteau fourrures » (pré-rempli « Vintage Dressing » gardé, « Fourrures D.S Paris »
// dite hors liste, « Options: [] ») et 3295940657 « Air Jordan MA2 » (« Nike » gardé, « Jordan » dite hors liste alors
// qu'elle est dans la liste). Le bloc LIVRÉ ⟦marque-recherche⟧ est exécuté (vm), puis les gestes ⟦marque-recherche-gestes⟧
// sont joués sur un faux champ à recherche (menu vide tant qu'on ne tape pas).
{
  const vm = await import('node:vm');
  const bloc = (debut, fin) => { const d = LBC.indexOf(debut), f = LBC.indexOf(fin); if (d < 0 || f < 0) throw new Error(`bloc introuvable : ${debut}`); return LBC.slice(d, f + fin.length); };
  const ligne = (re) => { const m = LBC.match(re); if (!m) throw new Error(`ligne introuvable : ${re}`); return m[0]; };
  const fonction = (entete) => { const i = LBC.indexOf(entete); if (i < 0) throw new Error(`fonction introuvable : ${entete}`); return LBC.slice(i, LBC.indexOf('\n}\n', i) + 2); };
  const source = [
    bloc('// ⟦texte-comparable:début⟧', '// ⟦texte-comparable:fin⟧'),
    'const normalizeFuzzy = (s) => texteComparable(s);',
    fonction('function containsAsWords(hay, needle) {'),
    bloc('// ⟦marque-exacte:début⟧', '// ⟦marque-exacte:fin⟧'),
    ligne(/^const VALEUR_GENERIQUE_RE = .*$/m),
    ligne(/^const estValeurGenerique = .*$/m),
    bloc('// ⟦marque-recherche:début⟧', '// ⟦marque-recherche:fin⟧'),
    'let TEXTE_ARTICLE_LBC = ""; const VALEURS_NON_RECONNUES = {};',
    fonction('function marqueCiteeDansLArticle(marque) {'),
    fonction('async function relireCombobox(input, label) {'),
    bloc('// ⟦marque-recherche-gestes:début⟧', '// ⟦marque-recherche-gestes:fin⟧'),
    'globalThis.__t = { decisionMarqueRechercheLbc, poserMarqueParRechercheLbc, normalizeFuzzy, poserTexte: (t) => { TEXTE_ARTICLE_LBC = normalizeFuzzy(t); }, horsListe: () => MARQUE_HORS_LISTE, razHorsListe: () => { MARQUE_HORS_LISTE = null; }, nonReconnues: VALEURS_NON_RECONNUES };',
  ].join('\n');
  // Le faux DOM : un combobox comme celui de Leboncoin. Taper filtre la liste servie (menu vide sans frappe) ; cliquer
  // une option la retient ; refermer (clic ailleurs) remet dans le champ la valeur retenue (`blurRemet`) ou laisse le
  // texte tapé sans rien retenir.
  const muet = { log() {}, warn() {} };
  const banc = { recherche: () => [], blurRemet: true };
  const etat = { selection: null, clics: [] };
  const menu = { options: [], querySelectorAll() { return this.options; }, querySelector() { return this.options[0] ?? null; }, get childElementCount() { return this.options.length; }, get textContent() { return this.options.map((o) => o.textContent).join(' '); } };
  const input = { value: '', getAttribute: (k) => (k === 'aria-controls' ? 'menu-marque' : null), dispatchEvent() {}, focus() {} };
  const option = (label) => ({ textContent: label, isConnected: true, dispatchEvent() { etat.selection = label; etat.clics.push(label); input.value = label; menu.options = []; } });
  const document = {
    getElementById: (id) => (id === 'menu-marque' ? menu : null),
    querySelectorAll: () => [],
    body: { click() { if (banc.blurRemet) input.value = etat.selection ?? ''; else if (input.value !== etat.selection) etat.selection = null; menu.options = []; } },
  };
  const ctx = vm.createContext({
    console: muet, String, Array, RegExp, Object, Map, Set, Number, Boolean, JSON, Date, document,
    MouseEvent: class { constructor(type) { this.type = type; } },
    sleep: async () => {}, humanPause: async () => {}, realClick: (el) => el.dispatchEvent(),
    typeInto: async (el, texte) => { el.value = String(texte); menu.options = String(texte) ? banc.recherche(String(texte)).map(option) : []; },
  });
  vm.runInContext(source, ctx);
  const T = ctx.__t;
  const D = T.decisionMarqueRechercheLbc;
  // La liste de Leboncoin servie à la frappe (contenance, comme une recherche) — « Jordan » y est (posée chez d'autres comptes).
  const LISTE = ['Air Jordan', 'Jordan', 'Nike', 'Vintage Dressing', 'Fourrures Toscane', 'Paris Fourrures', 'Autre', 'Sans marque', 'Canon'];
  const chercheLbc = (t) => LISTE.filter((b) => T.normalizeFuzzy(b).includes(T.normalizeFuzzy(t))).slice(0, 10);
  const MANTEAU = { titre: 'manteau fourrures ds paris femme 38/40 long  col volumineux vintage', description: 'Fourrures D.S Paris manteau long fourrure marron vintage M/L poches boutons\n\nManteau long en véritable fourrure de renard teinté brun, signé Fourrures DS Paris.' };
  const JORDAN = { titre: 'Basket femme Nike air jordan MA2 taille 38', description: 'Basket femme blanche noir et rouge\nNike air Jordan Ma2\ntaille 38\ntres bon etat' };
  // Le même article sans « Nike » : le pré-rempli « Nike » y est alors une marque devinée par Leboncoin.
  const JORDAN_SANS_NIKE = { titre: 'Basket femme air jordan MA2 taille 38', description: 'Basket femme blanche noir et rouge\nAir Jordan Ma2\ntaille 38\ntres bon etat' };
  const jouer = async ({ article, prefilled, notre, recherche = chercheLbc, blurRemet = true }) => {
    T.poserTexte(`${article.titre} ${article.description}`); T.razHorsListe();
    banc.recherche = recherche; banc.blurRemet = blurRemet;
    etat.selection = prefilled; etat.clics = []; input.value = prefilled; menu.options = [];
    for (const k of Object.keys(T.nonReconnues)) delete T.nonReconnues[k];
    const warnings = [];
    const r = await T.poserMarqueParRechercheLbc({ fieldName: 'marque', input, optionSelector: 'li', notre, prefilled, warnings });
    return { r, valeur: etat.selection, champ: input.value, clics: [...etat.clics], horsListe: T.horsListe(), note: warnings.join(' | '), nonReconnue: T.nonReconnues.marque };
  };

  console.log('\n4. (29/10) LA DÉCISION — LE PRÉ-REMPLI ≠ NOTRE MARQUE : ON TAPE LA NÔTRE');
  // (29/10 nuit, essai réel 3297848873) La frappe vide le champ et la recherche n'a jamais répondu en production :
  // un pré-rempli que l'article nomme n'est plus jamais tapé par-dessus.
  {
    const c = D({ notre: 'Jordan', prefilled: 'Nike', prefilledCite: true });
    ok(c.geste === 'garder' && c.avantRecherche && !c.horsListe && !c.muette && /l'article nomme « Nike »/.test(c.motif),
      '4a. l\'article nomme le pré-rempli « Nike » : il reste, AUCUNE frappe (jamais effacé par une recherche)', JSON.stringify(c));
    const t = D({ notre: 'Jordan', prefilled: 'Nike', prefilledCite: false });
    ok(t.geste === 'taper' && t.valeur === 'Jordan', '4a2. l\'article ne nomme pas le pré-rempli : notre marque est TAPÉE', JSON.stringify(t));
  }
  {
    const d = D({ notre: 'Jordan', prefilled: 'Nike', prefilledCite: false, vuesNotre: ['Air Jordan', 'Jordan'] });
    ok(d.geste === 'poser' && d.option === 'Jordan' && !d.autre, '4b. Air Jordan MA2 : « Jordan » est dans la recherche → « Jordan » (jamais « Air Jordan », la voisine)', JSON.stringify(d));
  }
  {
    const d1 = D({ notre: 'Fourrures D.S Paris', prefilled: 'Vintage Dressing', prefilledCite: false, vuesNotre: [] });
    const d2 = D({ notre: 'Fourrures D.S Paris', prefilled: 'Vintage Dressing', prefilledCite: false, vuesNotre: [], vuesAutre: ['Autre'] });
    ok(d1.geste === 'taper' && d1.valeur === 'Autre' && d2.geste === 'poser' && d2.option === 'Autre' && d2.autre && d2.marqueDansDescription,
      '4c. manteau : « Fourrures D.S Paris » absente, l\'article ne nomme pas « Vintage Dressing » → « Autre », la marque dans la description', JSON.stringify(d2));
  }
  {
    const d = D({ notre: 'Jordan', prefilled: 'Nike', prefilledCite: true, vuesNotre: ['Air Jordan'] });
    ok(d.geste === 'garder' && d.horsListe && !d.muette, '4d. notre marque absente et l\'article nomme le pré-rempli : il reste (« hors liste » : la recherche a répondu)', JSON.stringify(d));
  }
  {
    const d = D({ notre: 'Fourrures D.S Paris', prefilled: 'Vintage Dressing', prefilledCite: false, vuesNotre: [], vuesAutre: [] });
    ok(d.geste === 'vider' && d.retirerPrerempli && d.muette && !d.horsListe, '4e. recherche MUETTE, pré-rempli que l\'article ne nomme pas (marque devinée, règle P8) : retiré, jamais « hors liste »', JSON.stringify(d));
    const c = D({ notre: 'Jordan', prefilled: 'Nike', prefilledCite: true, vuesNotre: [] });
    ok(c.geste === 'garder' && c.muette && !c.horsListe, '4f. muette, pré-rempli nommé : « Autre » n\'est jamais tenté, rien n\'est conclu');
  }
  ok(D({ notre: 'Chic Me', prefilled: 'Zara', prefilledCite: false, vuesNotre: ['Chic', 'Chicco'], vuesAutre: ['Autre'] }).option === 'Autre'
    && D({ notre: 'Chic Me', prefilled: 'Zara', vuesNotre: ['ChicMe'] }).option === 'ChicMe', '4g. égalité tolérante seulement : « Chic » jamais pour « Chic Me », « ChicMe » oui');
  {
    const d = D({ notre: 'Karrimor', prefilled: 'Autre', prefilledCite: true, vuesNotre: [], vuesAutre: ['Autre'] });
    ok(d.geste === 'poser' && d.option === 'Autre' && d.marqueDansDescription, '4h. un pré-rempli générique (« Autre ») n\'est jamais « nommé » par l\'article : « Autre » + la marque dans la description');
    const g = D({ notre: 'Karrimor', prefilled: 'Autre', vuesNotre: [], vuesAutre: [] });
    ok(g.geste === 'garder' && g.marqueDansDescription, '4i. « Autre » pré-rempli qui reste (recherche muette) : la vraie marque part quand même dans la description');
  }
  ok(D({ notre: 'Sans marque', prefilled: 'Canon', prefilledCite: false, vuesNotre: ['Sans marque'] }).option === 'Sans marque',
    '4j. Ornella « Canon » (sans marque) sur un champ à recherche : « Sans marque » trouvé → posé');
  ok(D({ notre: 'Oakley', vuesNotre: [] }).valeur === 'Autre' && D({ notre: 'Sans marque', vuesNotre: [] }).geste === 'vider',
    '4k. sans pré-rempli (inchangé) : « Autre » pour une vraie marque seulement, sinon champ vide');

  console.log('\n5. (29/10) LES GESTES, JOUÉS SUR UN CHAMP À RECHERCHE (menu vide tant qu\'on ne tape pas)');
  {
    const j = await jouer({ article: JORDAN_SANS_NIKE, prefilled: 'Nike', notre: 'Jordan' });
    ok(j.r === true && j.valeur === 'Jordan' && j.clics.join() === 'Jordan' && j.horsListe === null && /remplacé par « Jordan », trouvé par recherche/.test(j.note),
      '5a. Air Jordan MA2 dont l\'article ne nomme pas « Nike » : « Nike » pré-rempli → « Jordan » tapé et posé', JSON.stringify(j));
  }
  {
    const j = await jouer({ article: JORDAN, prefilled: 'Nike', notre: 'Jordan', blurRemet: false });
    ok(j.r === true && j.valeur === 'Nike' && j.champ === 'Nike' && j.clics.length === 0 && /CONSERVÉ — l'article nomme « Nike » : il n'est jamais effacé par une recherche/.test(j.note),
      '5a2. 3295940657 (l\'article dit « Nike air Jordan ») : « Nike » reste, aucune frappe', JSON.stringify(j));
  }
  {
    const j = await jouer({ article: MANTEAU, prefilled: 'Vintage Dressing', notre: 'Fourrures D.S Paris' });
    ok(j.r === true && j.valeur === 'Autre' && j.horsListe === 'Fourrures D.S Paris' && /absent de la recherche Leboncoin \(propositions vues: \["Autre"\]\) → « Autre », la marque est écrite dans la description/.test(j.note),
      '5b. 3295898405 manteau : « Vintage Dressing » pré-rempli → « Autre », « Fourrures D.S Paris » dans la description', JSON.stringify(j));
  }
  {
    const j = await jouer({ article: JORDAN_SANS_NIKE, prefilled: 'Nike', notre: 'Jordan', recherche: (t) => chercheLbc(t).filter((b) => b !== 'Jordan' && b !== 'Autre') });
    ok(j.r === true && j.valeur === 'Nike' && j.champ === 'Nike' && /CONSERVÉ — « Jordan » hors liste \(propositions vues: \["Air Jordan"\]\)/.test(j.note),
      '5c. la recherche a RÉPONDU sans « Jordan » ni « Autre » : le pré-rempli reste (« hors liste » après une recherche relue)', JSON.stringify(j));
  }
  {
    const j = await jouer({ article: MANTEAU, prefilled: 'Vintage Dressing', notre: 'Fourrures D.S Paris', recherche: () => [], blurRemet: false });
    ok(j.r === false && j.champ === '' && j.nonReconnue === 'Fourrures D.S Paris' && /retiré — recherche muette — l'article ne nomme pas « Vintage Dressing »/.test(j.note) && /onglet /.test(j.note) && !/hors liste/.test(j.note),
      '5d. recherche muette, « Vintage Dressing » que l\'article ne nomme pas : retiré (champ vide), jamais « hors liste », l\'état du menu et de l\'onglet est dit', JSON.stringify(j));
  }
  {
    const j = await jouer({ article: JORDAN_SANS_NIKE, prefilled: 'Nike', notre: 'Jordan', recherche: (t) => chercheLbc(t).filter((b) => b !== 'Jordan' && b !== 'Autre'), blurRemet: false });
    ok(j.r === true && j.valeur === 'Nike' && j.clics.join() === 'Nike', '5e. la frappe a effacé le pré-rempli (le champ ne le remet pas) : il est retapé et choisi à l\'identique', JSON.stringify(j));
  }
  {
    const j = await jouer({ article: JORDAN_SANS_NIKE, prefilled: 'Nike', notre: 'Jordan', recherche: () => ['Air Jordan'], blurRemet: false });
    ok(j.r === false && j.champ === '' && j.nonReconnue === 'Jordan' && /effacé par la recherche et introuvable à la relecture — champ laissé vide/.test(j.note),
      '5f. pré-rempli effacé et introuvable : champ vidé et dit (jamais un texte tapé laissé dans le champ)', JSON.stringify(j));
  }
  {
    // L'essai réel du 29/10 20:26 (3297848873, compte de Nico, 0.6.156) : recherche muette, le champ ne remet rien.
    const j = await jouer({ article: { titre: 'TEST FillSell 999 ne pas acheter - sweat Nike Jordan taille M', description: 'Annonce de test FillSell.' }, prefilled: 'Nike', notre: 'Jordan', recherche: () => [], blurRemet: false });
    ok(j.r === true && j.valeur === 'Nike' && j.champ === 'Nike' && j.clics.length === 0 && j.nonReconnue === undefined,
      '5g. essai du 29/10 (titre « sweat Nike Jordan ») : « Nike » reste — jamais l\'annonce sans marque', JSON.stringify(j));
  }

  console.log('\n6. (29/10) LE BRANCHEMENT DANS fillCriterionSafe');
  ok(/if \(!match && rechercheParFrappe && fieldName === "marque" && !estMarqueConsole && prefilled && menu\) \{\s+return await poserMarqueParRechercheLbc\(\{ fieldName, input, optionSelector, notre: String\(rawValue\), prefilled, warnings \}\);/.test(LBC)
    && LBC.indexOf('return await poserMarqueParRechercheLbc(') < LBC.indexOf('const marqueDevineeFausse = fieldName === "marque"'),
    '6a. marque pré-remplie ≠ la nôtre, absente du menu ouvert : la recherche passe AVANT l\'ancien repli « Autre » dans le menu vide');
  ok(/fillCriterionSafe\("marque", 'label\[for\$="_brand"\]', fields\.marque, warnings,\s+\{ skipIfPrefilled: true, fallbackValues: [^\n]+, rechercheParFrappe: true \}\);/.test(LBC),
    '6b. le champ Marque est bien appelé en recherche (skipIfPrefilled + rechercheParFrappe)');
  ok(/: prefilledMatchesTarget\(prefilled, rawValue\) \|\| \(fieldName === "marque" && marquesEgales\(prefilled, rawValue\)\)\);/.test(LBC),
    '6c. un pré-rempli ÉGAL à notre marque (« ChicMe » = « Chic Me ») est gardé sans recherche');
  ok(/const menuVif = \(\) => menuDuChampLbc\(input\) \?\? menu;/.test(LBC) && (LBC.match(/menuVif\(\)\.querySelector/g) ?? []).length >= 4,
    '6d. champ vide (voie d\'avant) : le menu propre du champ est relu à chaque lecture, jamais le nœud d\'avant la frappe');
}

// ── 7. (29/10, lot C partie 4 — 0.6.159) LA MARQUE POSÉE PAR SON IDENTIFIANT ────────────────────────────────────────
// Prouvé le 29/10 sur le compte de Nico : la liste ENTIÈRE est dans la page (1 503 marques Mode, { id, label }), la pose
// passe par le gestionnaire du composant (onValueChange("zara") → champ « Zara », formulaire clothing_brand « zara »).
// Le monde MAIN est simulé (demanderMainLbc) ; la décision est la règle livrée (decisionMarqueRechercheLbc).
console.log('\n7. (29/10) LA MARQUE PAR SON IDENTIFIANT, DEPUIS LA LISTE DE LEBONCOIN');
{
  const vm = await import('node:vm');
  const bloc = (debut, fin) => { const d = LBC.indexOf(debut), f = LBC.indexOf(fin); if (d < 0 || f < 0) throw new Error(`bloc introuvable : ${debut}`); return LBC.slice(d, f + fin.length); };
  const ligne = (re) => { const m = LBC.match(re); if (!m) throw new Error(`ligne introuvable : ${re}`); return m[0]; };
  const fonction = (entete) => { const i = LBC.indexOf(entete); if (i < 0) throw new Error(`fonction introuvable : ${entete}`); return LBC.slice(i, LBC.indexOf('\n}\n', i) + 2); };
  const LISTE = [
    { id: '3suisses', label: '3 Suisses' }, { id: 'ana_alcazar', label: 'Ana Alcazar' }, { id: 'azzaro', label: 'Azzaro' },
    { id: 'hm', label: 'H&M' }, { id: 'jordan', label: 'Jordan' }, { id: 'nike', label: 'Nike' }, { id: 'vintage_dressing', label: 'Vintage Dressing' },
    { id: 'zara', label: 'Zara' }, { id: 'autre', label: 'Autre' },
  ];
  const source = [
    bloc('// ⟦texte-comparable:début⟧', '// ⟦texte-comparable:fin⟧'),
    'const normalizeFuzzy = (s) => texteComparable(s);',
    fonction('function containsAsWords(hay, needle) {'),
    bloc('// ⟦marque-exacte:début⟧', '// ⟦marque-exacte:fin⟧'),
    ligne(/^const VALEUR_GENERIQUE_RE = .*$/m),
    ligne(/^const estValeurGenerique = .*$/m),
    bloc('// ⟦marque-recherche:début⟧', '// ⟦marque-recherche:fin⟧'),
    fonction('async function poserMarqueParIdentifiantLbc({'),
    'globalThis.__t = { poserMarqueParIdentifiantLbc, horsListe: () => MARQUE_HORS_LISTE, raz: () => { MARQUE_HORS_LISTE = null; } };',
  ].join('\n');
  const banc = { liste: { ok: true, choix: LISTE, valeur: '' }, poses: [], relu: null };
  const ctx = vm.createContext({
    console: { log() {}, warn() {} }, String, Array, RegExp, Object, Map, Set, Number, Boolean, JSON, Date,
    demanderMainLbc: async (fn, args) => {
      if (fn === 'listerChoixCritere') return banc.liste;
      if (fn === 'poserChoixCritere') { banc.poses.push(args[1]); const c = LISTE.find((x) => x.id === args[1]); return { ok: true, valeurInput: banc.relu ?? c?.label ?? '', valeurForm: args[1] }; }
      return null;
    },
  });
  vm.runInContext(source, ctx);
  const T = ctx.__t;
  const jouer = async (notre, prefilled = null) => { banc.poses = []; T.raz(); const w = []; const r = await T.poserMarqueParIdentifiantLbc({ fieldName: 'marque', labelSelector: 'label[for$="_brand"]', notre, prefilled, warnings: w }); return { r, poses: [...banc.poses], w, hors: T.horsListe() }; };
  let j = await jouer('Zara');
  ok(j.r === true && j.poses.join() === 'zara' && /posée par son identifiant Leboncoin \(zara/.test(j.w[0]), '7a. « Zara » : posée par son identifiant « zara », sans frappe ni dessin du menu', JSON.stringify(j));
  j = await jouer('H&M');
  ok(j.r === true && j.poses.join() === 'hm', '7b. « H&M » → identifiant « hm » (la valeur ne se devine jamais depuis le libellé : elle est LUE)', JSON.stringify(j));
  j = await jouer('Fourrures D.S Paris');
  ok(j.r === true && j.poses.join() === 'autre' && j.hors === 'Fourrures D.S Paris' && /absente de la liste.*« Autre »/.test(j.w[0]), '7c. une vraie marque hors liste → « Autre » de CETTE liste, la marque écrite dans la description (boncoin59300)', JSON.stringify(j));
  j = await jouer('Jordan', 'Vintage Dressing');
  ok(j.r === true && j.poses.join() === 'jordan' && /pré-rempli « Vintage Dressing » que l'article ne nomme pas, remplacé/.test(j.w[0]), '7d. pré-rempli deviné que l\'article ne nomme pas : remplacé par notre marque, lue dans la liste', JSON.stringify(j));
  j = await jouer('Zar');
  ok(j.r === true && j.poses.join() === 'autre', '7e. jamais la plus proche : « Zar » ne devient pas « Zara » (égalité exacte), « Autre »', JSON.stringify(j));
  banc.liste = { ok: false, reason: 'fibre React absente' };
  j = await jouer('Zara');
  ok(j.r === null && j.poses.length === 0 && /recherche par frappe, comme avant/.test(j.w[0]), '7f. liste illisible (canal, page changée) : null → la voie d\'avant, à l\'identique', JSON.stringify(j));
  banc.liste = { ok: true, choix: LISTE, valeur: '' }; banc.relu = '';
  j = await jouer('Zara');
  ok(j.r === null && /non relu après la pose/.test(j.w[0]), '7g. pose non relue dans le champ : jamais « posée » sans preuve, la voie d\'avant', JSON.stringify(j));
  banc.relu = null;
  ok(/if \(rechercheParFrappe && fieldName === "marque" && !estMarqueConsole && !\(prefilled && marqueCiteeDansLArticle\(prefilled\) && !estValeurGenerique\(prefilled\)\)\) \{\s+const posee = await poserMarqueParIdentifiantLbc\(/.test(LBC)
    && LBC.indexOf('const posee = await poserMarqueParIdentifiantLbc(') < LBC.indexOf('if (rechercheParFrappe && !prefilled && menu && !menu.querySelector(optionSelector)'),
    '7h. branché AVANT toute frappe ; un pré-rempli que l\'article nomme ne passe jamais par là (il reste, règle du 29/10)');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
