// ═══════════════════════════════════════════════════════════════════════════
// UNE CATÉGORIE REFUSÉE PAR LA PLATEFORME : LE MOTEUR CHOISIT — `npm run selftest:rayon-refuse-moteur`
// ═══════════════════════════════════════════════════════════════════════════
// 12/10 (A3) : l'« Horloge puzzle en bois » de Louis, republication Vinted
// arrêtée AVANT tout retrait parce que Vinted a découpé « Enfants › Jeux et
// jouets » en sous-rayons. Règle (supabase/functions/_shared/rayon-refuse-moteur.js) :
//   1. le cas du job est reconnu (Vinted niveau intermédiaire, Beebs rayon
//      absent de la copie, Leboncoin rayon refusé au pré-vol) ;
//   2. le moteur ne choisit QUE parmi les feuilles réelles sous le rayon
//      d'origine (Vinted), celles que Vinted propose encore (catalogue vivant),
//      jamais d'un autre genre que celui de la fiche ; une réponse de l'IA hors
//      de la liste est refusée ; null = doute ;
//   3. le choix se pose là où l'extension le lit (copie / champ du job), la
//      question est retirée, l'étape ne bouge pas (le pré-vol refait son
//      contrôle avant tout retrait) ;
//   4. la question de dernier recours propose des FEUILLES (une réponse
//      suffit), traduite en chemin complet avant de servir le job ;
//   5. le câblage : handler-watch (choix, recapture, doute borné) et
//      get-pending-jobs (réponse traduite, recapture) importent le module.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(pathToFileURL(join(RACINE, 'supabase/functions/_shared/rayon-refuse-moteur.js')).href);
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');

let ko = 0, ok = 0;
const verifier = (c, quoi, detail = '') => { if (c) { ok++; console.log(`  ✓ ${quoi}`); } else { ko++; console.log(`  ✗ ${quoi}${detail ? `   ← ${detail}` : ''}`); } };

const VIVANTS_1499 = ['Figurines et accessoires', 'Loisirs créatifs', 'Activités et jouets pour bébé', 'Jeux de construction', 'Poupées, poupons et accessoires', 'Déguisements et jeux de rôle', 'Jeux éducatifs', 'Jeux et jouets électroniques', 'Jeux/jouets musicaux et instruments', 'Jeux de cirque, fidgets et gadgets', 'Jeux de sport et de plein air', 'Peluches', 'Voitures, trains et autres véhicules'];
const horloge = {
  id: '16f1721d', platform: 'vinted', action: 'republish', status: 'needs_user',
  platform_fields: {
    capture_id: '13093', republish_step: 'captured', needs_user_source: 'prevol_negatif',
    needsUserField: { field_key: 'categoryLevelChoice', allowed_values: VIVANTS_1499 },
    needsUserBoucle: { categoryLevelChoice: { n: 2 } }, champs_a_completer: ['Catégorie Vinted'],
    republish_snapshot: { categoryPath: ['Enfants', 'Jeux et jouets'], catalog_id: 1499 },
  },
};

console.log('1. Le cas du job');
const plan = M.rayonRefuseDuJob(horloge);
verifier(plan?.plateforme === 'vinted' && plan.base.join('>') === 'Enfants>Jeux et jouets', 'Horloge : Vinted, rayon d’origine « Enfants › Jeux et jouets »');
verifier(M.rayonRefuseDuJob({ ...horloge, status: 'pending' }) === null, 'un job qui ne pose pas la question : pas son cas');
verifier(M.rayonRefuseDuJob({ ...horloge, platform_fields: { ...horloge.platform_fields, needsUserField: { field_key: 'size' } } }) === null, 'une autre question (taille) : pas son cas');
const beebs = { platform: 'beebs', action: 'republish', status: 'needs_user', platform_fields: { republish_prevol_manquants: ['le rayon Beebs'] } };
verifier(M.rayonRefuseDuJob(beebs)?.plateforme === 'beebs', 'Beebs : rayon absent de la copie → le moteur');
verifier(M.rayonRefuseDuJob({ ...beebs, platform_fields: { republish_prevol_manquants: ['le rayon Beebs'], beebsCategoryPath: ['Mode', 'Homme'] } }) === null, 'Beebs : rayon déjà là → rien');
const lbc = { platform: 'leboncoin', action: 'republish', status: 'pending', platform_fields: { lbcCategoryPath: ['Mode', 'Vêtements'], republish_prevol_formulaire: { verdict: 'illisible', detail: 'Catégorie: feuille introuvable' } } };
verifier(M.rayonRefuseDuJob(lbc)?.exclure?.join('>') === 'Mode>Vêtements', 'Leboncoin : rayon refusé au pré-vol → le moteur, sans reproposer le refusé');

console.log('\n2. Les candidats, et le contrôle de la réponse');
const feuilles = M.feuillesCandidates({ plateforme: 'vinted', base: plan.base, enfantsVivants: VIVANTS_1499 });
verifier(feuilles.length > 20 && feuilles.every((f) => f.chemin.slice(0, 2).join('>') === 'Enfants>Jeux et jouets'), `Vinted : ${feuilles.length} feuilles, toutes sous le rayon d'origine`);
verifier(feuilles.every((f) => VIVANTS_1499.includes(f.chemin[2])), 'seuls les sous-rayons que Vinted propose encore');
verifier(feuilles.every((f) => f.id && !feuilles.some((g) => g !== f && g.chemin.join('>').startsWith(f.chemin.join('>') + '>'))), 'des FEUILLES (aucune n’en contient une autre), chacune avec son identifiant');
const choisir = (libelleFeuille) => async (corps) => {
  const c = corps.candidats.vinted.find((x) => x.chemin[x.chemin.length - 1] === libelleFeuille);
  return { choix: c ? { vinted: c } : {} };
};
const r = await M.resoudreRayonRefuse({ plateforme: 'vinted', base: plan.base, enfantsVivants: VIVANTS_1499, titre: 'Horloge puzzle en bois' }, choisir('Autres jeux éducatifs'));
verifier(r.chemin?.join('>') === 'Enfants>Jeux et jouets>Jeux éducatifs>Autres jeux éducatifs' && r.id === '3358' && r.source === 'ia', 'le choix de l’IA est une feuille de la liste, avec son id');
const horsListe = await M.resoudreRayonRefuse({ plateforme: 'vinted', base: plan.base, enfantsVivants: VIVANTS_1499 }, async () => ({ choix: { vinted: { chemin: ['Femmes', 'Vêtements', 'Robes'] } } }));
verifier(horsListe.doute && horsListe.motif === 'hors_liste', 'une réponse hors de la liste est refusée (doute)');
const nul = await M.resoudreRayonRefuse({ plateforme: 'vinted', base: plan.base, enfantsVivants: VIVANTS_1499 }, async () => ({ choix: {} }));
verifier(nul.doute && nul.motif === 'ia_sans_choix', 'IA sans choix → doute');
const panne = await M.resoudreRayonRefuse({ plateforme: 'vinted', base: plan.base, enfantsVivants: VIVANTS_1499 }, async () => { throw new Error('HTTP 503'); });
verifier(panne.doute && panne.iaIndisponible, 'IA injoignable → doute marqué « à réessayer »');
const fb = M.feuillesCandidates({ plateforme: 'beebs', base: [], titre: 'Jean Levi’s Homme T40' });
verifier(fb.length > 0 && !fb.some((f) => f.chemin[0] === 'Mode' && ['Femme', 'Fille', 'Garçon', 'Bébé'].includes(f.chemin[1])), 'Beebs : un article « Homme » ne voit jamais un rayon Femme / Fille / Garçon / Bébé');
const fl = M.feuillesCandidates({ plateforme: 'leboncoin', base: [], exclure: ['Mode', 'Vêtements'] });
verifier(fl.length > 20 && !fl.some((f) => /Emploi|Immobilier|Services|Voitures/.test(f.chemin.join('>'))) && !fl.some((f) => f.chemin.join('>') === 'Mode>Vêtements'), 'Leboncoin : rayons d’objets seulement, jamais le rayon refusé');

console.log('\n3. Ce qui s’écrit sur le job');
const pfR = M.pfApresRayon(horloge, r, { plateforme: 'vinted', base: plan.base, source: 'ia', par: 'test' });
verifier(pfR.republish_snapshot.categoryPath.length === 4 && pfR.republish_snapshot.catalog_id === 3358, 'republication Vinted : la copie porte la feuille et son identifiant');
verifier(!pfR.needsUserField && !pfR.needs_user_source && !pfR.champs_a_completer && !pfR.categoryLevelChoice && !pfR.needsUserBoucle?.categoryLevelChoice, 'question retirée (champ, motif, boucle)');
verifier(pfR.republish_step === 'captured' && pfR.capture_id === '13093', 'l’étape ne bouge pas : le pré-vol refait son contrôle avant tout retrait');
verifier(pfR.rayon_moteur?.chemin?.length === 4 && pfR.rayon_moteur.capture_id === '13093' && pfR.rayon_moteur.base.length === 2, 'trace rayon_moteur (avant, après, capture)');
const pfB = M.pfApresRayon(beebs, { chemin: ['Mode', 'Homme', 'Vêtements (homme)', 'Jeans (homme)', 'Jeans coupe droite (homme)'], id: null }, { plateforme: 'beebs', base: [], source: 'ia', par: 'test' });
verifier(Array.isArray(pfB.beebsCategoryPath) && pfB.beebsCategoryPath.length === 5 && !pfB.republish_prevol_manquants, 'Beebs : beebsCategoryPath (tableau) posé, manquant levé');

console.log('\n4. La question de dernier recours, et sa réponse');
const q = M.questionRayonRefuse({ plateforme: 'vinted', base: plan.base, feuilles, cleChamp: M.CLE_REPONSE_RAYON });
verifier(q.field_key === 'rayonChoisi' && q.input_type === 'selection_only' && q.allowed_values.length === feuilles.length, 'la question propose TOUTES les feuilles, choix fermé');
verifier(q.allowed_values.every((v) => M.cheminDeLaReponse({ plateforme: 'vinted', base: plan.base, reponse: v })) && q.allowed_values.some((v) => v.includes(M.SEPARATEUR_RAYON)), 'chaque choix mène à une FEUILLE (« Figurines et accessoires › Sets de jeux », « Peluches ») : une réponse suffit');
const rep = M.cheminDeLaReponse({ plateforme: 'vinted', base: plan.base, reponse: 'Figurines et accessoires › Sets de jeux' });
verifier(rep?.chemin.join('>') === 'Enfants>Jeux et jouets>Figurines et accessoires>Sets de jeux' && rep.id === '3313', 'la réponse devient le chemin complet de la feuille (+ id)');
verifier(M.cheminDeLaReponse({ plateforme: 'vinted', base: plan.base, reponse: 'Figurines et accessoires' }) === null, 'un niveau intermédiaire n’est jamais une réponse acceptée');
verifier(/AVANT toute suppression/.test(M.messageRayonAChoisir('vinted', plan.base)) && /intacte/.test(M.messageRayonAChoisir('vinted', plan.base)), 'le message dit que l’annonce est intacte');

console.log('\n5. Le câblage serveur');
const hw = lire('supabase/functions/handler-watch/index.ts');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
verifier(/from "\.\.\/_shared\/rayon-refuse-moteur\.js"/.test(hw) && /rayonRefuseDuJob\(j\)/.test(hw) && /resoudreRayonRefuse\(/.test(hw), 'handler-watch : le balayage juge et choisit');
verifier(/\.eq\("platform_fields->needsUserField->>field_key", "categoryLevelChoice"\)/.test(hw) && /\.slice\(0, 8\)/.test(hw), 'handler-watch : borné (8 jobs par passage)');
verifier(/vinted_republish_captures/.test(hw.slice(hw.indexOf('UNE CATÉGORIE QUE LA PLATEFORME'), hw.indexOf('UNE CATÉGORIE QUE LA PLATEFORME') + 9000)), 'handler-watch : republication Vinted → la capture porte le rayon');
verifier(/choix_refuse_par_la_plateforme/.test(hw) && /ESSAIS_RAYON_MAX/.test(hw), 'handler-watch : un choix refusé ne boucle jamais (question), essais bornés');
verifier(/cheminDeLaReponse\(/.test(gpj) && /CLE_REPONSE_RAYON/.test(gpj) && /aRetenirRayon/.test(gpj), 'get-pending-jobs : la réponse est traduite avant de servir (sinon retenue)');

console.log(`\n${ko ? `✗ ${ko} échec(s)` : '✓ tout est vert'} — ${ok} contrôles`);
process.exit(ko ? 1 : 0);
