-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — REJUGEMENT, PAR LA RÈGLE DU 17/10, DES DÉCISIONS « INTROUVABLE À
-- CONFIRMER » prises par handler-watch (v108 → v112) depuis le 15/10
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle (_shared/introuvable-a-confirmer.js, 17/10) :
--   · la trace d'une annonce se lit par son IDENTIFIANT EXACT (Vinted : relevé
--     du jour vinted_listing_snapshots ou fiche qui porte CE vinted_item_id ;
--     autres : annonces_plateforme) — jamais la fiche du job, jamais le titre ;
--   · une republication en pause REPART quand sa trace exacte la revoit en
--     ligne après la lecture ;
--   · elle se CLÔT sur la fiche vendue, une trace « vendue / fermée » après la
--     lecture, ou DEUX relevés complets (total connu, lus ≥ annoncés, NON
--     VIDES, sans « [incomplet] » ni « disparitions non marquées », de SA
--     boutique Vinted) commencés après la première lecture ratée et après sa
--     dernière trace ; sinon elle attend.
-- Ce script rejuge les décisions de l'ancienne règle (clôtures « introuvable
-- confirmé par un relevé » et reprises « relevée en ligne », 60 derniers jours) :
--   · une clôture SANS cette preuve → la republication revient EN PAUSE
--     (needs_user introuvable_a_confirmer, message de pause), marque gardée,
--     annonce_disparue retirée (gardée dans rejuge_1710), message clos archivé ;
--   · une reprise SANS trace de l'annonce exacte après la lecture → EN PAUSE,
--     démenti annulé (reprises − 1, gardé dans dementi_annule), étape gardée ;
--   · tout le reste est laissé tel quel.
-- Mesuré le 17/10 (lecture seule) : 8 décisions rejugées → 4 gardées
-- (51f8285a et e9986ca5 Beebs : 10 et 47 relevés complets sans elles ;
-- 38ac687c : fiche vendue ; 2464a816 : 2 relevés complets) ; 4 remises en pause
-- (eb1e852c DeadRoz Leboncoin, clos sur des relevés VIDES ; 011acb82 et
-- 20dade3e Vinted, un seul relevé complet ; a6e773d4 repris sur la trace d'une
-- AUTRE annonce de sa fiche).
-- ⛔ À LANCER APRÈS le déploiement de handler-watch portant la règle du 17/10 :
--    l'ancienne version re-clôturerait, sur un relevé vide ou unique, les jobs
--    remis en pause ici.
-- Aucun mail, aucun retrait, aucun job créé, aucune fiche touchée, aucun crédit.
-- Sauvegarde : _backup_1710_introuvable_rejuge ; inverse :
-- scripts/reparations/20261017_introuvable_rejuge_INVERSE.sql.

begin;

create table if not exists public._backup_1710_introuvable_rejuge as
  select id, status, error, platform_fields, now() as sauve_le, ''::text as verdict, ''::text as decision_jugee
  from public.cross_post_jobs where false;

create temp table _rejuge on commit drop as
with c0 as (
  select j.id, j.user_id, j.platform, j.status, j.error, j.inventaire_id, j.listing_url,
    nullif(btrim(j.platform_listing_id), '') as pid, j.platform_fields as pf,
    case when j.status = 'cancelled' then 'cloture' else 'reprise' end as decision_jugee,
    (j.platform_fields->'introuvable_a_confirmer'->>'depuis')::timestamptz as depuis,
    coalesce((j.platform_fields->'introuvable_a_confirmer'->>'premiere')::timestamptz,
             (j.platform_fields->'introuvable_a_confirmer'->>'depuis')::timestamptz) as premiere,
    (j.platform_fields->'introuvable_a_confirmer'->>'dementi_le')::timestamptz as dementi_le
  from public.cross_post_jobs j
  where j.action = 'republish' and j.created_at > now() - interval '60 days'
    and j.platform_fields ? 'introuvable_a_confirmer'
    and not (j.platform_fields ? 'rejuge_1710')
    and (
      (j.status = 'cancelled'
        and j.platform_fields->'annonce_disparue'->>'pose_par' = 'handler-watch (introuvable confirmé par un relevé)')
      or (j.status = 'pending' and j.platform_fields->'introuvable_a_confirmer' ? 'dementi_le'
        and coalesce(j.platform_fields->>'republish_step', 'a_capturer') in ('a_capturer', 'captured')
        and j.platform_fields->>'deleted_at' is null)
    )
), c1 as (
  select c0.*,
    case when c0.platform = 'vinted'
         then coalesce(nullif(btrim(c0.pf->>'vinted_item_id'), ''), substring(coalesce(c0.listing_url, '') from '/items/(\d+)'))
         else coalesce(c0.pid, nullif(btrim(c0.listing_url), '')) end as ident,
    i.statut as fiche_statut,
    case when c0.platform = 'vinted'
         then coalesce(nullif(btrim(c0.pf->>'vinted_account_id'), ''), nullif(btrim(i.vinted_account_id), '')) end as boutique_connue,
    -- L'absence se compte depuis la première lecture ratée, ou le dernier démenti —
    -- sauf le démenti rejugé ici (une reprise sans preuve n'est pas un démenti).
    case when c0.decision_jugee = 'reprise' then c0.premiere
         else greatest(c0.premiere, coalesce(c0.dementi_le, c0.premiere)) end as depuis_absence
  from c0 left join public.inventaire i on i.id = c0.inventaire_id
), c2 as (
  select c1.*, t.vu_le, t.statut as vu_statut
  from c1
  left join lateral (
    select x.vu_le, x.statut from (
      select s.captured_at as vu_le, s.status as statut from public.vinted_listing_snapshots s
       where c1.platform = 'vinted' and s.user_id = c1.user_id and s.vinted_item_id = c1.ident
      union all
      select i2.last_synced_at, i2.vinted_status from public.inventaire i2
       where c1.platform = 'vinted' and i2.user_id = c1.user_id and i2.vinted_item_id = c1.ident
      union all
      select a.vu_le, a.statut_plateforme from public.annonces_plateforme a
       where c1.platform <> 'vinted' and a.user_id = c1.user_id and a.platform = c1.platform
         and ((c1.pid is not null and a.listing_id = c1.pid) or (c1.pid is null and a.url = c1.listing_url))
    ) x where x.vu_le is not null order by x.vu_le desc limit 1
  ) t on true
), c3 as (
  select c2.*,
    coalesce(c2.boutique_connue, (
      select r.vinted_user_id::text from public.vinted_sync_runs r
       where c2.platform = 'vinted' and c2.vu_le is not null and r.user_id = c2.user_id and r.platform = 'vinted'
         and r.vinted_user_id is not null and r.finished_at is not null
         and r.started_at - interval '60 seconds' <= c2.vu_le and c2.vu_le <= r.finished_at + interval '60 seconds'
       order by r.started_at desc limit 1)) as boutique
  from c2
), c4 as (
  select c3.*,
    (select count(*) from public.vinted_sync_runs r
      where r.user_id = c3.user_id and r.platform = c3.platform and r.status = 'done'
        and r.kind in ('dressing', 'annonces') and r.finished_at is not null
        and r.total_entries is not null and r.total_entries >= 0
        and r.items_vus > 0 and r.items_vus >= r.total_entries
        and coalesce(r.erreur, '') !~* '\[incomplet\]|disparitions non marquées|n''a pas rendu sa liste'
        and (c3.platform <> 'vinted' or (r.kind = 'dressing' and c3.boutique is not null and r.vinted_user_id::text = c3.boutique))
        and r.started_at > c3.depuis_absence
        and (c3.vu_le is null or c3.vu_le < r.started_at - interval '60 seconds')) as n_sans_elle
  from c3
)
select c4.*,
  case
    when c4.decision_jugee = 'cloture' and (
           c4.fiche_statut = 'vendu'
        or (c4.vu_le > c4.depuis and c4.vu_statut in ('sold', 'closed', 'hidden', 'draft', 'vendue', 'desactivee'))
        or (c4.ident is not null and (c4.platform <> 'vinted' or c4.boutique is not null) and c4.n_sans_elle >= 2))
      then 'garder_clos'
    when c4.decision_jugee = 'reprise' and c4.ident is not null and c4.vu_le > c4.depuis
         and c4.vu_statut in ('active', 'en_ligne')
      then 'garder_repris'
    else 'remettre_en_pause'
  end as verdict
from c4;

-- Contrôles AVANT toute écriture.
do $$
declare v_pause integer; v_total integer;
begin
  select count(*), count(*) filter (where verdict = 'remettre_en_pause') into v_total, v_pause from _rejuge;
  if v_pause > 25 then
    raise exception 'rejugement : % job(s) à remettre en pause (4 mesurés le 17/10) — échelle inattendue, rien n''est écrit', v_pause;
  end if;
  if exists (select 1 from public._backup_1710_introuvable_rejuge b join _rejuge r on r.id = b.id) then
    raise exception 'rejugement : déjà appliqué pour au moins un de ces jobs — rien n''est écrit';
  end if;
  raise notice 'rejugement : % décision(s) rejugée(s) — % remise(s) en pause, % gardée(s)', v_total, v_pause, v_total - v_pause;
end $$;

insert into public._backup_1710_introuvable_rejuge (id, status, error, platform_fields, sauve_le, verdict, decision_jugee)
select j.id, j.status, j.error, j.platform_fields, now(), r.verdict, r.decision_jugee
from public.cross_post_jobs j join _rejuge r on r.id = j.id
where r.verdict = 'remettre_en_pause';

-- (a) Clôtures sans deux relevés complets → la pause, avec le message de pause.
update public.cross_post_jobs j set
  status = 'needs_user',
  error = 'Republication en pause, rien n''a été retiré : ' || n.nom
    || ' n''a pas rendu cette annonce à la dernière lecture. FillSell attend le prochain relevé de ta boutique ' || n.nom
    || ' pour savoir si elle est encore en ligne ; si elle l''est, la republication repartira toute seule. Pour aller plus vite : « Synchroniser ».',
  platform_fields = (j.platform_fields - 'annonce_disparue')
    || jsonb_build_object(
      'needs_user_source', 'introuvable_a_confirmer',
      'erreurs_archivees', (
        select coalesce(jsonb_agg(e.v order by e.o), '[]'::jsonb) from (
          select x.v, x.o from jsonb_array_elements(
            coalesce(case when jsonb_typeof(j.platform_fields->'erreurs_archivees') = 'array'
                          then j.platform_fields->'erreurs_archivees' end, '[]'::jsonb)
            || case when nullif(btrim(coalesce(j.error, '')), '') is null then '[]'::jsonb
                    else jsonb_build_array(jsonb_build_object(
                      'le', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'statut', j.status, 'erreur', left(j.error, 600),
                      'par', 'réparation 20261017_introuvable_rejuge (clôture sans 2 relevés)')) end
          ) with ordinality as x(v, o)
          order by x.o desc limit 20
        ) e),
      'rejuge_1710', jsonb_build_object('le', now(), 'annule', 'cloture',
        'annonce_disparue', j.platform_fields->'annonce_disparue', 'releves_complets_sans_elle', r.n_sans_elle,
        'regle', 'deux relevés complets, non vides, de sa boutique, après la première lecture'))
from _rejuge r,
  lateral (select case r.platform when 'vinted' then 'Vinted' when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs'
             when 'depop' then 'Depop' when 'opla' then 'Opla' when 'ebay' then 'eBay' else r.platform end as nom) n
where r.id = j.id and r.verdict = 'remettre_en_pause' and r.decision_jugee = 'cloture'
  and j.status = 'cancelled'
  and j.platform_fields->'annonce_disparue'->>'pose_par' = 'handler-watch (introuvable confirmé par un relevé)';

-- (b) Reprises sans trace de l'annonce EXACTE → la pause ; le démenti est annulé
--     (gardé dans dementi_annule), l'étape et la copie restent telles quelles.
update public.cross_post_jobs j set
  status = 'needs_user',
  error = 'Republication en pause, rien n''a été retiré : ' || n.nom
    || ' n''a pas rendu cette annonce à la dernière lecture. FillSell attend le prochain relevé de ta boutique ' || n.nom
    || ' pour savoir si elle est encore en ligne ; si elle l''est, la republication repartira toute seule. Pour aller plus vite : « Synchroniser ».',
  platform_fields = j.platform_fields
    || jsonb_build_object(
      'needs_user_source', 'introuvable_a_confirmer',
      'introuvable_a_confirmer', ((j.platform_fields->'introuvable_a_confirmer') - 'dementi_le' - 'dementi_par')
        || jsonb_build_object(
          'reprises', greatest(coalesce((j.platform_fields->'introuvable_a_confirmer'->>'reprises')::integer, 0) - 1, 0),
          'dementi_annule', jsonb_build_object('le', now(),
            'dementi_le', j.platform_fields->'introuvable_a_confirmer'->'dementi_le',
            'dementi_par', j.platform_fields->'introuvable_a_confirmer'->'dementi_par',
            'motif', 'aucune trace de CETTE annonce après la lecture : la preuve venait de la fiche, qui porte une autre annonce')),
      'rejuge_1710', jsonb_build_object('le', now(), 'annule', 'reprise', 'releves_complets_sans_elle', r.n_sans_elle,
        'derniere_trace', r.vu_le))
from _rejuge r,
  lateral (select case r.platform when 'vinted' then 'Vinted' when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs'
             when 'depop' then 'Depop' when 'opla' then 'Opla' when 'ebay' then 'eBay' else r.platform end as nom) n
where r.id = j.id and r.verdict = 'remettre_en_pause' and r.decision_jugee = 'reprise'
  and j.status = 'pending'
  and coalesce(j.platform_fields->>'republish_step', 'a_capturer') in ('a_capturer', 'captured')
  and j.platform_fields->>'deleted_at' is null;

-- Contrôle APRÈS écriture : chaque job sauvegardé est bien en pause ; sinon
-- (job passé « en cours » entre-temps, ligne changée) tout est annulé.
do $$
declare v_attendus integer; v_faits integer;
begin
  select count(*) into v_attendus from _rejuge where verdict = 'remettre_en_pause';
  select count(*) into v_faits
    from public.cross_post_jobs j join _rejuge r on r.id = j.id
   where r.verdict = 'remettre_en_pause' and j.status = 'needs_user'
     and j.platform_fields->>'needs_user_source' = 'introuvable_a_confirmer'
     and j.platform_fields ? 'rejuge_1710';
  if v_faits <> v_attendus then
    raise exception 'rejugement : % job(s) remis en pause sur % attendu(s) — tout est annulé', v_faits, v_attendus;
  end if;
end $$;

select left(r.id::text, 8) as job, left(r.user_id::text, 8) as compte, r.platform, r.decision_jugee, r.verdict,
  r.n_sans_elle as releves_complets_sans_elle, r.vu_le at time zone 'Europe/Paris' as derniere_trace,
  j.status as statut_maintenant
from _rejuge r join public.cross_post_jobs j on j.id = r.id
order by r.verdict, r.platform;

commit;
