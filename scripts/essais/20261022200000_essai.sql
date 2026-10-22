-- Essai à blanc de 20261022200000_file_synchro_boutique_partagee (22/10 soir) : ROLLBACK, rien n'est gardé.
-- Généré par scripts/essais/20261022200000_generer.sh — ne pas éditer à la main.
begin;
set local statement_timeout = '170s';
-- ═══════════════════════════════════════════════════════════════════════════
-- LOT DU 22/10 SOIR — LA FILE (PAUSE, SYNCHRO JAMAIS PENDANT UNE REPUBLICATION), LA BOUTIQUE PARTAGÉE, LE RETRAIT
-- BEEBS RÉARMÉ (points 6, 5, 3 et 1e — rapport docs/enquetes/lot-2210-soir/RAPPORT.md)
-- ═══════════════════════════════════════════════════════════════════════════
-- Fonctions RÉÉCRITES depuis pg_get_functiondef relu en prod le 22/10 vers 20:00 (Paris), seules les lignes marquées
-- « (22/10 soir) » changent : constater_absences_releve, annonces_plateforme_un_compte,
-- releve_clos_leve_alertes_disparues, alerte_lever_revues_plateformes.
-- Inverse : supabase/rollbacks/20261022200000_file_synchro_boutique_partagee_INVERSE.sql
-- Essai à blanc : scripts/essais/20261022200000_essai.sql (ROLLBACK).
--
-- 1. LA FILE EN PAUSE (point 6, idée de Louis validée par Nico). profiles.platform_settings.file_pause, écrit par
--    file_pause_basculer (via platform_settings_fusionner, la seule porte). get-pending-jobs ne sert plus ce qui n'a
--    pas commencé ; un retrait (vente ou geste) et une republication dont le retrait est engagé ne sont JAMAIS en pause.
-- 2. GARDE ABSOLUE (point 5) : aucun relevé (dressing ou annonces) ne DÉMARRE sur une plateforme tant qu'une
--    republication y est entre le retrait de l'ancienne annonce et l'essai de recréation (6 h au plus : au-delà, ce
--    n'est plus « en cours »). La demande reste en file et part dès la remise en ligne.
-- 3. DOUBLE GARDE (point 5) : un article en cours de republication n'est jamais compté disparu ni vendu par un relevé
--    ou par la veille — ni date de disparition, ni question « Vendue ? », ni statut changé.
-- 4. BOUTIQUE PARTAGÉE ENTRE COMPTES RELIÉS (point 3, Louis) : une seule vérité. Le relevé de l'un rafraîchit la
--    PRÉSENCE des annonces de l'autre (elles restent chez le compte qui les a publiées) et lève ses alertes démenties.
--    Une copie disparue dont l'article est en ligne sous l'annonce de la fiche jumelle n'est jamais « Vendue ? ».
--    Une alerte de la veille déjà démentie par un relevé ne repose plus la question : le relevé tranche.
-- 5. RETRAIT BEEBS RÉARMÉ (point 1e) : un retrait d'article vendu clos « déjà absente » sans geste de FillSell, que
--    le relevé revoit ensuite EN LIGNE, repart.


-- ═══ 1. LA FILE EN PAUSE ════════════════════════════════════════════════════
create or replace function public.file_en_pause(p_user uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select lower(coalesce(p.platform_settings #>> '{file_pause,active}', '')) = 'true'
                     from public.profiles p where p.id = p_user), false)
$$;

-- Une republication dont le retrait de l'ancienne annonce est engagé (ou fait) : elle va jusqu'à la remise en ligne.
create or replace function public.republication_retrait_engage(p_pf jsonb)
returns boolean language sql immutable set search_path to 'public', 'pg_temp' as $$
  select coalesce(p_pf ->> 'republish_step', '') = 'deleted'
      or coalesce(p_pf, '{}'::jsonb) ?| array['deleted_at', 'republish_suppression_envoyee']
$$;

-- La republication de CETTE fiche sur CETTE plateforme dont la copie est lue (retrait imminent) ou le retrait
-- engagé : l'article est « en cours de republication ». NULL sinon (fiche nulle comprise).
create or replace function public.republication_engagee(p_user uuid, p_fiche bigint, p_platform text)
returns uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select j.id from public.cross_post_jobs j
   where p_fiche is not null and j.user_id = p_user and j.inventaire_id = p_fiche and j.platform = p_platform
     and j.action = 'republish' and j.status in ('pending', 'processing', 'needs_user')
     and (coalesce(j.platform_fields ->> 'republish_step', '') in ('captured', 'deleted')
          or public.republication_retrait_engage(j.platform_fields))
   order by j.created_at desc
   limit 1
$$;

-- L'annonce est retirée et sa recréation n'a pas encore été tentée (6 h au plus) : la fenêtre où un relevé la verrait
-- disparue sans sa remplaçante. Une recréation tentée (dépôt parti, vérification par relevé attendue) n'y est plus :
-- c'est un relevé qui la vérifie.
create or replace function public.republication_entre_retrait_et_recreation(p_user uuid, p_platform text)
returns uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select j.id from public.cross_post_jobs j
   where j.user_id = p_user and j.platform = p_platform and j.action = 'republish'
     and j.status in ('pending', 'processing')
     and coalesce(j.platform_fields ->> 'republish_step', '') <> 'recreated'
     and public.republication_retrait_engage(j.platform_fields)
     and not (j.platform_fields ?| array['recreation_tentee', 'recreation_depot_parti', 'recreation_attente_depuis',
                                         'recreation_attente_releve', 'recreation_reprise', 'recreation_envois',
                                         'verifier_doublon_avant_publication', 'recreation_deja_partie'])
     and coalesce(public._ts_ou_null(j.platform_fields ->> 'deleted_at'),
                  public._ts_ou_null(j.platform_fields #>> '{republish_suppression_envoyee,at}'),
                  j.created_at) > now() - interval '6 hours'
   order by j.created_at
   limit 1
$$;

-- L'état de la file, pour l'app : pause, ce qui attend la reprise, et les relevés qui attendent une remise en ligne.
create or replace function public.file_etat_pour(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_ps jsonb; v_pause boolean; v_n integer := 0; v_attente jsonb := '[]'::jsonb; r record; v_job uuid;
begin
  select coalesce(platform_settings, '{}'::jsonb) into v_ps from public.profiles where id = p_user;
  v_pause := lower(coalesce(v_ps #>> '{file_pause,active}', '')) = 'true';
  if v_pause then
    select count(*) into v_n from public.cross_post_jobs j
     where j.user_id = p_user and j.status = 'pending' and coalesce(j.action, 'publish') in ('publish', 'republish')
       and not public.republication_retrait_engage(j.platform_fields);
  end if;
  for r in
    select distinct case when s.kind = 'dressing' then 'vinted' else s.platform end as pf
      from public.vinted_sync_runs s
     where s.user_id = p_user and s.status = 'queued' and s.kind in ('dressing', 'annonces')
       and s.queued_at > now() - interval '6 hours'
  loop
    v_job := public.republication_entre_retrait_et_recreation(p_user, r.pf);
    if v_job is not null then
      v_attente := v_attente || jsonb_build_array(jsonb_build_object('platform', r.pf, 'republication', v_job));
    end if;
  end loop;
  return jsonb_build_object('pause', v_pause,
                            'depuis', case when v_pause then v_ps #>> '{file_pause,depuis}' end,
                            'en_pause', v_n,
                            'synchro_attend_republication', v_attente);
end $$;

create or replace function public.file_etat()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  return jsonb_build_object('ok', true) || public.file_etat_pour(auth.uid());
end $$;

-- Ce que l'extension (≥ 0.6.130) relit ENTRE DEUX TÂCHES : la pause, et une synchro demandée par la personne il y a
-- moins de 10 min et pas encore prise (elle passe devant la suite de la file). Une lecture, deux index.
create or replace function public.file_etat_poste()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case when auth.uid() is null then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'pause', public.file_en_pause(auth.uid()),
    'synchro_demandee', exists (
      select 1 from public.vinted_sync_runs s
       where s.user_id = auth.uid() and s.status = 'queued' and s.kind in ('dressing', 'annonces')
         and s.queued_at > now() - interval '10 minutes'
         and coalesce(s.declencheur, '') ~ '^(bouton|bouton_distant|app)(:redemande)?$')) end
$$;

create or replace function public.file_pause_basculer(p_pause boolean)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_user uuid := auth.uid();
  v_deja boolean;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_pause is null then return jsonb_build_object('ok', false, 'reason', 'invalide'); end if;
  v_deja := public.file_en_pause(v_user);
  if p_pause and not v_deja then
    perform public.platform_settings_fusionner(array['file_pause'],
      jsonb_build_object('active', true, 'depuis', now(), 'par', 'app'), '{}'::text[], null);
    insert into public.usage_logs (user_id, feature, metadata) values (v_user, 'file_pause', jsonb_build_object('pause', true));
  elsif not p_pause and v_deja then
    perform public.platform_settings_fusionner(array['file_pause'],
      jsonb_build_object('active', false, 'repris_le', now(), 'par', 'app'), '{}'::text[], null);
    insert into public.usage_logs (user_id, feature, metadata) values (v_user, 'file_pause', jsonb_build_object('pause', false));
  end if;
  return jsonb_build_object('ok', true) || public.file_etat_pour(v_user);
end $$;

-- ═══ 2. GARDE ABSOLUE : AUCUN RELEVÉ NE DÉMARRE ENTRE LE RETRAIT ET LA RECRÉATION ═══
-- Même forme que garde_pause_antirobot_sync_runs : l'extension voit sa prise refusée (la demande reste en file et
-- repart au poll suivant) ou son relevé non créé (alarme, veilleur, bouton). Toutes les versions d'extension.
create or replace function public.garde_releve_pendant_republication()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_pf text; v_job uuid;
begin
  if new.status is distinct from 'running' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'running' then return new; end if;   -- progression d'un relevé en cours
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  v_pf := case when new.kind = 'dressing' then 'vinted' when new.kind = 'annonces' then new.platform end;
  if v_pf is null then return new; end if;
  begin
    v_job := public.republication_entre_retrait_et_recreation(new.user_id, v_pf);
  exception when others then
    raise warning 'garde_releve_pendant_republication (% / %) : % — relevé laissé partir', new.user_id, v_pf, sqlerrm;
    return new;
  end;
  if v_job is null then return new; end if;
  raise exception 'RELEVE_ATTEND_REPUBLICATION: republication % (%) entre le retrait et la recréation de son annonce — le relevé partira dès qu''elle sera remise en ligne', v_job, v_pf
    using errcode = 'P0001';
end $$;

drop trigger if exists garde_releve_pendant_republication on public.vinted_sync_runs;
create trigger garde_releve_pendant_republication
  before insert or update of status on public.vinted_sync_runs
  for each row execute function public.garde_releve_pendant_republication();

-- ═══ 3 + 4. UNE ALERTE « PLUS EN LIGNE » N'EST POSÉE QUE SI ELLE TIENT ═══════
-- Seulement une alerte NEUVE et de doute (jamais une preuve « sold », qui passe toujours) :
--  (1)  l'article est en cours de republication sur la plateforme → ni disparu, ni vendu : alerte écartée ;
--  (1b) le job est remplacé par SA republication (copie recréée, publiée, autre numéro) → clos, pas une vente ;
--  (3)  boutique partagée entre comptes reliés : l'article est en ligne sous l'annonce de la fiche jumelle → au constat
--       de deux relevés complets, la copie est close « remplacée par l'annonce de ton compte relié » ; à la veille,
--       aucune question (le relevé tranchera) ;
--  (2)  une alerte de la VEILLE sur une annonce qu'un relevé a déjà revue en ligne après une fausse alerte → aucune
--       question : « à confirmer par le relevé » (deux relevés complets sans elle la reposent, avec leur preuve).
-- Nommé « zz » : passe après cross_post_jobs_vue_ou_pas_encore_visible (dépôt jamais vu en ligne).
create or replace function public.cross_post_jobs_alerte_tenue()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_constat boolean;
  v_rep uuid;
  v_suiv record;
  v_jum record;
  v_retire text[] := array['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'];
  v_nom text;
begin
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  if not (coalesce(new.platform_fields, '{}'::jsonb) ? 'unavailable_since')
     or coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since'
     or coalesce(new.platform_fields ->> 'sale_signal', 'unavailable') <> 'unavailable'
     or new.status is distinct from 'published'
     or coalesce(new.action, 'publish') not in ('publish', 'republish')
     or new.inventaire_id is null then
    return new;
  end if;
  v_nom := case new.platform when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' when 'ebay' then 'eBay'
                             when 'depop' then 'Depop' when 'vinted' then 'Vinted' when 'opla' then 'Opla' else new.platform end;
  -- Le constat de deux relevés complets (constater_absences_releve) pose absence_releves dans la même écriture.
  v_constat := new.platform_fields ? 'absence_releves'
               and (new.platform_fields -> 'absence_releves') is distinct from (coalesce(old.platform_fields, '{}'::jsonb) -> 'absence_releves');

  -- (1) En cours de republication.
  v_rep := public.republication_engagee(new.user_id, new.inventaire_id, new.platform);
  if v_rep is not null and v_rep <> new.id then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('alerte_ecartee', jsonb_build_object('le', now(), 'motif', 'republication_en_cours',
           'republication', v_rep, 'constat', v_constat));
    return new;
  end if;

  -- (1b) Remplacé par sa propre republication.
  select r.id, btrim(r.platform_listing_id) as annonce into v_suiv
    from public.cross_post_jobs r
   where r.user_id = new.user_id and r.inventaire_id = new.inventaire_id and r.platform = new.platform
     and r.action = 'republish' and r.status = 'published' and r.id <> new.id
     and r.platform_fields ->> 'republish_source_job_id' = new.id::text
     and nullif(btrim(coalesce(r.platform_listing_id, '')), '') is not null
     and btrim(r.platform_listing_id) is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
   order by r.created_at desc limit 1;
  if v_suiv.id is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('republished_pending', true,
           'remplacee_par_republication', jsonb_build_object('le', now(), 'job', v_suiv.id, 'annonce', v_suiv.annonce));
    new.status := 'cancelled';
    new.error := 'Annonce remplacée par sa republication (nouvelle annonce ' || v_suiv.annonce || ') — ce n''est pas une vente.';
    return new;
  end if;

  -- (3) Boutique partagée : la fiche jumelle du compte relié est en ligne sur cette plateforme.
  if new.platform <> 'vinted' then
    select o.listing_id, o.compte into v_jum
      from public.jumelle_occupe_plateformes(new.user_id, new.inventaire_id) o
     where o.platform = new.platform and o.statut in ('en_ligne', 'en_verification', 'published')
       and o.listing_id is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
     limit 1;
    if v_jum.listing_id is not null then
      if v_constat then
        new.platform_fields := (new.platform_fields - v_retire)
          || jsonb_build_object('copie_remplacee_par_compte_relie', jsonb_build_object('le', now(),
               'annonce', v_jum.listing_id, 'compte', v_jum.compte));
        new.status := 'cancelled';
        new.error := 'Cette annonce ' || v_nom || ' n''est plus en ligne ; ton article reste en vente sur ' || v_nom
          || ' sous l''annonce ' || v_jum.listing_id || ' de ton compte FillSell relié (même boutique). Rien à refaire.';
      else
        new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
          || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
               'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'jumelle_en_ligne',
                 'annonce', v_jum.listing_id));
      end if;
      return new;
    end if;
  end if;

  -- (2) Alerte de la veille déjà démentie par un relevé sur cette annonce.
  if not v_constat and new.platform <> 'vinted'
     and coalesce(old.platform_fields, '{}'::jsonb) ? 'revue_en_ligne_par_releve' then
    new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
      || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
           'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'dementie_par_releve',
             'dementie_le', old.platform_fields #>> '{revue_en_ligne_par_releve,at}'));
    return new;
  end if;
  return new;
exception when others then
  raise warning 'cross_post_jobs_alerte_tenue : job % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists cross_post_jobs_zz_alerte_tenue on public.cross_post_jobs;
create trigger cross_post_jobs_zz_alerte_tenue
  before update on public.cross_post_jobs
  for each row execute function public.cross_post_jobs_alerte_tenue();

-- Vinted : la fiche d'un article en cours de republication n'est jamais datée « disparue » (la synchro du dressing
-- la verrait absente entre le retrait et la recréation). Même règle que la garde É4 de l'extension, pour toutes les
-- versions et tous les écrivains.
create or replace function public.inventaire_disparu_garde_republication()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_rep uuid;
begin
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  if new.disparu_le is null or old.disparu_le is not null then return new; end if;
  v_rep := public.republication_engagee(new.user_id, new.id, 'vinted');
  if v_rep is not null then
    raise log 'inventaire_disparu_garde_republication : fiche % — republication Vinted % en cours, disparition non datée', new.id, v_rep;
    new.disparu_le := null;
  end if;
  return new;
exception when others then
  raise warning 'inventaire_disparu_garde_republication : fiche % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $$;

drop trigger if exists inventaire_zz_disparu_garde_republication on public.inventaire;
create trigger inventaire_zz_disparu_garde_republication
  before update of disparu_le on public.inventaire
  for each row execute function public.inventaire_disparu_garde_republication();

-- constater_absences_releve : corps de prod du 22/10, une condition de plus (22/10 soir).
CREATE OR REPLACE FUNCTION public.constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 FOR a IN
   SELECT ap.id,ap.listing_id,ap.inventaire_id,ap.vu_le FROM annonces_plateforme ap
   WHERE ap.user_id=r.user_id AND ap.platform=r.platform
     AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
     AND ap.vu_le<precedent.started_at
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs recent WHERE recent.user_id=r.user_id
       AND recent.inventaire_id=ap.inventaire_id AND recent.platform=r.platform
       AND recent.action IN ('publish','republish') AND recent.status='published'
       AND COALESCE(recent.published_at,recent.created_at)>precedent.started_at-interval '4 hours'
       AND listing_designe(ap.listing_id,recent.listing_url,recent.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM rapprochements q WHERE q.annonce_id=ap.id
       AND q.detail->>'absence_confirmee_revision'='20260928'
       AND (q.detail->>'derniere_vue')::timestamptz>=ap.vu_le)
     -- (22/10 soir, point 5) Un article en cours de republication n'est jamais compté disparu.
     AND public.republication_engagee(r.user_id, ap.inventaire_id, r.platform) IS NULL
   ORDER BY ap.vu_le DESC,ap.id LIMIT 25 FOR UPDATE OF ap SKIP LOCKED
 LOOP
   EXIT WHEN clock_timestamp()-debut>interval '1 second';
   UPDATE annonces_plateforme SET disparu_le=COALESCE(disparu_le,r.finished_at),updated_at=now() WHERE id=a.id;
   -- Le signal existant ouvre la question de l'app. Ce n'est ni une vente,
   -- ni une annulation du dépôt historique, ni un retrait sur une plateforme.
   UPDATE cross_post_jobs j SET platform_fields=COALESCE(j.platform_fields,'{}'::jsonb)
     || jsonb_build_object('sale_signal','unavailable','unavailable_since',r.finished_at,
          'absence_releves',jsonb_build_object('premier',precedent.id,'second',r.id,'listing_id',a.listing_id,'le',now()))
   WHERE j.inventaire_id=a.inventaire_id AND j.user_id=r.user_id AND j.platform=r.platform
     AND j.status='published' AND j.action IN ('publish','republish')
     AND j.platform_fields->>'sale_signal' IS DISTINCT FROM 'sold'
     AND listing_designe(a.listing_id,j.listing_url,j.platform_listing_id);
   INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
   VALUES(r.user_id,a.id,a.inventaire_id,'aucune','auto',0,
     jsonb_build_object('absence_confirmee_revision','20260928','derniere_vue',a.vu_le,'premier',precedent.id,'second',r.id));
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id);
END;
$function$;

-- annonces_plateforme_un_compte : corps de prod du 22/10 ; la branche « compte relié » rafraîchit la présence (22/10 soir).
CREATE OR REPLACE FUNCTION public.annonces_plateforme_un_compte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Restauration par nous seuls (scripts de réparation, inverse) : même porte que inventaire_releve_par_decision.
  if coalesce(current_setting('fillsell.import_releve', true), '') = 'on' then return new; end if;
  if nullif(btrim(coalesce(new.listing_id, '')), '') is null or new.user_id is null then return new; end if;
  begin
    -- Upsert d'une annonce déjà suivie par CE compte : mise à jour normale.
    if exists (select 1 from public.annonces_plateforme a
                where a.user_id = new.user_id and a.platform = new.platform and a.listing_id = new.listing_id) then
      return new;
    end if;
    -- (18/10 soir, Louis — décision de Nico, option B) Deux comptes RELIÉS publient sur le MÊME compte Leboncoin :
    -- chaque annonce appartient au compte dont un job l'a PUBLIÉE (son identifiant). Le relevé de l'autre compte ne
    -- l'importe pas ; le compte qui l'a publiée l'importe toujours, même si l'autre la suit déjà.
    if exists (select 1 from public.comptes_lies cl where cl.user_a = new.user_id or cl.user_b = new.user_id) then
      if public.annonce_publiee_par_compte(new.user_id, new.platform, new.listing_id) then
        return new;
      end if;
      if public.annonce_publiee_par_compte_lie(new.user_id, new.platform, new.listing_id) then
        insert into public.sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
        values (new.user_id, new.listing_id, null, left(coalesce(new.titre, ''), 120), 'compte_relie:' || coalesce(new.platform, ''));
        -- (22/10 soir, point 3) UNE BOUTIQUE PARTAGÉE, UNE SEULE VÉRITÉ : ce relevé a VU l'annonce du compte relié
        -- dans la boutique commune. La ligne du compte qui l'a publiée est rafraîchie — PRÉSENCE seulement (vue,
        -- en ligne / en vérification) : jamais une vente, une transaction, un prix ni un titre lus pour l'autre.
        if new.vu_le is not null and coalesce(new.statut_plateforme, '') in ('en_ligne', 'en_verification') then
          update public.annonces_plateforme b set
                 vu_le = new.vu_le,
                 statut_plateforme = new.statut_plateforme,
                 disparu_le = null,
                 updated_at = now()
           where b.platform = new.platform and b.listing_id = new.listing_id and b.user_id <> new.user_id
             and public.comptes_sont_lies(new.user_id, b.user_id)
             and public.annonce_publiee_par_compte(b.user_id, new.platform, new.listing_id)
             and b.retiree_le is null
             and (b.vu_le is null or b.vu_le < new.vu_le);
        end if;
        return null;
      end if;
    end if;
    if exists (select 1 from public.annonces_plateforme a
                where a.platform = new.platform and a.listing_id = new.listing_id
                  and a.user_id <> new.user_id and a.disparu_le is null) then
      insert into public.sync_import_ecartes (user_id, vinted_item_id, vinted_status, titre, motif)
      values (new.user_id, new.listing_id, null, left(coalesce(new.titre, ''), 120), 'autre_compte:' || coalesce(new.platform, ''));
      return null;
    end if;
  exception when others then
    raise warning 'annonces_plateforme_un_compte : % — import inchangé', sqlerrm;
  end;
  return new;
end $function$;

-- alerte_lever_revues_plateformes : corps de prod du 22/10 ; + les alertes « à confirmer par le relevé » (22/10 soir).
CREATE OR REPLACE FUNCTION public.alerte_lever_revues_plateformes(p_user uuid DEFAULT NULL::uuid, p_platform text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids    uuid[];
  n_levees integer := 0;
  n_confirmees integer := 0;
BEGIN
  SELECT COALESCE(array_agg(j.id), ARRAY[]::uuid[]) INTO v_ids
    FROM cross_post_jobs j
   WHERE j.status = 'published'
     AND j.platform IN ('leboncoin', 'ebay', 'beebs', 'opla', 'depop')
     AND (p_user IS NULL OR j.user_id = p_user)
     AND (p_platform IS NULL OR j.platform = p_platform)
     AND j.platform_fields ? 'unavailable_since'
     AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'                  -- 1
     AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM annonces_plateforme a
        WHERE a.user_id = j.user_id AND a.platform = j.platform
          AND a.listing_id = btrim(j.platform_listing_id)                             -- 5
          AND a.statut_plateforme = 'en_ligne'                                        -- 2
          AND a.disparu_le IS NULL                                                    -- 3
          AND a.vu_le > (j.platform_fields ->> 'unavailable_since')::timestamptz);    -- 4
  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    UPDATE cross_post_jobs SET
      platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price',
                                                'alerte_masquee_pour', 'alerte_masquee_le'])
        || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('at', now(), 'par', 'alerte_lever_revues_plateformes'))
     WHERE id = ANY (v_ids) AND status = 'published';
    GET DIAGNOSTICS n_levees = ROW_COUNT;
  END IF;
  -- (22/10 soir, point 3) Une alerte « à confirmer par le relevé » (posée au lieu d'une question) : le relevé qui revoit
  -- l'annonce EN LIGNE après elle l'efface, comme une alerte levée.
  UPDATE cross_post_jobs j SET
    platform_fields = (j.platform_fields - ARRAY['alerte_a_confirmer_par_releve', 'unavailable_pending_since'])
      || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('at', now(), 'par', 'alerte_lever_revues_plateformes'))
   WHERE j.status = 'published'
     AND j.platform IN ('leboncoin', 'ebay', 'beebs', 'opla', 'depop')
     AND (p_user IS NULL OR j.user_id = p_user)
     AND (p_platform IS NULL OR j.platform = p_platform)
     AND j.platform_fields ? 'alerte_a_confirmer_par_releve'
     AND NOT (j.platform_fields ? 'unavailable_since')
     AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM annonces_plateforme a
        WHERE a.user_id = j.user_id AND a.platform = j.platform
          AND a.listing_id = btrim(j.platform_listing_id)
          AND a.statut_plateforme = 'en_ligne'
          AND a.disparu_le IS NULL
          AND a.vu_le > COALESCE(public._ts_ou_null(j.platform_fields #>> '{alerte_a_confirmer_par_releve,le}'), now()));
  GET DIAGNOSTICS n_confirmees = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'levees', n_levees, 'a_confirmer_levees', n_confirmees);
END
$function$;

-- ═══ 5. RETRAIT BEEBS CLOS SANS PREUVE, REVU EN LIGNE : RÉARMÉ ═══════════════
-- Un retrait d'article VENDU (armé par la vente) clos « déjà absente » SANS que FillSell ait envoyé la suppression
-- (Beebs l'examinait encore, 72 h passées) : si un relevé Beebs la revoit EN LIGNE après la clôture, le retrait repart.
-- Trois réarmements au plus par retrait. Aucun retrait si l'article n'est plus vendu (vente retirée).
create or replace function public.retraits_beebs_rearmer_revus(p_user uuid)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare d record; n integer := 0;
begin
  for d in
    select j.id, j.platform_fields as pf, a.id as annonce, a.vu_le, a.run_id
      from public.cross_post_jobs j
      join public.annonces_plateforme a
        on a.user_id = j.user_id and a.platform = 'beebs' and a.listing_id = btrim(j.platform_listing_id)
       and a.statut_plateforme = 'en_ligne' and a.disparu_le is null
     where j.user_id = p_user and j.platform = 'beebs' and j.action = 'delete' and j.status = 'deleted'
       and btrim(coalesce(j.platform_listing_id, '')) ~ '^\d+$'
       and j.platform_fields #>> '{arme_par,chemin}' in ('vente_article_serveur', 'vente_copie_prouvee')
       and coalesce((j.platform_fields -> 'delete_trace')::text, '') !~* 'confirmation (envoy|re[cç]u)'
       and coalesce((j.platform_fields #>> '{rearme_revu_en_ligne,n}')::int, 0) < 3
       and a.vu_le > greatest(j.created_at,
                              coalesce(public._ts_ou_null(j.platform_fields ->> 'processing_since'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{delete_preuve,lu_le}'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{rearme_revu_en_ligne,le}'), '-infinity'::timestamptz))
                     + interval '10 minutes'
       and not exists (select 1 from public.cross_post_jobs o
                        where o.user_id = j.user_id and o.platform = 'beebs' and o.action = 'delete'
                          and o.status in ('pending', 'processing', 'needs_user')
                          and btrim(coalesce(o.platform_listing_id, '')) = btrim(j.platform_listing_id))
       and exists (select 1 from public.cross_post_jobs dep
                     join public.inventaire i on i.id = dep.inventaire_id and i.user_id = dep.user_id
                    where (j.platform_fields #>> '{arme_par,depot}') ~ '^[0-9a-fA-F-]{36}$'
                      and dep.id = (j.platform_fields #>> '{arme_par,depot}')::uuid
                      and i.statut = 'vendu')
     limit 20
  loop
    update public.cross_post_jobs set
           status = 'pending',
           error = 'Revue en ligne sur Beebs après la clôture de son retrait : l''article est vendu, FillSell la retire.',
           platform_fields = (platform_fields - array['processing_since', 'next_action_after', 'delete_confirmed_by',
                                                      'delete_preuve', 'beebs_en_moderation'])
             || jsonb_build_object('rearme_revu_en_ligne', jsonb_build_object('le', now(), 'vu_le', d.vu_le,
                  'releve', d.run_id, 'n', coalesce((d.pf #>> '{rearme_revu_en_ligne,n}')::int, 0) + 1,
                  'trace_precedente', d.pf -> 'delete_trace'))
     where id = d.id and status = 'deleted';
    if found then
      update public.annonces_plateforme set retiree_le = null, retrait_job_id = null, updated_at = now()
       where id = d.annonce and retrait_job_id = d.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- releve_clos_leve_alertes_disparues : corps de prod du 22/10 ; + comptes reliés (boutique partagée) et Beebs (22/10 soir).
CREATE OR REPLACE FUNCTION public.releve_clos_leve_alertes_disparues()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_autre uuid; n integer;
BEGIN
  BEGIN
    v := alerte_lever_revues_plateformes(NEW.user_id, NEW.platform);
    IF COALESCE((v ->> 'levees')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → % alerte(s) « plus en ligne » levée(s), annonces revues en ligne', NEW.id, NEW.platform, v ->> 'levees';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues : run % : %', NEW.id, SQLERRM;
  END;
  -- (22/10 soir, point 3) Boutique partagée entre comptes reliés : ce relevé a aussi revu les annonces du compte relié.
  BEGIN
    FOR v_autre IN
      SELECT CASE WHEN cl.user_a = NEW.user_id THEN cl.user_b ELSE cl.user_a END
        FROM comptes_lies cl WHERE cl.user_a = NEW.user_id OR cl.user_b = NEW.user_id
    LOOP
      IF boutique_partagee_compte_relie(NEW.user_id, v_autre, NEW.platform) THEN
        v := alerte_lever_revues_plateformes(v_autre, NEW.platform);
        IF COALESCE((v ->> 'levees')::int, 0) + COALESCE((v ->> 'a_confirmer_levees')::int, 0) > 0 THEN
          RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → compte relié % : %', NEW.id, NEW.platform, v_autre, v;
        END IF;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues (compte relié) : run % : %', NEW.id, SQLERRM;
  END;
  -- (22/10 soir, point 1e) Beebs : un retrait clos sans preuve dont l'annonce est revue en ligne repart.
  IF NEW.platform = 'beebs' THEN
    BEGIN
      n := retraits_beebs_rearmer_revus(NEW.user_id);
      IF n > 0 THEN
        RAISE LOG 'releve_clos_leve_alertes_disparues : run % (beebs) → % retrait(s) réarmé(s), annonces revues en ligne', NEW.id, n;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_leve_alertes_disparues (retraits Beebs) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$;

-- ═══ DROITS ══════════════════════════════════════════════════════════════════
revoke all on function public.file_en_pause(uuid) from public, anon, authenticated;
revoke all on function public.republication_retrait_engage(jsonb) from public, anon;
revoke all on function public.republication_engagee(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.republication_entre_retrait_et_recreation(uuid, text) from public, anon, authenticated;
revoke all on function public.file_etat_pour(uuid) from public, anon, authenticated;
revoke all on function public.file_etat() from public, anon;
revoke all on function public.file_pause_basculer(boolean) from public, anon;
revoke all on function public.file_etat_poste() from public, anon;
revoke all on function public.retraits_beebs_rearmer_revus(uuid) from public, anon, authenticated;
revoke all on function public.cross_post_jobs_alerte_tenue() from public, anon, authenticated;
revoke all on function public.garde_releve_pendant_republication() from public, anon, authenticated;
revoke all on function public.inventaire_disparu_garde_republication() from public, anon, authenticated;
grant execute on function public.file_etat() to authenticated;
grant execute on function public.file_pause_basculer(boolean) to authenticated;
grant execute on function public.file_etat_poste() to authenticated;
grant execute on function public.file_en_pause(uuid) to service_role;
grant execute on function public.republication_engagee(uuid, bigint, text) to service_role;
grant execute on function public.republication_entre_retrait_et_recreation(uuid, text) to service_role;
grant execute on function public.file_etat_pour(uuid) to service_role;
grant execute on function public.retraits_beebs_rearmer_revus(uuid) to service_role;

-- Tests de 20261022200000_file_synchro_boutique_partagee (assemblés par 20261022200000_generer.sh avec la migration,
-- dans UNE transaction annulée). Données réelles : Nico (f44b5917…, annonces de TEST à 999 €), Louis (louis@ / louis-seller),
-- retraits Beebs clos du parc. Rien n'est gardé.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;

-- ── A. Structure et droits ────────────────────────────────────────────────
insert into _r select 'A1 déclencheurs posés', count(*) = 3, string_agg(tgname, ',')
  from pg_trigger where tgname in ('garde_releve_pendant_republication', 'cross_post_jobs_zz_alerte_tenue', 'inventaire_zz_disparu_garde_republication');
insert into _r select 'A2 RPC de l''app : authenticated oui, anon non',
  has_function_privilege('authenticated', 'public.file_pause_basculer(boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.file_etat()', 'execute')
  and not has_function_privilege('anon', 'public.file_pause_basculer(boolean)', 'execute')
  and not has_function_privilege('anon', 'public.file_etat()', 'execute'), '';
insert into _r select 'A3 aides serveur : authenticated non, service_role oui',
  not has_function_privilege('authenticated', 'public.republication_entre_retrait_et_recreation(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.retraits_beebs_rearmer_revus(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.republication_entre_retrait_et_recreation(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.file_etat_pour(uuid)', 'execute'), '';

-- ── B. La file en pause (point 6) ─────────────────────────────────────────
do $$
declare nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18'; r jsonb; ps jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', nico, 'role', 'authenticated')::text, true);
  r := public.file_pause_basculer(true);
  select platform_settings into ps from profiles where id = nico;
  insert into _r values ('B1 pause posée par la RPC', (r ->> 'pause')::boolean and (ps #>> '{file_pause,active}') = 'true', r::text);
  insert into _r values ('B2 file_en_pause lu vrai', public.file_en_pause(nico), '');
  r := public.file_pause_basculer(true);
  insert into _r values ('B3 reposer la pause ne change pas « depuis »', (r ->> 'depuis') = (ps #>> '{file_pause,depuis}'), r::text);
  r := public.file_pause_basculer(false);
  select platform_settings into ps from profiles where id = nico;
  insert into _r values ('B4 reprise', not (r ->> 'pause')::boolean and (ps #>> '{file_pause,active}') = 'false' and ps #>> '{file_pause,repris_le}' is not null, r::text);
  insert into _r values ('B5 le reste de platform_settings intact', ps ? 'vinted' or ps ? 'leboncoin' or jsonb_typeof(ps) = 'object', left(ps::text, 120));
  -- B7-B9 : ce que l'extension relit ENTRE DEUX TÂCHES (file_etat_poste)
  perform public.file_pause_basculer(true);
  r := public.file_etat_poste();
  insert into _r values ('B7 extension : la pause se lit entre deux tâches', (r ->> 'ok')::boolean and (r ->> 'pause')::boolean, r::text);
  perform public.file_pause_basculer(false);
  delete from vinted_sync_runs where user_id = nico and status = 'queued';
  insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at) values (nico, 'annonces', 'leboncoin', 'queued', 'serveur:verif_redepot', now());
  r := public.file_etat_poste();
  insert into _r values ('B8 une demande du SERVEUR ne coupe pas la file', not (r ->> 'synchro_demandee')::boolean and not (r ->> 'pause')::boolean, r::text);
  insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at) values (nico, 'dressing', 'vinted', 'queued', 'bouton', now());
  r := public.file_etat_poste();
  insert into _r values ('B9 « Synchroniser » de la personne (< 10 min) : la synchro passe entre deux tâches', (r ->> 'synchro_demandee')::boolean, r::text);
  update vinted_sync_runs set queued_at = now() - interval '11 minutes' where user_id = nico and status = 'queued' and declencheur = 'bouton';
  r := public.file_etat_poste();
  insert into _r values ('B10 au-delà de 10 min : plus rien ne retient la file', not (r ->> 'synchro_demandee')::boolean, r::text);
  delete from vinted_sync_runs where user_id = nico and status = 'queued';   -- les essais suivants posent les leurs
  perform set_config('request.jwt.claims', '', true);
  r := public.file_etat();
  insert into _r values ('B6 sans session : refus', (r ->> 'ok') = 'false', r::text);
  r := public.file_etat_poste();
  insert into _r values ('B11 extension sans session : refus', (r ->> 'ok') = 'false', r::text);
end $$;

-- ── C. Garde absolue : aucun relevé ne démarre entre le retrait et la recréation (point 5) ─────
do $$
declare
  nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18'; rep uuid; run uuid; ok boolean; msg text;
begin
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, listing_url, platform_listing_id, platform_fields)
  values (nico, 1791800000002, 'leboncoin', 'republish', 'pending', 'original', 'TEST FillSell ne pas acheter', 999, null, null,
          jsonb_build_object('republish_step', 'deleted', 'deleted_at', now() - interval '2 minutes', 'next_action_after', now() + interval '3 minutes',
                             'republish_source', 'manuel', 'essai_2210', true))
  returning id into rep;
  insert into _r values ('C0 republication en fenêtre (retirée, pas encore recréée)', public.republication_entre_retrait_et_recreation(nico, 'leboncoin') = rep, rep::text);
  -- un relevé lancé par l'extension (alarme, veilleur, bouton) : refusé
  begin
    insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, started_at) values (nico, 'annonces', 'leboncoin', 'running', 'app', now());
    ok := false; msg := 'inséré';
  exception when others then ok := sqlerrm like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C1 relevé LBC démarré par l''extension : refusé', ok, left(msg, 140));
  -- la demande de l'app (queued) : acceptée, elle attend
  insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at) values (nico, 'annonces', 'leboncoin', 'queued', 'app', now()) returning id into run;
  insert into _r values ('C2 demande de synchro posée en file', run is not null, run::text);
  insert into _r values ('C3 file_etat dit « la synchro attend la republication »',
    (public.file_etat_pour(nico) -> 'synchro_attend_republication') @> jsonb_build_array(jsonb_build_object('platform', 'leboncoin')), (public.file_etat_pour(nico))::text);
  -- la prise de la demande par l'extension : refusée, la demande reste en file
  begin
    update vinted_sync_runs set status = 'running', claimed_at = now(), started_at = now() where id = run and status = 'queued';
    ok := false; msg := 'prise';
  exception when others then ok := sqlerrm like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C4 prise de la demande pendant la fenêtre : refusée', ok and (select status from vinted_sync_runs where id = run) = 'queued', left(msg, 140));
  -- les autres plateformes ne sont pas retenues
  begin
    insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, started_at) values (nico, 'annonces', 'beebs', 'running', 'app', now());
    ok := true; msg := 'ok';
  exception when others then ok := sqlerrm not like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C5 relevé Beebs du même compte : pas retenu par la garde', ok, left(msg, 140));
  -- la recréation tentée (dépôt parti) : le relevé, qui la vérifie, part
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('recreation_tentee', jsonb_build_object('at', now(), 'n', 1)) where id = rep;
  begin
    update vinted_sync_runs set status = 'running', claimed_at = now(), started_at = now() where id = run and status = 'queued';
    ok := (select status from vinted_sync_runs where id = run) = 'running'; msg := 'prise';
  exception when others then ok := false; msg := sqlerrm; end;
  insert into _r values ('C6 recréation tentée : la synchro part (elle la vérifie)', ok, left(msg, 140));
  -- une fenêtre de plus de 6 h n'est plus « en cours »
  update cross_post_jobs set platform_fields = (platform_fields - 'recreation_tentee') || jsonb_build_object('deleted_at', now() - interval '7 hours') where id = rep;
  insert into _r values ('C7 retrait de plus de 6 h : plus « en cours »', public.republication_entre_retrait_et_recreation(nico, 'leboncoin') is null, '');
  -- dressing : même garde côté Vinted
  update cross_post_jobs set platform = 'vinted', platform_fields = platform_fields || jsonb_build_object('deleted_at', now(), 'vinted_item_id', '10397824964') where id = rep;
  begin
    insert into vinted_sync_runs (user_id, kind, status, declencheur, started_at) values (nico, 'dressing', 'running', 'bouton', now());
    ok := false; msg := 'inséré';
  exception when others then ok := sqlerrm like 'RELEVE_ATTEND_REPUBLICATION%'; msg := sqlerrm; end;
  insert into _r values ('C8 relevé du dressing pendant une republication Vinted retirée : refusé', ok, left(msg, 140));
  delete from vinted_sync_runs where user_id = nico and declencheur in ('app', 'bouton') and started_at > now() - interval '1 minute';
  delete from cross_post_jobs where id = rep;
end $$;

-- ── D. Double garde et alertes qui tiennent (points 5 et 3) ─────────────────
do $$
declare
  nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  jl uuid := '4d16d7f5-ba04-449c-94aa-fe98eed75468';   -- Nico, LBC 3289322234 (TEST, 999 €)
  rep uuid; sup uuid; pf jsonb; st text; err text;
begin
  -- D1 : republication engagée (copie lue) → l'alerte de la veille sur l'ancienne annonce est écartée
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, platform_fields)
  values (nico, 1791800000002, 'leboncoin', 'republish', 'pending', 'original', 'TEST', 999,
          jsonb_build_object('republish_step', 'captured', 'republish_source', 'manuel', 'essai_2210', true)) returning id into rep;
  update cross_post_jobs set platform_fields = (platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since','revue_en_ligne_par_releve'])
   where id = jl;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = jl;
  select platform_fields, status into pf, st from cross_post_jobs where id = jl;
  insert into _r values ('D1 republication en cours : ni « plus en ligne », ni « vendue ? »',
    not (pf ? 'sale_signal') and not (pf ? 'unavailable_since') and pf #>> '{alerte_ecartee,motif}' = 'republication_en_cours' and st = 'published', left(pf::text, 0) || st);
  -- D2 : une preuve « sold » passe toujours
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'sold') where id = jl;
  select platform_fields into pf from cross_post_jobs where id = jl;
  insert into _r values ('D2 une preuve de vente « sold » n''est jamais écartée', pf ->> 'sale_signal' = 'sold', '');
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','alerte_ecartee'] where id = jl;
  delete from cross_post_jobs where id = rep;
  -- D3 : remplacé par SA republication publiée → clos, pas une vente
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, platform_listing_id, listing_url, platform_fields)
  values (nico, 1791800000002, 'leboncoin', 'republish', 'published', 'original', 'TEST', 999, '3999999999', 'https://www.leboncoin.fr/ad/divers/3999999999',
          jsonb_build_object('republish_step', 'recreated', 'republish_source_job_id', jl::text, 'essai_2210', true)) returning id into sup;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = jl;
  select platform_fields, status, error into pf, st, err from cross_post_jobs where id = jl;
  insert into _r values ('D3 remplacé par sa republication : clos sans question', st = 'cancelled' and not (pf ? 'sale_signal') and pf ? 'remplacee_par_republication', st || ' — ' || coalesce(err, ''));
  delete from cross_post_jobs where id = sup;
end $$;

-- D4-D6 : Louis — copie de louis@ disparue, la jumelle de louis-seller en ligne dans la boutique commune
do $$
declare
  j uuid := '793cce6f-59ea-48e1-9775-472f9453314f';   -- louis@, LBC 3292085422 (désactivée), jumelle louis-seller 3291650743 en ligne
  pf jsonb; st text; err text;
begin
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since','absence_releves'] where id = j;
  -- la veille (sans constat) : aucune question
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = j;
  select platform_fields, status into pf, st from cross_post_jobs where id = j;
  insert into _r values ('D4 veille, jumelle en ligne : pas de « Vendue ? », à confirmer par le relevé',
    st = 'published' and not (pf ? 'sale_signal') and pf #>> '{alerte_a_confirmer_par_releve,motif}' = 'jumelle_en_ligne', '');
  -- le constat de deux relevés complets : la copie est close, remplacée par l'annonce du compte relié
  update cross_post_jobs set platform_fields = (platform_fields - array['unavailable_pending_since','alerte_a_confirmer_par_releve'])
    || jsonb_build_object('sale_signal', 'unavailable', 'unavailable_since', now(),
         'absence_releves', jsonb_build_object('premier', gen_random_uuid(), 'second', gen_random_uuid(), 'listing_id', '3292085422', 'le', now()))
   where id = j;
  select platform_fields, status, error into pf, st, err from cross_post_jobs where id = j;
  insert into _r values ('D5 constat, jumelle en ligne : close « remplacée par l''annonce de ton compte relié »',
    st = 'cancelled' and pf #>> '{copie_remplacee_par_compte_relie,annonce}' = '3291650743' and not (pf ? 'sale_signal'), coalesce(err, ''));
end $$;

do $$
declare
  j uuid := '42d7f883-2387-4601-8965-e9d43839bab3';   -- louis@, LBC 3287663775 « Jeu des acrobates », EN LIGNE, fausse alerte démentie le 18/10
  pf jsonb; st text;
begin
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since'] where id = j;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = j;
  select platform_fields, status into pf, st from cross_post_jobs where id = j;
  insert into _r values ('D6 veille sur une annonce démentie par un relevé : à confirmer, sans question',
    st = 'published' and not (pf ? 'sale_signal') and not (pf ? 'unavailable_since') and pf ? 'unavailable_pending_since'
    and pf #>> '{alerte_a_confirmer_par_releve,motif}' = 'dementie_par_releve', '');
  -- le relevé qui revoit l'annonce en ligne efface le doute
  update annonces_plateforme set vu_le = now() + interval '1 second', statut_plateforme = 'en_ligne', disparu_le = null
   where user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and platform = 'leboncoin' and listing_id = '3287663775';
  perform alerte_lever_revues_plateformes('faf5021a-479a-4bb3-b3ec-c296770739b7', 'leboncoin');
  select platform_fields into pf from cross_post_jobs where id = j;
  insert into _r values ('D7 relevé qui revoit l''annonce : doute effacé', not (pf ? 'alerte_a_confirmer_par_releve') and not (pf ? 'unavailable_pending_since'), '');
  -- un vrai constat (deux relevés complets) repose la question, avec sa preuve
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('sale_signal', 'unavailable', 'unavailable_since', now(),
         'absence_releves', jsonb_build_object('premier', gen_random_uuid(), 'second', gen_random_uuid(), 'listing_id', '3287663775', 'le', now()))
   where id = j;
  select platform_fields into pf from cross_post_jobs where id = j;
  insert into _r values ('D8 constat de deux relevés complets : la question est posée', pf ->> 'sale_signal' = 'unavailable', '');
end $$;

-- D9 : Vinted — la fiche d'un article en cours de republication n'est jamais datée « disparue »
do $$
declare nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18'; rep uuid; d timestamptz;
begin
  update inventaire set disparu_le = null where id = 1791800000002;
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price, listing_url, platform_fields)
  values (nico, 1791800000002, 'vinted', 'republish', 'processing', 'original', 'TEST', 999, 'https://www.vinted.fr/items/10397824964',
          jsonb_build_object('republish_step', 'deleted', 'deleted_at', now(), 'vinted_item_id', '10397824964', 'essai_2210', true)) returning id into rep;
  update inventaire set disparu_le = now() where id = 1791800000002;
  select disparu_le into d from inventaire where id = 1791800000002;
  insert into _r values ('D9 Vinted : disparition jamais datée pendant la republication', d is null, coalesce(d::text, 'null'));
  delete from cross_post_jobs where id = rep;
  update inventaire set disparu_le = now() where id = 1791800000002;
  select disparu_le into d from inventaire where id = 1791800000002;
  insert into _r values ('D10 Vinted : hors republication, la disparition se date comme avant', d is not null, '');
  update inventaire set disparu_le = null where id = 1791800000002;
end $$;

-- ── E. Boutique partagée : le relevé de louis-seller rafraîchit les annonces de louis@ (point 3) ──
do $$
declare
  seller uuid := '447d920c-976a-4d8f-aff4-a2998050358c'; louis uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  l text := '3287650732';   -- « Rondin pour le père Noël », publiée par louis@, en ligne
  avant timestamptz; apres timestamptz; n integer;
begin
  update annonces_plateforme set vu_le = now() - interval '2 days' where user_id = louis and platform = 'leboncoin' and listing_id = l;
  select vu_le into avant from annonces_plateforme where user_id = louis and platform = 'leboncoin' and listing_id = l;
  insert into annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le, disparu_le, updated_at)
  values (seller, 'leboncoin', l, 'https://www.leboncoin.fr/ad/decoration/' || l, 'Rondin pour le père Noël', 'en_ligne', now(), null, now())
  on conflict (user_id, platform, listing_id) do update set vu_le = excluded.vu_le;
  select count(*) into n from annonces_plateforme where user_id = seller and platform = 'leboncoin' and listing_id = l;
  select vu_le into apres from annonces_plateforme where user_id = louis and platform = 'leboncoin' and listing_id = l;
  insert into _r values ('E1 l''annonce de louis@ n''entre pas chez louis-seller', n = 0, n::text);
  insert into _r values ('E2 sa présence est rafraîchie chez louis@ (une seule vérité)', apres > avant, avant::text || ' → ' || apres::text);
  -- une annonce « vendue » lue par l'autre compte ne touche pas la ligne de louis@ (présence seulement)
  insert into annonces_plateforme (user_id, platform, listing_id, statut_plateforme, vu_le, updated_at)
  values (seller, 'leboncoin', l, 'vendue', now() + interval '1 minute', now())
  on conflict (user_id, platform, listing_id) do update set vu_le = excluded.vu_le;
  insert into _r values ('E3 « vendue » lue par l''autre compte : jamais recopiée',
    (select statut_plateforme from annonces_plateforme where user_id = louis and platform = 'leboncoin' and listing_id = l) = 'en_ligne', '');
end $$;

-- ── F. Retrait Beebs clos sans preuve puis revu en ligne : réarmé (point 1e) ──
do $$
declare
  j uuid := '75df2567-f6c4-4ad6-9aea-1029d3f9d849';   -- louis-seller, Beebs 34195237, clos « absente » (aucune confirmation)
  c uuid := '238229cf-0597-4c7b-866e-b73a240be9c2';   -- Johan, Beebs 34211505, clos APRÈS « confirmation envoyée »
  n integer; st text; pf jsonb;
begin
  update annonces_plateforme set statut_plateforme = 'en_ligne', disparu_le = null, vu_le = now()
   where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and platform = 'beebs' and listing_id = '34195237';
  n := retraits_beebs_rearmer_revus('447d920c-976a-4d8f-aff4-a2998050358c');
  select status, platform_fields into st, pf from cross_post_jobs where id = j;
  insert into _r values ('F1 retrait clos sans preuve, revu en ligne : réarmé', st = 'pending' and pf ? 'rearme_revu_en_ligne' and n >= 1, n::text || ' — ' || st);
  n := retraits_beebs_rearmer_revus('447d920c-976a-4d8f-aff4-a2998050358c');
  insert into _r values ('F2 une seule fois (retrait déjà en file)', n = 0, n::text);
  -- un retrait que FillSell a CONFIRMÉ (suppression envoyée) n'est jamais réarmé
  update annonces_plateforme set statut_plateforme = 'en_ligne', disparu_le = null, vu_le = now()
   where user_id = '7b9d8a71-6464-457f-abdc-9baee2a8543f' and platform = 'beebs' and listing_id = '34211505';
  n := retraits_beebs_rearmer_revus('7b9d8a71-6464-457f-abdc-9baee2a8543f');
  select status into st from cross_post_jobs where id = c;
  insert into _r values ('F3 suppression confirmée par FillSell : jamais réarmée', st = 'deleted', st || ' / ' || n::text);
end $$;

-- ── G. Rejeu : ce qui est en prod ce soir ──────────────────────────────────
insert into _r select 'G1 fenêtres retrait→recréation ouvertes maintenant (parc)', true, count(*)::text
  from (select distinct user_id, platform from cross_post_jobs where action = 'republish' and status in ('pending','processing')
          and public.republication_entre_retrait_et_recreation(user_id, platform) is not null) x;
insert into _r select 'G2 republications engagées (copie lue / retrait engagé) maintenant', true, count(*)::text
  from cross_post_jobs where action = 'republish' and status in ('pending','processing','needs_user')
   and (coalesce(platform_fields ->> 'republish_step', '') in ('captured','deleted') or public.republication_retrait_engage(platform_fields));

-- ── G3. Rejeu symétrique : constater_absences_releve AVANT / APRÈS sur les 40 derniers relevés complets ──
CREATE OR REPLACE FUNCTION public._avant_constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 FOR a IN
   SELECT ap.id,ap.listing_id,ap.inventaire_id,ap.vu_le FROM annonces_plateforme ap
   WHERE ap.user_id=r.user_id AND ap.platform=r.platform
     AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
     AND ap.vu_le<precedent.started_at
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs recent WHERE recent.user_id=r.user_id
       AND recent.inventaire_id=ap.inventaire_id AND recent.platform=r.platform
       AND recent.action IN ('publish','republish') AND recent.status='published'
       AND COALESCE(recent.published_at,recent.created_at)>precedent.started_at-interval '4 hours'
       AND listing_designe(ap.listing_id,recent.listing_url,recent.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM rapprochements q WHERE q.annonce_id=ap.id
       AND q.detail->>'absence_confirmee_revision'='20260928'
       AND (q.detail->>'derniere_vue')::timestamptz>=ap.vu_le)
   ORDER BY ap.vu_le DESC,ap.id LIMIT 25 FOR UPDATE OF ap SKIP LOCKED
 LOOP
   EXIT WHEN clock_timestamp()-debut>interval '1 second';
   UPDATE annonces_plateforme SET disparu_le=COALESCE(disparu_le,r.finished_at),updated_at=now() WHERE id=a.id;
   -- Le signal existant ouvre la question de l'app. Ce n'est ni une vente,
   -- ni une annulation du dépôt historique, ni un retrait sur une plateforme.
   UPDATE cross_post_jobs j SET platform_fields=COALESCE(j.platform_fields,'{}'::jsonb)
     || jsonb_build_object('sale_signal','unavailable','unavailable_since',r.finished_at,
          'absence_releves',jsonb_build_object('premier',precedent.id,'second',r.id,'listing_id',a.listing_id,'le',now()))
   WHERE j.inventaire_id=a.inventaire_id AND j.user_id=r.user_id AND j.platform=r.platform
     AND j.status='published' AND j.action IN ('publish','republish')
     AND j.platform_fields->>'sale_signal' IS DISTINCT FROM 'sold'
     AND listing_designe(a.listing_id,j.listing_url,j.platform_listing_id);
   INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
   VALUES(r.user_id,a.id,a.inventaire_id,'aucune','auto',0,
     jsonb_build_object('absence_confirmee_revision','20260928','derniere_vue',a.vu_le,'premier',precedent.id,'second',r.id));
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id);
END;
$function$
;

do $$
declare r record; a jsonb; b jsonb; n integer := 0; diff integer := 0; ex text := '';
begin
  for r in select s.id from vinted_sync_runs s where s.kind = 'annonces' and s.status = 'done' and s.platform in ('leboncoin','ebay','depop')
             and s.finished_at > now() - interval '3 days' and releve_preuve_absence(s.id) order by s.finished_at desc limit 40 loop
    begin a := public._avant_constater_absences_releve(r.id); raise exception 'annule_avant'; exception when others then if sqlerrm <> 'annule_avant' then a := jsonb_build_object('erreur', sqlerrm); end if; end;
    begin b := public.constater_absences_releve(r.id); raise exception 'annule_apres'; exception when others then if sqlerrm <> 'annule_apres' then b := jsonb_build_object('erreur', sqlerrm); end if; end;
    n := n + 1;
    if coalesce(a ->> 'disparues', a ->> 'erreur', '') <> coalesce(b ->> 'disparues', b ->> 'erreur', '') then
      diff := diff + 1; ex := ex || r.id::text || ':' || coalesce(a ->> 'disparues','?') || '→' || coalesce(b ->> 'disparues','?') || ' ';
    end if;
  end loop;
  insert into _r values ('G3 rejeu constater_absences_releve (' || n || ' relevés complets) : mêmes constats', diff = 0, 'écarts ' || diff || ' ' || ex);
end $$;

select essai, ok, left(detail, 160) detail from _r order by essai;
rollback;
