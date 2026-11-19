#!/usr/bin/env node
// VERROU (19/11/2026 soir, ordre de Nico — Lizzaa, 88 dépôts Leboncoin bloqués) : le nom et le prénom donnés dans FillSell
// ne sont posés que par l'extension ≥ 0.6.193 (ou le Cloud). Avant ce correctif : (1) l'éclaireur relancé par l'écran
// tournait sur la 0.6.192 et butait (cases vides), (2) rien ne le relançait quand le poste se mettait à jour (12 h),
// (3) l'écran promettait « FillSell les posera lui-même » à une extension qui ne sait pas.
// Rouge avant (module absent, handler-watch et l'écran muets), vert après.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m, x = '') => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${x ? ` — ${x}` : ''}`); } };
let P = null;
try { P = await import('../supabase/functions/_shared/lbc-identite-pose.js'); } catch (e) { ok(false, 'module _shared/lbc-identite-pose.js', e.message); }

const H = 3_600_000, MIN = 60_000;
const now = Date.parse('2026-11-19T15:30:00Z');
const B192 = '2026-11-16T14:54:01Z+4e5f9ee · v0.6.192';
const B193 = '2026-11-18T22:02:42Z+362d9af';
const C193 = '2026-11-19T07:26:34Z+d41d83e-cloud · v0.6.193.46412';
const C194 = '2026-11-19T12:01:56Z+b8a84d3-cloud · v0.6.194.46440';
const C191 = '2026-11-15T17:45:58Z+9fdb844-cloud · v0.6.191.45898';
const ID = { nom: 'Martin', prenom: 'Claire', enregistre_le: '2026-11-19T08:00:26.073Z' };

console.log('1. Le poste sait-il poser le nom et le prénom ?');
if (P) {
  ok(P.posteSaitPoserIdentite(B192) === false && P.posteSaitPoserIdentite('2026-11-16T14:54:01Z+4e5f9ee') === false, '0.6.192 : non');
  ok(P.posteSaitPoserIdentite(B193) === true, '0.6.193 (build CWS 362d9af) : oui');
  ok(P.posteSaitPoserIdentite(C193) === true && P.posteSaitPoserIdentite(C194) === true, 'copies Cloud 0.6.193 / 0.6.194 : oui');
  ok(P.posteSaitPoserIdentite(C191) === false, 'copie Cloud 0.6.191 : non');
  ok(P.posteSaitPoserIdentite(null) === false && P.posteSaitPoserIdentite('releve-annonces') === false && P.posteSaitPoserIdentite('') === false, 'illisible : non');
  ok(P.compteSaitPoserIdentite({ cloud_voie: true, extension_build: B192 }) === true, 'compte au Cloud : oui, quel que soit le build de son ordinateur');
  ok(P.compteSaitPoserIdentite({ cloud_voie: false, extension_build: null }) === null && P.compteSaitPoserIdentite(null) === null, 'inconnu : null (l\'écran garde son texte)');
}

console.log('2. Quand relancer l\'éclaireur tout de suite');
if (P) {
  const R = (o) => P.relanceIdentiteImmediate({ maintenant: now, identite: ID, ...o });
  const vu = new Date(now - 5 * MIN).toISOString();
  const lizzaaAvant = { profil: { extension_build: '2026-11-16T14:54:01Z+4e5f9ee', cloud_voie: false, extension_last_seen_at: vu },
    dernierEclaireur: { le: Date.parse('2026-11-19T08:17:15Z'), status: 'needs_user', handler_build: B192 } };
  ok(R(lizzaaAvant).relancer === false && R(lizzaaAvant).motif === 'poste_ne_sait_pas', 'Lizzaa aujourd\'hui (0.6.192) : rien (un essai voué à l\'échec)');
  const lizzaaApres = { ...lizzaaAvant, profil: { ...lizzaaAvant.profil, extension_build: '2026-11-19T12:01:34Z+b8a84d3' } };
  ok(R(lizzaaApres).relancer === true && R(lizzaaApres).motif === 'dernier_eclaireur_sans_pose', 'Lizzaa passée en 0.6.194 : relance TOUT DE SUITE (le dernier essai a tourné en 0.6.192)', JSON.stringify(R(lizzaaApres)));
  ok(R({ ...lizzaaApres, dernierEclaireur: { le: Date.parse('2026-11-19T07:00:00Z'), status: 'needs_user', handler_build: B193 } }).motif === 'identite_apres_dernier_eclaireur',
    'nom et prénom enregistrés APRÈS le dernier essai, poste à jour : relance tout de suite');
  ok(R({ ...lizzaaApres, dernierEclaireur: null }).relancer === true, 'aucun éclaireur encore : relance');
  ok(R({ ...lizzaaApres, dernierEclaireur: { le: now - 2 * H, status: 'needs_user', handler_build: C194 } }).motif === 'cadence_12h',
    'le dernier essai a tourné sur un poste qui sait (et a buté) : la cadence de 12 h reprend, pas de boucle');
  ok(R({ ...lizzaaApres, dernierEclaireur: { le: now - 30 * MIN, status: 'pending', handler_build: B192 } }).motif === 'eclaireur_en_route',
    'un éclaireur déjà en route : jamais un 2e');
  ok(R({ ...lizzaaApres, dernierEclaireur: { le: now - 3 * MIN, status: 'needs_user', handler_build: B192 } }).motif === 'eclaireur_recent', 'moins de 10 min : jamais doublé');
  ok(R({ ...lizzaaApres, identite: { nom: '', prenom: 'Claire' } }).motif === 'sans_identite', 'sans nom et prénom valides : rien');
  ok(R({ ...lizzaaApres, profil: { ...lizzaaApres.profil, extension_last_seen_at: new Date(now - 30 * H).toISOString() } }).motif === 'poste_eteint', 'poste éteint (> 24 h) : rien');
  ok(R({ ...lizzaaAvant, profil: { ...lizzaaAvant.profil, cloud_voie: true } }).relancer === true, 'compte au Cloud : relance (la copie Cloud sait les poser)');
}

console.log('3. handler-watch relance seul, sans attendre 12 h');
const hw = lire('supabase/functions/handler-watch/index.ts');
ok(/import \{ relanceIdentiteImmediate \} from "\.\.\/_shared\/lbc-identite-pose\.js";/.test(hw), 'import de la règle');
ok(/relanceIdentiteImmediate\(\{ identite: \(profil\?\.identite \?\? null\)/.test(hw) && /identite:platform_settings->leboncoin->identite_vendeur/.test(hw)
  && /extension_build, cloud_voie/.test(hw), 'profil lu : build, Cloud, nom et prénom enregistrés');
ok(/select\("id, user_id, status, published_at, handler_build, platform_fields"\)/.test(hw), 'le build qui a joué le dernier éclaireur est lu');
const iImm = hw.indexOf('if (imm.relancer)'), i12 = hw.indexOf('if (dernier && now - dernier < ECLAIREUR_INTERVALLE_MS) continue;');
ok(iImm > 0 && i12 > iImm, 'la relance immédiate passe AVANT la cadence de 12 h');
ok(/\.eq\("id", String\(eclI\.id\)\)\.eq\("status", "needs_user"\)/.test(hw), 'compare-and-swap sur needs_user');

console.log('4. L\'écran dit la vérité à une extension trop ancienne');
const ec = lire('src/stock/EcranIdentiteLbc.jsx');
ok(/compteSaitPoserIdentite\(data\)/.test(ec) && /select\('platform_settings, extension_build, cloud_voie'\)/.test(ec), 'l\'écran lit le build et le Cloud du compte');
ok(/if \(ancienneExtension\) \{ setEtat\('enregistre'\); return; \}/.test(ec), 'extension trop ancienne : enregistrés, aucun essai lancé');
ok(/Ta version de l’extension FillSell ne sait pas encore les poser/.test(ec), 'le texte dit la vérité');
ok(/const ancienneExtension = !cloud && saitPoser === false;/.test(ec), 'Cloud ou build inconnu : le texte d\'avant');

console.log('5. Le texte d\'une ancienne extension ne promet plus ce qu\'elle ne fait pas');
if (P) {
  const PROMESSE = 'FillSell les posera lui-même à chaque dépôt.';
  ok(P.messageIdentitePourBuild(B192, PROMESSE) === P.MSG_LBC_IDENTITE_EXTENSION_A_METTRE_A_JOUR, '0.6.192 : « dès que ton extension sera à jour »');
  ok(P.messageIdentitePourBuild(C194, PROMESSE) === PROMESSE && P.messageIdentitePourBuild(B193, PROMESSE) === PROMESSE, '0.6.193 et plus : la promesse (tenue)');
  ok(/nom et ton prénom sur ton compte vendeur/.test(P.MSG_LBC_IDENTITE_EXTENSION_A_METTRE_A_JOUR) && !/posera lui-même à chaque dépôt/.test(P.MSG_LBC_IDENTITE_EXTENSION_A_METTRE_A_JOUR),
    'même tournure (geste de la personne), sans la promesse');
  const ms = lire('src/utils/messagesServeur.js');
  ok(ms.includes(P.MSG_LBC_IDENTITE_EXTENSION_A_METTRE_A_JOUR), 'traduit dans src/utils/messagesServeur.js (texte exact)');
}
const ujs = lire('supabase/functions/update-job-status/index.ts');
ok(ujs.includes('const msgI = messageIdentitePourBuild(body.handler_build, MSG_LBC_ESCROW_IDENTITE);') && ujs.includes('patch.error = `${msgI}${annexe}`;')
  && !ujs.includes('patch.error = `${MSG_LBC_ESCROW_IDENTITE}${annexe}`;'),
  'update-job-status : le texte selon le build qui écrit');

console.log(ko ? `✗ lbc-identite-pose-1911 : ${ko} échec(s) sur ${n}` : `✓ lbc-identite-pose-1911 : ${n}/${n}`);
process.exit(ko ? 1 : 0);
