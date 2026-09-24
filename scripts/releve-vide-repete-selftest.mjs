// ═══════════════════════════════════════════════════════════════════════════
// RELEVÉS VIDES D'AFFILÉE — SELFTEST (2026-09-24, pironneau.vincent)
// ═══════════════════════════════════════════════════════════════════════════
// La règle vit au SERVEUR (migration 20260924234000, releve_vide_etat) et elle
// a été jouée à blanc EN PROD avant d'être appliquée : veilleur Leboncoin de
// pironneau refusé (RELEVE_VIDE_ARRET, 50 relevés vides), cron / app / veilleur
// Opla acceptés, relevé vide → complet=false, vide_non_probant=true,
// disparues=0 ; compte sans annonce → complet=true, inchangé.
//
// Ce test fige ce qui se lit HORS de la base :
//   1. le rangement côté app (src/annonces/releveVide.js), exécuté sur les
//      VRAIES lignes relevées en base le 24/09 à 21:57 — pas une forme
//      imaginée (cf. mémoire « un cas de test se relève en base ») ;
//   2. la migration elle-même : seul le veilleur est gardé, 45 min puis arrêt
//      à deux, et rapprocher_releve ne touche que le relevé qui n'a RIEN vu.
//
//   npm run selftest:releve-vide-repete
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexerRelevesVides, avecDernierReleveVide } from '../src/annonces/releveVide.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// ── Les lignes RÉELLES (base, 24/09 21:57) ──────────────────────────────────
// Ce que lireDerniersRunsReleve rendait pour Leboncoin : le relevé demandé
// depuis l'app le 23/09 (queued_at posé → trié AVANT les relevés du veilleur,
// qui n'en ont pas).
const RUN_APP_2309 = {
  id: '4c6121f5-42e2-4a41-a231-0dad93c6e807', platform: 'leboncoin', status: 'done', declencheur: 'app',
  items_vus: 528, items_crees: 0, items_maj: 0, total_entries: 528,
  erreur: '[défilement] [adresse] 6 page(s) de 100 · [rattachement] par identifiant 0, automatiques 0, proposées 0, sans candidat 528, disparues 0 · [capture] 30 fiche(s) capturée(s), 438 au prochain relevé',
  queued_at: '2026-09-23T08:55:59.679816+00:00', started_at: '2026-09-23T08:57:31.346+00:00', finished_at: '2026-09-23T09:01:55.422+00:00',
};
// Ce que releves_vides_signales rend pour lui (releve_vide_etat, 24/09 21:57).
const ETAT_LBC = {
  arret: true, platform: 'leboncoin', vides_consecutifs: 50, avait_des_annonces: true, reprise_veilleur_le: null,
  dernier_vide_le: '2026-09-24T19:54:36.497+00:00',
  dernier_vide_run: {
    id: '0bdcf81d-3e14-4620-9c66-d2c1b6a28224', platform: 'leboncoin', status: 'done', declencheur: 'veilleur',
    items_vus: 0, items_crees: 0, items_maj: 0, total_entries: 0,
    erreur: '[défilement] [adresse] 1 page(s) de 100 · [rattachement] par identifiant 0, automatiques 0, proposées 0, sans candidat 0, importées 0, disparues 0',
    queued_at: null, started_at: '2026-09-24T19:54:36.274632+00:00', finished_at: '2026-09-24T19:54:36.497+00:00',
  },
};
const RUN_BEEBS = { id: 'b', platform: 'beebs', status: 'done', items_vus: 8, finished_at: '2026-09-23T08:36:08.308+00:00', queued_at: '2026-09-23T08:31:20.309398+00:00' };

console.log('1. La réponse du serveur, rangée');
{
  const v = indexerRelevesVides([ETAT_LBC]);
  ok(Object.keys(v).length === 1 && v.leboncoin === ETAT_LBC, 'une plateforme à l\'arrêt → indexée par plateforme');
  ok(Object.keys(indexerRelevesVides([])).length === 0, 'liste vide (tous les autres comptes) → {}');
  ok(Object.keys(indexerRelevesVides(null)).length === 0, 'RPC absente / lecture ratée (null) → {}');
  ok(Object.keys(indexerRelevesVides([{ platform: 'opla', arret: false }])).length === 0, 'arret=false n\'est jamais signalé');
  ok(Object.keys(indexerRelevesVides([{ arret: true }, 'x', 3])).length === 0, 'forme inattendue → ignorée, rien ne casse');
}

console.log('2. La tuile Leboncoin de pironneau montre le relevé vide, plus « 528 »');
{
  const runs = { leboncoin: RUN_APP_2309, beebs: RUN_BEEBS };
  const out = avecDernierReleveVide(runs, { leboncoin: ETAT_LBC });
  ok(out.leboncoin === ETAT_LBC.dernier_vide_run, 'Leboncoin : la ligne du relevé vide le plus récent (21:54) remplace celle du 23/09');
  ok(out.leboncoin.items_vus === 0, 'le nombre affiché est 0, pas 528');
  ok(out.beebs === RUN_BEEBS, 'Beebs (non signalée) : ligne intouchée');
  ok(runs.leboncoin === RUN_APP_2309, 'la table d\'origine n\'est pas modifiée');
}

console.log('3. Ce qui ne change PAS');
{
  const runs = { leboncoin: RUN_APP_2309, beebs: RUN_BEEBS };
  ok(avecDernierReleveVide(runs, {}) === runs, 'aucun signal (tous les autres comptes) → la même table, à l\'identique');
  ok(avecDernierReleveVide(runs, null) === runs, 'signal illisible → la même table');
  const enCours = { ...RUN_APP_2309, status: 'running', finished_at: null };
  ok(avecDernierReleveVide({ leboncoin: enCours }, { leboncoin: ETAT_LBC }).leboncoin === enCours,
    'un relevé qui TOURNE garde la parole (tuile « en cours »)');
  const plusRecent = { ...RUN_APP_2309, finished_at: '2026-09-24T20:30:00+00:00', items_vus: 12 };
  ok(avecDernierReleveVide({ leboncoin: plusRecent }, { leboncoin: ETAT_LBC }).leboncoin === plusRecent,
    'une ligne affichée plus récente que le relevé vide reste affichée');
  ok(avecDernierReleveVide({}, { leboncoin: ETAT_LBC }).leboncoin === ETAT_LBC.dernier_vide_run,
    'aucune ligne affichée → le relevé vide s\'affiche');
  ok(avecDernierReleveVide({ leboncoin: RUN_APP_2309 }, { leboncoin: { ...ETAT_LBC, dernier_vide_run: null } }).leboncoin === RUN_APP_2309,
    'signal sans ligne de relevé → rien de remplacé');
}

console.log('4. La migration : seul le VEILLEUR est gardé, et un relevé vide ne prouve rien');
{
  const sql = fs.readFileSync(path.join(racine, 'supabase/migrations/20260924234000_releve_vide_espace_jamais_une_preuve.sql'), 'utf8').replace(/\r\n/g, '\n');
  const garde = sql.slice(sql.indexOf('FUNCTION public.garde_releve_vide_sync_runs()'), sql.indexOf('CREATE OR REPLACE TRIGGER'));
  ok(/NEW\.declencheur IS DISTINCT FROM 'veilleur'/.test(garde), 'la garde laisse passer tout ce qui n\'est pas le veilleur');
  ok(!/'cron'|'app'|'bouton_distant'|'reprise_connexion'|'serveur:/.test(garde.replace(/--.*$/gm, '')),
    'aucun autre déclencheur n\'est nommé dans le code de la garde (cron, app, serveur : intouchés)');
  ok(/NEW\.kind IS DISTINCT FROM 'annonces'/.test(garde), 'le dressing Vinted n\'est pas concerné');
  ok(/BEFORE INSERT ON public\.vinted_sync_runs/.test(sql), 'garde posée à la création du run (l\'UPDATE d\'une demande de l\'app n\'y passe pas)');
  ok(/'arret', v_vides >= 2/.test(sql), 'arrêt au DEUXIÈME relevé vide d\'affilée');
  ok(/v_vides = 1 THEN v_dernier_fin \+ interval '45 minutes'/.test(sql), '45 min après un relevé vide isolé');
  ok(/EXIT WHEN COALESCE\(r\.items_vus, 0\) > 0;/.test(sql), 'le premier relevé qui a vu quelque chose clôt la série');
  ok(/status = 'done' AND finished_at IS NOT NULL/.test(sql), 'seuls les relevés TERMINÉS comptent (failed / absente / expired : ni pour ni contre)');
  ok(/IF v_complet AND COALESCE\(array_length\(v_vus, 1\), 0\) = 0\s+AND releve_compte_avait_annonces\(v_user, v_pf\) THEN\s+v_complet := false;/.test(sql),
    'rapprocher_releve : seul un relevé qui n\'a RIEN vu, sur un compte qui avait des annonces, perd « complet »');
  ok(!/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rapprocher_releve\s*\(/i.test(sql),
    'rapprocher_releve n\'est pas réécrit en entier (remplacement ancré du corps prod)');
}

if (ko) { console.log(`\n✗ ${ko} contrôle(s) en échec`); process.exit(1); }
console.log('\n✓ relevés vides d\'affilée : rangement app et garde serveur conformes');
