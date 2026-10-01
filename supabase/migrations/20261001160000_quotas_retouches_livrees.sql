-- ═══════════════════════════════════════════════════════════════════════════
-- RETOUCHES : SEULES LES RETOUCHES LIVRÉES SONT DÉCOMPTÉES (01/10/2026, GO Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- generate-listing pose UNE ligne usage_logs 'photo_retouche' par rédaction
-- retouchée, livrée OU NON (metadata.delivered). Le compteur les prenait toutes :
-- du 28/09 au 01/10 le crédit OpenAI était épuisé (0 retouche livrée sur 25),
-- et ces échecs ont vidé des quotas — inandup33 affichait 5/5 avec 5 échecs.
-- Règle : une ligne delivered = false ne compte pas ; une ligne sans la clé
-- (antérieure au 08/08) compte comme avant. Même filtre dans generate-listing
-- (garde avant retouche), déployé avec cette migration.
-- Partie de la définition EN PROD (pg_get_functiondef, md5 af29fbee…), une
-- seule ligne ajoutée. Aucune valeur de quota, aucune ligne usage_logs touchée.
-- Retour : supabase/rollbacks/20261001160000_quotas_retouches_livrees.sql
SET lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.quotas_etat()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_tier  text;
  v_cycle timestamptz;
  v_qa integer; v_qs integer; v_qr integer; v_qrep integer;
  v_avie integer; v_depuis integer;
  v_ca integer; v_cs integer; v_cr integer; v_crep integer;
  v_repub jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = v_user;
  v_tier  := COALESCE(v_tier, 'free');
  v_cycle := debut_cycle_quotas(v_user);

  SELECT value INTO v_qa   FROM coin_config WHERE key = 'quota_annonces_'  || v_tier;
  SELECT value INTO v_qs   FROM coin_config WHERE key = 'quota_scan_'      || v_tier;
  SELECT value INTO v_qr   FROM coin_config WHERE key = 'quota_retouche_'  || v_tier;
  -- Fusion 02/09 soir : clés scans à 0 (retour arrière) — 0 = pas de compteur.
  v_qs := NULLIF(COALESCE(v_qs, 0), 0);

  v_ca := quota_annonces_consommees(v_user, v_cycle);
  SELECT count(*)::int INTO v_cs FROM usage_logs
   WHERE user_id = v_user AND feature = 'lens' AND created_at >= v_cycle;
  -- Retouches : même remise à zéro que les annonces (quotas_retouche_depuis).
  SELECT count(*)::int INTO v_cr FROM usage_logs
   WHERE user_id = v_user AND feature = 'photo_retouche'
     AND (metadata->>'delivered') IS DISTINCT FROM 'false'
     AND created_at >= GREATEST(v_cycle,
       to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_retouche_depuis'), 0)));

  IF v_tier = 'free' THEN
    SELECT value INTO v_avie   FROM coin_config WHERE key = 'republication_avie_free';
    SELECT value INTO v_depuis FROM coin_config WHERE key = 'republication_avie_depuis';
    IF v_avie IS NOT NULL AND v_depuis IS NOT NULL THEN
      SELECT count(*)::int INTO v_crep FROM cross_post_jobs
       WHERE user_id = v_user AND action = 'republish'
         AND created_at >= to_timestamp(v_depuis);
      v_repub := jsonb_build_object('mode', 'avie', 'plafond', v_avie,
                                    'faites', v_crep,
                                    'restantes', GREATEST(0, v_avie - v_crep));
    ELSE
      v_repub := jsonb_build_object('mode', 'avie', 'plafond', NULL);
    END IF;
  ELSIF v_tier = 'business' THEN
    v_repub := jsonb_build_object('mode', 'illimite');
  ELSE
    SELECT value INTO v_qrep FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    SELECT count(*)::int INTO v_crep FROM cross_post_jobs
     WHERE user_id = v_user AND action = 'republish' AND created_at >= v_cycle;
    v_repub := jsonb_build_object('mode', 'mensuel',
                                  'plafond', NULLIF(COALESCE(v_qrep, 0), 0),
                                  'faites', v_crep,
                                  'restantes', CASE WHEN COALESCE(v_qrep,0) > 0
                                    THEN GREATEST(0, v_qrep - v_crep) ELSE NULL END);
  END IF;

  RETURN jsonb_build_object(
    'palier', v_tier,
    'cycle_debut', v_cycle,
    'annonces',  jsonb_build_object('plafond', v_qa, 'consommes', v_ca,
                   'restantes', CASE WHEN v_qa IS NOT NULL THEN GREATEST(0, v_qa - v_ca) END),
    'scans',     jsonb_build_object('plafond', v_qs, 'consommes', v_cs,
                   'restantes', CASE WHEN v_qs IS NOT NULL THEN GREATEST(0, v_qs - v_cs) END),
    'retouches', jsonb_build_object('plafond', v_qr, 'consommes', v_cr,
                   'restantes', CASE WHEN v_qr IS NOT NULL THEN GREATEST(0, v_qr - v_cr) END),
    'republication', v_repub
  );
END;
$function$;
