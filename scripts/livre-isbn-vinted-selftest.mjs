// ═══════════════════════════════════════════════════════════════════════════
// UN LIVRE NE PART JAMAIS SUR VINTED SANS ISBN, NI SANS LE DIRE — `npm run selftest:livre-isbn-vinted`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (Morgane, inscrite le 11/10 21:27, livres importés de Leboncoin).
// « Blake & Mortimer – Le Mystère de la Grande Pyramide » (BD 5425) est parti
// avec "isbn":null → Vinted 400 « Merci d'entrer un numéro ISBN valide ».
// Causes établies (lecture des traces) :
//   1. l'ISBN n'était lu ni dans l'annonce ni sur les photos (la rédaction est
//      texte seul, l'ISBN ne venait que de Lens) ;
//   2. la réponse tapée atterrissait dans vintedAspects.isbn, pas pf.isbn ;
//   3. aucune règle « livre = ISBN » : le catalogue avait appris la ligne isbn
//      des BD en « facultatif » (et n'en avait aucune pour « Enfants et jeunes
//      adultes » ni « Manuels scolaires ») ; le filet serveur ne connaissait que
//      la couleur et la marque ;
//   4. eBay « compte à finir » : aucun lien vers ce qui reste à faire.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const X = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/vinted-exigences.js')).href);
const I = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/isbn.js')).href);
const S = await import(pathToFileURL(join(RACINE, 'src/utils/shared.js')).href);
let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

console.log('1. La règle : tout « Livres › … » exige l’ISBN, sauf le coloriage');
const L = (...c) => ['Livres et médias', 'Livres', ...c];
for (const [chemin, id] of [[L('Fiction'), 2319], [L('Non-fiction'), 2320], [L('Enfants et jeunes adultes', 'Jeunes adultes'), 2363], [L('Enfants et jeunes adultes', 'Enfants'), 2364], [L('Enfants et jeunes adultes', 'Bébés'), 2365], [L('Bandes dessinées, mangas et romans graphiques'), 5425], [L('Manuels scolaires et ressources pédagogiques'), 5426]]) {
  verifier(X.vintedExigeUnIsbn(chemin, id) === true, `${chemin.slice(2).join(' › ')} (${id}) : ISBN exigé`);
}
verifier(X.vintedExigeUnIsbn(L("Livres de coloriage et d'activités et revues de jeux"), 5427) === false, 'Coloriage (5427) : jamais d’ISBN');
verifier(!X.vintedExigeUnIsbn(['Livres et médias', 'Magazines'], 5424) && !X.vintedExigeUnIsbn(['Livres et médias', 'Musique', 'CD'], 3039) && !X.vintedExigeUnIsbn(['Livres et médias', 'Vidéo', 'DVD'], 3045), 'Magazines, CD, DVD : jamais d’ISBN');
verifier(!X.vintedExigeUnIsbn(['Femmes', 'Vêtements', 'Robes']) && !X.vintedExigeUnIsbn([]), 'hors livres, ou sans rayon : rien');
verifier(X.ISBN_ABSENT === "Ce livre n'a pas d'ISBN", 'la réponse fermée « Ce livre n’a pas d’ISBN »');

console.log('\n2. Les données réelles de Morgane');
verifier(I.resoudreIsbn({ description: 'Edition 1999 \nBlack et Mortimer - Edgar P.Jacobs', titre: 'Blake & Mortimer - Le Mystère de la Grande Pyramide - Tome 1' }) === null, 'Blake & Mortimer : aucun ISBN dans le texte → la question (photos lues d’abord)');
for (const isbn of ['978-2226116680', '978-2-253-17415-8', '2-290-30078-0']) verifier(I.normalizeIsbn(isbn).ok, `ISBN saisi par Morgane « ${isbn} » : valide (ses 3 livres partis)`);

console.log('\n3. L’ISBN se lit sur les photos (_shared/isbn-ia.ts)');
const ia = lire('supabase/functions/_shared/isbn-ia.ts');
verifier(/const texte = resoudreIsbn\(\{ description, titre \}\);/.test(ia) && /if \(texte\) return/.test(ia), 'le texte d’abord, sans IA');
verifier(/const n = normalizeIsbn\(brut\);\s*\n\s*if \(!n\.ok\) return/.test(ia) && /if \(!\/\^97\[89\]\/\.test\(n\.isbn13\)\)/.test(ia), 'la réponse de l’IA n’est retenue que valide (clé) et en 978/979 — jamais un ISBN inventé');
const gl = lire('supabase/functions/generate-listing/index.ts');
verifier(/if \(body\.resolve_isbn === true\) \{/.test(gl) && /photosPourCouleurIA\(body\.photos, supabaseUrl, 4\)/.test(gl) && /feature: "isbn_auto"/.test(gl) && />= 400\) return json\(\{ isbn: null/.test(gl), 'generate-listing : mode resolve_isbn (1 à 4 photos, mesure isbn_auto, plafond 400/24 h)');

console.log('\n4. L’app : lue avant d’être demandée, la règle avant le catalogue');
const lps = lire('src/components/ListingPreviewScreen.jsx');
verifier(/if \(platform === "vinted" && vintedExigeUnIsbn\(String\(key\)\.split\(" > "\)\)\) \{\s*\n\s*rows = \[\.\.\.rows\.filter\(r => r\.field_key !== "isbn"\), \{ field_key: "isbn"[^\n]*allowed_values: \[ISBN_ABSENT\], synthetique: "vinted_isbn_exige" \}\];/.test(lps), 'ligne ISBN posée par la RÈGLE (remplace une ligne « facultative » du catalogue), avec « Ce livre n’a pas d’ISBN »');
verifier(/material: "matiere", isbn: "isbn" \}\[key\]/.test(lps), 'la réponse va dans pf.isbn (parallèle exact de genericKnownSource)');
verifier(/body: \{ resolve_isbn: true, photos: photosIa/.test(lps) && /const texte = resoudreIsbn\(\{ article: isbnFiche, description, titre \}\);/.test(lps) && /setIaGeneriqueEnVol\(n => n \+ 1\);/.test(lps), 'avant la question : texte puis photos (le lot attend la lecture)');
verifier(/if \(String\(pf\.isbn \?\? ""\)\.trim\(\) \|\| String\(pf\.vintedAspects\?\.isbn \?\? ""\)\.trim\(\)\) return prev;/.test(lps), 'jamais par-dessus une saisie');
const rp = lire('src/utils/resolutionPublication.js');
verifier(/pf\.isbn_absent = true;\s*\n\s*delete pf\.isbn;/.test(rp), '« Ce livre n’a pas d’ISBN » devient isbn_absent : jamais tapé chez Vinted');
// (18/10, eBay ÷ 5) L'issue se décide dans moteur/regles (issueQuestionDisparue) : « retiree » quand le rayon
// change, « plateforme_decochee » quand la plateforme est décochée, « complete » sinon.
verifier(/const issue = issueQuestionDisparue\(\{ plateformeCochee: selected\.has\(vu\.platform\), rayonChange \}\);\s*logChampBloquant\(issue,/.test(lps)
  && /return rayonChange \? "retiree" : "complete";/.test(lire('src/publication/moteur/regles.js')), 'mesure : une question retirée par un changement de rayon n’est plus comptée « complétée »');
const bq = lire('src/publication/BlocQuestions.jsx');
verifier(/allowedValues=\{gp === "vinted" && a\.key === "isbn" \? \[\] : a\.allowedValues\}/.test(bq) && /onClick=\{\(\) => ecrire\(ISBN_ABSENT\)\}/.test(bq), 'stepper et lot : l’ISBN se tape (jamais derrière « Autre valeur… »), « Ce livre n’a pas d’ISBN » en un tap');
const st = lire('src/tabs/StockTab.jsx');
verifier(/\{f\?\.field_key === "isbn" \? \(/.test(st) && /aria-label=\{lang === "en" \? "ISBN" : "ISBN du livre"\}/.test(st) && /allowed\.includes\("Ce livre n'a pas d'ISBN"\)/.test(st), '« Compléter » : un vrai champ ISBN, l’aide, et « Ce livre n’a pas d’ISBN » quand la question le permet (aperçu : capture-question-isbn)');

console.log('\n5. Le serveur : aucun départ sans ISBN, ni sans le dire');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
const filet = gpj.slice(gpj.indexOf('UN LIVRE NE PART JAMAIS SANS ISBN, NI SANS LE DIRE'), gpj.indexOf('const libelles = champs.map((c) => String(c.field_label));'));
verifier(/if \(vintedExigeUnIsbn\(chemin,/.test(filet) && /resoudreIsbn\(\{ reponse: reponse === ISBN_ABSENT \? null : reponse, capture: pf\.isbn, article: isbnFiche, description:/.test(filet), 'get-pending-jobs : l’ISBN cherché partout (réponse, job, fiche, description, titre) avant toute question');
verifier(/pf\.isbn = r\.isbn13;\s*\n\s*pf\.vintedAspects = \{ \.\.\.aspects, isbn: r\.isbn13 \};/.test(filet), 'trouvé : posé là où l’extension le lit (pf.isbn ET vintedAspects.isbn)');
verifier(/else if \(pf\.isbn_absent === true \|\| reponse === ISBN_ABSENT\)/.test(filet) && /pfIsbnAbsent/.test(filet), '« Ce livre n’a pas d’ISBN » (réponse ou champ dédié) : départ assumé, jamais l’option tapée');
verifier(/isbnManque = true;/.test(filet) && /champs\.push\(\{ field_key: "isbn", field_label: "ISBN", allowed_values: \[ISBN_ABSENT\]/.test(gpj) && /pf\.isbn_a_lire_photos = /.test(gpj), 'sinon : la question AVANT tout essai, avec « Ce livre n’a pas d’ISBN », et les photos à lire');
verifier(/n'est pas valide \(un chiffre manque ou est de trop \?\)/.test(gpj), 'un ISBN saisi invalide est dit, jamais envoyé');
const hw = lire('supabase/functions/handler-watch/index.ts');
const bloc = hw.slice(hw.indexOf("L'ISBN D'UN LIVRE SE LIT SUR SES PHOTOS AVANT DE LE DEMANDER"), hw.indexOf('LA RECONNEXION FAIT REPARTIR LES JOBS'));
verifier(/\.eq\("platform_fields->needsUserField->>field_key", "isbn"\)/.test(bloc) && /resoudreIsbnArticle\(/.test(bloc) && /update\(\{ status: "pending", error: null, platform_fields: pf \}\)/.test(bloc), 'handler-watch : ISBN lisible sur les photos → posé, le job repart SEUL');
verifier(/allowed_values: dejaRefuseSansIsbn \? \[\] : \[ISBN_ABSENT\]/.test(bloc) && /Vinted a refusé ce livre sans ISBN/.test(bloc), 'illisible : question complète ; déjà refusé sans ISBN par Vinted → plus cette option, et le message le dit');
verifier(!/sonde|HTTP 400|payload/i.test((bloc.match(/const message = [\s\S]*?;\n/) ?? [''])[0]), 'messages sans jargon (ni sonde, ni HTTP, ni JSON)');
verifier(/\.slice\(0, 6\)/.test(bloc) && /isbn_photos_lu/.test(bloc), 'borné (6 par passage), une seule lecture par job');

console.log('\n6. eBay « compte à finir » : le lien direct');
const ev = lire('supabase/functions/_shared/ebay-voie.ts');
verifier(/export const LIEN_EBAY_VENDEUR = "https:\/\/www\.ebay\.fr\/sh\/ovw";/.test(ev) && /export const LIEN_EBAY_CONDITIONS = "https:\/\/www\.ebay\.fr\/bp\/manage";/.test(ev), 'liens VÉRIFIÉS seulement (Seller Hub, conditions de vente)');
verifier(/C'est ici : \$\{etape\.url\}/.test(ev), 'le message porte le lien de l’étape qui reste');
const w = lire('supabase/functions/ebay-api-worker/index.ts');
verifier(!/MESSAGE_EBAY_COMPTE_A_FINIR/.test(w) && (w.match(/messageEbayCompteAFinir\(/g) ?? []).length === 2 && /ebay_a_finir/.test(w), 'ebay-api-worker : les deux parcages disent l’étape et son lien');
const l1 = S.lienVerificationEbay({ platform: 'ebay', status: 'needs_user', platform_fields: { needs_user_source: 'ebay_compte_a_finir', ebay_a_finir: { etape: 'conditions', url: 'https://www.ebay.fr/bp/manage' } } }, 'fr');
const l2 = S.lienVerificationEbay({ platform: 'ebay', status: 'needs_user', platform_fields: { needs_user_source: 'ebay_compte_a_finir' } }, 'fr');
verifier(l1?.url === 'https://www.ebay.fr/bp/manage' && /conditions de vente/.test(l1.libelle) && l2?.url === 'https://www.ebay.fr/sh/ovw', 'l’app : un bouton vers la page eBay (conditions, ou Seller Hub pour un job d’avant)');
verifier(S.lienVerificationEbay({ platform: 'ebay', status: 'needs_user', platform_fields: { needs_user_source: 'ebay_compte_a_finir', ebay_a_finir: { url: 'https://evil.example/' } } }, 'fr')?.url === 'https://www.ebay.fr/sh/ovw', 'jamais un lien hors ebay.fr');
verifier(S.lienVerificationEbay({ platform: 'ebay', status: 'needs_user', platform_fields: { needs_user_source: 'ebay_connexion_requise' } }, 'fr') === null, '« connexion requise » : pas de lien eBay (le geste est « Relier mon compte »)');
// (17/10) Plafond de vente eBay à zéro : le Seller Hub, nommé comme tel ; ce qui
// se règle DANS FillSell (choisir ses conditions, ses retours) : aucun lien eBay.
const l3 = S.lienVerificationEbay({ platform: 'ebay', status: 'needs_user', platform_fields: { needs_user_source: 'ebay_compte_a_finir', ebay_a_finir: { etape: 'plafond', url: 'https://www.ebay.fr/sh/ovw' } } }, 'fr');
verifier(l3?.url === 'https://www.ebay.fr/sh/ovw' && /compte vendeur/.test(l3.libelle) && /plafond de vente/.test(l3.aide), 'plafond à zéro : « Ouvrir mon compte vendeur eBay », et l’aide le nomme');
verifier(['parcours', 'retours'].every((etape) => S.lienVerificationEbay({ platform: 'ebay', status: 'needs_user', platform_fields: { needs_user_source: 'ebay_compte_a_finir', ebay_a_finir: { etape, url: null } } }, 'fr') === null),
  'à choisir dans FillSell (conditions, retours) : pas de lien eBay');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
