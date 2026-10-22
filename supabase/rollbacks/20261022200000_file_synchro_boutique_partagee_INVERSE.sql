-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261022200000_file_synchro_boutique_partagee : les quatre fonctions réécrites reprennent leur corps lu
-- en prod le 22/10 vers 20:00 (pg_get_functiondef) ; déclencheurs et fonctions neufs retirés. platform_settings.file_pause
-- reste dans les profils (inerte sans get-pending-jobs qui le lit) ; les marqueurs posés (alerte_ecartee,
-- alerte_a_confirmer_par_releve, rearme_revu_en_ligne…) restent : ce sont des traces.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
drop trigger if exists garde_releve_pendant_republication on public.vinted_sync_runs;
drop trigger if exists cross_post_jobs_zz_alerte_tenue on public.cross_post_jobs;
drop trigger if exists inventaire_zz_disparu_garde_republication on public.inventaire;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.alerte_lever_revues_plateformes(p_user uuid DEFAULT NULL::uuid, p_platform text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids    uuid[];
  n_levees integer := 0;
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
  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'levees', 0);
  END IF;
  UPDATE cross_post_jobs SET
    platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price',
                                              'alerte_masquee_pour', 'alerte_masquee_le'])
      || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('at', now(), 'par', 'alerte_lever_revues_plateformes'))
   WHERE id = ANY (v_ids) AND status = 'published';
  GET DIAGNOSTICS n_levees = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'levees', n_levees);
END
$function$
;

CREATE OR REPLACE FUNCTION public.releve_clos_leve_alertes_disparues()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb;
BEGIN
  BEGIN
    v := alerte_lever_revues_plateformes(NEW.user_id, NEW.platform);
    IF COALESCE((v ->> 'levees')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → % alerte(s) « plus en ligne » levée(s), annonces revues en ligne', NEW.id, NEW.platform, v ->> 'levees';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues : run % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END
$function$
;

drop function if exists public.garde_releve_pendant_republication();
drop function if exists public.cross_post_jobs_alerte_tenue();
drop function if exists public.inventaire_disparu_garde_republication();
drop function if exists public.retraits_beebs_rearmer_revus(uuid);
drop function if exists public.file_pause_basculer(boolean);
drop function if exists public.file_etat_poste();
drop function if exists public.file_etat();
drop function if exists public.file_etat_pour(uuid);
drop function if exists public.republication_entre_retrait_et_recreation(uuid, text);
drop function if exists public.republication_engagee(uuid, bigint, text);
drop function if exists public.republication_retrait_engage(jsonb);
drop function if exists public.file_en_pause(uuid);
COMMIT;
