// selftest:ebay-genre-choix-main — (19/11/2026 midi, décision de Nico)
// UN GENRE CHOISI OU TAPÉ À LA MAIN DANS LA CARTE eBAY L'EMPORTE SUR L'ÉTAGÈRE VINTED.
// Ordre : le choix de la personne à l'écran (tapé à la main compris), puis l'étagère Vinted, puis la déduction de l'app.
//
//   npm run selftest:ebay-genre-choix-main
//   (node --import ./scripts/loader-ext.mjs scripts/ebay-genre-choix-main-selftest.mjs)
//
// Le trou (rapport du 19/11 matin) : le champ « Genre » de la carte eBay écrivait `genre` sans aucune trace
// (noteSharedOverride ne retient que taille, couleur, matière, marque) ; l'étagère Vinted le recouvrait à la résolution.
// Ce que le verrou prouve :
//   1. la trace : posée par le GESTE de la personne dans la carte (CarteRayon, jamais par l'effet qui pose les valeurs
//      par défaut sur le même chemin onChampChange), lue par la règle commune (_shared/genre-etagere-vinted.js) ;
//   2. l'app (resolutionPublication.js, vraie cascade hors ligne) : « Homme » tapé sur une étagère Femmes → Homme, même
//      quand le texte dit « femme » ; la trace part avec la tâche ; sans trace → l'étagère, comme aujourd'hui ;
//   3. le serveur (ebay-genre-apres-refus.js, lu par ebay-api-worker après un refus) : la même chose.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `\n    ${d}` : ''}`); };
const charger = async (f) => { try { return await import(pathToFileURL(path.join(RACINE, f)).href); } catch (e) { return { __absent: String(e?.message ?? e).slice(0, 200) }; } };
const appel = (M, n, ...a) => { try { return typeof M?.[n] === 'function' ? M[n](...a) : undefined; } catch (e) { return { __erreur: e.message }; } };

const R = await charger('supabase/functions/_shared/genre-etagere-vinted.js');
const VB = await charger('supabase/functions/_shared/vinted-branche.ts');
const GAR = await charger('supabase/functions/_shared/ebay-genre-apres-refus.js');
const RP = await charger('src/utils/resolutionPublication.js');

// L'étagère Femmes d'un manteau : 2527 « Femmes › Vêtements › … › Perfectos et blousons de moto ».
const ETAGERE_FEMMES = { v: 2527, source: 'vinted_detail', at: '2026-11-19T09:00:00.000Z' };
const eFemmes = appel(R, 'etagereDeLaFiche', { categorieVinted: ETAGERE_FEMMES, colonne: 2527 }, VB.brancheVinted);
const LE = '2026-11-19T11:00:00.000Z';

console.log("1. La trace : posée par le GESTE de la personne, jamais par une valeur par défaut");
ok(!R.__absent, 'la règle commune se charge', R.__absent);
ok(eFemmes?.genre === 'Femme', `étagère 2527 → public « Femme » (${JSON.stringify(eFemmes)})`);
ok(typeof R.TRACE_GENRE_CHOISI === 'string' && R.TRACE_GENRE_CHOISI.length > 0, `la clé de la trace est nommée une fois (${R.TRACE_GENRE_CHOISI})`);
const T = R.TRACE_GENRE_CHOISI ?? '__trace_absente__';
const geste = appel(R, 'champsDuGesteDeLaPersonne', 'ebay', 'genre', 'Homme', LE);
ok(Array.isArray(geste) && geste.length === 1 && geste[0][0] === T && geste[0][1]?.genre === 'Homme' && geste[0][1]?.le === LE,
  `« Homme » choisi dans la carte eBay → la trace { genre, le } (${JSON.stringify(geste)})`);
const vide = appel(R, 'champsDuGesteDeLaPersonne', 'ebay', 'genre', '', LE);
ok(Array.isArray(vide) && vide.length === 1 && vide[0][0] === T && vide[0][1] === null, 'genre vidé par la personne → la trace part (null)');
ok(Array.isArray(appel(R, 'champsDuGesteDeLaPersonne', 'ebay', 'taille', 'M', LE)) && appel(R, 'champsDuGesteDeLaPersonne', 'ebay', 'taille', 'M', LE).length === 0, 'un autre champ : aucune trace');
ok(Array.isArray(appel(R, 'champsDuGesteDeLaPersonne', 'vinted', 'genre', 'Homme', LE)) && appel(R, 'champsDuGesteDeLaPersonne', 'vinted', 'genre', 'Homme', LE).length === 0, 'une autre plateforme : aucune trace (la règle est celle d\'eBay)');
// CarteRayon : le geste passe par changerParLaPersonne, l'effet des valeurs par défaut par onChampChange tout court.
const CR = lire('src/components/CarteRayon.jsx');
const iDef = CR.indexOf('const defautsPoses = useRef(new Set());');
const blocDefauts = iDef > 0 ? CR.slice(iDef, CR.indexOf('}, [defauts, onChampChange, platform, cle]);', iDef)) : '';
ok(/onChampChange\(d\.cleNotre, d\.valeur, d\.cle\);/.test(blocDefauts) && !/changerParLaPersonne/.test(blocDefauts),
  "CarteRayon : l'effet des valeurs par défaut écrit sans trace (onChampChange seul)");
ok(/from '\.\.\/\.\.\/supabase\/functions\/_shared\/genre-etagere-vinted\.js'/.test(CR) && /const changerParLaPersonne = /.test(CR)
  && /champsDuGesteDeLaPersonne\(platform, cleNotre, valeur/.test(CR), 'CarteRayon : le geste de la personne passe par la règle commune (changerParLaPersonne)');
const gestes = CR.match(/(toucherQuestion|epingler)\([a-z]\.cle\); [a-zA-Z?.]+\(/g) ?? [];
ok(gestes.length >= 6 && gestes.every((g) => /changerParLaPersonne\($/.test(g)), `les ${gestes.length} gestes de la carte (questions et « déjà rempli ») posent la trace`, JSON.stringify(gestes));
// ListingPreviewScreen : la carte écrit n'importe quelle clé de notre copie — la trace atteint `edited` sans ligne de plus.
const LPS = lire('src/components/ListingPreviewScreen.jsx');
ok(/onChampChange=\{\(cleNotre, valeur, cleCatalogue\) => \{[\s\S]{0,1600}?else if \(cleNotre\) \{\s*pf\[cleNotre\] = valeur;/.test(LPS),
  "l'écran range la clé telle quelle sur la copie (pf[cleNotre] = valeur) : la trace part avec elle, au brouillon et à la tâche");

console.log('\n2. La règle : le choix de la personne, puis l\'étagère, puis la déduction');
const pfTape = { genre: 'Homme', [T]: { genre: 'Homme', le: LE } };
ok(appel(R, 'genreSaisiParLaPersonne', pfTape) === true, 'genre tapé (trace = genre de la copie) : choix de la personne');
ok(appel(R, 'genreSaisiParLaPersonne', { genre: 'Femme', [T]: { genre: 'Homme', le: LE } }) === false, 'trace périmée (le genre a bougé depuis, sans la personne) : plus un choix');
ok(appel(R, 'genreSaisiParLaPersonne', { genre: 'Homme' }) === false, 'sans trace : pas un choix');
ok(appel(R, 'genreDeLEtagere', { genre: 'Homme', pf: pfTape, etagere: eFemmes }) === null, "l'étagère se tait devant un genre tapé");
const av = appel(R, 'genreAvantDeduction', { genre: 'Homme', pf: pfTape, etagere: eFemmes });
ok(av?.genre === 'Homme' && av?.source === 'choix' && av?.change === false, `genreAvantDeduction : le choix d'abord (${JSON.stringify(av)})`);
const sansChoix = appel(R, 'genreAvantDeduction', { genre: 'Homme', pf: { genre: 'Homme' }, etagere: eFemmes });
ok(sansChoix?.genre === 'Femme' && sansChoix?.source === 'etagere_vinted', `sans choix : l'étagère, comme aujourd'hui (${JSON.stringify(sansChoix)})`);
ok(appel(R, 'genreAvantDeduction', { genre: 'Homme', pf: { genre: 'Homme' }, etagere: null }) === null, 'ni choix ni étagère : null (la déduction d\'avant)');

console.log("\n3. L'app : resolutionPublication.js (vraie cascade, hors ligne)");
const fauxSupabase = {
  functions: { invoke: async () => ({ data: null, error: { message: 'hors ligne (selftest)' } }) },
  from: () => { const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, order: () => q, maybeSingle: async () => ({ data: null }), then: (r) => r({ data: [] }) }; return q; },
};
const outils = { platformFieldsConfig: {}, isConditionKey: () => false, defaultConditionFor: () => null, GENERIC_ASPECTS_PF_KEY: {},
  normAspectVal: (s) => s, resolveArticleIcon: () => '🧥', resolveArticleIconDetail: () => ({ icon: '🧥', source: 'ia' }), OPLA_ETAT_PAR_LIBELLE: {} };
const logs = console.log, warns = console.warn;
const silence = async (fn) => { console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = logs; console.warn = warns; } };
const TITRE = 'Parka longue NikeLab ACG Gore-Tex taille S kaki olive';
const article = ({ pfEbay = {}, titreVinted = TITRE, etagere = true } = {}) => {
  const genres = { vinted: 'Femme', beebs: 'Femme', ebay: 'Homme' };
  const edited = Object.fromEntries(Object.keys(genres).map((p) => [p, { title: p === 'vinted' ? titreVinted : TITRE, description: 'Superbe parka longue.',
    platform_fields: { genre: genres[p], etat: 'Neuf avec étiquette', marque: 'Nike', ...(p === 'ebay' ? pfEbay : {}) } }]));
  return { plateformes: Object.keys(genres), selected: new Set(Object.keys(genres)), edited,
    initialListing: { titre: TITRE, description: 'Superbe parka longue.', vinted_catalog_id: etagere ? 2527 : null, attributs: etagere ? { categorie_vinted: ETAGERE_FEMMES } : {} },
    sharedFields: {}, sharedOverrides: {}, activeAiIcon: '🧥', activeAiObjet: 'parka', origineCat: null, lang: 'fr', supabase: fauxSupabase, ebayVoieApi: true, outils };
};
const resoudre = async (ctx) => { try { return typeof RP.resoudrePublication === 'function' ? await silence(() => RP.resoudrePublication(ctx)) : null; } catch (e) { return { __erreur: e.message }; } };
const ebay = (r) => r?.pfParPlateforme?.ebay ?? {};
{
  const tape = await resoudre(article({ pfEbay: { [T]: { genre: 'Homme', le: LE } } }));
  ok(ebay(tape).genre === 'Homme' && String(ebay(tape).ebayCategoryId) === '57988', `« Homme » tapé sur une étagère Femmes → Homme, 57988 (${ebay(tape).genre}, ${ebay(tape).ebayCategoryId})`);
  ok(ebay(tape)[T]?.genre === 'Homme' && !ebay(tape).genre_de_l_etagere, 'la trace part avec la tâche (le serveur la lit), aucune trace d\'étagère');
  const tapeTexte = await resoudre(article({ pfEbay: { [T]: { genre: 'Homme', le: LE } }, titreVinted: 'Parka longue femme NikeLab ACG' }));
  ok(ebay(tapeTexte).genre === 'Homme', `et même quand le texte dit « femme » : le choix passe avant la déduction (${ebay(tapeTexte).genre})`);
  const sansTexteNiEtagere = await resoudre(article({ pfEbay: { [T]: { genre: 'Homme', le: LE } }, titreVinted: 'Parka longue femme NikeLab ACG', etagere: false }));
  ok(ebay(sansTexteNiEtagere).genre === 'Homme', `sans étagère, le texte « femme » ne retourne pas non plus un genre tapé (${ebay(sansTexteNiEtagere).genre})`);
  const sansChoixApp = await resoudre(article());
  ok(ebay(sansChoixApp).genre === 'Femme' && ebay(sansChoixApp).genre_de_l_etagere?.avant === 'Homme', `sans choix : l'étagère Femmes, comme aujourd'hui (${ebay(sansChoixApp).genre})`);
  const perime = await resoudre(article({ pfEbay: { [T]: { genre: 'Femme', le: LE } } }));
  ok(ebay(perime).genre === 'Femme', `trace périmée (elle dit « Femme », la copie « Homme ») : l'étagère, comme sans choix (${ebay(perime).genre})`);
}

console.log('\n4. Le serveur : ebay-genre-apres-refus.js (ebay-api-worker, après un refus)');
const GR = (x) => appel(GAR, 'genreApresRefus', x);
const PFR = { categorie_icone: '🧥', categorie_source: 'icone_non_confirmee' };
ok(GR({ genre: 'Homme', titre: 'Parka longue femme Nike', pf: { ...PFR, genre: 'Homme', [T]: { genre: 'Homme', le: LE } }, etagere: eFemmes })?.genre === 'Homme',
  '« Homme » tapé, étagère Femmes, titre « femme » → Homme');
ok(GR({ genre: 'Homme', titre: TITRE, pf: { ...PFR, genre: 'Homme' }, etagere: eFemmes })?.genre === 'Femme', "sans choix : l'étagère, comme aujourd'hui");
ok(GR({ genre: 'Homme', titre: 'Parka longue femme Nike', pf: { ...PFR, genre: 'Homme' }, etagere: null })?.genre === 'Femme', 'ni choix ni étagère : le texte, comme avant');
const W = lire('supabase/functions/_shared/ebay-genre-apres-refus.js');
ok(/import \{ genreAvantDeduction \} from "\.\/genre-etagere-vinted\.js"/.test(W) && /genreAvantDeduction\(\{ genre: g, pf, etagere, genreRequis: true \}\)/.test(W),
  'le serveur lit la même règle (genreAvantDeduction de la règle commune : le choix, puis l\'étagère)');
const A = lire('src/utils/resolutionPublication.js');
ok(/genreAvantDeduction\(\{ genre: edited\.ebay\.platform_fields\.genre/.test(A) && /if \(p === "ebay" && ebayGenreAvantDeduction\) continue;/.test(A),
  "l'app lit la même règle avant la règle du texte (genreAvantDeduction)");

console.log(`\n${echecs ? '✗' : '✓'} selftest:ebay-genre-choix-main — ${total - echecs}/${total}`);
process.exit(echecs ? 1 : 0);
