// selftest:reprise-technique — une attente TECHNIQUE repart seule, sur preuve ;
// une attente qui demande la personne reste à la personne (15/10, P11 / P2).
//
//   npm run selftest:reprise-technique
//
//   1. republication en pause AVANT tout retrait (Louis, 17 Leboncoin) : reprise
//      quand la sonde revoit la plateforme répondre APRÈS le dernier blocage,
//      3 fois au plus sur le même mur, 3 par compte et par plateforme à chaque
//      passage ; le compteur de lectures de l'extension repart ;
//   2. les motifs techniques (anti-robot, session, formulaire non capté) sont
//      repris ; un champ, une marque, un rayon, un mur payant, une
//      configuration de compte, jamais ;
//   3. une republication déjà recréée (Ornella) est close « published » par
//      handler-watch comme par get-pending-jobs (même règle, partagée).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const HW = lire('supabase/functions/handler-watch/index.ts');
const GPJ = lire('supabase/functions/get-pending-jobs/index.ts');
const { republicationFinie, champsRepublicationFinie } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/republication-finie.js')).href);

let echecs = 0, total = 0;
const ok = (c, l, d = '') => { total++; if (!c) echecs++; console.log(`${c ? '✓' : '✗'} ${l}${!c && d ? `   ← ${d}` : ''}`); };

// Le prédicat de handler-watch, exécuté tel qu'écrit.
const i0 = HW.indexOf('const MOTIF_TECHNIQUE_RE =');
const i1 = HW.indexOf('const reprisesEtatParCompte');
const code = HW.slice(i0, i1).replace(/\/\/ deno-lint-ignore[^\n]*\n/g, '').replace(/\(j: any\)/g, '(j)')
  .replace(/ as Record<string, unknown>( \| undefined)?/g, '').replace(/\(pf: Record<string, unknown>\)/g, '(pf)');
// (18/10, lot 3) La signature unique des coupures (etat-job.js), importée par handler-watch.
const { CANAL_RE } = await import(pathToFileURL(path.join(RACINE, 'supabase/functions/_shared/etat-job.js')).href);
// eslint-disable-next-line no-new-func
const { etatIndetermineAvantRetrait, bloqueLeDe } = new Function('CANAL_RE', `${code}; return { etatIndetermineAvantRetrait, bloqueLeDe };`)(CANAL_RE);
ok(i0 > 0 && i1 > i0, '0. le prédicat de reprise est trouvé dans handler-watch');

// 1. Louis : republication Leboncoin, lecture bloquée par l'anti-robot
{
  const louis = { action: 'republish', status: 'needs_user', platform: 'leboncoin',
    error: "Republication en pause AVANT tout retrait : l'état de ton annonce Leboncoin n'a pas pu être vérifié (Leboncoin a bloqué notre lecture par une vérification anti-robot)…",
    platform_fields: { republish_step: 'a_capturer', needs_user_source: 'relancer', needs_user_vu_le: '2026-10-14T07:06:01.458Z',
      republish_etat_indetermine: { n: 4, depuis: '2026-10-14T06:01:13.048Z', raison: 'bot_shield_403', dernier: '2026-10-14T06:49:11.956Z' } } };
  ok(etatIndetermineAvantRetrait(louis) === true, '1a. Louis (12e5d144) : reprise possible');
  ok(bloqueLeDe(louis.platform_fields) === Date.parse('2026-10-14T07:06:01.458Z'), '1b. le blocage retenu est le DERNIER connu (jamais une sonde d\'avant)');
  ok(etatIndetermineAvantRetrait({ ...louis, platform_fields: { ...louis.platform_fields, republish_step: 'deleted' } }) === false,
    '1c. jamais après le retrait (l\'étape deleted a sa propre reprise)');
  ok(/if \(!\(vu > bloqueLe\)\) continue;/.test(HW) && /if \(deja >= 3\) continue;/.test(HW) && /delete pf\.republish_etat_indetermine;/.test(HW)
    && /const REPRISES_CONNEXION_MAX = 3;/.test(HW), '1d. sonde postérieure au blocage, 3 par compte et plateforme, 3 fois au plus, compteur de lectures remis');
  ok(/if \(s\[j\.platform\] !== true\) continue;/.test(HW), '1e. seulement si la sonde dit « répond » (true) — un anti-robot écrit null, jamais true');
}

// 2. Motifs techniques ou personnels
{
  const j = (error, step = 'captured') => ({ action: 'republish', status: 'needs_user', platform: 'vinted', error,
    platform_fields: { republish_step: step, needs_user_source: 'relancer', needs_user_vu_le: '2026-10-10T16:30:00Z' } });
  const cas = [
    ["Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Connexion Vinted requise : se connecter sur vinted.fr dans Chrome (l'onglet de travail est resté ouvert), le job repartira au prochain passage. Rien à corriger sur l'annonce — relance depuis l'app quand tu veux.", true, 'Leo-paul 6af38fa2 (session)'],
    ["Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Impossible de vérifier les champs obligatoires Vinted pour cette catégorie (configuration non captée). Relance la publication — le formulaire sera rechargé. Rien à corriger sur l'annonce — relance depuis l'app quand tu veux.", true, 'Leo-paul fcfa9f82 (formulaire non capté)'],
    ["Republication en pause AVANT toute suppression : ta capture datait de plus de 24 h et la nouvelle capture a échoué : lecture de l'annonce refusée par Vinted — protection anti-robot. Rien n'a été touché, ton annonce est intacte. Relance la republication depuis l'app, Chrome ouvert.", true, 'RoCotCot a15c16e5 (anti-robot)'],
    ["Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : Le champ Marque n'a pas pu être renseigné avec « Cousu Main » (introuvable au catalogue Vinted, création impossible, et même le repli « Sans marque » a échoué). Rien à corriger sur l'annonce — relance depuis l'app quand tu veux.", false, 'Jen cec26662 (marque)'],
    ["Leboncoin ne propose aucune option gratuite pour ce dépôt : son écran « Boostez votre annonce »…", false, 'mur payant'],
  ];
  for (const [err, attendu, nom] of cas) ok(etatIndetermineAvantRetrait(j(err)) === attendu, `2. ${nom} : ${attendu ? 'reprise' : 'jamais reprise'}`);
  ok(etatIndetermineAvantRetrait({ ...j(cas[0][0]), platform_fields: { republish_step: 'captured', needs_user_source: 'champ_a_choisir' } }) === false,
    '2b. une autre source que « relancer » n\'est jamais reprise ici');
  // (18/10, lot 3) seghirdeborah711 (16691e13, ab180fa0) : coupure pendant la republication,
  // brut gardé dans error_technique, message affiché réécrit « Relance-la… ».
  const brut = "Republication interrompue pendant la suppression (onglet de travail vinted : le content script ne répond pas, ni après rechargement puis onglet neuf). Relance depuis l'app : l'état réel de l'annonce sera re-vérifié avant tout geste.";
  const affiche = "L'opération n'a pas pu aboutir sur ton ordinateur. Relance-la depuis la fiche de l'article quand tu veux.";
  const coupe = { ...j(affiche), platform_fields: { republish_step: 'captured', needs_user_source: 'relancer', needs_user_vu_le: '2026-10-17T11:36:03Z', error_technique: { brut } } };
  ok(etatIndetermineAvantRetrait(coupe) === true, '2c. coupure (onglet qui ne répond pas) : reprise sur preuve, plus de « Relancer »');
  ok(etatIndetermineAvantRetrait({ ...coupe, error: 'Cette republication attend.' }) === true, '2d. le BRUT seul suffit (message réécrit sans signature)');
  ok(etatIndetermineAvantRetrait({ ...coupe, platform_fields: { ...coupe.platform_fields, republish_step: 'deleted' } }) === false, '2e. jamais une recréation (deleted)');
  ok(etatIndetermineAvantRetrait({ ...j('Timeout: choisis la taille dans la liste'), platform_fields: { republish_step: 'captured', needs_user_source: 'relancer' } }) === false, '2f. une coupure qui parle d\'un champ reste à la personne');
  // (25/10 nuit) patrick.giry07 3730ef49 : sélecteur photo non résolu AVANT retrait, source « prevol_negatif » héritée.
  const selecteur = "Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. Motif : [selectors] vinted/publish.photo_input (criticité red) : aucun des 1 maillon(s) n'a résolu. Rien à corriger sur l'annonce — relance depuis l'app quand tu veux.";
  const patrick = { action: 'republish', status: 'needs_user', platform: 'vinted', error: selecteur,
    platform_fields: { republish_step: 'captured', needs_user_source: 'prevol_negatif', needs_user_vu_le: '2026-10-21T07:06:01.904Z',
      needsUserField: { field_key: 'brand', field_label: 'Marque', raison: 'marque_hors_catalogue', target: { key: 'marque', root: null } }, champs_a_completer: ['Marque'] } };
  ok(etatIndetermineAvantRetrait(patrick) === true, '2g. patrick 3730ef49 : sélecteur non résolu avant retrait, source héritée → reprise sur preuve');
  ok(etatIndetermineAvantRetrait({ ...patrick, platform_fields: { ...patrick.platform_fields, needs_user_source: 'relancer' } }) === true, '2h. même arrêt, source « relancer » → reprise');
  ok(etatIndetermineAvantRetrait({ ...patrick, platform_fields: { ...patrick.platform_fields, needs_user_source: 'champ_a_choisir' } }) === false, '2i. une vraie question (champ_a_choisir) n\'est jamais reprise');
  ok(etatIndetermineAvantRetrait({ ...patrick, platform_fields: { ...patrick.platform_fields, republish_step: 'deleted' } }) === false, '2j. jamais après le retrait');
  ok(etatIndetermineAvantRetrait({ ...patrick, error: "Republication en pause AVANT toute suppression — ton annonce est intacte sur Vinted. Vinted exige des champs encore vides pour cette catégorie : Espace de stockage." }) === false,
    '2k. un pré-vol négatif (champ exigé) reste à la personne, même source');
  ok(etatIndetermineAvantRetrait({ ...patrick, error: selecteur.replace('photo_input', 'field_input').replace('Rien à corriger', 'Marque : rien à corriger') }) === false,
    '2l. un sélecteur qui parle d\'un champ (Marque) reste à la personne');
  ok(/delete pf\.needsUserField; delete pf\.needsUserFields; delete pf\.champs_a_completer;/.test(HW), '2m. la reprise retire la question héritée');
  ok(/"handler-watch \(réveil par capture fraîche\)"/.test(HW) && /\.select\("id, user_id, inventaire_id, created_at, error, platform_fields"\)/.test(HW),
    '2n. le réveil par capture archive le motif et ferme la question réveillée');
}

// 3. Republication déjà recréée
{
  const ornella = { action: 'republish', status: 'needs_user', platform_listing_id: '10352378300', error: 'Étape de republication inconnue : recreated',
    platform_fields: { republish_step: 'recreated', recreated_at: '2026-10-12T17:39:58.638Z', old_vinted_item_id: '10070657616', new_vinted_item_id: '10352378300',
      needs_user_source: 'relancer', needs_user_vu_le: '2026-10-13T00:03:00.885Z', needs_user_sans_motif: { le: '2026-10-13T00:01:07.250Z' } } };
  ok(republicationFinie(ornella) === true, '3a. Ornella 9a7b9499 : finie');
  const pf = champsRepublicationFinie(ornella.platform_fields, '10352378300', 'test', '2026-10-15T01:00:00Z');
  ok(!pf.needs_user_source && !pf.needs_user_sans_motif && pf.republish_step === 'recreated' && pf.republication_finie.annonce === '10352378300',
    '3b. l\'attente est levée, l\'étape et la trace restent');
  ok(/\.in\("status", \["needs_user", "failed"\]\)\.eq\("action", "republish"\)\s*\n\s*\.eq\("platform_fields->>republish_step", "recreated"\)/.test(HW)
    && /if \(!republicationFinie\(j\)\) continue;/.test(HW), '3c. handler-watch la clôt (needs_user / failed, bornée)');
  ok(/const finies = out\.filter\(\(j\) => j\.status === "pending" && republicationFinie\(j\)\);/.test(GPJ), '3d. get-pending-jobs : même règle, partagée');
}

// 4. Les dépôts « mis de côté » à tort reprennent par paquets (phase 3)
{
  const i = HW.indexOf('// ══ REPRISE DES DÉPÔTS « MIS DE CÔTÉ » À TORT, PAR PAQUETS');
  const bloc = HW.slice(i, HW.indexOf('// ══ LA RECONNEXION FAIT REPARTIR LES JOBS', i));
  ok(i > 0 && /const AVANT_REGLE = Date\.parse\("2026-10-15T00:45:00Z"\);/.test(bloc) && /if \(!Number\.isFinite\(le\) \|\| le >= AVANT_REGLE\) continue;/.test(bloc),
    '4a. seules les mises de côté d\'AVANT la règle corrigée repartent');
  // (15/10 soir, Ciddjy) une republication aussi — mais seulement AVANT tout retrait.
  ok(/\.in\("action", \["publish", "republish"\]\)/.test(bloc)
    && /if \(!\["a_capturer", "captured"\]\.includes\(etape\) \|\| retraitEngage\(j\)\) continue;/.test(bloc),
    '4b. des dépôts, et des republications jamais engagées (aucune suppression envoyée : aucun doublon possible)');
  ok(/if \(r\.some\(\(x\) => x\.status === "pending" \|\| x\.status === "processing"\)\) continue;/.test(bloc) && /jobs\.slice\(0, 10\)/.test(bloc),
    '4c. par paquets de 10 : le suivant attend que le précédent n\'ait plus rien en file');
  ok(/if \(r\.length >= 5 && echecs \/ r\.length > 0\.10\) \{/.test(bloc) && /DISJONCTEUR/.test(bloc), '4d. disjoncteur : plus de 10 % d\'échecs → arrêt net, dit');
  ok(/Date\.now\(\) - vu > 7 \* 24 \* 3600_000\) continue;/.test(bloc), '4e. comptes actifs seulement (extension vue < 7 j)');
  ok(/pf\.reprise_1510 = \{/.test(bloc) && /archiverErreur\(pf\.erreurs_archivees, j\.error, "needs_user"/.test(bloc), '4f. marqueur reprise_1510 posé, message archivé');
}

console.log(`\n${total - echecs}/${total} contrôles verts`);
process.exit(echecs ? 1 : 0);
