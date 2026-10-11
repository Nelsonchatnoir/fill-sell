// selftest:creneau-suit-le-reglage — (11/10, Louis, @evat) La ligne du créneau
// suit le réglage : déplacer la FIN d'un créneau en cours ne fige plus la
// republication planifiée sur l'ancienne fin (mig 20261011180000), et l'app
// annonce ce que le balayage fera vraiment.
// Cas fondateur : deux boutiques, Chrome sur @evat, créneau passé de 12–14 à
// 12–23:59 → la ligne 317 gardait 14:00, plus aucun job après 12:27:05.
// Rejeu réel (transaction annulée puis appliquée le 11/10 17:16) : ligne 317
// réalignée 17:18:05, job b142cd6c créé, republié 17:21:21 sur @evat.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const lire = (p) => fs.readFileSync(path.join(ici, '..', p), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; console.log(`  ✓ ${msg}`); };

const mig = lire('supabase/migrations/20261011180000_republication_creneau_suit_le_reglage.sql');
const inv = lire('supabase/rollbacks/20261011180000_republication_creneau_suit_le_reglage_INVERSE.sql');
const sweep = mig.slice(mig.indexOf('CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()'), mig.indexOf('CREATE OR REPLACE FUNCTION public.republish_planifiee_etat('));
const etat = mig.slice(mig.indexOf('CREATE OR REPLACE FUNCTION public.republish_planifiee_etat('));

console.log('1. Le balayage : la ligne suit le réglage');
const i2ter = sweep.indexOf('2ter. (11/10, Louis');
const i3 = sweep.indexOf('-- 3. Extension vivante ?');
const i6ter = sweep.indexOf('-- 6ter.');
ok(i2ter > 0 && i2ter < i3 && i3 < i6ter, 'le réalignement (2ter) précède toute garde — 6ter lit donc la fin du réglage');
ok(/v_row\.fin IS DISTINCT FROM v_fin_regl/.test(sweep) && /v_row\.a IS DISTINCT FROM \(v_regl ->> 'a'\)::time/.test(sweep) && /v_row\.de IS DISTINCT FROM \(v_regl ->> 'de'\)::time/.test(sweep),
  'déclenché par une fin ou des heures qui ne sont plus celles du réglage');
ok(/fin = v_fin_regl/.test(sweep) && /statut = CASE WHEN v_fin_regl > now\(\) THEN 'en_cours' ELSE statut END/.test(sweep),
  'nouvelle fin, ligne rouverte si la fin est à venir (une ligne « ecourte » sur une fin périmée reprend)');
ok(/prevues = v_faits_cr \+ v_prevues/.test(sweep) && /republish_planifiee_actives_eligibles\(v_compte\.id\)/.test(sweep.slice(i2ter, i3)),
  'prévues = faites + calcul de création pour le temps restant (part égale entre plateformes)');
ok(/\(sautes - '_fin_de_creneau' - '_prevues_atteintes'\)/.test(sweep) && /'_reglage_change'/.test(sweep), 'notes périmées retirées, réalignement tracé (_reglage_change)');
ok(/v_debut_ryt := COALESCE\(NULLIF\(v_row\.sautes -> '_reglage_change' ->> 'depuis', ''\)::timestamptz, v_row\.debut\)/.test(sweep)
  && /v_intervalle := extract\(epoch FROM \(v_row\.fin - v_debut_ryt\)\) \/ GREATEST\(1, v_prev_ryt\)/.test(sweep),
  'rythme compté depuis le réalignement (jamais plus serré que la création)');
ok(/v_row\.fin - now\(\) < make_interval\(secs => v_duree\)/.test(sweep), '6ter inchangée : jamais une republication qui ne peut pas finir dans le créneau');
ok(/AND COALESCE\(boutique, ''\) = COALESCE\(v_boutique, ''\)/.test(sweep) && /WHEN v_boutique IS NOT NULL AND c\.boutique = v_boutique THEN 0/.test(sweep),
  'garde-fous intacts : la ligne et les candidats restent ceux de la boutique connectée (rien sur une autre boutique)');
ok(/EXIT WHEN v_cree;/.test(sweep) && /IF v_hors_ligne \+ v_mobiles > 0 THEN/.test(sweep), 'un job par compte et par passage, une republication en vol à la fois : inchangés');

console.log('2. L\'état lu par l\'app');
ok(!/republish_planifiee_capacite_partagee\(/.test(etat), 'plus de « capacité partagée » (un autre calcul que le balayage)');
ok(/v_source_capacite := 'creneau_en_cours'/.test(etat) && /v_cr\.fin = \(v_fen ->> 'courant_fin'\)::timestamptz/.test(etat),
  'créneau en cours dont la ligne suit le réglage : ses prévues restantes, bornées par le temps à son rythme');
ok(/'capacite_source', v_source_capacite/.test(etat), 'la source de la capacité est rendue (creneau_en_cours | creation)');
ok(/Définitions de départ : pg_get_functiondef EN PROD/.test(mig) && /CREATE OR REPLACE FUNCTION public\.republish_planifiee_sweep\(\)/.test(inv),
  'parti de la prod, inverse prêt (définitions d\'avant)');

console.log('3. L\'écran du réglage');
const app = lire('src/components/RepublicationPlanifiee.jsx');
ok(!/Attend que Chrome soit sur ce compte/.test(app), 'plus de « Attend que Chrome soit sur ce compte » quand la boutique ouverte est inconnue');
ok(/Chrome est sur \$\{loginConnectee/.test(app) && /pas encore lue/.test(app) && /Chrome est ouvert sur/.test(app),
  'la boutique réellement ouverte est nommée (ou « pas encore lue »), avec l\'heure de la lecture');

console.log(`\n✓ creneau-suit-le-reglage : ${n} contrôles verts`);
