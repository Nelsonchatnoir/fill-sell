-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — UNE REPUBLICATION HORS VINTED RETROUVE SA COPIE DE DÉPÔT (Amiral 317adae1)
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle (migration 20261017110000) : la copie de dépôt d'une republication
-- Leboncoin / Beebs / Depop vient du serveur (spend_coins_and_republish) et rien
-- ne la refait ; elle n'est JAMAIS retirée. L'ancien annonce_partagee_reprendre
-- la retirait pour « recapturer » (ce que seule l'extension Vinted sait faire) :
-- le job échouait ensuite à l'étape 'a_capturer' — « le job ne porte pas le lien
-- de l'annonce ou sa copie de dépôt » — puis « À toi de jouer ».
-- Ce script, par la règle, rend leur copie aux republications hors Vinted :
--   · copie absente ET retirée par la recapture (recapture_annonce_partagee),
--     étape 'a_capturer', aucune suppression engagée (pas de deleted_at) ;
--   · lien présent, d'accord avec le numéro, annonce relevée EN LIGNE (non
--     disparue) et portée par cette seule fiche ; fiche en stock ;
--   · la copie est refaite telle que spend_coins_and_republish la fait (version 2 :
--     titre, prix, photos du job, lien et numéro de l'annonce désignée, dépôt
--     source) ; le job repart en file à l'étape 'a_capturer' (l'extension relit
--     l'annonce avant tout retrait), le message est archivé, les compteurs de
--     reprise de l'erreur due au défaut sont remis à zéro (gardés dans la marque).
-- Mesuré le 17/10 (lecture seule) : 1 job — 317adae1 (Amiral, Leboncoin
-- 3276310850, « Rangement Blanc et Bleu », en ligne, vue le 16/10 à 18:07).
-- ⛔ À lancer APRÈS la migration 20261017110000 (l'ancienne fonction retirerait
--    la copie à nouveau si le job était encore retenu « annonce partagée »).
-- Le job repart dans la cadence de son compte (créneau Leboncoin) : rien n'est
-- forcé, aucun mail, aucune annonce touchée par ce script.
-- Sauvegarde : _backup_1710_copie_reconstruite ; inverse :
-- scripts/reparations/20261017_copie_republication_reconstruite_INVERSE.sql.

begin;

create table if not exists public._backup_1710_copie_reconstruite as
  select id, status, error, platform_fields, now() as sauve_le from public.cross_post_jobs where false;

create temp table _copie on commit drop as
select j.id, j.user_id, j.platform, j.status, j.error, j.title, j.price, j.photos, j.listing_url,
       nullif(btrim(j.platform_listing_id), '') as pid,
       coalesce(nullif(btrim(j.platform_listing_id), ''), public.annonce_id_job(j.platform, j.listing_url)) as lid,
       j.platform_fields as pf
from public.cross_post_jobs j
join public.inventaire i on i.id = j.inventaire_id
where j.action = 'republish' and j.platform in ('leboncoin', 'beebs', 'depop')
  and j.created_at > now() - interval '60 days'
  and j.status in ('needs_user', 'pending', 'failed')
  and not (j.platform_fields ? 'republish_snapshot')
  and j.platform_fields ? 'recapture_annonce_partagee'
  and not (j.platform_fields ? 'reparation_1710_copie')
  and coalesce(j.platform_fields->>'republish_step', 'a_capturer') = 'a_capturer'
  and j.platform_fields->>'deleted_at' is null
  and nullif(btrim(j.listing_url), '') is not null
  and (nullif(btrim(j.platform_listing_id), '') is null
       or public.annonce_id_job(j.platform, j.listing_url) is null
       or public.annonce_id_job(j.platform, j.listing_url) = btrim(j.platform_listing_id))
  and coalesce(i.statut, 'stock') = 'stock'
  -- l'annonce désignée est relevée en ligne, non disparue
  and exists (
    select 1 from public.annonces_plateforme a
     where a.user_id = j.user_id and a.platform = j.platform
       and a.listing_id = coalesce(nullif(btrim(j.platform_listing_id), ''), public.annonce_id_job(j.platform, j.listing_url))
       and a.statut_plateforme = 'en_ligne' and a.disparu_le is null and a.retiree_le is null)
  -- et portée par cette seule fiche (une annonce n'appartient jamais à deux fiches)
  and (select count(distinct coalesce(i2.fusionne_dans, i2.id))
         from public.cross_post_jobs o join public.inventaire i2 on i2.id = o.inventaire_id
        where o.user_id = j.user_id and o.platform = j.platform and o.inventaire_id is not null
          and o.status in ('pending', 'processing', 'published', 'needs_user')
          and (public.listing_designe(coalesce(nullif(btrim(j.platform_listing_id), ''), public.annonce_id_job(j.platform, j.listing_url)),
                                      o.listing_url, o.platform_listing_id)
               or public.annonce_id_job(o.platform, o.listing_url)
                  = coalesce(nullif(btrim(j.platform_listing_id), ''), public.annonce_id_job(j.platform, j.listing_url)))) = 1;

-- Contrôles AVANT toute écriture.
do $$
declare v_n integer;
begin
  select count(*) into v_n from _copie;
  if v_n > 10 then
    raise exception 'copie reconstruite : % job(s) (1 mesuré le 17/10) — échelle inattendue, rien n''est écrit', v_n;
  end if;
  if exists (select 1 from public._backup_1710_copie_reconstruite b join _copie c on c.id = b.id) then
    raise exception 'copie reconstruite : déjà appliqué pour au moins un de ces jobs — rien n''est écrit';
  end if;
  raise notice 'copie reconstruite : % job(s)', v_n;
end $$;

insert into public._backup_1710_copie_reconstruite (id, status, error, platform_fields, sauve_le)
select j.id, j.status, j.error, j.platform_fields, now()
from public.cross_post_jobs j join _copie c on c.id = j.id;

update public.cross_post_jobs j set
  status = 'pending',
  error = null,
  platform_fields = (j.platform_fields
      - 'needs_user_source' - 'needsUserField' - 'needsUserAttempts' - 'needsUserBoucle' - 'next_action_after'
      - 'processing_since' - 'needs_user_actif_ms' - 'needs_user_tick_le' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
      - 'pas_de_rouge_reprises' - 'error_technique')
    || jsonb_build_object(
      'republish_snapshot', jsonb_build_object(
        'version', 2,
        'plateforme', c.platform,
        'source_job_id', c.pf->>'republish_source_job_id',
        'titre', c.title,
        'prix', c.price,
        'listing_url', c.listing_url,
        'platform_listing_id', c.pid,
        'photos', case when jsonb_typeof(c.photos) = 'array' then jsonb_array_length(c.photos) else 0 end,
        'captured_at', now(),
        'reconstruite', jsonb_build_object('le', now(), 'par', '20261017_copie_republication_reconstruite',
          'motif', 'copie retirée par la recapture d''annonce partagée (Vinted seulement), annonce désignée en ligne')),
      'erreurs_archivees', (
        select coalesce(jsonb_agg(e.v order by e.o), '[]'::jsonb) from (
          select x.v, x.o from jsonb_array_elements(
            coalesce(case when jsonb_typeof(c.pf->'erreurs_archivees') = 'array' then c.pf->'erreurs_archivees' end, '[]'::jsonb)
            || case when nullif(btrim(coalesce(c.error, '')), '') is null then '[]'::jsonb
                    else jsonb_build_array(jsonb_build_object(
                      'le', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                      'statut', c.status, 'erreur', left(c.error, 600),
                      'par', 'réparation 20261017_copie_republication_reconstruite')) end
          ) with ordinality as x(v, o)
          order by x.o desc limit 20
        ) e),
      'reparation_1710_copie', jsonb_build_object('le', now(), 'statut_avant', c.status,
        'needs_user_source_avant', c.pf->'needs_user_source', 'pas_de_rouge_reprises_avant', c.pf->'pas_de_rouge_reprises',
        'error_technique_avant', c.pf->'error_technique', 'annonce', c.lid))
from _copie c
where c.id = j.id and j.status = c.status and not (j.platform_fields ? 'republish_snapshot');

-- Contrôle APRÈS écriture : chaque job sauvegardé a sa copie et repart en file ;
-- sinon tout est annulé.
do $$
declare v_attendus integer; v_faits integer;
begin
  select count(*) into v_attendus from _copie;
  select count(*) into v_faits
    from public.cross_post_jobs j join _copie c on c.id = j.id
   where j.status = 'pending' and j.platform_fields ? 'republish_snapshot'
     and j.platform_fields ? 'reparation_1710_copie'
     and j.platform_fields->>'republish_step' = 'a_capturer'
     and public.annonce_id_job(j.platform, j.platform_fields #>> '{republish_snapshot,listing_url}') is not distinct from c.lid;
  if v_faits <> v_attendus then
    raise exception 'copie reconstruite : % job(s) réparé(s) sur % attendu(s) — tout est annulé', v_faits, v_attendus;
  end if;
end $$;

select left(j.id::text, 8) as job, left(j.user_id::text, 8) as compte, j.platform, j.status,
  j.platform_fields->>'republish_step' as etape, c.lid as annonce,
  j.platform_fields #>> '{republish_snapshot,listing_url}' as lien_de_la_copie
from public.cross_post_jobs j join _copie c on c.id = j.id;

commit;
