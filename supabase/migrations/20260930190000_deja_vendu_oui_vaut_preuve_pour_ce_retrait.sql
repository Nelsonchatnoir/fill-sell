-- ═══════════════════════════════════════════════════════════════════════════
-- « DÉJÀ VENDU ? » → « OUI » VAUT PREUVE DE VENTE POUR CE RETRAIT-LÀ (D2, GO Nico 30/09)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision de Nico : le « oui » de la personne vaut preuve de vente pour le
-- SEUL retrait de l'annonce que l'app lui a montrée avant le « oui »
-- (« le geste de la personne », preuve reconnue le 27/09). L'app envoie
-- l'annonce montrée (p_annonce_montree) ; sans elle (anciennes versions de
-- l'app), rien ne change : sans vente enregistrée, pas de retrait, le « oui »
-- est refusé (retrait_impossible) et rien n'est regroupé.
--
--   · armer_retrait_job_pour(job, chemin, délai, preuve_geste) : corps repris
--     de la PROD du 30/09 (md5 51ef3762…), seule la garde « vente enregistrée »
--     accepte en plus le geste (fiche vendue, jamais sur la plateforme de la
--     vente) ; toutes les autres gardes restent (preuve du dépôt, deux
--     exemplaires, sale_signal, Vinted vendu, retrait déjà en cours) ;
--   · armer_retrait_job(job, chemin, délai) devient une enveloppe (geste = non) :
--     aucun autre appelant ne change ;
--   · inventaire_doublon_decider prend un 3e paramètre p_annonce_montree
--     (défaut NULL : l'app actuelle continue de fonctionner). Une annonce
--     vivante qui ne peut pas être retirée → tout est annulé et la réponse
--     donne ses plateformes (texte de l'app : « Retirez-la vous-même sur… »).
--   · Si le retrait échoue ensuite : le regroupement est défait
--     (deja_vendu_retrait_echoue_defait, posé en D1).
--
-- ⚠️ L'app qui envoie p_annonce_montree ne part qu'APRÈS cette migration.
-- Appliquée en prod le 30/09 (md5 prosrc vérifiés : _pour 4aadbcdb…, enveloppe
-- 0e34fa49…, decider bcfb1977…).
-- INVERSE : supabase/rollbacks/20260930190000_deja_vendu_oui_vaut_preuve_pour_ce_retrait.sql
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.armer_retrait_job_pour(p_job_id uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        public.cross_post_jobs%rowtype;
  v_item   text;
  v_url    text;
  v_ident  text;
  v_sans_lien boolean;
  v_pf     jsonb;
  v_del    uuid;
  v_compte text;
begin
  select * into j from public.cross_post_jobs where id = p_job_id for update;
  if not found or j.inventaire_id is null
     or coalesce(j.action, 'publish') not in ('publish', 'republish')
     or j.status is distinct from 'published' then
    return null;
  end if;

  -- Point A, incident Angel : le dépôt prouve l'annonce, pas une vente.
  -- Lecture indexée ventes_user_inventaire_idx ; aucune réécriture de données.
  if not exists (
    select 1 from public.ventes v
    join public.inventaire i on i.id = v.inventaire_id and i.user_id = v.user_id
    where v.user_id = j.user_id and v.inventaire_id = j.inventaire_id
      and i.statut = 'vendu'
      and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
      and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
      and lower(coalesce(nullif(i.plateforme, ''), nullif(v.plateforme_code, ''), v.plateforme)) <> lower(j.platform)
    limit 1
  ) then
    -- (2026-09-30, règle Louis partie 2 — décision Nico) Le geste de la
    -- personne vaut preuve de vente pour CE retrait-là seulement : « oui » à
    -- « Déjà vendu ? » sur l'annonce que l'app lui a montrée (preuve déjà
    -- reconnue le 27/09). La fiche doit être vendue, et jamais sur la
    -- plateforme de l'annonce retirée. Toutes les autres gardes restent.
    if not coalesce(p_preuve_geste, false) or not exists (
      select 1 from public.inventaire i
       where i.id = j.inventaire_id and i.user_id = j.user_id and i.statut = 'vendu'
         and lower(coalesce(nullif(i.plateforme, ''), '')) <> lower(j.platform)
    ) then
      return null;
    end if;
  end if;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : l'annonce doit être liée à
  -- SA fiche par une preuve, et la fiche ne doit pas porter deux annonces
  -- vivantes sur cette plateforme (deux annonces = deux exemplaires).
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 then
    return null;
  end if;
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if j.platform = 'vinted' then
    v_item := coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(v_url from '/items/(\d+)'));
    if v_item is not null and public.vinted_annonce_vendue(j.user_id, v_item) then
      return null;
    end if;
  end if;
  v_sans_lien := v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null;
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and (d.status in ('pending', 'processing', 'needs_user')
            or (d.status = 'deleted' and d.created_at >= coalesce(j.published_at, j.created_at)))
       and (v_sans_lien
            or public.listing_designe(coalesce(j.platform_listing_id, v_item, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return null;
  end if;
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'depot', j.id,
            'pose_par', 'armer_retrait_job (serveur)'));
  if coalesce(p_preuve_geste, false) then
    v_pf := v_pf || jsonb_build_object('preuve', 'geste_deja_vendu');   -- MODIF 2026-09-30
  end if;
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  if j.platform = 'beebs' and v_sans_lien then
    v_pf := v_pf || jsonb_build_object('retrait_attend_lien', jsonb_build_object(
              'depuis', now(), 'motif', 'depot_beebs_en_verification_a_la_vente'));
  end if;
  if j.platform = 'vinted' then
    select nullif(btrim(i.vinted_account_id::text), '') into v_compte
      from public.inventaire i where i.id = j.inventaire_id;
    if v_compte is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', v_compte);
    end if;
  end if;
  if p_delai is not null and p_delai > interval '0' then
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  end if;
  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id into v_del;
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;
  return v_del;
end;
$function$;


CREATE OR REPLACE FUNCTION public.armer_retrait_job(p_job_id uuid, p_chemin text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- (2026-09-30) corps dans armer_retrait_job_pour ; ici, jamais de preuve par le geste.
  return public.armer_retrait_job_pour(p_job_id, p_chemin, p_delai, false);
end;
$function$;

REVOKE ALL ON FUNCTION public.armer_retrait_job_pour(uuid, text, interval, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.armer_retrait_job_pour(uuid, text, interval, boolean) TO service_role;

-- La signature change (3e paramètre) : l'ancienne est retirée dans la même transaction.
DROP FUNCTION IF EXISTS public.inventaire_doublon_decider(uuid, text);

CREATE FUNCTION public.inventaire_doublon_decider(p_id uuid, p_decision text, p_annonce_montree uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  d inventaire_doublons%ROWTYPE;
  r jsonb;
  v_job uuid; v_del uuid; v_retraits jsonb; v_sans int; v_geste boolean; v_pf_sans jsonb; v_detail text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO d FROM inventaire_doublons WHERE id = p_id AND user_id = v_user FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF d.statut <> 'proposee' THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); END IF;
  IF p_decision = 'non' THEN
    UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
    RETURN jsonb_build_object('ok', true, 'decision', 'non');
  ELSIF p_decision = 'oui' THEN
    IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND user_id = v_user AND fusionne_dans IS NULL)
       OR NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.absorbe AND user_id = v_user AND fusionne_dans IS NULL) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'fiche_introuvable');
    END IF;
    -- (2026-09-30, règle Louis partie 2) La fiche gardée est VENDUE : on
    -- regroupe, puis SEULS les dépôts venus de la fiche en ligne reçoivent un
    -- retrait. Si une annonce vivante venue de la fiche en ligne reste sans
    -- retrait, tout est annulé (jamais une annonce vivante cachée sous une
    -- fiche vendue).
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu') THEN
      BEGIN
        r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
        IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN
          RETURN r || jsonb_build_object('decision', 'oui');
        END IF;
        FOR v_job IN
          SELECT j.id FROM cross_post_jobs j
           WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
             AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
        LOOP
          -- (2026-09-30, décision Nico) le « oui » vaut preuve de vente pour le
          -- seul retrait de l'annonce que l'app a montrée (p_annonce_montree),
          -- et seulement si elle vient bien de la fiche en ligne.
          v_geste := p_annonce_montree IS NOT NULL AND EXISTS (
            SELECT 1 FROM annonces_plateforme ap
             WHERE ap.id = p_annonce_montree AND ap.user_id = v_user AND ap.job_id = v_job AND ap.disparu_le IS NULL
               AND ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x));
          v_del := armer_retrait_job_pour(v_job, 'doublon_vendu_confirme', interval '0', v_geste);
        END LOOP;
        -- Les retraits en cours des dépôts venus de la fiche en ligne (armés
        -- ici, ou déjà par un autre chemin : armer_retrait_job ne double jamais).
        SELECT COALESCE(jsonb_agg(DISTINCT dj.id::text), '[]'::jsonb) INTO v_retraits
          FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
         WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
           AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user');
        -- Une annonce vivante venue de la fiche en ligne sans retrait en cours ?
        SELECT count(*) INTO v_sans
          FROM annonces_plateforme ap
         WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
           AND ap.disparu_le IS NULL
           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                            WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
        IF v_sans > 0 THEN
          -- les plateformes où la personne devra retirer elle-même
          SELECT COALESCE(jsonb_agg(DISTINCT ap.platform), '[]'::jsonb) INTO v_pf_sans
            FROM annonces_plateforme ap
           WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
             AND ap.disparu_le IS NULL
             AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                              WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
          RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible', DETAIL = v_pf_sans::text;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                       fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid,
                                       preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retraits_oui', v_retraits)
         WHERE id = d.id;
        RETURN r || jsonb_build_object('decision', 'oui', 'retraits', jsonb_array_length(v_retraits));
      EXCEPTION WHEN SQLSTATE 'P0R01' THEN
        -- regroupement et retraits annulés ; la question reste ouverte
        GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;   -- (texte jsonb des plateformes)
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                  'plateformes', COALESCE(NULLIF(v_detail, '')::jsonb, '[]'::jsonb));
      END;
    END IF;
    r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
    IF COALESCE((r ->> 'ok')::boolean, false) THEN
      UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                     fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid
       WHERE id = d.id;
    END IF;
    RETURN r || jsonb_build_object('decision', 'oui');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$;

REVOKE ALL ON FUNCTION public.inventaire_doublon_decider(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventaire_doublon_decider(uuid, text, uuid) TO authenticated, service_role;

-- PostgREST relit le schéma tout de suite (nouvelle signature).
NOTIFY pgrst, 'reload schema';
