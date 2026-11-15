-- INVERSE de 20261115190000 : public.prix_de_republication telle que posée par 20261115180000 (15/11 15:38).
SET lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.prix_de_republication(p_inventaire_id bigint, p_platform text, p_src_job_id uuid,
  p_listing_id text, p_vinted_item_id text, p_prix_republication numeric DEFAULT NULL, p_baisse_pct numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(btrim(p_platform), ''), 'vinted'));
  v_user uuid;
  v_fiche_prix numeric;
  v_change_le timestamptz;
  v_change_par text;
  v_pub_le timestamptz;
  v_annonce numeric;
  v_src_prix numeric;
  v_fiche numeric;
  v_base numeric;
  v_prix numeric;
  v_raison text;
BEGIN
  SELECT i.user_id, i.prix_vente, i.prix_vente_change_le, i.prix_vente_change_par
    INTO v_user, v_fiche_prix, v_change_le, v_change_par
    FROM inventaire i WHERE i.id = p_inventaire_id;
  BEGIN
    IF v_pf = 'vinted' THEN
      -- L'annonce Vinted en ligne : la dernière mise en ligne de la fiche sur Vinted (dépôt ou republication).
      SELECT max(COALESCE(CASE WHEN (j.platform_fields ->> 'recreated_at') ~ '^\d{4}-\d{2}-\d{2}'
                               THEN (j.platform_fields ->> 'recreated_at')::timestamptz END, j.published_at))
        INTO v_pub_le
        FROM cross_post_jobs j
       WHERE j.inventaire_id = p_inventaire_id AND j.platform = 'vinted'
         AND j.action IN ('publish', 'republish') AND j.status IN ('published', 'sold');
      SELECT s.price INTO v_annonce FROM vinted_listing_snapshots s
       WHERE s.user_id = v_user AND s.vinted_item_id = p_vinted_item_id AND s.price > 0
       ORDER BY s.captured_at DESC NULLS LAST LIMIT 1;
    ELSE
      -- L'annonce copiée (la tâche source) : sa mise en ligne, son prix ; le prix relevé sur CE numéro (14 j) d'abord.
      SELECT COALESCE(CASE WHEN (j.platform_fields ->> 'recreated_at') ~ '^\d{4}-\d{2}-\d{2}'
                           THEN (j.platform_fields ->> 'recreated_at')::timestamptz END, j.published_at, j.created_at),
             j.price
        INTO v_pub_le, v_src_prix
        FROM cross_post_jobs j WHERE j.id = p_src_job_id;
      SELECT a.prix INTO v_annonce FROM annonces_plateforme a
       WHERE a.user_id = v_user AND a.platform = v_pf AND a.listing_id = p_listing_id
         AND a.vu_le >= now() - interval '14 days' AND a.prix > 0
       ORDER BY a.vu_le DESC LIMIT 1;
      v_annonce := COALESCE(v_annonce, NULLIF(v_src_prix, 0));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pub_le := NULL; v_annonce := NULL;
  END;
  -- Le prix de la fiche ne compte que s'il a été changé PAR LA PERSONNE (l'app) APRÈS la mise en ligne de l'annonce.
  IF v_change_par = 'app' AND v_fiche_prix >= 1 AND (v_pub_le IS NULL OR v_change_le > v_pub_le) THEN
    v_fiche := v_fiche_prix;
  END IF;
  v_base := COALESCE(v_fiche, v_annonce);
  IF p_prix_republication IS NOT NULL THEN
    v_prix := p_prix_republication; v_raison := 'prix_choisi';
  ELSIF p_baisse_pct IS NOT NULL AND v_base IS NOT NULL THEN
    v_prix := greatest(2, floor(v_base * (100 - p_baisse_pct) / 100)); v_raison := 'baisse';
  ELSIF p_baisse_pct IS NOT NULL THEN
    v_prix := NULL; v_raison := 'baisse_sans_prix_connu';
  ELSIF v_fiche IS NOT NULL THEN
    v_prix := v_fiche; v_raison := 'prix_de_la_fiche';
  ELSE
    v_prix := NULL; v_raison := 'prix_de_l_annonce';
  END IF;
  RETURN jsonb_build_object('prix', v_prix, 'raison', v_raison, 'base', v_base,
    'base_de', CASE WHEN v_fiche IS NOT NULL THEN 'fiche' WHEN v_annonce IS NOT NULL THEN 'annonce' END,
    'fiche_prix', v_fiche_prix, 'fiche_change_le', v_change_le, 'fiche_change_par', v_change_par,
    'annonce_publiee_le', v_pub_le, 'annonce_prix', v_annonce, 'baisse_pct', p_baisse_pct, 'le', now());
END;
$function$;
REVOKE ALL ON FUNCTION public.prix_de_republication(bigint, text, uuid, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prix_de_republication(bigint, text, uuid, text, text, numeric, numeric) TO service_role;
