-- INVERSE de 20261023100000_photos_origine_toutes : les trois fonctions reprennent leur corps lu en prod le 23/10
-- (pg_get_functiondef, vers 11:40, avant application) ; les deux fonctions ajoutées sont retirées.
-- ⚠ Les fiches complétées entre-temps gardent leurs photos (sauvegarde : _backup_2310_photos_origine).
BEGIN;
CREATE OR REPLACE FUNCTION public.fiche_completer_photos_capture(p_inventaire bigint, p_vignette text, p_capture jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_photos jsonb;
  n integer;
BEGIN

  -- (20/10, sécurité) Appelée sous une session (authenticated, ou tout rôle porté
  -- par un jeton autre que service_role) — y compris par le déclencheur
  -- annonce_capture_complete_fiche lors d'une écriture de l'extension : la fiche
  -- doit appartenir à auth.uid(). service_role, cron et SQL d'administration :
  -- inchangés. Le déclencheur attrape l'exception (WARNING) : l'écriture de
  -- l'annonce n'est jamais refusée pour autant.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = p_inventaire AND i.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'fiche non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_inventaire IS NULL OR jsonb_typeof(p_capture -> 'photos') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  SELECT COALESCE(jsonb_agg(p ORDER BY o), '[]'::jsonb) INTO v_photos
    FROM jsonb_array_elements(p_capture -> 'photos') WITH ORDINALITY AS t(p, o)
   WHERE jsonb_typeof(p) = 'string' AND (p #>> '{}') ~ '^https?://';
  IF jsonb_array_length(v_photos) < 2 THEN RETURN false; END IF;
  UPDATE inventaire i SET
    photos = v_photos,
    photos_a_rapatrier = true
   WHERE i.id = p_inventaire
     AND i.fusionne_dans IS NULL
     AND jsonb_array_length(COALESCE(i.photos, '[]'::jsonb)) <= 1
     AND (i.photos -> 0 IS NULL
          OR (i.photos ->> 0) = p_vignette
          OR (i.photos ->> 0) LIKE '%/rapatrie-fiche/' || p_inventaire::text || '/%');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fiches_contenu_vendeur(p_user uuid, p_ids bigint[])
 RETURNS TABLE(id bigint, origine text, titre text, description text, photos jsonb, attributs jsonb, vinted_item_id text, description_lue_le timestamp with time zone, etat_lu_le timestamp with time zone, photos_lues_le timestamp with time zone, annonces jsonb, origine_lue_le timestamp with time zone, disparu_le timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select i.id, i.origine, i.titre, i.description, i.photos, i.attributs, i.vinted_item_id,
         greatest(public._ts_ou_null(i.attributs #>> '{description_source,at}'),
                  (select max(jl.created_at) from public.inventaire_journal jl
                    where jl.inventaire_id = i.id and jl.champ = 'description')),
         greatest(public._ts_ou_null(i.attributs #>> '{etat,at}'),
                  (select max(jl.created_at) from public.inventaire_journal jl
                    where jl.inventaire_id = i.id and jl.champ = 'attributs.etat')),
         (select max(a.capture_le) from public.annonces_plateforme a where a.inventaire_id = i.id and a.user_id = i.user_id),
         (select coalesce(jsonb_agg(jsonb_build_object('platform', a.platform, 'capture_le', a.capture_le,
                                                       'disparu_le', a.disparu_le, 'listing_id', a.listing_id)), '[]'::jsonb)
            from public.annonces_plateforme a where a.inventaire_id = i.id and a.user_id = i.user_id),
         -- La lecture de l'origine déjà FAITE (détail Vinted lu par l'extension ou l'app) : ce qui manque encore
         -- n'existe pas chez le vendeur — on n'attend plus (jamais une attente sans fin).
         (select max(d.faite_le) from public.lectures_origine_demandees d
           where d.user_id = i.user_id and d.inventaire_id = i.id),
         i.disparu_le
    from public.inventaire i
   where i.user_id = p_user and i.id = any (coalesce(p_ids, array[]::bigint[]))
$function$;

CREATE OR REPLACE FUNCTION public.demander_lecture_origine(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_origine text; v_pf text; v_id uuid;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select origine into v_origine from public.inventaire where id = p_fiche and user_id = v_user;
  if not found then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  v_pf := case when v_origine = 'vinted_sync' then 'vinted'
               when v_origine ~ '^releve_(leboncoin|beebs|depop)$' then substring(v_origine from 8) end;
  if v_pf is null then return jsonb_build_object('ok', true, 'reason', 'sans_origine_a_lire'); end if;
  insert into public.lectures_origine_demandees (user_id, inventaire_id, plateforme)
  values (v_user, p_fiche, v_pf)
  on conflict (user_id, inventaire_id) do update
    set demandee_le = now(), faite_le = null, plateforme = excluded.plateforme
    where public.lectures_origine_demandees.faite_le is not null
       or public.lectures_origine_demandees.demandee_le < now() - interval '15 minutes';
  if v_pf = 'vinted' then
    return jsonb_build_object('ok', true, 'reason', 'lecture_par_l_extension', 'plateforme', v_pf);
  end if;
  if exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
               and s.platform = v_pf and s.status in ('queued', 'running')) then
    return jsonb_build_object('ok', true, 'reason', 'releve_deja_en_file', 'plateforme', v_pf);
  end if;
  if exists (select 1 from public.vinted_sync_runs s where s.user_id = v_user and s.kind = 'annonces'
               and s.platform = v_pf and s.declencheur = 'serveur:lecture_origine'
               and coalesce(s.queued_at, s.started_at) > now() - interval '15 minutes') then
    return jsonb_build_object('ok', true, 'reason', 'releve_recent', 'plateforme', v_pf);
  end if;
  begin
    insert into public.vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
    values (v_user, 'annonces', v_pf, 'queued', 'serveur:lecture_origine', now())
    returning id into v_id;
  exception when others then
    return jsonb_build_object('ok', true, 'reason', 'releve_non_pose', 'detail', left(sqlerrm, 200), 'plateforme', v_pf);
  end;
  return jsonb_build_object('ok', true, 'reason', case when v_id is null then 'releve_non_pose' else 'releve_demande' end,
                            'plateforme', v_pf, 'run_id', v_id);
end $function$;

DROP FUNCTION IF EXISTS public.photo_est_vignette_de_fiche(bigint, text, text, text, text);
DROP FUNCTION IF EXISTS public.ebay_cle_image(text);
COMMIT;
