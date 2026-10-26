-- INVERSE de 20261026171000_releve_ebay_api_importe : le corps de PROD lu le 26/10 (md5 56a0ffed1c5414290052a3efae3c9e15).
BEGIN;
CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_run vinted_sync_runs%ROWTYPE; v_imp jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais une fiche neuve
  IF a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.statut_plateforme IS DISTINCT FROM 'en_ligne' THEN RETURN NULL; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'ebay' AND a.run_id IS NOT NULL AND releve_ebay_run_bloque(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'beebs' AND releve_dette_beebs(p_user) THEN RETURN NULL; END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN RETURN NULL; END IF;
  IF NOT p_geste THEN
    SELECT * INTO v_run FROM vinted_sync_runs WHERE id = a.run_id;
    IF NOT releve_est_geste(v_run.declencheur) THEN RETURN NULL; END IF;
  END IF;
  v_imp := rapprocher_importer(p_user, a.id, 'rapprochement');
  IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN (v_imp ->> 'inventaire_id')::bigint; END IF;
  RETURN NULL;
END;
$function$
;
COMMIT;
