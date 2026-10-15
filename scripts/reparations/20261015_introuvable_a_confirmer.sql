-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir, point 14 (DeadRoz) — reprise PAR LA RÈGLE des republications
-- annulées « plus en ligne » sur UNE seule lecture (aucune preuve).
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle (update-job-status v136, handler-watch v108,
-- _shared/introuvable-a-confirmer.js) : une lecture « plus en ligne » avant
-- tout retrait met en PAUSE (needs_user introuvable_a_confirmer) ; handler-watch
-- la reprend quand un relevé revoit l'annonce en ligne (3 par compte et par
-- passage, l'extension relit l'annonce avant tout retrait), la clôt avec le
-- message d'avant quand un relevé complet ne la voit plus.
-- Ce script remet dans cet état les annulations d'avant la règle qui n'ont
-- AUCUNE preuve de disparition :
--   · dernière republication annulée de la fiche sur cette plateforme, depuis
--     le 18/09, avant tout retrait ;
--   · fiche au stock, aucune republication vivante, aucune republiée depuis ;
--   · PAS de preuve de disparition : Vinted — aucun relevé complet de sa
--     boutique après la lecture qui l'aurait manquée, fiche jamais relevée
--     vendue/fermée ; autres — annonce jamais relevée disparue, vendue,
--     désactivée ;
--   · ET (relevée en ligne APRÈS la lecture, ou lecture de moins de 7 jours).
-- La fiche n'est plus datée « disparue » quand c'est CETTE lecture qui l'a
-- datée (même instant). Sauvegardes : _backup_1510_introuvable_jobs /
-- _backup_1510_introuvable_fiches ; inverse : 20261015_introuvable_a_confirmer_INVERSE.sql.
-- Aucun mail, aucun retrait, aucun job créé.

begin;

create table if not exists public._backup_1510_introuvable_jobs as
  select id, status, error, platform_fields, now() as sauve_le from public.cross_post_jobs where false;
create table if not exists public._backup_1510_introuvable_fiches as
  select id, disparu_le, now() as sauve_le from public.inventaire where false;

with c as (
  select j.id, j.user_id, j.platform, j.inventaire_id, j.created_at, j.platform_listing_id, j.listing_url,
    coalesce((j.platform_fields->'introuvable_404'->>'at')::timestamptz,
             (j.platform_fields->'annonce_disparue'->>'at')::timestamptz, j.created_at) as lu_le,
    row_number() over (partition by j.inventaire_id, j.platform order by j.created_at desc) as rang
  from public.cross_post_jobs j
  where j.action = 'republish' and j.status = 'cancelled' and j.created_at >= '2026-09-18'
    and j.error ilike 'Cette annonce n''est plus en ligne sur%'
    and coalesce(j.platform_fields->>'republish_step', '') <> 'deleted'
    and j.platform_fields->>'deleted_at' is null
    and j.inventaire_id is not null
), x as (
  select c.*, i.statut, i.last_synced_at, i.vinted_status, i.vinted_account_id, i.disparu_le,
    a.statut_plateforme, a.disparu_le as a_disparu_le, a.vu_le as a_vu_le,
    exists (select 1 from public.cross_post_jobs k where k.action = 'republish' and k.inventaire_id = c.inventaire_id
            and k.platform = c.platform and k.status in ('pending', 'processing', 'needs_user')) as vivant,
    exists (select 1 from public.cross_post_jobs k where k.action = 'republish' and k.inventaire_id = c.inventaire_id
            and k.platform = c.platform and k.created_at > c.created_at and k.status = 'published') as republiee_depuis,
    exists (select 1 from public.vinted_sync_runs r where r.user_id = c.user_id and r.platform = c.platform
            and r.status = 'done' and r.kind in ('dressing', 'annonces') and r.started_at > c.lu_le
            and (c.platform <> 'vinted' or i.vinted_account_id is null or r.vinted_user_id is null
                 or r.vinted_user_id::text = i.vinted_account_id::text)
            and (c.platform <> 'vinted' or i.last_synced_at is null or i.last_synced_at < r.started_at)) as releve_sans_elle
  from c
  join public.inventaire i on i.id = c.inventaire_id
  left join public.annonces_plateforme a on c.platform <> 'vinted' and a.user_id = c.user_id and a.platform = c.platform
    and (a.listing_id = c.platform_listing_id or a.url = c.listing_url)
  where c.rang = 1
), cibles as (
  select x.* from x
  where x.statut = 'stock' and not x.vivant and not x.republiee_depuis
    and not (x.platform = 'vinted' and x.last_synced_at > x.lu_le and x.vinted_status in ('sold', 'closed', 'hidden', 'draft'))
    and not (x.platform = 'vinted' and x.releve_sans_elle)
    and not (x.platform <> 'vinted' and (x.a_disparu_le is not null or x.statut_plateforme in ('vendue', 'desactivee')))
    and (
      (x.platform = 'vinted' and x.last_synced_at > x.lu_le and x.vinted_status = 'active')
      or (x.platform <> 'vinted' and x.a_vu_le > x.lu_le and x.statut_plateforme = 'en_ligne')
      or x.lu_le > now() - interval '7 days'
    )
), sauves as (
  insert into public._backup_1510_introuvable_jobs (id, status, error, platform_fields, sauve_le)
  select j.id, j.status, j.error, j.platform_fields, now() from public.cross_post_jobs j join cibles on cibles.id = j.id
  returning id
), fiches as (
  insert into public._backup_1510_introuvable_fiches (id, disparu_le, sauve_le)
  select i.id, i.disparu_le, now() from public.inventaire i join cibles on cibles.inventaire_id = i.id
  where cibles.platform = 'vinted' and i.disparu_le is not null and abs(extract(epoch from (i.disparu_le - cibles.lu_le))) < 5
  returning id
), dates as (
  update public.inventaire i set disparu_le = null from fiches where fiches.id = i.id returning i.id
)
update public.cross_post_jobs j set
  status = 'needs_user',
  error = 'Republication en pause, rien n''a été retiré : ' ||
    case cibles.platform when 'vinted' then 'Vinted' when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' when 'depop' then 'Depop' else cibles.platform end ||
    ' n''a pas rendu cette annonce à la dernière lecture. FillSell attend le prochain relevé de ta boutique ' ||
    case cibles.platform when 'vinted' then 'Vinted' when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' when 'depop' then 'Depop' else cibles.platform end ||
    ' pour savoir si elle est encore en ligne ; si elle l''est, la republication repartira toute seule. Pour aller plus vite : « Synchroniser ».',
  platform_fields = (coalesce(j.platform_fields, '{}'::jsonb) - 'annonce_disparue')
    || jsonb_build_object(
      'needs_user_source', 'introuvable_a_confirmer',
      'introuvable_a_confirmer', jsonb_build_object('depuis', cibles.lu_le, 'premiere', cibles.lu_le, 'n', 1, 'reprises', 0,
        'plateforme', cibles.platform, 'lecture', 'reparation_20261015', 'reparation', '20261015_introuvable_a_confirmer'))
from cibles, sauves
where j.id = cibles.id and sauves.id = j.id and j.status = 'cancelled';

select (select count(*) from public._backup_1510_introuvable_jobs) jobs_sauves,
       (select count(*) from public._backup_1510_introuvable_fiches) fiches_sauvees;

commit;
