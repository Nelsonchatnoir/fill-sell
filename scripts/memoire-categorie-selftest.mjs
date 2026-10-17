// selftest:memoire-categorie — point 1 de la nuit du 18/10 (Nico) : la mémoire
// « compte × catégorie » des réponses.
//   1. la liste exacte : seuls les champs qui disent le PUBLIC du rayon
//      (Univers Leboncoin Femme/Homme/Enfant…, Département eBay) ; jamais un
//      champ de l'article, jamais un Univers qui nomme des familles d'objets ;
//   2. la pose : champ VIDE et REQUIS seulement, valeur dans la grille
//      d'aujourd'hui (sinon ignorée), jamais contre un public nommé par le texte,
//      même compte, même plateforme, même rayon ;
//   3. la réponse : un CHOIX dans la liste, écrit au clic Publier pour les
//      plateformes envoyées, jamais une ligne inchangée, la nouvelle remplace ;
//   4. le branchement : écran Publier (après fiche et texte), télémétrie et
//      pilote du lot qui attendent la lecture, questions, lot, Réglages ;
//   5. la base : CHECK = la liste du module, RLS sur les quatre gestes, inverse.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l) => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}`); };
const M = await import(pathToFileURL(path.join(RACINE, 'src/publication/moteur/memoireCategorie.js')).href);

// Les vraies listes (platform_category_aspects, relevées le 17/10).
const VETEMENTS = ['Femme', 'Maternité', 'Homme', 'Enfant'];
const CHAUSSURES = ['Femme', 'Homme', 'Enfant'];
const ACCESSOIRES = ['Femme', 'Homme', 'Enfant', 'Mixte'];
const DECO = ['Éclairage', 'Décoration textile', 'Accessoire de rangement', 'Décoration murale', 'Objet décoratif', 'Autre'];
const BEBE_GENRE = ['Fille', 'Garçon', 'Mixte', 'Autres'];
const LIVRES = ['Roman / Littérature', 'Bande dessinée et manga', 'Policier', 'Livre pour enfant et adolescent', 'Autre'];
const DEPARTEMENT = ['Femme', 'Homme', 'Adulte unisexe', 'Fille', 'Garçon', 'Enfant unisexe', 'Bébé et tout-petit (unisexe)'];

console.log('1. La liste exacte');
ok(M.champMemorisable('leboncoin', 'clothing_type', VETEMENTS), 'Univers de Mode > Vêtements (Femme / Maternité / Homme / Enfant) : retenu');
ok(M.champMemorisable('leboncoin', 'shoe_type', CHAUSSURES) && M.champMemorisable('leboncoin', 'accessories_univers', ACCESSOIRES), 'Univers des chaussures et des accessoires : retenus');
ok(M.champMemorisable('ebay', 'Département', DEPARTEMENT), 'Département eBay : retenu');
ok(!M.champMemorisable('leboncoin', 'house_and_garden_type', DECO), 'Univers de Décoration (familles d\'objets) : JAMAIS (11 sur 16 au rejeu)');
ok(!M.champMemorisable('leboncoin', 'decoration_type', ['Tableau et toile', 'Bibelot', 'Poster']), 'Produit de Décoration : JAMAIS (8 sur 16)');
ok(!M.champMemorisable('leboncoin', 'leisure_book_genre', LIVRES), 'Genre de livre : JAMAIS (0 sur 5)');
ok(!M.champMemorisable('leboncoin', 'baby_clothing_universe', BEBE_GENRE), 'Genre bébé (fille / garçon de CET article) : JAMAIS');
ok(['taille', 'marque', 'etat', 'couleur', 'matiere', 'isbn', 'poids', 'prix', 'title', 'description', 'Taille', 'Marque', 'Couleur', 'Matière', 'Âge', 'Style', 'Type']
  .every((ch) => ['leboncoin', 'ebay', 'beebs', 'vinted', 'depop'].every((p) => !M.champMemorisable(p, ch, VETEMENTS))), 'aucun champ de l\'article, sur aucune plateforme, même avec une liste de publics');
ok(!M.champMemorisable('leboncoin', 'clothing_type', ['Femme', 'Robe', 'Homme']), 'une liste qui cesse d\'être un public (valeur « Robe ») : la mémoire se tait');
ok(!M.champMemorisable('leboncoin', 'clothing_type', ['Femme']) && !M.champMemorisable('leboncoin', 'clothing_type', []), 'liste absente ou à une seule valeur : rien');
ok(!M.champMemorisable('beebs', 'clothing_type', VETEMENTS) && !M.champMemorisable('vinted', 'Département', DEPARTEMENT), 'la clé vaut pour SA plateforme seulement');

console.log('2. La pose');
const mem = M.indexerMemoire([
  { plateforme: 'leboncoin', compte: 'principal', categorie: 'Mode > Vêtements', champ: 'clothing_type', valeur: 'Femme', repondu_le: '2026-10-17T20:00:00Z', inventaire_id: 1 },
  { plateforme: 'leboncoin', compte: 'principal', categorie: 'Mode > Chaussures', champ: 'shoe_type', valeur: 'Bébé', repondu_le: '2026-10-17T20:00:00Z' },
  { plateforme: 'ebay', compte: 'principal', categorie: '63861', champ: 'Département', valeur: 'femme', repondu_le: '2026-10-17T20:00:00Z' },
]);
const vide = (allowedValues = VETEMENTS, extra = {}) => ({ key: 'clothing_type', label: 'Univers', state: 'missing', value: '', allowedValues, dedicatedTarget: 'univers', blocking: true, ...extra });
const poser = (ligne, extra = {}) => M.valeurDeMemoire({ memoire: mem, plateforme: 'leboncoin', categorie: 'Mode > Vêtements', ligne, textes: ['Pull bleu taille M', 'Très bon état'], ...extra });
ok(poser(vide())?.valeur === 'Femme', 'article B du même rayon, champ vide et requis : « Femme » posé sans question');
ok(poser(vide(), { textes: ['Robe femme fleurie'] })?.valeur === 'Femme', 'un texte qui dit le même public ne l\'empêche pas');
ok(poser(vide(), { textes: ['Chemise homme lin'] })?.ignoree === 'texte_autre_public', 'le titre dit « homme » : le texte du vendeur l\'emporte, la mémoire se tait');
ok(poser(vide(), { textes: ['Pull', 'Pour fille de 8 ans'] })?.ignoree === 'texte_autre_public', 'la description dit « fille » : la mémoire se tait');
ok(poser(vide(), { textes: ['Manteau en laine', 'Vêtements de marque, manches longues'] })?.valeur === 'Femme', '« manches », « vêtements » ne sont pas « man » / « men »');
ok(poser(vide(VETEMENTS, { state: 'ok', value: 'Homme' })) === null, 'jamais par-dessus une valeur posée (saisie, fiche, Lens, texte)');
ok(poser(vide(VETEMENTS, { state: 'invalid', value: 'Hommes' })) === null, 'jamais sur une valeur hors liste du vendeur (elle a son rapprochement)');
ok(poser(vide(VETEMENTS, { value: 'x' })) === null, 'jamais sur un champ qui porte déjà quelque chose');
ok(poser(vide(VETEMENTS, { blocking: false })) === null, 'jamais sur un champ non requis');
ok(poser(vide(VETEMENTS, { deduit: { valeur: 'Homme', source: 'fiche:categorie_vinted' } })) === null, 'jamais à la place d\'une déduction de la fiche ou du texte');
ok(poser(vide(['Homme', 'Enfant', 'Maternité'])) ?.ignoree === 'hors_liste', 'la valeur retenue n\'existe plus dans la grille : ignorée, la question revient');
ok(M.valeurDeMemoire({ memoire: mem, plateforme: 'leboncoin', categorie: 'Mode > Chaussures', ligne: { ...vide(CHAUSSURES), key: 'shoe_type' }, textes: [] })?.ignoree === 'hors_liste', '« Bébé » n\'est pas dans la grille Chaussures : ignorée');
ok(poser(vide(), { categorie: 'Mode > Accessoires & Bagagerie' }) === null, 'un autre rayon : rien');
ok(poser(vide(), { compte: 'boutique-2' }) === null, 'un autre compte de la plateforme : rien');
ok(poser(vide(), { plateforme: 'beebs' }) === null, 'une autre plateforme : rien');
ok(M.valeurDeMemoire({ memoire: new Map(), plateforme: 'leboncoin', categorie: 'Mode > Vêtements', ligne: vide() }) === null, 'mémoire vide : la question, comme avant');
const ebay = M.valeurDeMemoire({ memoire: mem, plateforme: 'ebay', categorie: '63861', ligne: { name: 'Département', state: 'missing', value: '', allowedValues: DEPARTEMENT }, textes: ['Robe longue'] });
ok(ebay?.valeur === 'Femme', 'eBay : la réponse retenue « femme » est rendue avec l\'écriture exacte de la grille (« Femme »)');
ok(M.valeurDeMemoire({ memoire: mem, plateforme: 'ebay', categorie: '63861', ligne: { name: 'Département', state: 'missing', value: '', allowedValues: DEPARTEMENT }, textes: ['Robe fille 6 ans'] })?.ignoree === 'texte_autre_public', 'eBay : « fille » dans le titre contre une mémoire « Femme » → rien');

console.log('3. La réponse');
ok(M.reponseARetenir({ plateforme: 'leboncoin', champ: 'clothing_type', allowedValues: VETEMENTS, valeur: 'Homme' }) === 'Homme', 'un choix dans la liste est retenu');
ok(M.reponseARetenir({ plateforme: 'leboncoin', champ: 'clothing_type', allowedValues: VETEMENTS, valeur: 'Hom' }) === null, 'une frappe en cours n\'est jamais retenue');
ok(M.reponseARetenir({ plateforme: 'leboncoin', champ: 'house_and_garden_type', allowedValues: DECO, valeur: 'Objet décoratif' }) === null, 'une réponse à un champ de l\'article n\'est jamais retenue');
const reponses = { 'leboncoin|clothing_type': { plateforme: 'leboncoin', champ: 'clothing_type', categorie: 'Mode > Vêtements', compte: 'principal', valeur: 'Homme' } };
const ecr = (extra = {}) => M.lignesAEcrire({ reponses, envoyees: ['leboncoin'], valeurFinale: () => 'Homme', memoire: mem, inventaireId: 42, ...extra });
ok(ecr().length === 1 && ecr()[0].valeur === 'Homme' && ecr()[0].inventaire_id === 42, 'au clic Publier : la nouvelle réponse remplace l\'ancienne (Femme → Homme)');
ok(ecr({ envoyees: ['vinted'] }).length === 0, 'plateforme non envoyée : rien de retenu');
ok(ecr({ valeurFinale: () => 'Enfant' }).length === 0, 'la copie partie porte une autre valeur : rien de retenu');
ok(M.lignesAEcrire({ reponses: { k: { ...reponses['leboncoin|clothing_type'], valeur: 'Femme' } }, envoyees: ['leboncoin'], valeurFinale: () => 'Femme', memoire: mem }).length === 0, 'même valeur que la mémoire : aucune ligne réécrite');
ok(M.lignesAEcrire({ reponses: { k: { ...reponses['leboncoin|clothing_type'], champ: 'taille' } }, envoyees: ['leboncoin'], valeurFinale: () => 'Homme', memoire: mem }).length === 0, 'un champ hors liste du module ne s\'écrit jamais');
const vis = M.posesMemoireVisibles({ posesMemoire: { 'leboncoin|clothing_type': { plateforme: 'leboncoin', champ: 'clothing_type', valeur: 'Femme', modifiee: null } }, genericRequiredStatus: { leboncoin: [{ key: 'clothing_type', state: 'ok', value: 'Femme' }] } });
ok(vis.length === 1 && vis[0].valeur === 'Femme', 'la pose se MONTRE tant que la copie la porte');
ok(M.posesMemoireVisibles({ posesMemoire: { 'leboncoin|clothing_type': { plateforme: 'leboncoin', champ: 'clothing_type', valeur: 'Femme', modifiee: null } }, genericRequiredStatus: { leboncoin: [{ key: 'clothing_type', state: 'missing', value: '' }] } }).length === 0, 'redevenue question (vidée) : c\'est la question qui la montre');

console.log('4. Le branchement');
const LPS = lire('src/components/ListingPreviewScreen.jsx');
const BQ = lire('src/publication/BlocQuestions.jsx');
const LOT = lire('src/publication/lot/LotPublication.jsx');
const iFiche = LPS.indexOf('const u = universLbcDeLaFiche({');
const iTexte = LPS.indexOf('let ded = deduireOptionDuTexte({ platform, key: a.key');
const iMem1 = LPS.indexOf('if (!ded) return avecMemoire(a);');
ok(iFiche > 0 && iTexte > iFiche && iMem1 > iTexte && LPS.includes('return avecMemoire(a);\n      });'), 'écran Publier : la mémoire APRÈS la fiche (Univers) et le texte, jamais avant');
ok(/source: "memoire"/.test(LPS) && LPS.includes('noterPoseMemoire(gp, a, d, genericCategoryKeys?.[gp] ?? null)'), 'la pose part par le même canal que l\'option lue dans le texte, tracée (option_du_texte, usage_logs memoire_categorie)');
ok(LPS.includes('const mem = valeurDeMemoire({') && LPS.indexOf('const mem = valeurDeMemoire({') > LPS.indexOf('const ded = deduireOptionDuTexte({ platform: "ebay"'), 'eBay : après le texte (le genre de la copie garde la priorité dans les défauts)');
ok(LPS.includes('const memoireRetenue = memoireCat === null;') && LPS.includes('if ((iaGeneriqueRetenue || memoireRetenue) && !champBloquantVus.current[k]) continue;'), 'télémétrie : rien de nouveau compté tant que la mémoire n\'est pas lue');
ok(LPS.includes('if (memoireCat === null) return false;'), 'le pilote du lot attend la mémoire avant de compter les questions');
ok(LPS.includes('reponses: reponsesQuestionsRef.current,') && LPS.includes('envoyees: rowsEnvoyees.map(r => r.platform),') && LPS.includes('await retenirReponses(supabase, userId, lignesMem)'), 'au clic Publier : retenu pour les plateformes envoyées seulement');
ok(LPS.includes('posesMemoire, noterReponseQuestion,') && LPS.includes('onReponseQuestion={noterReponseQuestion}'), 'moteur exposé aux nouveaux écrans, et à l\'ancien');
ok(BQ.includes('m.noterReponseQuestion?.(gp, a, v);') && BQ.includes('if (!a.sharedKey) m.noterReponseQuestion?.("ebay", a, v);') && BQ.includes('posesMemoireVisibles(m)'), 'questions : la réponse est notée, la pose se montre et se change');
ok(LOT.includes('m.noterReponseQuestion?.(e.gp, e.a, valeur);') && LOT.includes('blocProtege("poses_memoire"'), 'lot : la réponse commune est notée, la pose est dite et modifiable pour tout le groupe');
ok(lire('src/reglages/SousPagePreferences.jsx').includes('<MemoireRayons c={c} T={T} />') && lire('src/reglages/MemoireRayons.jsx').includes('viderMemoire(supabase, userId)'), 'Réglages › Préférences : voir, oublier, tout oublier');
const DATA = lire('src/utils/memoireChamps.js');
ok(!/setInterval/.test(DATA) && /range\(debut, debut \+ PAGE - 1\)/.test(DATA), 'lecture : une fois par compte, par pages, jamais d\'intervalle');

console.log('4 bis. L\'interrupteur (livré ÉTEINT : la preuve réelle n\'a pas pu être faite cette nuit)');
const D = await import(pathToFileURL(path.join(RACINE, 'src/utils/memoireChamps.js')).href);
const fauxClient = ({ beta = undefined, config = 0, lignes = [] } = {}) => {
  const journal = { lectures: 0, ecritures: 0 };
  const chaine = (table) => {
    const q = {
      _table: table,
      select() { return q; }, eq() { return q; }, order() { return q; }, gte() { return q; },
      range() { journal.lectures++; return Promise.resolve({ data: table === 'memoire_champs_categorie' ? lignes : [], error: null }); },
      maybeSingle() {
        if (table === 'profiles') return Promise.resolve({ data: { beta_flags: beta === undefined ? {} : { memoire_categorie: beta } }, error: null });
        if (table === 'coin_config') return Promise.resolve({ data: { value: config }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      upsert(rows) { journal.ecritures++; return { select: () => Promise.resolve({ data: rows, error: null }) }; },
      delete() { journal.ecritures++; return q; },
    };
    return q;
  };
  return { from: chaine, journal };
};
const LIGNE = { plateforme: 'leboncoin', compte: 'principal', categorie: 'Mode > Vêtements', champ: 'clothing_type', valeur: 'Femme' };
{
  const sb = fauxClient({ config: 0, lignes: [LIGNE] });
  const m = await D.chargerMemoire(sb, 'u-eteinte');
  const r = await D.retenirReponses(sb, 'u-eteinte', [LIGNE]);
  ok(m.size === 0 && sb.journal.lectures === 0 && D.memoireOuverteEnCache('u-eteinte') === false, 'éteinte (défaut, coin_config 0) : la table n\'est même pas lue, mémoire vide');
  ok(r.eteinte === true && sb.journal.ecritures === 0, 'éteinte : rien n\'est retenu au clic Publier');
  ok((await D.listerMemoire(sb, 'u-eteinte')) === null, 'éteinte : la section Réglages ne s\'affiche pas');
}
{
  const sb = fauxClient({ beta: true, config: 0, lignes: [LIGNE] });
  const m = await D.chargerMemoire(sb, 'u-beta');
  const r = await D.retenirReponses(sb, 'u-beta', [{ ...LIGNE, valeur: 'Homme' }]);
  ok(m.size === 1 && r.n === 1 && sb.journal.ecritures === 1, 'allumée pour UN compte (beta_flags.memoire_categorie) : lue et retenue');
}
{
  const sb = fauxClient({ beta: false, config: 1, lignes: [LIGNE] });
  ok((await D.chargerMemoire(sb, 'u-exclu')).size === 0, 'un compte exclu (beta false) reste éteint même ouverte à tous');
}
{
  const sb = fauxClient({ config: 1, lignes: [LIGNE] });
  ok((await D.chargerMemoire(sb, 'u-tous')).size === 1, 'ouverte à tous (coin_config 1) : lue');
}

console.log('5. La base');
const MIG = lire('supabase/migrations/20261018030000_memoire_champs_categorie.sql');
const check = [...MIG.matchAll(/\('(leboncoin|ebay|vinted|beebs|depop)', '([^']+)'\)/g)].map((m) => `${m[1]}|${m[2]}`).sort();
const module = Object.entries(M.CHAMPS_MEMOIRE).flatMap(([p, ch]) => ch.map((c) => `${p}|${c}`)).sort();
ok(JSON.stringify(check) === JSON.stringify(module), `la base refuse tout autre champ : CHECK = liste du module (${module.length})`);
ok(/ENABLE ROW LEVEL SECURITY/.test(MIG) && ['FOR SELECT', 'FOR INSERT', 'FOR UPDATE', 'FOR DELETE'].every((g) => MIG.includes(g)) && (MIG.match(/\(SELECT auth\.uid\(\)\)/g) ?? []).length >= 5, 'RLS : chacun ses lignes, sur les quatre gestes');
ok(/REVOKE ALL ON public\.memoire_champs_categorie FROM PUBLIC, anon;/.test(MIG) && /PRIMARY KEY \(user_id, plateforme, compte, categorie, champ\)/.test(MIG), 'anon exclu ; clé = utilisateur × compte × plateforme × catégorie × champ');
ok(existsSync(path.join(RACINE, 'supabase/rollbacks/20261018030000_memoire_champs_categorie.sql')), 'inverse présent');

console.log(`\n${total - echecs}/${total} ${echecs ? 'ÉCHECS' : 'OK'}`);
process.exit(echecs ? 1 : 0);
