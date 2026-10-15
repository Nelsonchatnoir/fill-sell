-- INVERSE de 20261015191000 : la définition d'avant (celle de 20261015190000).
BEGIN;
CREATE OR REPLACE FUNCTION public.annonce_partagee_attribuer(p_user uuid, p_platform text, p_listing_id text, p_inventaire_garde bigint, p_par text, p_raison text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lid  text := NULLIF(btrim(p_listing_id), '');
  v_def  jsonb;
  v_rep  jsonb := '[]'::jsonb;
  r      record;
BEGIN
  IF p_user IS NULL OR v_lid IS NULL OR p_inventaire_garde IS NULL OR p_par NOT IN ('identifiant', 'photo', 'ia') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cross_post_jobs o
     WHERE o.user_id = p_user AND o.platform = p_platform AND o.inventaire_id = p_inventaire_garde
       AND o.status IN ('pending', 'processing', 'published', 'needs_user', 'cancelled', 'sold')
       AND (listing_designe(v_lid, o.listing_url, o.platform_listing_id) OR annonce_id_job(o.platform, o.listing_url) = v_lid)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fiche_non_candidate');
  END IF;

  -- Les jobs retenus AVANT la décision (ceux qui seront recâblés n'y
  -- désigneront plus l'annonce ensuite).
  CREATE TEMP TABLE IF NOT EXISTS _ap_retenus (id uuid) ON COMMIT DROP;
  DELETE FROM _ap_retenus;
  INSERT INTO _ap_retenus
  SELECT o.id FROM cross_post_jobs o
   WHERE o.user_id = p_user AND o.platform = p_platform
     AND ((o.status = 'needs_user' AND o.platform_fields ->> 'needs_user_source' = 'annonce_partagee')
          OR (o.status = 'pending' AND o.platform_fields #>> '{annonce_partagee,cascade,etat}' IN ('a_trancher', 'incertain')))
     AND (o.platform_fields #>> '{annonce_partagee,annonce}' = v_lid
          OR listing_designe(v_lid, o.listing_url, o.platform_listing_id) OR annonce_id_job(o.platform, o.listing_url) = v_lid);

  v_def := defaire_croisement_annonce(p_user, p_platform, v_lid, p_inventaire_garde);
  -- defaire_croisement_annonce écrit « choix fait dans l'app » : ici c'est la cascade.
  UPDATE cross_post_jobs SET
    error = 'L''annonce visée est celle d''un autre article (' ||
            CASE p_par WHEN 'identifiant' THEN 'identifiant de l''annonce' WHEN 'photo' THEN 'photos identiques' ELSE 'vérifié par FillSell' END ||
            ') : rien n''a été retiré, ton annonce est intacte.'
   WHERE user_id = p_user AND platform = p_platform AND status = 'cancelled'
     AND platform_fields #>> '{lien_delie,annonce}' = v_lid
     AND (platform_fields #>> '{lien_delie,le}')::timestamptz >= now() - interval '1 minute';
  UPDATE annonces_plateforme SET
    source_rapprochement = CASE WHEN p_par = 'identifiant' THEN 'job' ELSE 'automatique' END,
    proposition = NULL, updated_at = now()
   WHERE user_id = p_user AND platform = p_platform AND listing_id = v_lid AND inventaire_id = p_inventaire_garde;

  FOR r IN SELECT id FROM _ap_retenus LOOP
    v_rep := v_rep || jsonb_build_object('job', r.id, 'resultat', annonce_partagee_reprendre(r.id, p_par, p_raison));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'annonce', v_lid, 'fiche', p_inventaire_garde, 'par', p_par, 'defaire', v_def, 'reprises', v_rep);
END
$function$
;
COMMIT;
