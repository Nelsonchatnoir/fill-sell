// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION DONT LA SUPPRESSION EST PARTIE VA AU BOUT (08/10/2026, Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Louis, Beebs, créneau mardi/samedi 19:00–22:00 : le 06/10, la 9e
// republication (job 8d0fabb6, annonce 32745154) a envoyé sa suppression vers
// 21:58 ; Beebs montrait encore l'annonce deux minutes après, le job s'est
// reprogrammé à 22:05, créneau fermé → retenu jusqu'au samedi 19:00 avec
// « Ton annonce est intacte, rien n'a été retiré » — l'annonce n'était plus sur
// Beebs. Ce test échoue si :
//   · une retenue de gouvernance (créneau, plafond du jour, pause de
//     respiration) peut de nouveau retenir un job dont la suppression est partie ;
//   · l'extension pouvait remettre en ligne sans PREUVE de la suppression
//     (jamais deux annonces) ;
//   · la migration 20261008140000 (le balayage ne lance pas ce qui ne peut pas
//     finir dans le créneau) perd sa garde.
//
//   npm run selftest:republication-va-au-bout
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retraitEngage, messageRetenueCreneau, suppressionEnvoyeeHeritee, jePasseDevant, TRACES_DE_RETRAIT_RE } from '../supabase/functions/_shared/retenue-creneau.js';
import { ligneRepublicationPhotos } from '../supabase/functions/_shared/photos-lbc-amputees.js';
import { extraireFonctionJs } from './lib/extraire-fonction-js.mjs';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

console.log('1. Le retrait engagé se reconnaît');
{
  // le job de Louis tel qu'il était le 08/10 à 12:30 (champs utiles)
  const louis = { action: 'republish', platform: 'beebs', error: messageRetenueCreneau('beebs', '2026-10-10T17:00:00Z'),
    platform_fields: { republish_source: 'auto', republish_step: 'captured', needsUserAttempts: 1,
      republish_suppression_envoyee: { at: '2026-10-06T20:00:20.354Z', annonce: '32745154' } } };
  ok(retraitEngage(louis), 'le job de Louis (suppression envoyée, étape « captured ») : retrait engagé');
  ok(retraitEngage({ platform_fields: { republish_step: 'deleted' } }), 'étape « deleted » : retrait engagé');
  ok(retraitEngage({ platform_fields: { deleted_at: '2026-10-06T19:14:12Z' } }), 'deleted_at posé : retrait engagé');
  ok(retraitEngage({ platform_fields: { erreurs_archivees: [{ erreur: 'Suppression envoyée à Beebs (encore dans « Mes annonces »)' }] } }),
    'poste d\'avant la 0.6.97 : la trace écrite suffit');
  ok(!retraitEngage({ platform_fields: { republish_step: 'captured' }, error: 'Retrait Beebs non abouti. Ton annonce est TOUJOURS en ligne' }),
    'annonce vérifiée en ligne, rien envoyé : pas de retrait engagé (la retenue de créneau vaut)');
  ok(!retraitEngage({ platform_fields: {} }) && !retraitEngage(null), 'job vierge : pas de retrait engagé');
}

console.log('2. get-pending-jobs : aucune retenue de gouvernance sur un retrait engagé');
{
  const g = lire('supabase/functions/get-pending-jobs/index.ts');
  // (15/10) + messageRetenuePause : la pause de la republication automatique retient aussi.
  ok(/import \{ messageRetenueCreneau, (messageRetenuePause, )?retraitEngage \} from "\.\.\/_shared\/retenue-creneau\.js"/.test(g), 'retraitEngage importé');
  ok(/pf\["republish_step"\] !== "deleted"\s*&& !retraitEngage\(j\) && !exceptionCreneau\(pf\)/.test(g), 'créneau : un retrait engagé n\'est jamais retenu');
  ok(/\?\.\["republish_step"\] === "deleted" \|\|\s*retraitEngage\(j\)\);\s*heldRepublish = avant - out\.length;/.test(g), 'plafond du jour et pause de respiration : idem');
  ok(/\?\.\["republish_step"\] !== "deleted"\s*&& !retraitEngage\(j\)\)/.test(g), 'la trace de retenue ne s\'écrit pas sur un retrait engagé');
  ok(/Ton annonce est intacte, rien n'a été retiré/.test(messageRetenueCreneau('beebs', null)),
    'le message « intacte » ne vaut que pour une annonce que personne n\'a touchée (les seules encore retenues)');
}

console.log('3. Extension : jamais une remise en ligne sans preuve de la suppression');
{
  const b = lire('chrome-extension/background.js');
  const s = lire('chrome-extension/content-scripts/beebs.js');
  ok(/for \(const attente of \[0, 10_000, 20_000, 40_000, 60_000\]\)[\s\S]{0,200}if \(dernier\.verdict === "absente"\) \{\s*return \{ success: true/.test(s),
    'Beebs : la suppression n\'est « faite » que sur le verdict « absente »');
  ok(/success: false, reprise: true, suppressionEnvoyee: true/.test(s), '… sinon reprise, suppression envoyée, rien d\'autre');
  ok(/if \(result\.suppressionEnvoyee\) \{[\s\S]{0,900}return \{ status: "retry"/.test(b), 'suppression envoyée non prouvée : le job reste avant le redépôt');
  ok(/if \(!retire\) \{[\s\S]{0,300}\}\s*\/\/ ── RETIRÉE : étape actée[\s\S]{0,120}pfApres\.republish_step = "deleted";/.test(b), 'l\'étape « deleted » (redépôt) n\'est posée qu\'après un retrait prouvé');
  ok(/\(state === "unavailable" \|\| state === "sold"\) && suppressionDejaEnvoyee\(job, pf\)[\s\S]{0,200}pf\.republish_step = "captured";/.test(b),
    'à la reprise, une annonce absente après NOTRE suppression repasse par la preuve d\'absence');
}

console.log('4. Le balayage ne lance pas ce qui ne peut pas finir dans le créneau (20261008140000)');
{
  const m = lire('supabase/migrations/20261008140000_republication_finit_dans_son_creneau.sql');
  ok(/FUNCTION public\.republish_duree_estimee\(p_user uuid, p_platform text\)/.test(m) && /republish_source' = 'auto'/.test(m),
    'durée estimée : médiane des 10 dernières republications automatiques du compte');
  ok(/WHEN 'beebs' THEN 1500 WHEN 'leboncoin' THEN 600 ELSE 300/.test(m), '… sinon une valeur par plateforme (mesurée sur 14 jours)');
  ok(/IF v_row\.fin IS NOT NULL AND v_row\.fin - now\(\) < make_interval\(secs => v_duree\) THEN[\s\S]{0,300}CONTINUE;/.test(m),
    'moins de temps restant que la durée : aucune republication lancée');
  ok(/'republish_step' = 'deleted' OR j\.platform_fields \? 'republish_suppression_envoyee'/.test(m),
    'une suppression envoyée compte comme un retrait en vol (le créneau attend)');
  ok(fs.existsSync(path.join(racine, 'supabase/rollbacks/20261008140000_republication_finit_dans_son_creneau_INVERSE.sql')), 'l\'inverse est prêt');
}

// ── (04/11, 9cdr9rm4rn — Beebs) UNE TRACE HÉRITÉE NE RETIENT PERSONNE ; DEUX JOBS NE S'ATTENDENT JAMAIS ──────────────
console.log('5. Le marqueur hérité d\'une republication précédente (04/11)');
// Les deux jobs du 03/11 tels qu'ils étaient avant le déblocage manuel (champs utiles, lus en base).
const pyjama = { id: 'c10e8d1a', action: 'republish', platform: 'beebs', created_at: '2026-11-03T14:22:12Z', platform_listing_id: '34199633',
  listing_url: 'https://www.beebs.app/fr/p/34199633', platform_fields: { republish_step: 'captured',
    republish_suppression_envoyee: { annonce: '34174560', at: '2026-10-18T14:59:30Z' } } };
const ensemble = { id: '07c8d5e3', action: 'republish', platform: 'beebs', created_at: '2026-11-03T14:22:03Z', platform_listing_id: '34199441',
  listing_url: 'https://www.beebs.app/fr/p/34199441', platform_fields: { republish_step: 'captured',
    republish_suppression_envoyee: { annonce: '34174206', at: '2026-10-18T05:20:56Z' },
    retenue_hors_ligne: { job: 'c10e8d1a', titre: 'Pyjama 36 mois', depuis: '2026-11-04T09:06:49Z' } } };
{
  ok(suppressionEnvoyeeHeritee(pyjama) && !retraitEngage(pyjama), 'Pyjama : marqueur du 18/10 (34174560), annonce actuelle 34199633 → hérité, pas engagé');
  ok(suppressionEnvoyeeHeritee(ensemble) && !retraitEngage(ensemble), 'Ensemble : idem (34174206 / 34199441)');
  const sans = { ...pyjama, platform_fields: { republish_step: 'captured', republish_suppression_envoyee: { at: '2026-10-18T14:59:30Z' } } };
  ok(!suppressionEnvoyeeHeritee(sans) && retraitEngage(sans), 'marqueur SANS annonce : il retient (vraie protection)');
  const actuel = { ...pyjama, platform_fields: { republish_step: 'captured', republish_suppression_envoyee: { annonce: '34199633', at: '2026-11-04T14:20:00Z' } } };
  ok(retraitEngage(actuel), 'marqueur au numéro ACTUEL : il retient');
  const apres = { ...pyjama, platform_fields: { republish_step: 'captured', republish_suppression_envoyee: { annonce: '34174560', at: '2026-11-03T15:00:00Z' } } };
  ok(retraitEngage(apres), 'autre numéro mais écrit APRÈS la naissance du job : il retient (une seule preuve ne suffit pas)');
  const sansNumero = { ...pyjama, platform_listing_id: null, listing_url: null };
  ok(retraitEngage(sansNumero), 'job sans numéro à comparer : il retient');
  const sansNaissance = { ...pyjama, created_at: undefined };
  ok(retraitEngage(sansNaissance), 'naissance inconnue : il retient');
  const retire = { ...pyjama, platform_listing_id: null, listing_url: null, platform_fields: { republish_step: 'captured',
    old_platform_listing_id: '34199633', republish_suppression_envoyee: { annonce: '34199633', at: '2026-11-04T14:20:00Z' } } };
  ok(retraitEngage(retire), 'annonce vraiment retirée (numéro passé dans old_platform_listing_id) : elle retient');
  ok(retraitEngage({ ...pyjama, platform_fields: { republish_step: 'deleted' } }), 'étape « deleted » : toujours engagé');
  // Depop : l'identifiant est un slug (thibault.andrieux, c9dbe10d).
  const depop = { id: 'c9dbe10d', platform: 'depop', created_at: '2026-10-30T10:00:00Z', platform_listing_id: 'thaad_733-sweat-7fbe',
    listing_url: 'https://www.depop.com/products/thaad_733-sweat-7fbe/', platform_fields: { republish_step: 'captured',
      republish_suppression_envoyee: { annonce: 'tha9d_733-sweat-e662', at: '2026-10-20T08:00:00Z' } } };
  ok(suppressionEnvoyeeHeritee(depop) && !retraitEngage(depop), 'Depop : un slug d\'une autre annonce, écrit avant → hérité');
  const depopLien = { ...depop, platform_fields: { ...depop.platform_fields, republish_suppression_envoyee: { annonce: 'https://www.depop.com/products/thaad_733-sweat-7fbe/', at: '2026-10-31T08:00:00Z' } } };
  ok(retraitEngage(depopLien), 'Depop : le lien de l\'annonce actuelle → il retient');
  const archive = { ...pyjama, platform_fields: { republish_step: 'captured',
    erreurs_archivees: [{ erreur: 'Suppression envoyée à Beebs (encore dans « Mes annonces »)', le: '2026-10-18T15:00:00Z' }],
    error_technique: { brut: 'Suppression envoyée à Beebs', at: '2026-10-18T15:00:00Z' } } };
  ok(!retraitEngage(archive), 'trace écrite datée d\'avant la naissance du job : pas la sienne');
  const archiveSienne = { ...archive, platform_fields: { republish_step: 'captured',
    erreurs_archivees: [{ erreur: 'Suppression envoyée à Beebs (encore dans « Mes annonces »)', le: '2026-11-04T09:00:00Z' }] } };
  ok(retraitEngage(archiveSienne), 'trace écrite après la naissance : la sienne, elle retient');
}

console.log('6. Deux jobs ne s\'attendent jamais : le plus ancien passe');
{
  // Ensemble (né à 15:22:03) attend le Pyjama (15:22:12) ; si le Pyjama est jugé derrière l'Ensemble, l'Ensemble passe.
  const pyjamaVraimentEnvoye = { ...pyjama, platform_fields: { ...pyjama.platform_fields, retenue_hors_ligne: { job: '07c8d5e3' } } };
  ok(jePasseDevant(ensemble, pyjamaVraimentEnvoye), 'cycle : l\'Ensemble (le plus ancien) passe devant le Pyjama qui l\'attend');
  ok(!jePasseDevant(pyjamaVraimentEnvoye, ensemble), '… et le Pyjama (le plus récent) attend');
  ok(!jePasseDevant(ensemble, pyjama), 'aucun cycle (le frère n\'attend pas ce job) : on attend, comme avant');
  ok(!jePasseDevant(ensemble, { ...pyjamaVraimentEnvoye, platform_fields: { ...pyjamaVraimentEnvoye.platform_fields, republish_step: 'deleted' } }),
    'un frère à l\'étape « deleted » (vraiment retiré) retient toujours');
  ok(!jePasseDevant({ ...ensemble, created_at: null }, pyjamaVraimentEnvoye), 'date illisible : on attend');
}

console.log('7. L\'extension juge comme le serveur (copie dans background.js)');
{
  const bg = lire('chrome-extension/background.js');
  const noms = ['jetonsAnnonce', 'pfDeJob', 'identifiantsVises', 'naissanceJob', 'suppressionEnvoyeeHeritee', 'textesDuJob', 'jePasseDevant', 'suppressionDejaEnvoyee', 'retraitEngageJob'];
  const corps = noms.map((n) => extraireFonctionJs(bg, n)).join('\n');
  const ext = new Function(`${corps}\nreturn { suppressionEnvoyeeHeritee, jePasseDevant, suppressionDejaEnvoyee, retraitEngageJob };`)();
  const cas = [pyjama, ensemble, { ...pyjama, created_at: undefined }, { ...pyjama, platform_listing_id: null, listing_url: null },
    { ...pyjama, platform_fields: { republish_step: 'captured', republish_suppression_envoyee: { annonce: '34174560', at: '2026-11-03T15:00:00Z' } } },
    { ...pyjama, platform_fields: { republish_step: 'captured', republish_suppression_envoyee: { at: '2026-10-18T14:59:30Z' } } },
    { ...pyjama, platform_fields: { republish_step: 'captured', erreurs_archivees: [{ erreur: 'Suppression envoyée à Beebs', le: '2026-10-18T15:00:00Z' }] } },
    { ...pyjama, platform_fields: { republish_step: 'captured', erreurs_archivees: [{ erreur: 'Suppression envoyée à Beebs', le: '2026-11-04T15:00:00Z' }] } }];
  ok(cas.every((j) => ext.suppressionEnvoyeeHeritee(j) === suppressionEnvoyeeHeritee(j)), 'suppressionEnvoyeeHeritee : même verdict que le serveur sur les 8 cas');
  ok(cas.every((j) => ext.suppressionDejaEnvoyee(j, j.platform_fields) === retraitEngage(j)), 'le juge de SOI (suppressionDejaEnvoyee) = retraitEngage du serveur');
  ok(cas.every((j) => ext.retraitEngageJob(j) === (j.platform_fields.republish_step === 'deleted' || Boolean(j.platform_fields.deleted_at)
    || Boolean(j.platform_fields.republish_suppression_envoyee && !suppressionEnvoyeeHeritee(j)))), 'retraitEngageJob : marqueur hérité muet');
  ok(ext.jePasseDevant(ensemble, { ...pyjama, platform_fields: { ...pyjama.platform_fields, retenue_hors_ligne: { job: '07c8d5e3' } } })
    && !ext.jePasseDevant(ensemble, pyjama), 'jePasseDevant : même règle que le serveur');
  const garde = bg.slice(bg.indexOf('const baseHorsLigne = '), bg.indexOf('retenirDerriereAnnonceHorsLigne(accessToken, job, pf, horsLigne[0])'));
  ok(/select=id,title,created_at,error,platform_listing_id,listing_url,platform_fields/.test(garde)
    && /\.filter\(\(r\) => suppressionDejaEnvoyee\(r, r\?\.platform_fields \?\? \{\}\)\)\s*\.filter\(\(r\) => !jePasseDevant\(job, r\)\)/.test(garde),
    'le garde-fou juge les autres avec le même juge que soi, puis le filet du cycle');
}

console.log('8. Une republication neuve n\'hérite d\'aucune trace de retrait (20261104210000)');
{
  const m = lire('supabase/migrations/20261104210000_republication_sans_traces_de_retrait.sql');
  const reSql = m.match(/WHERE e\.key !~ '([^']+)'/)?.[1];
  ok(reSql && reSql === TRACES_DE_RETRAIT_RE.source, 'la règle SQL et son miroir JS sont identiques', reSql);
  ok(/v_pf_src := public\.republication_sans_traces\(COALESCE\(v_src\.platform_fields, '\{\}'::jsonb\)\)\s*- ARRAY\['needsUserField'/.test(m),
    'spend_coins_and_republish : la copie passe par la règle, PUIS la liste d\'avant');
  ok((m.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length === 2 && !/republish_planifiee_sweep/.test(m.replace(/^--.*$/gm, '')),
    'deux fonctions seulement ; la cadence (republish_planifiee_sweep) n\'est pas touchée');
  const traces = ['republish_suppression_envoyee', 'suppression_non_prouvee', 'preuve_retrait', 'republish_retrait', 'retenue_hors_ligne',
    'retenue_levee_le', 'recreation_attente_depuis', 'recreated_at', 'deleted_at', 'old_platform_listing_id', 'new_listing_url', 'orphan_alerted_at',
    'error_technique', 'retrait_arme', 'republish_etat_indetermine', 'republish_reprise_apres_suppression', 'deja_absente', 'delete_trace'];
  ok(traces.every((k) => TRACES_DE_RETRAIT_RE.test(k)), 'toutes les traces de retrait relevées en base sont attrapées');
  const depot = ['beebsAspects', 'beebsCategory', 'lbcCategory', 'adresse', 'taille', 'marque', 'colis', 'republish_prevol_formulaire',
    'republish_source', 'photos_lbc', 'depopCategory', 'ebayAspects', 'preuve_identifiant_beebs', 'vinted_item_id', 'prix_republication'];
  ok(!depot.some((k) => TRACES_DE_RETRAIT_RE.test(k)), 'aucun champ de dépôt n\'est attrapé');
  const ligne = ligneRepublicationPhotos({ user_id: 'u', inventaire_id: 1, platform: 'leboncoin', title: 't', photos: [],
    platform_fields: { lbcCategory: 'x', republish_suppression_envoyee: { annonce: '1', at: '2026-10-18T00:00:00Z' }, preuve_retrait: {}, retenue_levee_le: 'x' } });
  ok(ligne.platform_fields.lbcCategory === 'x' && !('republish_suppression_envoyee' in ligne.platform_fields) && !('preuve_retrait' in ligne.platform_fields)
    && !('retenue_levee_le' in ligne.platform_fields), 'republier-photos-lbc : même règle (miroir JS)');
  ok(fs.existsSync(path.join(racine, 'supabase/rollbacks/20261104210000_republication_sans_traces_de_retrait_INVERSE.sql')), 'l\'inverse est prêt');
}

console.log(ko ? `\n${ko} contrôle(s) en échec.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
