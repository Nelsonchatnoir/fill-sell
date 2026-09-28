SET statement_timeout='4s';
SET lock_timeout='1s';
CREATE OR REPLACE FUNCTION public.enregistrer_ventes_prouvees(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '4s'
AS $function$
DECLARE j record; r jsonb; n integer:=0;
BEGIN
 IF p_user IS NULL OR (auth.uid() IS NOT NULL AND auth.uid()<>p_user) THEN
  RAISE EXCEPTION 'Compte non autorisé' USING ERRCODE='42501';
 END IF;
 -- Un ancien relevé peut encore écrire son inventaire : attendre sa clôture.
 IF EXISTS(SELECT 1 FROM vinted_sync_runs WHERE user_id=p_user AND status='running' LIMIT 1) THEN
  RETURN jsonb_build_object('enregistrees',0,'releve_en_cours',true);
 END IF;
 FOR j IN
  SELECT c.id,coalesce(
    CASE WHEN c.platform_fields->>'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
      THEN (c.platform_fields->>'detected_price')::numeric END,c.price) prix
  FROM cross_post_jobs c JOIN inventaire i ON i.id=c.inventaire_id AND i.user_id=c.user_id
  WHERE c.user_id=p_user AND c.status='published' AND c.action IN('publish','republish')
    AND c.platform_fields->>'sale_signal'='sold'
    AND i.statut='stock' AND coalesce(i.quantite,1)>0 AND i.fusionne_dans IS NULL
    AND nullif(c.platform_listing_id,'') IS NOT NULL
    AND coalesce(CASE WHEN c.platform_fields->>'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
      THEN (c.platform_fields->>'detected_price')::numeric END,c.price)>0
    AND NOT EXISTS(SELECT 1 FROM ventes_operations o
      WHERE o.user_id=p_user AND o.cle='annonce:'||c.platform||':'||c.platform_listing_id LIMIT 1)
    AND NOT EXISTS(SELECT 1 FROM ventes_operations o
      WHERE o.user_id=p_user AND o.cle=c.platform_fields->>'vente_operation_cle' LIMIT 1)
    AND (
      (c.platform='vinted' AND (
        SELECT s.status='sold' AND s.captured_at>=coalesce(c.published_at,c.created_at)
        FROM vinted_listing_snapshots s
        WHERE s.user_id=p_user AND s.vinted_item_id=c.platform_listing_id
        ORDER BY s.captured_at DESC LIMIT 1
      ))
      OR (c.platform_fields#>>'{sale_evidence,listing_id}'=c.platform_listing_id
        AND c.platform_fields#>>'{sale_evidence,platform}'=c.platform
        AND c.platform_fields#>>'{sale_evidence,state}'='sold'
        AND c.platform_fields#>>'{sale_evidence,exact}'='true')
    )
    AND retrait_job_prouve(c.id) AND fiche_annonces_vivantes(c.inventaire_id,c.platform)<2
  ORDER BY c.last_checked_at NULLS FIRST,c.id LIMIT 5
 LOOP
  BEGIN
   r:=enregistrer_vente_atomique(p_user,null,p_job:=j.id,p_prix:=j.prix);
   IF r->>'ok'='true' THEN n:=n+1; END IF;
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Vente automatique annulée, job % : %',j.id,SQLERRM;
  END;
 END LOOP;
 RETURN jsonb_build_object('enregistrees',n);
END;
$function$
;
