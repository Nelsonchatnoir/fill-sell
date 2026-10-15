// Autotest : UNE PUBLICATION VINTED PART SUR LA BOUTIQUE DE SON ARTICLE (11/10/2026, Louis).
//
//     npm run selftest:publication-boutique-vinted
//
// Le cas : 11/10 10:40, remise en vente des « 12 adaptateurs pour pots La
// Laitière – M » (fiche de @neyenonie, 247512093) partie sur @evat (371531),
// ouverte dans Chrome — une publication ne passait par aucune garde de boutique.
// Ce qu'il prouve, sans réseau ni base :
//   1. la règle (identite-boutique.js) : le cas de Louis rejoué → retenu ;
//      bonne boutique ouverte → servi ; session illisible chez un compte à
//      plusieurs boutiques → retenu ; article sans boutique → la personne
//      choisit (jamais un défaut) ; compte à une boutique : inchangé ;
//      retraits / republications et autres plateformes : non concernés ;
//   2. le choix de la personne ne vaut que pour une boutique confirmée ;
//   3. l'attente se lève seule quand la bonne boutique est vue connectée, avec
//      sa phrase ;
//   4. le câblage dans get-pending-jobs (ordre, question à part, levée).
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const I = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/identite-boutique.js')).href);
const A = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/attente-autre-boutique.js')).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const LOUIS = [{ user_id: '247512093', login: 'neyenonie' }, { user_id: '371531', login: 'evat' }];
const v = (o) => I.verifierBoutiquePublicationVinted({ action: 'publish', platform: 'vinted', boutiques: LOUIS, lectureFiable: true, ...o });

console.log('1. la règle');
ok(v({ boutiqueArticle: '247512093', boutiqueSession: '371531' }) === 'boutique_etrangere', 'cas de Louis rejoué : fiche @neyenonie, Chrome sur @evat → RETENU (boutique_etrangere)');
ok(v({ boutiqueArticle: '247512093', boutiqueSession: '247512093' }) === null, 'bonne boutique ouverte → servi');
ok(v({ boutiqueArticle: '247512093', boutiqueSession: '' }) === 'session_inconnue', 'session illisible, deux boutiques → retenu en file');
ok(v({ boutiqueArticle: '', boutiqueSession: '371531' }) === 'origine_inconnue', 'article sans boutique, deux boutiques → la personne choisit');
ok(v({ boutiqueArticle: '999', boutiqueSession: '999' }) === 'boutique_non_confirmee', 'boutique de la fiche hors de la liste confirmée → retenu');
ok(v({ boutiqueArticle: '247512093', boutiqueSession: '371531', lectureFiable: false }) === 'lecture_indisponible', 'lecture ratée → jamais une permission');
const MONO = [{ user_id: '1', login: 'seule' }];
ok(I.verifierBoutiquePublicationVinted({ action: 'publish', platform: 'vinted', boutiques: MONO, lectureFiable: true, boutiqueArticle: '', boutiqueSession: '' }) === null, 'une boutique, article sans boutique, session illisible : inchangé (servi)');
ok(I.verifierBoutiquePublicationVinted({ action: 'publish', platform: 'vinted', boutiques: MONO, lectureFiable: true, boutiqueArticle: '1', boutiqueSession: '' }) === null, 'une boutique, session illisible : inchangé (servi)');
ok(I.verifierBoutiquePublicationVinted({ action: 'publish', platform: 'vinted', boutiques: MONO, lectureFiable: true, boutiqueArticle: '1', boutiqueSession: '2' }) === 'boutique_etrangere', 'une boutique, mais Chrome sur un AUTRE compte → retenu');
ok(I.verifierBoutiquePublicationVinted({ action: 'publish', platform: 'vinted', boutiques: [], lectureFiable: true, boutiqueArticle: '', boutiqueSession: '5' }) === null, 'aucune boutique confirmée, article sans boutique : inchangé');
ok(v({ action: 'republish', boutiqueArticle: '247512093', boutiqueSession: '371531' }) === null && v({ action: 'delete', boutiqueArticle: '1', boutiqueSession: '2' }) === null, 'retraits / republications : la garde existante, inchangée');
ok(v({ platform: 'leboncoin', boutiqueArticle: '247512093', boutiqueSession: '371531' }) === null, 'autres plateformes : non concernées');
ok(I.verifierBoutiqueOperation({ action: 'publish', platform: 'vinted', boutiqueArticle: '247512093', boutiqueSession: '371531', boutiques: LOUIS, lectureFiable: true }) === null, 'la garde des opérations existantes ne change pas (publish = null)');

console.log('2. le choix de la personne');
ok(I.boutiqueChoisieVersId('@evat', LOUIS) === '371531' && I.boutiqueChoisieVersId('neyenonie', LOUIS) === '247512093', '« @evat » / « neyenonie » → leur numéro');
ok(I.boutiqueChoisieVersId('371531', LOUIS) === '371531', 'un numéro confirmé → lui-même');
ok(I.boutiqueChoisieVersId('@inconnue', LOUIS) === null && I.boutiqueChoisieVersId('', LOUIS) === null, 'boutique non confirmée ou vide → rien (jamais un défaut)');

console.log('3. l\'attente se lève seule');
const garde = { motif: 'boutique_etrangere', article: '247512093', pose_par: A.POSE_PAR_PUBLICATION_BOUTIQUE };
ok(A.attenteBoutiqueLevable(garde), 'publication retenue sur sa boutique : levable dès que @neyenonie est vue connectée');
ok(!A.attenteBoutiqueLevable({ ...garde, article: '' }), 'sans boutique d\'article : jamais levée');
ok(/@neyenonie/.test(A.messageAttenteBoutique('neyenonie', 'publish')) && /ne se publie que sur elle/.test(A.messageAttenteBoutique('neyenonie', 'publish')) && /Rien n'a été publié ailleurs/.test(A.messageAttenteBoutique('neyenonie', 'publish')),
  'la phrase nomme la boutique, dit la règle et que rien n\'est parti');
ok(/la republication repartira toute seule/.test(A.messageAttenteBoutique('x', 'republish')), 'phrase des republications inchangée');

console.log('4. câblage (get-pending-jobs)');
const gpj = lire('supabase/functions/get-pending-jobs/index.ts');
ok(/\?\? verifierBoutiquePublicationVinted\(\{ action: j\.action, platform: j\.platform,/.test(gpj), 'la règle des publications suit celle des opérations existantes');
// (15/10 soir, Nico) Plus de question « boutique_a_choisir » : article sans
// boutique → choix de la file, puis défaut des Réglages, puis boutique ouverte
// (scripts/questions-tranchees-selftest.mjs, _shared/boutique-publication-vinted.js).
ok(/boutiqueChoisie: pf\.vinted_boutique_choisie \?\? null/.test(gpj) && /vinted_account_id: choix\.boutique/.test(gpj), 'le choix de la personne (file) devient l\'origine du job');
ok(!/needs_user_source: "boutique_a_choisir"/.test(gpj) && /motif === "origine_inconnue"\) continue;/.test(gpj), 'article sans boutique : plus jamais de question, la publication attend une boutique du compte');
ok(/\.eq\("platform_fields->>needs_user_source", "boutique_etrangere"\)/.test(gpj), 'la reprise automatique ne lit que « boutique_etrangere » (jamais la question)');
ok(/pose_par: publicationAilleurs \? POSE_PAR_PUBLICATION_BOUTIQUE/.test(gpj), 'publication retenue : levable (reprend seule)');
const st = lire('src/tabs/StockTab.jsx');
ok(/f\?\.field_key === "vinted_boutique"/.test(st), '« À régler » : la question dit ce qu\'elle demande');

console.log(ko ? `\n✗ ${ko} échec(s)` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
