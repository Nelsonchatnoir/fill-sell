// selftest:vente-relevee-sans-annonce — (15/10, point 6, Bilal) une vente relevée
// par les commandes Vinted SANS numéro d'annonce rejoint sa fiche seulement quand
// la preuve est unique des deux côtés (même prix, dans la fenêtre de l'annonce,
// une seule vente, aucune autre annonce possible) ; jamais le titre ; jamais un
// rattachement sur un cas ambigu.
//   1. le SQL de la migration 20261015150000 (lecture) ;
//   2. la réparation des retraits annulés le 09/10 (lecture) ;
//   3. avec --prod : les cas rejoués dans des transactions ANNULÉES (rien n'est
//      écrit) — Bilal tel qu'avant le geste du 15/10 16:44, deux ventes, deux
//      annonces, offre, lot, fiche déjà vendue — puis l'historique (0 faux).
//   node scripts/vente-relevee-sans-annonce-selftest.mjs [--prod]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => fs.readFileSync(path.join(racine, p), 'utf8');
let n = 0; let ko = 0;
const ok = (c, m) => { try { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); } catch { ko++; console.log(`  ✗ ${m}`); } };
const sansCommentaires = (s) => s.replace(/--[^\n]*/g, '');
const corps = (sql, nom) => {
  const i = sql.indexOf(`FUNCTION public.${nom}(`);
  if (i < 0) return '';
  const d = sql.indexOf('$function$', i);
  return sql.slice(d, sql.indexOf('$function$', d + 10));
};

const MIG = 'supabase/migrations/20261015150000_vente_relevee_sans_annonce_rattachee.sql';
const INV = 'supabase/rollbacks/20261015150000_vente_relevee_sans_annonce_rattachee_INVERSE.sql';
const mig = lire(MIG);
const inv = lire(INV);
const cand = sansCommentaires(corps(mig, 'ventes_relevees_sans_annonce_candidats'));
const ratt = sansCommentaires(corps(mig, 'ventes_relevees_sans_annonce_rattacher'));
const tick = sansCommentaires(corps(mig, 'ventes_prouvees_tick'));

console.log('1. La règle (SQL de la migration)');
ok(cand.length > 0 && ratt.length > 0 && tick.length > 0, 'les trois fonctions sont dans la migration');
ok(!/titre/i.test(cand.replace(/coalesce\(v\.titre, ''\) !~\* '[^']*lot[^']*'/, '')),
  'jamais le titre : la seule lecture du titre est le veto « Lot N articles »');
ok(/v\.annonce_id IS NULL AND v\.inventaire_id IS NULL/.test(cand) && /v\.source = 'releve'/.test(cand),
  'côté vente : relevée par les commandes, sans annonce ni fiche');
ok(/v\.prix_vente = f\.prix/.test(cand) && /v\.vendu_le >= f\.fenetre_debut AND v\.vendu_le <= f\.fenetre_fin/.test(cand),
  'même prix, vendue dans la fenêtre de l\'annonce');
ok(/\(c\.platform_fields ->> 'sale_signal'\) = 'sold'/.test(cand) && /\? 'signal_conteste'/.test(cand)
  && /coalesce\(i\.quantite, 1\) <= 1/.test(cand) && /i\.statut = 'stock'/.test(cand),
  'côté annonce : carte « Vendue » ouverte, jamais contestée, fiche en stock à un exemplaire');
ok(/s\.status = 'active' AND s\.captured_at > fin\.t/.test(cand), 'jamais une annonce revue en ligne après sa fenêtre');
ok(/max\(s\.price\) >= q\.prix/.test(cand) && /\) >= q\.prix/.test(cand),
  'concurrentes à ce prix OU PLUS (offre acceptée : 2 faux rattachements sans cette garde)');
ok(!/listed_at_guess/.test(cand), 'jamais la date de la photo (listed_at_guess change quand on retouche les photos)');
ok(/j0\.created_at > q\.vendu_le/.test(cand) && /NOT ILIKE '%sync-dressing%'/.test(cand) && /LIMIT 5\) y/.test(cand),
  'seuil de création : annonces créées par FillSell APRÈS la vente (job créé avant l\'annonce), cinquième plus petit numéro');
ok(/\(nv\.n = 1 AND q\.autres_annonces_eligibles = 0 AND k\.n = 0\) AS rattachable/.test(cand),
  'rattachable = une seule vente, aucune autre annonce éligible, aucune concurrente');
ok(/IF NOT c\.rattachable THEN n_amb := n_amb \+ 1; CONTINUE; END IF;/.test(ratt), 'un cas ambigu n\'est jamais rattaché');
ok(/WHERE id = c\.vente_id AND user_id = c\.user_id AND inventaire_id IS NULL AND annonce_id IS NULL/.test(ratt),
  'la vente ne reçoit sa fiche que si elle n\'en a toujours aucune');
ok(/signal_vente_clore_vente_relevee\(c\.job_id, c\.vente_id,/.test(ratt) && !/INSERT INTO public\.ventes\b/.test(ratt)
  && !/enregistrer_vente_atomique/.test(ratt), 'clôture par la règle du lot H (vente déclarée, 0 mail) — aucune vente créée');
ok(/EXCEPTION WHEN OTHERS THEN/.test(ratt) && /n_vus >= v_max OR clock_timestamp\(\) - v_debut > v_budget/.test(ratt),
  'borné (nombre, durée) et isolé par vente');
ok(/'vente_relevee_rattachee'/.test(ratt), 'chaque rattachement tracé (usage_logs)');
ok(/pg_try_advisory_xact_lock\(hashtextextended\('ventes_prouvees_tick', 0\)\)/.test(tick)
  && /BEGIN\s+v_ratt := public\.ventes_relevees_sans_annonce_rattacher\(25, 4000\);\s+EXCEPTION WHEN OTHERS THEN/.test(tick),
  'appelée par ventes_prouvees_tick, même verrou, 25 / 4 s, isolée');
ok(/FOR c IN SELECT \* FROM ventes_prouvees_a_enregistrer\(v_depuis, v_max\) LOOP/.test(tick),
  'le reste du passage est inchangé (ventes prouvées depuis l\'armement)');
ok(/REVOKE ALL ON FUNCTION public\.ventes_relevees_sans_annonce_rattacher/.test(mig)
  && /REVOKE ALL ON FUNCTION public\.ventes_relevees_sans_annonce_candidats/.test(mig), 'fermées à anon / authenticated');
ok(!/ventes_relevees_sans_annonce_rattacher\(25/.test(sansCommentaires(inv)) && /DROP FUNCTION IF EXISTS public\.ventes_relevees_sans_annonce_rattacher/.test(inv),
  'l\'inverse rend le passage d\'avant et retire les deux fonctions');

console.log('2. La réparation des retraits annulés le 09/10 (questions promises)');
const rep = sansCommentaires(lire('scripts/reparations/20261015_questions_retraits_annules_0910.sql'));
const repInv = sansCommentaires(lire('scripts/reparations/20261015_questions_retraits_annules_0910_INVERSE.sql'));
ok(/'copie_non_prouvee'/.test(rep) && /'proposee'/.test(rep), 'pose la question « Déjà vendu ? »');
ok(!/insert into public\.cross_post_jobs/i.test(rep) && !/armer_retrait/i.test(rep), 'jamais un retrait d\'office');
ok(/a\.statut_plateforme = 'en_ligne'/.test(rep) && /i\.statut = 'vendu'/.test(rep)
  && /q\.preuves ->> 'job' = j\.id::text/.test(rep), 'seulement une copie en ligne, d\'une fiche vendue, jamais déjà questionnée');
ok(/q\.statut = 'proposee'/.test(repInv), 'l\'inverse ne défait jamais une réponse donnée');

if (process.argv.includes('--prod')) {
  console.log('3. EN PROD, transactions ANNULÉES (rien n\'est écrit)');
  const q = (sql) => {
    const f = path.join(os.tmpdir(), `vente-relevee-sans-annonce-${process.pid}-${Date.now()}.sql`);
    fs.writeFileSync(f, sql);
    try {
      const out = execSync(`npx supabase db query --linked -f "${f}"`, { cwd: racine, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
      return JSON.parse(out.slice(out.indexOf('{'))).rows;
    } finally { fs.rmSync(f, { force: true }); }
  };
  const BILAL = '66ffd657-ae13-408a-9f46-40803de20819';
  // Bilal tel qu'avant le geste de Nico (15/10 16:44), dans la transaction annulée.
  const avant = `
select set_config('fillsell.sans_retrait', '1', true);
update ventes set inventaire_id = null, annonce_id = null where id = 95888;
delete from ventes_operations where user_id = '${BILAL}' and cle = 'annonce:vinted:10152700586';
update cross_post_jobs set status = 'published', sold_at = null,
       platform_fields = platform_fields - 'vente_operation_cle' - 'vente_meme_cession'
 where id = 'cf6cd26c-594c-4339-96d7-2cfac07cb3f6';
delete from cross_post_jobs where inventaire_id = 1790523715035002 and action = 'delete' and created_at >= '2026-10-15 14:44:00+00';
update cross_post_jobs set platform_fields = platform_fields - 'retrait_arme' - 'pending_removal'
 where id in ('edf13e48-105f-4c93-911d-0218968c1b1c','d122db19-9152-4510-bd06-11e5a4fc726f','228e794b-dfdc-422e-a99e-d8db39f32368');
update inventaire set statut = 'stock', quantite = 1 where id = 1790523715035002;
delete from push_ventes where user_id = '${BILAL}' and origine = 'declaree' and cree_le >= '2026-10-15 14:44:00+00';
select set_config('fillsell.sans_retrait', '', true);`;
  const scenario = (injection) => `begin;\n${mig}\n${avant}\n${injection}
create temp table _r as select public.ventes_relevees_sans_annonce_rattacher(25, 4000, '${BILAL}') r;
select (select r from _r) r,
  (select statut from inventaire where id = 1790523715035002) fiche,
  (select count(*) from cross_post_jobs where inventaire_id = 1790523715035002 and action = 'delete' and created_at >= now()) retraits,
  (select count(*) from push_ventes where user_id = '${BILAL}' and cree_le >= now() and statut <> 'declaree') notes_non_declarees,
  (select count(*) from email_logs where user_id = '${BILAL}' and sent_at >= now()) mails;
rollback;`;
  const cas = (nom, injection, attendu) => {
    const [r] = q(scenario(injection));
    const ratt = Number(r.r?.rattachees ?? -1);
    ok(ratt === attendu && Number(r.mails) === 0 && Number(r.notes_non_declarees) === 0,
      `${nom} : ${ratt} rattachement(s) (attendu ${attendu}), fiche ${r.fiche}, ${r.retraits} retrait(s) armé(s), 0 mail`);
    return r;
  };
  const r0 = cas('Bilal, nappe rose (vente 95888)', '', 1);
  ok(r0.fiche === 'vendu', 'Bilal : la fiche passe vendue');
  cas('deux ventes au même prix dans la fenêtre', `insert into ventes (user_id, titre, prix_vente, date, vendu_le, plateforme, plateforme_code, commande_ref, source, releve_le, devise, quantite, statut)
    values ('${BILAL}', 'ESSAI (transaction annulée)', 8, '2026-09-27', '2026-09-27 16:30:00+00', 'vinted', 'vinted', 'ESSAI-AMBIGU-SELFTEST', 'releve', now(), 'EUR', 1, 'vendu');`, 0);
  cas('une autre annonce à 10 € qui a pu être vendue (offre)', `insert into vinted_listing_snapshots (user_id, vinted_item_id, captured_at, captured_on, price, status)
    values ('${BILAL}', '10152700000', '2026-09-28 10:00:00+00', '2026-09-28', 10, 'sold');`, 0);
  cas('une autre annonce à 7 € (ne peut pas se vendre 8 €)', `insert into vinted_listing_snapshots (user_id, vinted_item_id, captured_at, captured_on, price, status)
    values ('${BILAL}', '10152700000', '2026-09-28 10:00:00+00', '2026-09-28', 7, 'sold');`, 1);
  cas('une annonce créée APRÈS la vente', `insert into vinted_listing_snapshots (user_id, vinted_item_id, captured_at, captured_on, price, status)
    values ('${BILAL}', '10400000000', '2026-10-15 10:00:00+00', '2026-10-15', 10, 'sold');`, 1);
  cas('la vente est un lot (« Lot 2 articles »)', `update ventes set titre = 'Lot 2 articles' where id = 95888;`, 0);
  cas('la fiche porte déjà une vente', `insert into ventes (user_id, titre, prix_vente, date, plateforme, plateforme_code, inventaire_id, quantite, statut)
    values ('${BILAL}', 'ESSAI (transaction annulée)', 8, '2026-09-27', 'vinted', 'vinted', 1790523715035002, 1, 'vendu');`, 0);

  const [h] = q(`begin;\n${mig}\ncreate temp table _c as select * from public.ventes_relevees_sans_annonce_candidats(null);
select (select count(*) from _c) paires, (select count(*) from _c where rattachable) rattachables,
       (select count(*) from _c c where rattachable and exists (select 1 from _c d where d.vente_id = c.vente_id and d.job_id <> c.job_id)) doubles;
rollback;`);
  ok(Number(h.doubles) === 0, `parc entier : ${h.paires} paire(s), ${h.rattachables} rattachable(s), aucune vente rattachable à deux annonces`);
}

console.log(`\nvente-relevee-sans-annonce : ${n} contrôles verts, ${ko} rouges`);
process.exit(ko ? 1 : 0);
