-- Fix double-débit du quota de publication : check_and_log_publish consommait
-- le quota (INSERT usage_logs) AVANT l'insert des cross_post_jobs — un insert
-- raté brûlait une publication du quota hebdo sans rien publier.
-- Découpage en deux fonctions :
--   * check_publish_quota : lecture seule, mêmes règles (free=0, premium=3/7j
--     glissants, pro=illimité), ne consomme rien — pour la modal côté client
--   * log_publish : consommation, appelée par le client UNIQUEMENT après un
--     insert cross_post_jobs confirmé réussi
-- Fenêtre de course assumée : deux publications strictement simultanées du même
-- user peuvent passer le check ensemble — préférable au quota perdu sans
-- publication. check_and_log_publish est conservée telle quelle pour les
-- clients déjà déployés ; à supprimer quand plus aucun client ne l'appelle.

CREATE OR REPLACE FUNCTION check_publish_quota(
  p_user_id  uuid,
  p_is_premium boolean,
  p_is_pro     boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_weekly_count int;
BEGIN
  -- Free : jamais autorisé (ConversionModal côté client, double-vérif serveur)
  IF NOT p_is_premium AND NOT p_is_pro THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'tier_free', 'limit', 0);
  END IF;

  -- Pro : aucune limite aujourd'hui — point d'extension futur pour les pièces
  IF p_is_pro THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Premium : 3 publications sur 7 jours glissants
  SELECT COUNT(*) INTO v_weekly_count
  FROM usage_logs
  WHERE user_id = p_user_id
    AND feature  = 'publish'
    AND created_at >= now() - interval '7 days';

  IF v_weekly_count >= 3 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'weekly_limit', 'limit', 3);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'weekly_used', v_weekly_count);
END;
$$;

CREATE OR REPLACE FUNCTION log_publish(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO usage_logs (user_id, feature) VALUES (p_user_id, 'publish');
END;
$$;

GRANT EXECUTE ON FUNCTION check_publish_quota(uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION log_publish(uuid) TO authenticated;
