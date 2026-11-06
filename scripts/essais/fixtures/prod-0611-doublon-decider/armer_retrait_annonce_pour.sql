CREATE OR REPLACE FUNCTION public.armer_retrait_annonce_pour(p_annonce uuid, p_chemin text, p_delai interval, p_preuve_geste boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a      public.annonces_plateforme%ROWTYPE;
  i      public.inventaire%ROWTYPE;
  v_url  text;
  v_pf   jsonb;
  v_del  uuid;
BEGIN
  -- ⛔ (05/11 soir, Nico — VENDU QUELQUE PART = RETIRÉ PARTOUT) Le retrait d'UNE annonce relevée d'une fiche VENDUE, par
  -- SON numéro et SON lien (la ligne du relevé) — jamais le numéro d'un autre dépôt, jamais un titre. Seul appelant : le
  -- « Oui, la retirer » de la personne sur CETTE annonce (inventaire_doublon_decider, p_preuve_geste) ; sans ce geste,
  -- rien. Gardes : fiche vendue, non fusionnée, même compte ; jamais la plateforme de la vente ; annonce vivante (ni
  -- disparue, ni retirée, ni écartée), numéro d'au moins 4 signes ; jamais Opla (quittée) ; jamais une annonce Leboncoin
  -- sous transaction (elle est elle-même vendue) ; un seul retrait ouvert par annonce. Les déclencheurs de création des
  -- retraits (annonce déclarée retirée par la personne, annonce Vinted vendue, doublon, annonce remplacée) restent juges.
  IF NOT COALESCE(p_preuve_geste, false) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO a FROM public.annonces_plateforme WHERE id = p_annonce FOR UPDATE;
  IF NOT FOUND OR a.inventaire_id IS NULL OR a.disparu_le IS NOT NULL OR a.retiree_le IS NOT NULL OR a.ignoree_le IS NOT NULL
     OR length(btrim(COALESCE(a.listing_id, ''))) < 4 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO i FROM public.inventaire WHERE id = a.inventaire_id AND user_id = a.user_id;
  IF NOT FOUND OR i.fusionne_dans IS NOT NULL OR i.statut IS DISTINCT FROM 'vendu'
     OR lower(COALESCE(NULLIF(i.plateforme, ''), '')) = lower(a.platform) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ventes v
              WHERE v.user_id = a.user_id AND v.inventaire_id = a.inventaire_id
                AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')
                AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''), '')) = lower(a.platform)) THEN
    RETURN NULL;
  END IF;
  IF a.platform = 'opla' AND public.opla_sortie_passee() THEN
    RETURN NULL;
  END IF;
  IF COALESCE(a.transaction_plateforme, '') IN ('pending', 'sold') THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d
              WHERE d.user_id = a.user_id AND d.platform = a.platform AND d.action = 'delete'
                AND d.status IN ('pending', 'processing', 'needs_user')
                AND public.listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN
    RETURN NULL;
  END IF;
  v_url := NULLIF(btrim(COALESCE(a.url, '')), '');
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'annonce', a.id, 'depot', a.job_id,
            'pose_par', 'armer_retrait_annonce_pour (serveur)'),
          'preuve', 'geste_deja_vendu');
  IF v_url IS NULL THEN
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  END IF;
  IF p_delai IS NOT NULL AND p_delai > interval '0' THEN
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  END IF;
  INSERT INTO public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  VALUES
    (a.user_id, a.inventaire_id, a.platform, 'delete', 'pending', 'original',
     COALESCE(NULLIF(btrim(COALESCE(a.titre, '')), ''), i.titre), v_url, btrim(a.listing_id), v_pf)
  RETURNING id INTO v_del;
  IF v_del IS NOT NULL THEN
    INSERT INTO public.usage_logs (user_id, feature, metadata)
    VALUES (a.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin, 'plateformes', jsonb_build_array(a.platform), 'n_annonces', 1, 'n_articles', 1,
      'article_id', a.inventaire_id::text, 'annonce', a.id, 'listing_id', a.listing_id));
  END IF;
  RETURN v_del;
END;
$function$

