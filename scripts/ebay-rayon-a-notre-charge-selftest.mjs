// selftest:ebay-rayon-a-notre-charge — (09/11, point 3 de Nico — contact.grizstyle)
// UN TROU DE CORRESPONDANCE eBay EST À NOTRE CHARGE, JAMAIS AU CLIENT.
//
//   npm run selftest:ebay-rayon-a-notre-charge
//
// Cas (voie API, needs_user « relancer » le 09/11 00:30) : « Lit bébé Sauthon » (Très bon état) dans 93391 « Lits,
// matelas, berceaux » (eBay : Neuf seulement, la reprise retombe sur le même rayon) ; « Lot femme M/L T40 – Last Queen
// + Neo Noir » (rayon de l'app « Robes » refusé, aucune suggestion retenue). Les deux disaient « Change l'icône ou le
// genre de l'article, puis relance ».
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `\n    ${d}` : ''}`); };

const R = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/ebay-rayon-a-notre-charge.js')).href);
const { FEUILLES } = await import(pathToFileURL(path.join(RACINE, 'src/utils/arbres/ebayFeuilles.js')).href);
const EJ = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/etat-job.js')).href);
const CB = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/cause-blocage.js')).href);

console.log('1. Un rayon qui accepte l\'état réel : les voisins de la même branche');
const v = R.rayonsVoisinsPourEtat('93391');
ok(v.length >= 1 && v[0].id === '58761' && v[0].chemin.join(' > ') === "Bébé, puériculture > Lits, équipements d'intérieur > Autres",
  `lit bébé (93391) : d'abord « Lits, équipements d'intérieur › Autres » (58761) — ${v.map((x) => x.id).join(', ')}`);
ok(v.every((x) => x.chemin[0] === 'Bébé, puériculture' && /^Autres/.test(x.chemin[x.chemin.length - 1])), 'jamais une autre racine, seulement des feuilles « Autres »');
ok(v.length <= R.VOISINS_MAX && R.VOISINS_MAX === 3, 'au plus 3 rayons vérifiés chez eBay par publication');
ok(R.rayonsVoisinsPourEtat('999999999').length === 0 && R.rayonsVoisinsPourEtat('').length === 0, 'rayon inconnu → aucun voisin (la règle d\'avant)');
ok(!R.rayonsVoisinsPourEtat('58761').some((x) => x.id === '58761'), 'jamais le rayon lui-même');
ok(FEUILLES.find((x) => x.id === '93391')?.chemin.join(' > ') === "Bébé, puériculture > Lits, équipements d'intérieur > Lits, matelas, berceaux", 'arbre relevé : 93391 est bien « Lits, matelas, berceaux »');

console.log('\n2. Un lot de vêtements sans rayon sûr : « Tenues, ensembles » de son genre');
const lot = R.rayonLotDeVetements({ titre: 'Lot femme M/L T40 – Last Queen + Neo Noir – Neuf – Valeur 184,95€', objet: 'lot de deux vêtements',
  cheminMappe: ['Vêtements, accessoires', 'Femme : vêtements, accessoires', 'Femme : vêtements', 'Robes'], genre: 'Femme' });
ok(lot?.id === '260011' && lot.chemin.join(' > ') === 'Vêtements, accessoires > Femme : vêtements, accessoires > Femme : vêtements > Tenues, ensembles', `grizstyle : ${lot?.id} « ${lot?.chemin.at(-1)} »`);
for (const [g, cible] of Object.entries(R.TENUES_ENSEMBLES)) {
  const f = FEUILLES.find((x) => x.id === cible.id);
  ok(f && f.chemin.join(' > ') === cible.chemin.join(' > '), `« Tenues, ensembles » ${g} (${cible.id}) existe dans l'arbre eBay France relevé`);
}
ok(R.rayonLotDeVetements({ titre: 'Lot 3 bodies', cheminMappe: ['Vêtements, accessoires', 'Bébé : vêtements, accessoires', 'Bébé : vêtements', 'Bodys'] })?.id === '260024', 'bébé → 260024');
ok(R.rayonLotDeVetements({ titre: 'Lot fille 8 ans', cheminMappe: ['Vêtements, accessoires', 'Enfant : vêtements, accessoires', 'Fille : vêtements, accessoires', 'Vêtements fille (2-16 ans)', 'Robes'] })?.id === '156801', 'fille → 156801');
ok(R.rayonLotDeVetements({ titre: 'Lot homme L', cheminMappe: ['Vêtements, accessoires', 'Homme : vêtements, accessoires', 'Homme : vêtements', 'Pulls'] }) === null, 'homme : aucun « Tenues, ensembles » chez eBay → la règle ne s\'applique pas');
ok(R.rayonLotDeVetements({ titre: 'Lot 2 doudous', cheminMappe: ['Jouets et jeux', 'Peluches, doudous', 'Lots'] }) === null, 'hors vêtements (doudous) → non');
ok(R.rayonLotDeVetements({ titre: 'Lot sacs', cheminMappe: ['Vêtements, accessoires', 'Femme : vêtements, accessoires', 'Femme : accessoires', 'Sacs'] }) === null, 'accessoires → non');
ok(R.rayonLotDeVetements({ titre: 'Robe Zara bleue', cheminMappe: ['Vêtements, accessoires', 'Femme : vêtements, accessoires', 'Femme : vêtements', 'Robes'] }) === null, 'pas un lot → non');
ok(R.rayonLotDeVetements({ titre: 'Câble USB-C (Unité ou Lot)', famille: 'mode' }) === null && R.estUnLot('Câble USB-C (Unité ou Lot)') === false, '« Unité ou Lot » n\'est pas un lot');
ok(R.rayonLotDeVetements({ titre: 'Lot femme', genre: 'Femme', cheminMappe: [], famille: 'mode' })?.id === '260011', 'sans rayon de l\'app : famille « mode » + genre de la fiche');
ok(R.rayonLotDeVetements({ ...{ titre: 'Lot femme', cheminMappe: ['Vêtements, accessoires', 'Femme : vêtements, accessoires', 'Femme : vêtements', 'Robes'] }, categorieSource: 'choix_humain' }) === null, 'le rayon choisi par la personne n\'est jamais remplacé');

console.log('\n3. Le trou qui reste : en pause, chez nous');
ok(EJ.SOURCES_AUTOMATIQUES[R.SOURCE_RAYON_A_NOTRE_CHARGE] === 'ebay_rayon', 'etat-job : source automatique « ebay_rayon »');
const j = { status: 'needs_user', platform: 'ebay', action: 'publish', platform_fields: { needs_user_source: R.SOURCE_RAYON_A_NOTRE_CHARGE }, error: R.messageRayonANotreCharge() };
const e = EJ.etatJob(j);
ok(e.etat === EJ.ETATS.EN_PAUSE && e.motif === 'ebay_rayon', `l'app le dit « En pause » (motif ${e.motif}), jamais « À toi de jouer »`);
const b = CB.blocagesDuJob(j);
ok(b.length && b[0].origine === CB.ORIGINE.NOUS && b[0].cause === 'categorie', 'la sentinelle le range chez nous (categorie)');
ok(/FillSell s'en occupe/.test(R.messageRayonANotreCharge()) && !/ic[ôo]ne|genre|relance/i.test(R.messageRayonANotreCharge()), 'le message ne demande ni icône, ni genre, ni relance');
const m1 = R.messageEtatRefuseParEbay('Très bon état', true);
ok(/n'accepte que des objets neufs/.test(m1) && /Rien n'a été envoyé à eBay/.test(m1) && !/ic[ôo]ne|genre|relance/i.test(m1), 'état refusé partout : la règle d\'eBay dite vraie, rien à faire');
const FDJ = lire('src/utils/fileDesJobs.js');
ok((FDJ.match(/ebay_rayon: "/g) ?? []).length === 2, 'fileDesJobs : le texte de la pause en français et en anglais');
ok(/ebay_rayon: ShieldCheck/.test(lire('src/components/FileDesJobs.jsx')), 'FileDesJobs : son icône');
ok(lire('chrome-extension/etat-job.js').includes('ebay_rayon_a_notre_charge: "ebay_rayon"'), 'copie de l\'extension régénérée (gen-etat-job-extension)');

console.log('\n4. Le rejeu des tâches déjà arrêtées');
const t = (pf, x = {}) => ({ status: 'needs_user', platform: 'ebay', action: 'publish', platform_fields: pf, ...x });
const lit = t({ needs_user_source: 'relancer', last_diagnostic: { etape: 'condition', quoi: 'etat_sans_correspondance' }, condition_relance_auto: { at: 'x' }, ebayCategorieAttente: { choix: [] } });
const lotJ = t({ needs_user_source: 'relancer', last_diagnostic: { etape: 'categorie', quoi: 'categorie_a_choisir' }, ebayCategorieAttente: { choix: [{ id: '63862' }] } });
ok(R.aRejouer(lit) && R.aRejouer(lotJ), 'les deux tâches de grizstyle sont rejouées');
ok(!R.aRejouer(t({ needs_user_source: 'relancer', last_diagnostic: { etape: 'categorie', quoi: 'categorie_a_confirmer' } })), '« Catégorie eBay à confirmer » (le choix de la personne) : jamais rejouée');
ok(!R.aRejouer(t({ needs_user_source: 'ebay_verification_identite', last_diagnostic: { etape: 'categorie', quoi: 'categorie_a_choisir' } })), 'une autre source (compte, connexion…) : jamais');
ok(!R.aRejouer({ ...lotJ, status: 'pending' }) && !R.aRejouer({ ...lotJ, platform: 'vinted' }) && !R.aRejouer({ ...lotJ, action: 'delete' }), 'needs_user eBay publication seulement');
const pfR = R.champsRejoues(lotJ.platform_fields, '2026-11-09T09:00:00Z');
ok(!('ebayCategorieAttente' in pfR) && !('needs_user_source' in pfR) && pfR.rayon_rejoue.version === R.REGLE_RAYON_VERSION,
  'rejouée SANS ebayCategorieAttente (sinon la relance prendrait « Manteaux, vestes et gilets » à l\'aveugle) et sans source');
ok(!('condition_relance_auto' in R.champsRejoues(lit.platform_fields)), 'le lit : sans la reprise déjà faite (les voisins puis la reprise rejouent)');
ok(!R.aRejouer(t({ ...lotJ.platform_fields, rayon_rejoue: { version: R.REGLE_RAYON_VERSION } })), 'une fois par version des règles, jamais en boucle');
ok(R.aRejouer(t({ needs_user_source: R.SOURCE_RAYON_A_NOTRE_CHARGE, last_diagnostic: { etape: 'categorie', quoi: 'categorie_a_choisir' }, rayon_rejoue: { version: '2026-01-01' } })), 'règles complétées (nouvelle version) : les pauses « chez nous » repartent');

console.log('\n5. ebay-api-worker : les règles branchées au bon endroit');
const W = lire('supabase/functions/ebay-api-worker/index.ts');
const iLot = W.indexOf('UN LOT DE VÊTEMENTS SANS RAYON SÛR PART EN « TENUES, ENSEMBLES »');
const iChoix = W.indexOf('if ("choix" in categorie) {\n    const mappee');
ok(iLot > 0 && iLot < iChoix && /if \("choix" in categorie && !categorie\.attente\) \{\s*const lot = rayonLotDeVetements\(/.test(W)
  && /categorie = \{ id: lot\.id, chemin: lot\.chemin, source: "lot_vetements"/.test(W), 'lot : avant la question, jamais sur une IA indisponible');
ok(/const aNotreCharge = sansMapping && !categorie\.attente;/.test(W) && /needs_user_source: SOURCE_RAYON_A_NOTRE_CHARGE/.test(W)
  && /error: aNotreCharge \? messageRayonANotreCharge\(\) : msg/.test(W) && /message_d_avant: msg/.test(W), 'aucun rayon sûr : en pause chez nous, le message d\'avant gardé au diagnostic');
const iVois = W.indexOf('UN RAYON QUI ACCEPTE L\'ÉTAT RÉEL DE L\'ARTICLE');
const iRep = W.indexOf('const dejaReprise = Boolean(pfCond.condition_relance_auto);');
ok(iVois > 0 && iVois < iRep && /for \(const v of rayonsVoisinsPourEtat\(categoryId\)\) \{\s*const cv = await conditionsCategorie\(env, token, v\.id\);\s*const ch = choisirCondition\(pf\.etat as string, cv\);/.test(W),
  'état : les voisins vérifiés chez eBay AVANT la reprise avec la proposition d\'eBay');
ok(/categoryId = v\.id;\s*condition = ch;\s*pf\.ebayCategoryPath = v\.chemin;\s*pf\.ebayCategoryId = v\.id;/.test(W) && /rayon_etat_reel: rayonEtat/.test(W), 'le rayon retenu part dans l\'offre et reste écrit sur le job (trace rayon_etat_reel)');
ok(/status: "cancelled",\s*error: messageEtatRefuseParEbay\(/.test(W) && /quoi: "etat_refuse_par_ebay"/.test(W)
  && !/Change l'icône ou le genre de l'article depuis sa fiche, puis relance d'un clic/.test(W), 'refus d\'eBay partout : close, message vrai — plus jamais « change l\'icône ou le genre »');
ok(/try \{ rayons = await rayonsANotreChargeRejouer\(admin\); \}/.test(W) && /\.filter\(aRejouer\)\.slice\(0, REJOUER_MAX_PAR_PASSAGE\)/.test(W)
  && /\.eq\("id", String\(j\.id\)\)\.eq\("status", "needs_user"\)\.select\("id"\)/.test(W), 'rejeu : à chaque passage, borné, écriture conditionnée au statut lu');

console.log(`\n${echecs ? '✗' : '✓'} selftest:ebay-rayon-a-notre-charge — ${total - echecs}/${total}`);
process.exit(echecs ? 1 : 0);
