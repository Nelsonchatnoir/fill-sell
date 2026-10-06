// Autotest (06/10/2026) — « Synchroniser » face à une boutique Vinted à
// confirmer : plus jamais un cul-de-sac (cas nerema75, 75 appuis refusés en
// silence ; lohanobert59, revenu sur sa boutique et refusé quand même).
//
//     npm run selftest:boutique-a-confirmer
import { decisionQuestionBoutique, runPoseQuestionBoutique } from '../src/annonces/synchroniser.js';
import { texteRefusReleve } from '../src/utils/syncPlateformes.js';
import { textesAnnonces } from '../src/annonces/textes.js';

let echecs = 0;
const ok = (c, nom, detail) => { console.log(`${c ? '  ✓' : '  ✗'} ${nom}${c ? '' : `   ← ${JSON.stringify(detail)}`}`); if (!c) echecs++; };

const question = {
  id: 'run-1', status: 'failed', vinted_user_id: '36325065', vinted_login: 'celineetmarie',
  erreur: "[boutique_a_confirmer] Ce navigateur est connecté au dressing @celineetmarie — ce compte FillSell suit @narema75, @jcassou. Rien n'a été importé.",
};
const fraiche = (userId) => ({ userId, login: 'x', fraiche: true });
const vieille = (userId) => ({ userId, login: 'x', fraiche: false });

console.log('Le refus « boutique à confirmer » :');
ok(runPoseQuestionBoutique(question), 'un relevé failed [boutique_a_confirmer] pose la question');
ok(!runPoseQuestionBoutique({ ...question, status: 'done' }), 'un relevé réussi ne la pose pas');
ok(decisionQuestionBoutique({ run: { status: 'done' } }) === 'aucune', 'pas de question → la synchro part');
ok(decisionQuestionBoutique({ run: question, connectee: fraiche('36325065') }) === 'feuille',
  'nerema75 : Chrome toujours sur @celineetmarie → la feuille s\'ouvre (Ajouter / Pas la mienne)');
ok(decisionQuestionBoutique({ run: question, connectee: null }) === 'feuille', 'boutique ouverte inconnue → la feuille s\'ouvre');
ok(decisionQuestionBoutique({ run: question, connectee: vieille('295151754') }) === 'feuille',
  'sonde de plus de 30 min : on n\'affirme rien → la feuille s\'ouvre');
ok(decisionQuestionBoutique({ run: question, connectee: fraiche('295151754') }) === 'relancer_boutique_changee',
  'lohanobert59 : Chrome revenu sur une autre boutique → la synchro part, l\'extension tranche');
ok(decisionQuestionBoutique({ run: question, connectee: null, ecarteeRunId: 'run-1' }) === 'relancer_ecartee',
  '« pas la mienne » puis appui, boutique ouverte inconnue → la synchro part (l\'extension relit Chrome)');
ok(decisionQuestionBoutique({ run: question, connectee: fraiche('36325065'), ecarteeRunId: 'run-1' }) === 'feuille_rappel',
  '« pas la mienne » mais Chrome toujours dessus → la feuille revient, avec « Connecte-toi… » en tête');
ok(decisionQuestionBoutique({ run: question, connectee: null, ecarteeRunId: 'run-0' }) === 'feuille',
  'un « pas la mienne » d\'un AUTRE relevé ne vaut pas pour celui-ci');

console.log('Les textes :');
const T = textesAnnonces('fr');
ok(T.finBoutiqueAConfirmer('celineetmarie').includes('@celineetmarie') && !/Chrome|onglet/i.test(T.finBoutiqueAConfirmer('celineetmarie')),
  'le point dit la boutique, sans parler de Chrome ni d\'onglets');
ok(T.ctaChoisirBoutique === 'Choisir ma boutique', 'le geste du point : « Choisir ma boutique »');
for (const raison of ['plateforme_ecartee', 'unauthorized', 'erreur', 'motif_inconnu']) {
  const t = texteRefusReleve({ reason: raison, message: 'HTTP 500 boom' }, 'fr', 'leboncoin');
  ok(t !== 'Synchronisation impossible.' && !t.includes('HTTP 500'), `refus « ${raison} » : une phrase avec son geste, jamais le texte brut`, t);
}

console.log(echecs ? `\n✗ ${echecs} cas en échec` : '\n✓ tous les cas passent');
process.exit(echecs ? 1 : 0);
