// ═══════════════════════════════════════════════════════════════════════════
// JAMAIS UNE QUESTION SANS CHOIX, JAMAIS UN GESTE QUE L'APP N'OFFRE PAS — `npm run selftest:question-jamais-sans-choix`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A10bis, A3). Louis, « Moules noel » (11/10 19:57) : « Univers » et
// « Produit » affichaient « les valeurs viennent de son formulaire » au-dessus
// d'un champ VIDE ; l'Horloge puzzle : « choisis la sous-catégorie, bouton
// Compléter » — 13 choix dont 10 intermédiaires, une réponse ne pouvait pas
// aboutir. Règles contrôlées ici :
//   1. AspectValueInput : une liste connue se choisit TOUJOURS dans un vrai
//      sélecteur (jamais un <datalist>, invisible sur iPhone), quelle que soit
//      sa longueur ; « Autre valeur… » garde un retour vers la liste ;
//   2. une liste qui FAIT FOI est un sélecteur fermé (jamais « Autre valeur… ») ;
//   3. Maison & Jardin : le Produit attend son Univers (sa liste en dépend) ;
//   4. la question de rayon du moteur (A3) : des feuilles, liste certifiée
//      complète → sélecteur fermé dans « Compléter », chaque choix aboutit ;
//   5. « Arts de la table » (rupture du 04/10, commit 3561156) : le Produit
//      demandé après l'Univers, avec SA liste.
// Preuve à l'écran : node scripts/apercu/capture-question-horloge.mjs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

const lps = lire('src/components/ListingPreviewScreen.jsx');
const avi = lps.slice(lps.indexOf('export function AspectValueInput('), lps.indexOf('function StepPublish('));
console.log('1. AspectValueInput');
const branchesDatalist = (avi.match(/<datalist id=/g) ?? []).length;
verifier(branchesDatalist === 1 && /if \(texteLibre && !strict && n > 0\)/.test(avi), 'un seul <datalist> : le champ À RECHERCHE (marque, saisie libre par nature) — jamais une liste à choisir', `${branchesDatalist} datalist`);
verifier(/if \(n > 30 && !libre\) \{[\s\S]{0,400}<select/.test(avi), 'une liste de plus de 30 valeurs : un vrai sélecteur');
verifier(/\{libre && n > 0 && \([\s\S]{0,300}onClick=\{\(\) => setLibre\(false\)\}[\s\S]{0,400}Revenir à la liste/.test(avi), '« Autre valeur… » garde un retour vers la liste');
verifier(/\{!strict && <option value=\{OTHER_SENTINEL\}>Autre valeur…<\/option>\}/.test(avi), '« Autre valeur… » seulement hors liste fermée');

console.log('\n2. Une liste qui fait foi : sélecteur fermé');
verifier(/strict=\{faitFoi\}/.test(lire('src/publication/BlocQuestions.jsx')), 'BlocQuestions : strict quand la liste fait foi');
verifier(/strict=\{listeCertifieeComplete\}/.test(lire('src/tabs/StockTab.jsx')), '« Compléter » : strict quand le handler certifie la liste complète');

console.log('\n3. Maison & Jardin : le Produit attend son Univers');
verifier(/if \(feuilleRow && key === feuilleRow\.produitKey && rows\.some\(\(x\) => x\.field_key === feuilleRow\.typeKey\)/.test(lps) && /blocking: false, attendUnivers: feuilleRow\.typeKey/.test(lps), 'Univers vide : pas de question Produit (jamais la liste d’un autre Univers)');
const R = await import(pathToFileURL(join(RACINE, 'src/publication/moteur/regles.js')).href);
verifier(R.aspectBloquant({ state: 'missing', blocking: false, attendUnivers: 'x' }) === false, 'le Produit en attente ne bloque pas (l’Univers, lui, bloque)');
const MJ = await import(pathToFileURL(join(RACINE, 'src/utils/lbcMaisonJardin.js')).href);
const prodArts = MJ.lbcProduitsDependants('Maison & Jardin > Arts de la table', 'table_art_product', (k) => (k === 'table_art_type' ? 'Matériel de cuisine' : ''));
verifier(Array.isArray(prodArts) && prodArts.includes('Moule'), 'Arts de la table, Univers « Matériel de cuisine » : le Produit propose SA liste (« Moule »)');

console.log('\n4. La question de rayon du moteur (A3)');
const M = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/rayon-refuse-moteur.js')).href);
const feuilles = M.feuillesCandidates({ plateforme: 'vinted', base: ['Enfants', 'Jeux et jouets'] });
const q = M.questionRayonRefuse({ plateforme: 'vinted', base: ['Enfants', 'Jeux et jouets'], feuilles });
verifier(q.options_completes === true && q.input_type === 'selection_only' && q.allowed_values.length === feuilles.length && feuilles.length > 30, 'liste certifiée complète (sélecteur fermé, même à plus de 30 choix)');
verifier(q.allowed_values.every((v) => M.cheminDeLaReponse({ plateforme: 'vinted', base: ['Enfants', 'Jeux et jouets'], reponse: v })), 'chaque choix aboutit à une feuille réelle');
const S = await import(pathToFileURL(join(RACINE, 'src/utils/shared.js')).href);
verifier(S.needsUserOuvrable({ status: 'needs_user', platform_fields: { needsUserField: q } }), 'le bouton « Compléter » existe pour cette question');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
