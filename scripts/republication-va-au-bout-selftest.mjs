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
import { retraitEngage, messageRetenueCreneau } from '../supabase/functions/_shared/retenue-creneau.js';

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
  ok(/import \{ messageRetenueCreneau, retraitEngage \} from "\.\.\/_shared\/retenue-creneau\.js"/.test(g), 'retraitEngage importé');
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

console.log(ko ? `\n${ko} contrôle(s) en échec.` : '\nTout est vert.');
process.exit(ko ? 1 : 0);
