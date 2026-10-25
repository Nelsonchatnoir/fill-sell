// selftest:rythme-par-plateforme — (25/10 soir, décision de Nico) LE RYTHME PAR PLATEFORME, DERRIÈRE UN INTERRUPTEUR
// ÉTEINT (coin_config.republish_rythme_par_plateforme, absent = rythme du COMPTE comme avant). Allumé : chaque plateforme
// compte son attente depuis SA dernière republication. Garde-fous : une seule action à la fois dans l'extension (verrou
// de flux, boucle séquentielle), « un job par compte et par passage », anti-rafale par plateforme — inchangés.
// Essais joués en prod le 25/10 (BEGIN … ROLLBACK) : éteint = balayage identique sur les 13 créneaux en cours ; le
// créneau de Jocabroc rejoué : éteint, Leboncoin attend 36 min derrière la republication Vinted ; allumé, il part.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ici = path.dirname(fileURLToPath(import.meta.url));
const lire = (p) => fs.readFileSync(path.join(ici, '..', p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };
const corps = (src) => {
  const i = src.indexOf('CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()');
  const a = src.indexOf('AS $function$', i);
  return src.slice(i, src.indexOf('$function$', a + 14) + 10);
};

const mig = lire('supabase/migrations/20261025200000_rythme_par_plateforme.sql');
const inv = lire('supabase/rollbacks/20261025200000_rythme_par_plateforme_INVERSE.sql');
const avant = lire('supabase/migrations/20261025180000_creneau_remplace_les_sautes.sql');
const nouveau = corps(mig);
const ancien = corps(inv);

console.log('1. Parti de la prod, inverse exact');
ok(/md5\(pg_get_functiondef\('public\.republish_planifiee_sweep\(\)'::regprocedure\)\) <> '22bb479d7197e7ec9e316aceb00aab01'/.test(mig),
  'garde md5 du corps de prod (= la migration 20261025180000)');
ok(crypto.createHash('md5').update(`${ancien}\n`).digest('hex') === '22bb479d7197e7ec9e316aceb00aab01', 'inverse : le corps de prod d\'avant, mot pour mot (md5)');
ok(ancien === corps(avant), 'l\'inverse est bien le corps appliqué à 17:58 (20261025180000)');

console.log('2. Trois ajouts, rien d\'autre');
const lignesNeuves = nouveau.split('\n').filter((l) => !ancien.split('\n').includes(l));
ok(lignesNeuves.length === 8, `8 lignes ajoutées (déclaration ; lecture de l'interrupteur et ses 4 lignes de commentaire ; filtre et son commentaire) — lu : ${lignesNeuves.length}`);
ok(ancien.split('\n').every((l) => nouveau.split('\n').includes(l)), 'aucune ligne du corps de prod retirée ni modifiée');
ok(/v_rythme_pf := COALESCE\(\(SELECT value FROM coin_config WHERE key = 'republish_rythme_par_plateforme'\), 0\) = 1;/.test(nouveau),
  'interrupteur lu une fois par balayage ; ABSENT = éteint');
const ref = nouveau.slice(nouveau.indexOf('SELECT j.created_at, j.platform INTO v_dernier, v_dernier_pf'));
ok(/AND \(NOT v_rythme_pf OR j\.platform = v_pf\)\s+ORDER BY j\.created_at DESC\s+LIMIT 1;/.test(ref.slice(0, 900)),
  'allumé : la republication de référence est celle de CETTE plateforme ; éteint : celle du compte (comme avant)');
ok(!/INSERT INTO (public\.)?coin_config/.test(mig), 'la migration n\'allume rien (aucune écriture dans coin_config)');

console.log('3. Les garde-fous ne bougent pas');
ok(/EXIT WHEN v_cree;/.test(nouveau), 'un job par compte et par passage');
ok(/IF v_hors_ligne \+ v_mobiles > 0 THEN/.test(nouveau) && /j\.platform = v_pf\s+AND j\.status IN \('pending', 'processing'\)/.test(nouveau),
  'anti-rafale par plateforme (une republication en vol bloque sa plateforme)');
ok(/v_row\.fin - now\(\) < make_interval\(secs => v_duree\)/.test(nouveau), '6ter : jamais une republication qui ne peut pas finir dans le créneau');
ok(/v_intervalle := extract\(epoch FROM \(v_row\.fin - v_debut_ryt\)\) \/ GREATEST\(1, v_prev_ryt\);/.test(nouveau), 'intervalle = durée / prévues (inchangé)');
const bg = lire('chrome-extension/background.js');
ok(/let jobFlowTail = Promise\.resolve\(\);/.test(bg) && /function withJobFlowLock\(label, fn\)/.test(bg) && /On sérialise : un seul flux de jobs à la fois/.test(bg),
  'extension : un seul flux de jobs à la fois (verrou de flux)');
ok(/for \(let i = 0; i < jobs\.length; i\+\+\) \{[\s\S]{0,4000}?const outcome = await processJob\(job, session\.access_token\);/.test(bg),
  'extension : les jobs d\'un poll passent l\'un APRÈS l\'autre (jamais deux onglets en parallèle)');

console.log('4. Allumer / éteindre');
const on = lire('scripts/reparations/20261025_rythme_par_plateforme_allumer.sql');
const off = lire('scripts/reparations/20261025_rythme_par_plateforme_eteindre.sql');
ok(/VALUES \('republish_rythme_par_plateforme', 1, now\(\)\)/.test(on) && /0\.6\.144/.test(on), 'allumer : une ligne, après la 0.6.144 acceptée et servie');
ok(/SET value = 0 WHERE key = 'republish_rythme_par_plateforme'/.test(off), 'éteindre : une ligne, effet au passage suivant');

console.log(`\n✓ rythme-par-plateforme : ${n} contrôles verts`);
