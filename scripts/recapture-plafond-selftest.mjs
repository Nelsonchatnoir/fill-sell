// `node scripts/recapture-plafond-selftest.mjs`
//
// LE COMPTEUR DE RECAPTURES NE COMPTAIT PAS CE QUE SON NOM DIT (2026-09-22).
//
// LE CAS : seghirdeborah711, job 7fa92ebf, « Blouse FOCUS.S beige ».
//   · platform_fields.recaptures_perimees = 5 ;
//   · et EN BASE, l'article 9970803136 n'a qu'UNE SEULE capture : la 6260, du
//     18/09 à 12:53, verdict « valide », 0 champ manquant, 91,8 h d'âge.
//   Le compteur a donc grimpé CINQ fois sans qu'aucune capture neuve n'ait
//   jamais existé.
//
// POURQUOI : l'incrément était posé AVANT toute tentative, et le plafond
// court-circuitait la recapture. Passé 2, plus aucune recapture n'était même
// ESSAYÉE ⇒ la capture ne pouvait plus être rafraîchie ⇒ elle restait périmée
// ⇒ chaque passage ré-incrémentait. Un cycle fermé : le compteur ne se remet à
// zéro qu'à une republication aboutie, devenue impossible.
// Et le message accusait la personne — « ton Chrome s'ouvre trop longtemps
// après ». Mesuré le 22/09 : job relancé à 07:55, Chrome vu à 07:49 PUIS à
// 08:21, extension 0.6.49 ; il est retombé au même endroit, 4 → 5.
//
// ⛔ CE TEST EXÉCUTE LE VRAI CODE : il extrait de background.js le bloc de
//    décision « capture périmée » (de `if (Date.parse(capMeta.captured_at)…`
//    jusqu'à son accolade fermante) et le fait tourner contre des doublures.
//    Rien n'est recopié : si le bloc change, ce test change de verdict.
//
// ⛔ IL TOURNE AUSSI SUR LE PAQUET :
//    node scripts/recapture-plafond-selftest.mjs build/extension/background.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FICHIER = (process.argv[2] ? String(process.argv[2]).replace(/\\/g, '/') : 'chrome-extension/background.js');
console.log(`fichier exécuté : ${FICHIER}\n`);
const SRC = fs.readFileSync(path.join(ROOT, FICHIER), 'utf8');

/** Le bloc « capture périmée », par équilibrage d'accolades. */
function extraireBloc() {
  const debut = SRC.indexOf('if (Date.parse(capMeta.captured_at)');
  if (debut < 0) throw new Error('bloc « capture périmée » introuvable dans ' + FICHIER);
  let i = SRC.indexOf('{', debut);
  let p = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') p++;
    else if (SRC[i] === '}') { p--; if (p === 0) return SRC.slice(debut, i + 1); }
  }
  throw new Error('accolades non équilibrées');
}
const BLOC = extraireBloc();

/** Exécute le bloc avec des doublures, et rend ce qu'il a fait. */
async function jouer({ ageHeures, pf, recapture }) {
  const ecritures = [];
  const capMeta = { captured_at: new Date(Date.now() - ageHeures * 3600 * 1000).toISOString(), payload: {} };
  const etat = { pf: { ...pf }, route404: false };
  const sandbox = {
    capMeta,
    pf: etat.pf,
    job: { id: 'job-test', inventaire_id: 42 },
    accessToken: 'jeton.avec.sub',
    decodeJwtSub: () => 'user-test',
    updateJobStatus: async (_t, _id, status, opts) => { ecritures.push({ status, error: opts?.error ?? null }); },
    capturerEtPersisterDepuisExtension: async () => recapture,
    traiterIntrouvable404Republication: async () => { etat.route404 = true; return { status: 'needsUser', error: '404 routé' }; },
    motifLisible: (e, n) => String(e ?? '').slice(0, n),
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  const noms = Object.keys(sandbox);
  const fn = new Function(...noms, `return (async () => { ${BLOC}\n return { status: "pas-entre-dans-le-bloc" }; })();`);
  const res = await fn(...noms.map((n) => sandbox[n]));
  return { ...res, ecritures, pf: etat.pf, route404: etat.route404 };
}

const OK_RECAP = { success: true, verdict: 'valide', capture_id: 7777, champs_manquants: [] };

let ko = 0;
const ok = (nom, cond, detail = '') => {
  if (cond) { console.log(`  ✅ ${nom}`); return; }
  ko++; console.log(`  ❌ ${nom}${detail ? `\n       ${detail}` : ''}`);
};
const accuseChrome = (e) => /Chrome s'ouvre trop longtemps après/.test(String(e ?? ''));

console.log('LE CAS RÉEL — job 7fa92ebf, capture 6260 (91,8 h), compteur à 5\n');
{
  const r = await jouer({ ageHeures: 91.8, pf: { recaptures_perimees: 5, vinted_item_id: '9970803136' }, recapture: OK_RECAP });
  ok('la recapture est ESSAYÉE malgré le compteur à 5',
    r.status === 'skipped', `statut rendu : ${r.status}`);
  ok('le job repart en pending avec la capture neuve',
    r.ecritures.at(-1)?.status === 'pending' && r.pf.capture_id === 7777,
    JSON.stringify(r.ecritures));
  ok('aucun message n\'accuse le Chrome de la personne',
    !r.ecritures.some((e) => accuseChrome(e.error)));
  ok('le compteur n\'a PAS été incrémenté (aucune capture à nous n\'avait expiré)',
    Number(r.pf.recaptures_perimees) === 5, `compteur = ${r.pf.recaptures_perimees}`);
  ok('la marque `recapture_le` est posée — les prochains cycles compteront',
    typeof r.pf.recapture_le === 'string' && r.pf.recapture_le.length > 10);
}

console.log('\nLE VRAI CYCLE — une capture QUE NOUS AVONS REFAITE a expiré\n');
{
  // Deux cycles déjà faits : le troisième doit s'arrêter, message d'origine.
  const r = await jouer({
    ageHeures: 30,
    pf: { recaptures_perimees: 2, recapture_le: '2026-09-20T10:00:00.000Z' },
    recapture: OK_RECAP,
  });
  ok('3ᵉ péremption d\'une capture à nous : le plafond tire', r.status === 'needsUser', r.status);
  ok('…et c\'est bien le message d\'origine', accuseChrome(r.ecritures.at(-1)?.error), String(r.ecritures.at(-1)?.error));
  ok('…et le compteur est bien passé à 3', Number(r.pf.recaptures_perimees) === 3, `${r.pf.recaptures_perimees}`);
}
{
  // Sous le plafond : on recapture, et on compte.
  const r = await jouer({
    ageHeures: 30,
    pf: { recaptures_perimees: 1, recapture_le: '2026-09-20T10:00:00.000Z' },
    recapture: OK_RECAP,
  });
  ok('2ᵉ péremption : la recapture est faite', r.status === 'skipped', r.status);
  ok('…et le compteur monte à 2', Number(r.pf.recaptures_perimees) === 2, `${r.pf.recaptures_perimees}`);
}

console.log('\nNON-RÉGRESSION\n');
{
  const r = await jouer({ ageHeures: 2, pf: { recaptures_perimees: 5 }, recapture: OK_RECAP });
  ok('capture fraîche (2 h) : le bloc ne tire pas du tout',
    r.status === 'pas-entre-dans-le-bloc', r.status);
}
{
  const r = await jouer({
    ageHeures: 40, pf: {},
    recapture: { success: false, error: 'session Vinted refusée (HTTP 401)' },
  });
  ok('recapture en échec : le message dit que la CAPTURE a échoué',
    /la nouvelle capture a échoué/.test(String(r.ecritures.at(-1)?.error)), String(r.ecritures.at(-1)?.error));
  ok('…et n\'accuse pas le Chrome de la personne', !accuseChrome(r.ecritures.at(-1)?.error));
}
{
  const r = await jouer({
    ageHeures: 40, pf: {},
    recapture: { success: false, error: "annonce introuvable sur Vinted (HTTP 404)" },
  });
  ok('404 du propriétaire : routé vers le traitement « introuvable » (inchangé)', r.route404 === true);
}
{
  const r = await jouer({
    ageHeures: 40, pf: {},
    recapture: { success: true, verdict: 'incomplet', capture_id: 8888, champs_manquants: ['taille', 'couleur'] },
  });
  ok('recapture incomplète : needs_user nommé, champs à compléter (inchangé)',
    r.status === 'needsUser' && r.pf.needs_user_source === 'capture_incomplete'
    && Array.isArray(r.pf.champs_a_completer) && r.pf.champs_a_completer.includes('taille'),
    JSON.stringify({ s: r.status, src: r.pf.needs_user_source, ch: r.pf.champs_a_completer }));
}
{
  // ⛔ LA RÈGLE D'OR : rien ne supprime quoi que ce soit dans ce bloc.
  ok('aucune suppression dans le bloc — il précède tout retrait',
    !/deleteListing|republish_step\s*=\s*["']deleted["']|supprimer/i.test(BLOC));
}

console.log(`\n${ko === 0 ? '✅ TOUT PASSE' : `❌ ${ko} CONTRÔLE(S) EN ÉCHEC`}`);
process.exit(ko === 0 ? 0 : 1);
