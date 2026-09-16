// ── AUTOTEST DU CATALOGUE OPLA (2026-09-16) ──────────────────────────────────
//
// L'arbre Opla vit maintenant à TROIS endroits : le module serveur
// (_shared/opla-catalogue.ts), la base (la migration), et le référentiel LIVE
// que le handler charge dans la page. Trois copies, c'est trois occasions de
// diverger — ce fichier existe pour que ça ne puisse pas arriver en silence.
//
// Ce qu'il établit :
//   1. les trois sortent de la MÊME source (docs/opla/*.tsv) et disent la même
//      chose, nœud par nœud, grille par grille ;
//   2. `oplaOptionsNiveauEchoue` propose LE NIVEAU QUI A ÉCHOUÉ, jamais les
//      racines — le défaut Blaf69 du 16/09, transposé sur Opla et refusé ;
//   3. une taille n'est valide que dans la grille de SA feuille : « 90C » est un
//      code Opla réel, et il est refusé sur un t-shirt ;
//   4. le handler (chrome-extension/handlers/opla.js) et le module serveur
//      répondent PAREIL sur les 1014 nœuds — deux implémentations, un verdict.
//
//   node scripts/opla-catalogue-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

let echecs = 0;
const ok = (titre, condition, detail) => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 200)}` : ''}`); }
};

// ── La SOURCE, relue ici aussi : le test ne fait confiance à personne ────────
const noeuds = [];
for (const l of lire('docs/opla/categories.tsv').split('\n').slice(1)) {
  if (!l.trim()) continue;
  const [prof, code, titre, parent, feuille] = l.split('\t');
  noeuds.push({ prof: Number(prof), code, titre, parent: parent || null, feuille: feuille === 'F' });
}
const grilleDe = new Map();
for (const l of lire('docs/opla/categorie-grille.tsv').split('\n').slice(1)) {
  if (!l.trim()) continue;
  const [code, , g] = l.split('\t');
  grilleDe.set(code, g);
}

// ── Le module serveur, importé TEL QUEL ─────────────────────────────────────
// Node 22+ dépouille les annotations de type des .ts nativement : on exerce
// donc le fichier GÉNÉRÉ, pas une transcription. Il n'a aucune dépendance,
// c'est ce qui le rend importable ici comme il l'est dans une edge function.
const M = await import(new URL('../supabase/functions/_shared/opla-catalogue.ts', import.meta.url).href);

console.log('\n── CATALOGUE OPLA ─────────────────────────────────────────────');

console.log('\n1. Le module serveur dit EXACTEMENT ce que dit la source');
{
  let divergents = 0;
  for (const n of noeuds) {
    const m = M.oplaNoeud(n.code);
    if (!m || m.titre !== n.titre || m.parent !== n.parent || m.feuille !== n.feuille) divergents += 1;
    if (n.feuille) {
      const attendue = grilleDe.get(n.code);
      const g = m?.grille ?? null;
      if ((attendue === 'G0' ? null : attendue) !== (g === 'G0' ? null : g)) divergents += 1;
    }
  }
  ok('les 1014 nœuds, titre, parent, feuille et grille compris', divergents === 0, `${divergents} divergences`);
  ok('8 racines', M.oplaEnfants('').length === 8, M.oplaEnfants('').length);
  ok('886 feuilles', noeuds.filter((n) => n.feuille).length === 886);
  ok('un code inconnu rend null, jamais une approximation', M.oplaNoeud('PAS_UN_CODE') === null);
  ok('le chemin remonte à la racine',
    M.oplaChemin('LIVRES_POUR_BEBE').join(' > ') === 'Culture et Loisirs > Livres > Livres pour bébé',
    M.oplaChemin('LIVRES_POUR_BEBE'));
}

console.log('\n2. ⛔ LE NIVEAU QUI A ÉCHOUÉ — jamais les racines');
{
  const racines = M.oplaEnfants('').map((n) => n.code).sort().join(',');
  const codesDe = (r) => r.options.map((o) => o.code).sort().join(',');

  // LE CAS BLAF69, transposé. Sur Vinted, le job a buté sur la FEUILLE
  // « Bandes dessinées… » et l'app a proposé les 8 racines : l'utilisateur
  // aurait rechoisi « Livres et médias », déjà bon, et rebuté au même endroit.
  const surFeuille = M.oplaOptionsNiveauEchoue('BANDES_DESSINEES');
  ok('feuille en échec → ses FRÈRES, pas les racines',
    surFeuille.options.length > 1 && codesDe(surFeuille) !== racines, surFeuille.options.map((o) => o.code));
  ok('… et les frères sont bien ceux de sa branche (Livres)',
    surFeuille.ancre === 'LIVRES' && surFeuille.options.some((o) => o.code === 'MANGAS'), surFeuille.ancre);
  ok('… le choix qui a échoué figure dans la liste (on ne le cache pas)',
    surFeuille.options.some((o) => o.code === 'BANDES_DESSINEES'));

  const surNoeud = M.oplaOptionsNiveauEchoue('LIVRES');
  ok('nœud intermédiaire en échec → ses PROPRES enfants (descendre d un cran)',
    surNoeud.ancre === 'LIVRES' && surNoeud.options.every((o) => M.oplaNoeud(o.code).parent === 'LIVRES'),
    surNoeud.ancre);

  // Code inconnu MAIS chemin reconnu : on descend aussi loin que possible.
  const parChemin = M.oplaOptionsNiveauEchoue('CODE_INVENTE', ['Culture et Loisirs', 'Livres']);
  ok('code inconnu + chemin reconnu → les enfants du dernier nœud reconnu',
    parChemin.ancre === 'LIVRES', parChemin.ancre);
  const parCheminPartiel = M.oplaOptionsNiveauEchoue('CODE_INVENTE', ['Culture et Loisirs', 'Rayon Imaginaire']);
  ok('chemin reconnu À MOITIÉ → on s arrête au dernier nœud valide',
    parCheminPartiel.ancre === 'CULTURE_ET_LOISIR', parCheminPartiel.ancre);

  // Les racines ne sortent QUE quand rien n'est reconnu — le seul cas où elles
  // sont la bonne réponse.
  const rien = M.oplaOptionsNiveauEchoue('CODE_INVENTE', []);
  ok('rien de reconnu → ALORS les racines, et seulement alors',
    codesDe(rien) === racines && rien.ancre === null, rien.ancre);
  const horsSujet = M.oplaOptionsNiveauEchoue('', ['Rayon Imaginaire']);
  ok('chemin entièrement inconnu → les racines aussi', codesDe(horsSujet) === racines);

  // Aucun niveau ne doit rendre une liste vide : une question sans réponse
  // possible est pire qu'un échec sec.
  let vides = 0;
  for (const n of noeuds) if (M.oplaOptionsNiveauEchoue(n.code).options.length === 0) vides += 1;
  ok('AUCUN des 1014 nœuds ne rend une liste vide', vides === 0, `${vides} vides`);
}

console.log('\n3. ⛔ Les grilles : la branche ne dit rien, et les codes sont en DOUBLE');
{
  ok('« 90C » est bien une taille Opla RÉELLE (G4, soutiens-gorge)',
    M.oplaTailleValide('BRAS', '90C'));
  ok('… et elle est REFUSÉE sur un t-shirt (G1) — le piège de la liste plate',
    !M.oplaTailleValide('WOM_TOP_T_SHIRTS', '90C'));
  ok('« XS » est valide des DEUX côtés (le doublon légitime)',
    M.oplaTailleValide('BRAS', 'XS') && M.oplaTailleValide('WOM_TOP_T_SHIRTS', 'XS'));
  ok('une catégorie SANS grille n accepte AUCUNE taille (pas « toutes »)',
    !M.oplaTailleValide('LIVRES_POUR_BEBE', 'M') && M.oplaTaillesDe('LIVRES_POUR_BEBE').length === 0);
  ok('un code inconnu n accepte aucune taille', !M.oplaTailleValide('PAS_UN_CODE', 'M'));
  ok('une taille vide est refusée', !M.oplaTailleValide('WOM_TOP_T_SHIRTS', ''));

  // Les cas contre-intuitifs du relevé § 7.3 : la grille NE SE DÉDUIT PAS.
  const attendu = {
    BELTS: 'G1', GLOVES: 'G1', GLOVES_GIRLS_NEW: 'G0', SOCKS_GIRLS_NEW: 'G3',
    HATS_GIRLS_NEW: 'G2', BABY_BATH_ACC: 'G2', PANTIES_THONGS: 'G1', BRAS: 'G4',
    SPORT_GOLF_GLOVES: 'G1', MEN_BRACELETS: 'G0',
  };
  let faux = 0;
  for (const [code, g] of Object.entries(attendu)) if ((M.oplaNoeud(code)?.grille ?? 'G0') !== g) faux += 1;
  ok('les 10 attributions contre-intuitives du § 7.3 sont respectées', faux === 0, `${faux} fausses`);

  const tailles = M.oplaTaillesDe('GIRLS_COMBI_PILOTES_NEW');
  ok('les tailles portent leur LIBELLÉ, pas juste leur code (« 0M » → « 0 mois »)',
    tailles.find((t) => t.code === '0M')?.title === '0 mois', tailles.slice(0, 2));
}

console.log('\n4. La base dit la même chose que le module');
{
  const sql = lire('supabase/migrations/20260916150000_opla_catalogue.sql');
  const sansCommentaires = sql.replace(/^\s*--.*$/gm, '');
  // La migration est écrite en CTE : `niveaux` (un nœud → ses enfants),
  // `grilles` (les 4 grilles, écrites UNE fois) et `feuilles` (feuille → grille).
  // On relit ces trois blocs et on les compare au module, ligne par ligne.
  const bloc = (nom) => [...sansCommentaires.matchAll(new RegExp(`${nom} \\([^)]*\\) as \\(values\\n([\\s\\S]*?)\\n\\)`, 'g'))]
    .map((m) => m[1]).join('\n');
  const niveaux = [...bloc('niveaux').matchAll(/\('([^']*)', '(\[[\s\S]*?\])'::jsonb\)/g)];
  const grillesSql = new Map([...bloc('grilles').matchAll(/\('(G\d)', '(\[[\s\S]*?\])'::jsonb\)/g)]
    .map(([, nom, json]) => [nom, JSON.parse(json.replace(/''/g, "'")).map((o) => o.code).join(',')]));
  const feuillesSql = [...bloc('feuilles').matchAll(/\('([A-Z0-9_]+)', '(G\d)'\)/g)];

  ok('la migration porte les trois blocs', niveaux.length > 0 && grillesSql.size > 0 && feuillesSql.length > 0,
    { niveaux: niveaux.length, grilles: grillesSql.size, feuilles: feuillesSql.length });
  // ⛔ Chaque INSERT doit se suffire : rejouable seul, dans n'importe quel
  // ordre. C'est ce qui rend l'application reprenable si l'envoi casse.
  const inserts = (sansCommentaires.match(/insert into public\.platform_category_aspects/g) ?? []).length;
  const conflits = (sansCommentaires.match(/on conflict \(platform, category_key, field_key\) do update/g) ?? []).length;
  ok('chaque INSERT porte SON on conflict (rejouable seul)', inserts > 1 && inserts === conflits, { inserts, conflits });
  ok('elle n insère QUE du opla', (sansCommentaires.match(/'(vinted|leboncoin|beebs|ebay|vestiaire)'/g) ?? []).length === 0);
  ok('elle est idempotente (on conflict … do update)', /on conflict[\s\S]*do update/i.test(sql));
  ok('⛔ elle ne porte AUCUN DDL (l unicité existe déjà en prod)',
    !/\b(create|alter|drop)\s+(unique\s+)?(index|table|constraint)/i.test(sansCommentaires));

  let divergentes = 0;
  for (const [, cle, json] of niveaux) {
    const attendues = M.oplaEnfants(cle === 'ROOT' ? '' : cle).map((n) => n.code).join(',');
    const enBase = JSON.parse(json.replace(/''/g, "'")).map((o) => o.code).join(',');
    if (attendues !== enBase) divergentes += 1;
  }
  for (const [, code, nom] of feuillesSql) {
    const attendues = M.oplaTaillesDe(code).map((t) => t.code).join(',');
    if (attendues !== grillesSql.get(nom)) divergentes += 1;
  }
  ok('CHAQUE ligne de la migration dit ce que dit le module', divergentes === 0, `${divergentes} divergentes`);
  ok('129 niveaux de choix (128 nœuds + la racine)', niveaux.length === 129, niveaux.length);
  ok('397 feuilles avec grille — les 489 en G0 n ont PAS de ligne', feuillesSql.length === 397, feuillesSql.length);
  ok('les 4 grilles écrites UNE fois, pas 397 (G0 n existe pas en base)',
    grillesSql.size === 4 && !grillesSql.has('G0'), [...grillesSql.keys()]);
}

console.log('\n5. Le handler et le module répondent PAREIL, sur les 1014 nœuds');
{
  // On sert au handler l'arbre EXACT d'Opla, reconstruit depuis le TSV dans la
  // forme que rend /api/public/config/articles — puis on compare ses verdicts
  // à ceux du module, nœud par nœud. Deux implémentations écrites séparément :
  // si elles s'accordent sur 1014 cas, l'algorithme est le même.
  const parParent = new Map();
  for (const n of noeuds) {
    const cle = n.parent ?? '';
    if (!parParent.has(cle)) parParent.set(cle, []);
    parParent.get(cle).push(n);
  }
  const construire = (cle) => (parParent.get(cle) ?? []).map((n) => {
    const enfants = construire(n.code);
    return enfants.length ? { code: n.code, title: n.titre, categories: enfants } : { code: n.code, title: n.titre };
  });
  const arbre = { categories: construire('') };

  const ecouteurs = [];
  const contexte = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout, clearTimeout,
    fetch: async (url) => {
      if (String(url).includes('/config/articles')) {
        return { status: 200, ok: true, text: async () => JSON.stringify(arbre) };
      }
      return { status: 200, ok: true, text: async () => JSON.stringify({ sizes: [], colors: [], materials: [] }) };
    },
    chrome: { runtime: { onMessage: { addListener: (fn) => ecouteurs.push(fn) }, sendMessage: () => Promise.resolve() } },
    window: { addEventListener: () => {}, location: { origin: 'https://www.opla.co' }, postMessage: () => {} },
    document: { querySelector: () => null, addEventListener: () => {}, readyState: 'complete' },
  };
  contexte.globalThis = contexte;
  contexte.self = contexte;
  vm.createContext(contexte);
  vm.runInContext(lire('chrome-extension/handlers/opla.js'), contexte, { filename: 'opla.js' });
  const ref = await vm.runInContext('oplaChargerReferentiel()', contexte);

  ok('le handler a lu les 886 feuilles et les 1014 nœuds',
    ref.feuilles.size === 886 && ref.noeuds.size === 1014, `${ref.feuilles.size}/${ref.noeuds.size}`);

  let desaccords = 0;
  let premier = null;
  for (const n of noeuds) {
    const a = ref.optionsNiveauEchoue(n.code, []).map((o) => o.code).join(',');
    const b = M.oplaOptionsNiveauEchoue(n.code).options.map((o) => o.code).join(',');
    if (a !== b) { desaccords += 1; premier ??= { code: n.code, handler: a.slice(0, 60), module: b.slice(0, 60) }; }
  }
  ok('handler et module d accord sur les 1014 nœuds', desaccords === 0, premier ?? `${desaccords} désaccords`);

  const parChemin = ref.optionsNiveauEchoue('CODE_INVENTE', ['Culture et Loisirs', 'Livres']).map((o) => o.code).join(',');
  const parCheminM = M.oplaOptionsNiveauEchoue('CODE_INVENTE', ['Culture et Loisirs', 'Livres']).options.map((o) => o.code).join(',');
  ok('… et sur la descente par chemin de libellés', parChemin === parCheminM, { parChemin: parChemin.slice(0, 60) });
}

console.log('\n6. La source n a pas bougé sous nos pieds');
{
  const sha = (rel) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 16);
  const attendues = {
    'docs/opla/categories.tsv': '6d284b5821c72ea7',
    'docs/opla/categorie-grille.tsv': 'e24f8ec875ea8138',
    'docs/opla/grilles-tailles.tsv': 'fdcafb7f3701602c',
    'docs/opla/sizes.txt': '00df77682e178e8c',
  };
  for (const [f, e] of Object.entries(attendues)) ok(`${f.replace('docs/opla/', '')} — empreinte du relevé`, sha(f) === e, sha(f));
}

console.log(
  echecs === 0
    ? '\nTOUT PASSE — un seul arbre, trois copies qui disent la même chose\n'
    : `\n${echecs} CONTRÔLE(S) EN ÉCHEC\n`,
);
process.exit(echecs === 0 ? 0 : 1);
