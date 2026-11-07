CREATE OR REPLACE FUNCTION public.cloud_ip_depense_ouvrir(p_nature text, p_quantite integer, p_prix_usd numeric, p_ip bigint DEFAULT NULL::bigint, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_garde jsonb;
  v_commande text := NULLIF(btrim(COALESCE(p_details ->> 'commande', '')), '');
  v_id bigint;
BEGIN
  IF p_nature NOT IN ('achat', 'prolongation') THEN RETURN jsonb_build_object('ok', false, 'raison', 'nature_inconnue'); END IF;
  IF (p_nature = 'achat' AND public.cloud_param('ip_achats_auto', 0) <> 1)
     OR (p_nature = 'prolongation' AND public.cloud_param('ip_renouvellement_auto', 0) <> 1) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'interrupteur_coupe');
  END IF;
  IF p_prix_usd IS NULL OR p_prix_usd <= 0 OR p_quantite IS NULL OR p_quantite < 1 OR p_quantite > 50 THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'prix_ou_quantite_illisible');
  END IF;
  -- Sous verrou : deux entretiens (deux serveurs) ne passent jamais ensemble ; le second voit la ligne du premier.
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip_depense', 0));
  IF p_nature = 'achat' THEN
    v_garde := public.cloud_ip_garde_nombre(p_quantite);
    IF (v_garde ->> 'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'raison', 'garde_nombre', 'garde', v_garde);
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.cloud_ip_commandes c
                 WHERE c.nature = 'prolongation' AND c.statut NOT IN ('echec', 'remboursee')
                   AND c.demandee_le > now() - make_interval(days => public.cloud_param('ip_prolongation_espacement_jours', 15))
                   AND ((v_commande IS NOT NULL AND c.details ->> 'commande' = v_commande)
                        OR (p_ip IS NOT NULL AND c.ip_id = p_ip))) THEN
    RETURN jsonb_build_object('ok', false, 'raison', 'prolongation_recente', 'commande', v_commande, 'ip_id', p_ip);
  END IF;
  INSERT INTO public.cloud_ip_commandes (fournisseur, nature, quantite, statut, prix_usd, go_par, ip_id, details)
  VALUES ('iproyal', p_nature, p_quantite, 'demandee', p_prix_usd,
          CASE WHEN p_nature = 'achat' THEN 'automatique (cloud_ip_achats_auto)' ELSE 'automatique (cloud_ip_renouvellement_auto)' END,
          p_ip, COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;
  IF p_ip IS NOT NULL THEN
    PERFORM public.cloud_journal(p_ip, 'depense', NULL, jsonb_build_object('commande_id', v_id, 'nature', p_nature, 'prix_usd', p_prix_usd));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'depense_mois_usd', public.cloud_ip_depenses_mois(), 'garde', v_garde);
END;
$function$
