// ════════════════════════════════════════════════════════════════════════════
// PREUVE EN PROD, SANS RIEN GARDER — LE PRIX D'UNE VENTE NÉE D'UN JOB (16/10, C1)
// ════════════════════════════════════════════════════════════════════════════
// Cas : 128 notes de vente sans prix (republications Vinted : `price` NULL), 45
// mails « vendu 0 € » depuis le 06/10. Migration 20261016221000 (la règle :
// prix_vente_du_job, push_trg_job, push_ventes_a_envoyer) et réparation
// scripts/reparations/20261016_ventes_prix_zero.sql (les notes déjà nées).
//
// Tout se passe dans UNE transaction (REPEATABLE READ) qui finit TOUJOURS en
// erreur (le rapport est le message de l'erreur) : rien n'est validé, aucun
// appel pg_net ne part, AUCUN mail ni push n'est envoyé.
//
//   node scripts/preuves/preuve-ventes-prix-inconnu.mjs --avec-migration --avec-reparation
//        (AVANT application : la migration et la réparation rejouées dans la transaction)
//   node scripts/preuves/preuve-ventes-prix-inconnu.mjs      (les deux déjà en prod)
//
// R : la règle sur des valeurs fabriquées (+ une fiche de Nico, deux vrais jobs
//     vendus, en lecture) ; P : chaque note sans prix a une source, la même que
//     la chaîne écrite à la main ; S : la réparation ne touche que `prix` (rien
//     ne repart, la table ventes intacte, idempotente) ; T : le déclencheur, sur
//     une COPIE temporaire de cross_post_jobs (4 ventes d'essai, compte de
//     Nico) ; D : la décision d'une note de job annonce la vente ENREGISTRÉE.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AVEC_MIGRATION = process.argv.includes('--avec-migration');
const AVEC_REPARATION = process.argv.includes('--avec-reparation');
const MIG = AVEC_MIGRATION
  ? readFileSync(path.join(RACINE, 'supabase/migrations/20261016221000_ventes_prix_inconnu.sql'), 'utf8')
  : '-- (migration déjà en prod)';
const REP_BRUT = readFileSync(path.join(RACINE, 'scripts/reparations/20261016_ventes_prix_zero.sql'), 'utf8')
  .replace(/^BEGIN;\s*$/m, '-- (BEGIN retiré : transaction de la preuve)')
  .replace(/^COMMIT;\s*$/m, '-- (COMMIT retiré : transaction de la preuve)')
  .replace(/^SELECT \(SELECT count\(\*\)[\s\S]*?sauvegardees;\s*$/m, '-- (contrôle final : vérifications S ci-dessous)');
const REP = AVEC_REPARATION ? REP_BRUT : '-- (réparation non rejouée)';

const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const FICHE_3 = '1790864707143000';                        // fiche de Nico, prix_vente 3 €
const JOB_626 = '00989c7c-5899-412c-9358-768ff6004b91';    // annonce 14 €, vente enregistrée 12 €
const USER_626 = '63ad8597-4fee-4277-9a69-14ad44af1896';
const JOB_EBAY = '57aaf4c8-e7ce-4f94-827d-5becd9fe2f02';   // eBay vendu, prix du job 15 €
const USER_EBAY = '53efea05-dc2d-4467-a8cd-c6fa52a47a61';

const EMPREINTE_HORS_PRIX = String.raw`md5(string_agg(row(pv.id, pv.user_id, pv.origine, pv.plateforme, pv.vente_id, pv.inventaire_id, pv.job_id,
               pv.commande_ref, pv.annonce_id, pv.titre, pv.devise, pv.vendu_le, pv.cles, pv.statut, pv.motif, pv.lot,
               pv.essais, pv.cree_le, pv.traite_le, pv.resultat, pv.part_le, pv.mail_statut, pv.mail_essais,
               pv.mail_traite_le, pv.mail_motif, pv.preuve_recente)::text, ',' order by pv.id))`;

const sql = String.raw`
begin isolation level repeatable read;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
create temp table preuve(n serial, ok boolean, label text) on commit drop;
create function pg_temp.verif(c boolean, l text) returns void language sql as $f$
  insert into preuve(ok, label) values (coalesce(c, false), l) $f$;

-- ── AVANT : la photo ────────────────────────────────────────────────────────
create temp table avant on commit drop as
select (select max(id) from push_ventes) as max_id,
       (select count(*) from push_ventes where job_id is not null and prix is null) as sans_prix,
       (select count(*) from push_ventes where job_id is not null and prix is null and mail_statut = 'envoye') as mails_sans_prix,
       -- note 2348 (Louis) : jamais touchée par la réparation (décision de Nico en attente, 17/10)
       (select count(*) from push_ventes where id = 2348 and job_id is not null and prix is null) as n_2348,
       (select count(*) from push_ventes where id = 2348 and job_id is not null and prix is null and mail_statut = 'envoye') as mail_2348,
       (select count(*) from email_logs where email_type like 'vente:%') as mails_vente,
       (select count(*) from push_ventes where statut = 'a_envoyer' or mail_statut = 'a_envoyer') as en_file,
       (select ${EMPREINTE_HORS_PRIX} from push_ventes pv) as empreinte_hors_prix,
       (select md5(string_agg(row(pv.id, pv.prix)::text, ',' order by pv.id)) from push_ventes pv
         where not (pv.job_id is not null and pv.prix is null)) as empreinte_autres_prix,
       (select md5(string_agg(row(v.id, v.prix_vente, v.benefice, v.prix_achat)::text, ',' order by v.id)) from ventes v
         where v.created_at > now() - interval '40 days') as empreinte_ventes;

-- ═══ LA MIGRATION ═══
${MIG}

-- ── R. LA RÈGLE, sur des valeurs fabriquées (aucune écriture) ─────────────
do $t$
declare u uuid := gen_random_uuid();  -- un compte sans vente, sans fiche
begin
  perform pg_temp.verif(public._prix_ou_null('14') = 14, 'R1. « 14 » se lit 14');
  perform pg_temp.verif(public._prix_ou_null('14.0') = 14, 'R2. « 14.0 » (republish_snapshot) se lit 14');
  perform pg_temp.verif(public._prix_ou_null('10,5') = 10.5, 'R3. « 10,5 » se lit 10.5');
  perform pg_temp.verif(public._prix_ou_null('0') is null, 'R4. « 0 » n''est pas un prix (absence)');
  perform pg_temp.verif(public._prix_ou_null('abc') is null and public._prix_ou_null('') is null
                        and public._prix_ou_null(null) is null and public._prix_ou_null('-3') is null, 'R5. vide, texte, négatif → NULL, jamais deviné');
  perform pg_temp.verif(public.prix_vente_du_job(u, 'vinted', '990000001', null, '{}'::jsonb, null) is null,
    'R6. job sans aucun prix, sans fiche, sans vente → NULL (inconnu), jamais 0');
  perform pg_temp.verif(public.prix_vente_du_job(u, 'vinted', '990000001', null,
      '{"prix_recreation": 14, "republish_snapshot": {"prix": "13.0"}}'::jsonb, null) = 14,
    'R7. republication : prix_recreation (dernier prix publié) avant le snapshot');
  perform pg_temp.verif(public.prix_vente_du_job(u, 'vinted', '990000001', null,
      '{"republish_snapshot": {"prix": "13.0"}}'::jsonb, null) = 13, 'R8. snapshot seul → 13');
  perform pg_temp.verif(public.prix_vente_du_job(u, 'vinted', '990000001', 20,
      '{"detected_price": 18, "prix_recreation": 14}'::jsonb, null) = 18,
    'R9. prix lu à la vente (detected_price) avant le prix du job et la recréation');
  perform pg_temp.verif(public.prix_vente_du_job(u, 'vinted', '990000001', 20, '{"prix_recreation": 14}'::jsonb, null) = 20,
    'R10. prix du job avant la recréation');
  perform pg_temp.verif(public.prix_vente_du_job(u, 'vinted', '990000001', 0, '{"detected_price": 0, "prix_recreation": "0"}'::jsonb, null) is null,
    'R11. des 0 partout → NULL (un 0 n''est jamais un prix annoncé)');
  perform pg_temp.verif(public.prix_vente_du_job('${NICO}'::uuid, 'vinted', '990000001', null, '{}'::jsonb, ${FICHE_3}) = 3,
    'R12. aucun prix publié → la FICHE du stock (3 €)');
  perform pg_temp.verif(public.prix_vente_du_job('${NICO}'::uuid, 'vinted', '990000001', null, '{"prix_recreation": 14}'::jsonb, ${FICHE_3}) = 14,
    'R13. le dernier prix publié passe AVANT la fiche');
  perform pg_temp.verif(public.prix_vente_du_job(u, 'vinted', '990000001', null, '{}'::jsonb, ${FICHE_3}) is null,
    'R14. la fiche d''un AUTRE compte n''est jamais lue');
  perform pg_temp.verif((select public.prix_vente_enregistree(j.user_id, j.platform, j.platform_listing_id, j.platform_fields)
                           from cross_post_jobs j where j.id = '${JOB_626}') = 12,
    'R15. la vente ENREGISTRÉE (transaction / prix confirmé) se lit : 12 €');
  perform pg_temp.verif((select public.prix_vente_du_job(j.user_id, j.platform, j.platform_listing_id, j.price, j.platform_fields, j.inventaire_id)
                           from cross_post_jobs j where j.id = '${JOB_626}') = 12,
    'R16. la vente enregistrée passe AVANT le prix lu à l''annonce (14 €)');
  perform pg_temp.verif((select public.prix_vente_enregistree(j.user_id, j.platform, j.platform_listing_id, j.platform_fields)
                           from cross_post_jobs j where j.id = '${JOB_EBAY}') is null,
    'R17. eBay : jamais le reçu par annonce (une annonce eBay en quantité se vend plusieurs fois)');
  perform pg_temp.verif((select public.prix_vente_du_job(j.user_id, j.platform, j.platform_listing_id, j.price, j.platform_fields, j.inventaire_id)
                           from cross_post_jobs j where j.id = '${JOB_EBAY}') = 15,
    'R18. eBay : le prix de sa commande (prix du job, 15 €) reste');
end $t$;

-- ── P. LA PROD : chaque note sans prix a-t-elle une source, et la bonne ? ──
do $t$
declare v_n int; v_ko int; v_null int;
begin
  with n as (
    select pv.id, j.user_id, j.platform, j.platform_listing_id, j.price, j.platform_fields pf, j.inventaire_id
      from push_ventes pv join cross_post_jobs j on j.id = pv.job_id and j.user_id = pv.user_id
     where pv.job_id is not null and pv.prix is null
  ), calc as (
    select n.id,
      public.prix_vente_du_job(n.user_id, n.platform, n.platform_listing_id, n.price, n.pf, n.inventaire_id) as regle,
      -- la même chaîne écrite À LA MAIN, source par source (contrôle indépendant)
      coalesce(
        (select v.prix_vente from ventes_operations o
           cross join lateral jsonb_array_elements_text(case when jsonb_typeof(o.resultat -> 'ventes_ids') = 'array' then o.resultat -> 'ventes_ids' else '[]'::jsonb end) e(vid)
           join ventes v on v.id = e.vid::bigint and v.user_id = o.user_id
          where n.platform <> 'ebay' and o.user_id = n.user_id and v.prix_vente > 0
            and o.cle in (n.pf ->> 'vente_operation_cle', 'annonce:' || n.platform || ':' || btrim(coalesce(n.platform_listing_id, '')))
          order by (o.cle = n.pf ->> 'vente_operation_cle') desc nulls last, v.id limit 1),
        case when (n.pf ->> 'detected_price') ~ '^[0-9]+([.][0-9]+)?$' and (n.pf ->> 'detected_price')::numeric > 0 then (n.pf ->> 'detected_price')::numeric end,
        case when n.price > 0 then n.price end,
        case when (n.pf ->> 'prix_recreation') ~ '^[0-9]+([.][0-9]+)?$' and (n.pf ->> 'prix_recreation')::numeric > 0 then (n.pf ->> 'prix_recreation')::numeric end,
        case when (n.pf #>> '{republish_snapshot,prix}') ~ '^[0-9]+([.][0-9]+)?$' and (n.pf #>> '{republish_snapshot,prix}')::numeric > 0 then (n.pf #>> '{republish_snapshot,prix}')::numeric end,
        (select i.prix_vente from inventaire i where i.id = n.inventaire_id and i.user_id = n.user_id and i.prix_vente > 0)) as main
    from n
  )
  select count(*), count(*) filter (where regle is distinct from main), count(*) filter (where regle is null)
    into v_n, v_ko, v_null from calc;
  perform pg_temp.verif(v_n = (select sans_prix from avant), format('P1. %s note(s) sans prix née(s) d''un job, toutes relues', v_n));
  perform pg_temp.verif(v_ko = 0, format('P2. la règle = la chaîne écrite à la main (%s écart)', v_ko));
  perform pg_temp.verif(v_null = 0, format('P3. aucune ne reste sans prix connu (%s inconnue)', v_null));
end $t$;

-- ═══ LA RÉPARATION ═══
${REP}

-- ── S. APRÈS LA RÉPARATION (rien si elle n'est pas rejouée) ────────────────
do $t$
declare a record; v int; w int; x text; y text; z text; v_rejouee boolean := ${AVEC_REPARATION ? 'true' : 'false'};
begin
  if not v_rejouee then return; end if;
  select * into a from avant;
  select count(*) into v from push_ventes where job_id is not null and prix is null and id <= a.max_id and id <> 2348;
  perform pg_temp.verif(v = 0, format('S1. notes sans prix nées d''un job (hors note 2348, laissée) : %s → %s', a.sans_prix - a.n_2348, v));
  select count(*) into v from public._backup_1610_ventes_prix_zero where sauve_le = now();
  perform pg_temp.verif(v = a.sans_prix - a.n_2348, format('S2. sauvegarde : %s ligne(s) (prix avant / après)', v));
  select count(*) into v from public._backup_1610_ventes_prix_zero where sauve_le = now() and (prix_avant is not null or prix_apres <= 0);
  perform pg_temp.verif(v = 0, 'S3. seules des notes SANS prix sont touchées ; aucun prix remis à 0 ou moins');
  select ${EMPREINTE_HORS_PRIX} into x from push_ventes pv;
  perform pg_temp.verif(x = a.empreinte_hors_prix, 'S4. tout le reste des notes est identique à l''octet (statut, mail_statut, part_le, essais…) : rien ne repart');
  select md5(string_agg(row(pv.id, pv.prix)::text, ',' order by pv.id)) into y from push_ventes pv
   where not (pv.job_id is not null and pv.prix is null)
     and pv.id not in (select b.id from public._backup_1610_ventes_prix_zero b where b.sauve_le = now());
  perform pg_temp.verif(y is not distinct from a.empreinte_autres_prix, 'S5. aucune autre note ne change de prix (les notes à 0 € restent à 0 €)');
  select count(*) into v from email_logs where email_type like 'vente:%';
  perform pg_temp.verif(v = a.mails_vente, format('S6. mails de vente : %s avant, %s après (aucun envoyé)', a.mails_vente, v));
  select count(*) into w from push_ventes where statut = 'a_envoyer' or mail_statut = 'a_envoyer';
  perform pg_temp.verif(w = a.en_file, format('S7. notes en file d''envoi : %s avant, %s après', a.en_file, w));
  select md5(string_agg(row(vv.id, vv.prix_vente, vv.benefice, vv.prix_achat)::text, ',' order by vv.id)) into z from ventes vv
   where vv.created_at > now() - interval '40 days';
  perform pg_temp.verif(z is not distinct from a.empreinte_ventes, 'S8. la table ventes est intacte (prix, bénéfices)');
  select count(*) into v from public._backup_1610_ventes_prix_zero where sauve_le = now() and mail_statut = 'envoye';
  perform pg_temp.verif(v = a.mails_sans_prix - a.mail_2348, format('S9. dont %s note(s) dont le mail « 0 € » était parti : prix remis, AUCUN renvoi', v));
  if exists (select 1 from push_ventes where id = 2348) then
    perform pg_temp.verif(exists (select 1 from push_ventes where id = 2348 and prix is null)
                          and not exists (select 1 from public._backup_1610_ventes_prix_zero where id = 2348),
      'S10. note 2348 (Louis) : NON touchée, toujours sans prix (14 € chez nous, 12 € selon le vendeur : décision de Nico en attente)');
  end if;
  if exists (select 1 from push_ventes where id = 626) then
    perform pg_temp.verif(exists (select 1 from push_ventes where id = 626 and prix = 12), 'S11. note 626 : 12 € (vente enregistrée), pas les 14 € de l''annonce');
  end if;
end $t$;

${AVEC_REPARATION ? REP_BRUT.replace(/CREATE TABLE IF NOT EXISTS[\s\S]*?REVOKE ALL ON public\._backup_1610_ventes_prix_zero FROM anon, authenticated;/, '-- (table déjà là)') : ''}

do $t$
declare v int; v_rejouee boolean := ${AVEC_REPARATION ? 'true' : 'false'};
begin
  if not v_rejouee then return; end if;
  select count(*) into v from public._backup_1610_ventes_prix_zero where sauve_le = now();
  perform pg_temp.verif(v = (select sans_prix - n_2348 from avant), format('S12. rejouée une 2e fois : %s ligne(s) sauvegardée(s), rien de plus (idempotente)', v));
end $t$;

-- ── T. LE DÉCLENCHEUR, sur une COPIE de cross_post_jobs (table vivante intacte) ──
create temp table cpj_essai (like public.cross_post_jobs including defaults) on commit drop;
create trigger essai_push_vendu after update of status, platform_fields on cpj_essai for each row
  when ((new.action = any (array['publish'::text, 'republish'::text]))
        and (((new.status = 'sold') and (old.status is distinct from 'sold'))
             or (((new.platform_fields ->> 'sale_signal') = 'sold') and ((old.platform_fields ->> 'sale_signal') is distinct from 'sold'))))
  execute function public.push_trg_job();
do $t$
declare u uuid := '${NICO}'; e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid(); e3 uuid := gen_random_uuid(); e4 uuid := gen_random_uuid();
        v numeric; v_n int;
begin
  insert into cpj_essai (id, user_id, platform, action, status, title, price, platform_listing_id, inventaire_id,
                         platform_fields, vu_en_ligne_le, published_at, created_at)
  values
   (e1, u, 'vinted', 'republish', 'published', 'Essai C1 recréation', null, '990000901', null,
    '{"prix_recreation": 14, "republish_snapshot": {"prix": "14.0"}}'::jsonb, now() - interval '30 minutes', now() - interval '3 days', now() - interval '3 days'),
   (e2, u, 'vinted', 'republish', 'published', 'Essai C1 fiche', null, '990000902', ${FICHE_3},
    '{"republish_snapshot": {"prix": "0"}}'::jsonb, now() - interval '30 minutes', now() - interval '3 days', now() - interval '3 days'),
   (e3, u, 'vinted', 'republish', 'published', 'Essai C1 rien', null, '990000903', null,
    '{}'::jsonb, now() - interval '30 minutes', now() - interval '3 days', now() - interval '3 days'),
   (e4, u, 'vinted', 'publish', 'published', 'Essai C1 lu', 20, '990000904', null,
    '{}'::jsonb, now() - interval '30 minutes', now() - interval '3 days', now() - interval '3 days');
  update cpj_essai set platform_fields = platform_fields || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', now())
                                       || case when id = e4 then '{"detected_price": 18}'::jsonb else '{}'::jsonb end
   where id in (e1, e2, e3, e4);
  select count(*) into v_n from push_ventes where job_id in (e1, e2, e3, e4);
  perform pg_temp.verif(v_n = 4, format('T0. le déclencheur a noté les 4 ventes d''essai (%s)', v_n));
  select prix into v from push_ventes where job_id = e1;
  perform pg_temp.verif(v = 14, format('T1. republication sans price : la note naît à 14 € (dernier prix publié) — %s', coalesce(v::text, 'NULL')));
  select prix into v from push_ventes where job_id = e2;
  perform pg_temp.verif(v = 3, format('T2. rien de publié lisible (snapshot « 0 ») : la FICHE, 3 € — %s', coalesce(v::text, 'NULL')));
  select prix into v from push_ventes where job_id = e3;
  perform pg_temp.verif(v is null and exists (select 1 from push_ventes where job_id = e3),
    format('T3. aucun prix connu : la note naît SANS prix (NULL, jamais 0) — %s', coalesce(v::text, 'NULL')));
  select prix into v from push_ventes where job_id = e4;
  perform pg_temp.verif(v = 18, format('T4. publication : le prix lu à la vente (18 €) avant le prix du job (20 €) — %s', coalesce(v::text, 'NULL')));
end $t$;

-- ── D. LA DÉCISION : une note de JOB annonce la vente ENREGISTRÉE ─────────
do $t$
declare v_res jsonb; n1 bigint; n2 bigint; n3 bigint; v numeric; v_part timestamptz;
begin
  -- Notes d'essai sur de VRAIS jobs vendus (vente enregistrée), sans clé (aucun doublon).
  insert into push_ventes (user_id, origine, plateforme, job_id, inventaire_id, titre, prix, cles, statut, cree_le)
  values ('${USER_626}', 'job', 'vinted', '${JOB_626}', null, 'Essai C1 décision', null, '{}', 'a_envoyer', now() - interval '10 minutes')
  returning id into n1;
  insert into push_ventes (user_id, origine, plateforme, job_id, inventaire_id, titre, prix, cles, statut, cree_le)
  values ('${USER_626}', 'job', 'vinted', '${JOB_626}', null, 'Essai C1 décision 2', 14, '{}', 'a_envoyer', now() - interval '10 minutes')
  returning id into n2;
  insert into push_ventes (user_id, origine, plateforme, job_id, inventaire_id, titre, prix, cles, statut, cree_le)
  values ('${USER_EBAY}', 'job', 'ebay', '${JOB_EBAY}', null, 'Essai C1 eBay', 15, '{}', 'a_envoyer', now() - interval '10 minutes')
  returning id into n3;
  v_res := public.push_ventes_a_envoyer(500);
  select prix, part_le into v, v_part from push_ventes where id = n1;
  perform pg_temp.verif(v_part is not null and v = 12, format('D1. note SANS prix décidée : elle annonce la vente enregistrée, 12 € — %s', coalesce(v::text, 'NULL')));
  perform pg_temp.verif(exists (select 1 from jsonb_array_elements(v_res -> 'notes') x where (x ->> 'id')::bigint = n1 and (x ->> 'prix')::numeric = 12),
    'D2. le prix rendu au mail = 12 € (celui écrit sur la note)');
  select prix, part_le into v, v_part from push_ventes where id = n2;
  perform pg_temp.verif(v_part is not null and v = 12, format('D3. note née à 14 € (annonce) : elle annonce la vente enregistrée, 12 € — %s', coalesce(v::text, 'NULL')));
  select prix, part_le into v, v_part from push_ventes where id = n3;
  perform pg_temp.verif(v_part is not null and v = 15, format('D4. eBay : le prix de la note (sa commande) reste, 15 € — %s', coalesce(v::text, 'NULL')));
end $t$;

do $r$
declare r text; k int; t int;
begin
  select string_agg(case when ok then '✓ ' else '✗ ' end || label, E'\n' order by n), count(*) filter (where not ok), count(*)
    into r, k, t from preuve;
  raise exception E'PREUVE_VENTES_PRIX_INCONNU echecs=% sur %\n%', k, t, r;
end $r$;
rollback;
`;

const dossier = mkdtempSync(path.join(tmpdir(), 'preuve-ventes-prix-inconnu-'));
const fichier = path.join(dossier, 'preuve.sql');
writeFileSync(fichier, sql);
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', fichier], { cwd: RACINE, encoding: 'utf8', shell: true, maxBuffer: 1 << 26 });
const sortie = `${r.stdout}\n${r.stderr}`;
const m = sortie.match(/PREUVE_VENTES_PRIX_INCONNU echecs=(\d+) sur (\d+)([\s\S]*?)(?:\\n"|"\}|$)/);
if (!m) { console.log(sortie.slice(0, 4000)); console.log('\n✗ rapport introuvable (la transaction a échoué AVANT les vérifications)'); process.exit(1); }
console.log(`Preuve « le prix d'une vente née d'un job »${AVEC_MIGRATION ? ' (migration 20261016221000 rejouée)' : ''}${AVEC_REPARATION ? ' (réparation rejouée)' : ''}, transaction annulée :`);
console.log(m[3].split(/\\+n/).map((l) => l.replace(/\\+$/, '').replace(/\\u0027/g, "'")).filter((l) => /[✓✗]/.test(l)).join('\n'));
console.log(Number(m[1]) === 0 ? `\n✓ ${m[2]} vérifications, toutes vertes — rien n'a été gardé (aucun mail, aucune notification)` : `\n✗ ${m[1]} échec(s) sur ${m[2]}`);
process.exit(Number(m[1]) === 0 ? 0 : 1);
