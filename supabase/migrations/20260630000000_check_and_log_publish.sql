-- Quota de publication : fenêtre glissante 7 jours, 3 tiers
-- free=0 (jamais autorisé), premium=3/semaine, pro=illimité (pas de pièces pour l'instant)
-- Réutilise usage_logs avec feature='publish'

CREATE OR REPLACE FUNCTION check_and_log_publish(
  p_user_id  uuid,
  p_is_premium boolean,
  p_is_pro     boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_weekly_count int;
BEGIN
  -- Free : jamais autorisé (ConversionModal côté client, mais double-vérif serveur)
  IF NOT p_is_premium AND NOT p_is_pro THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'tier_free', 'limit', 0);
  END IF;

  -- Pro : aucune limite aujourd'hui — point d'extension futur pour les pièces
  IF p_is_pro THEN
    INSERT INTO usage_logs (user_id, feature) VALUES (p_user_id, 'publish');
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

  INSERT INTO usage_logs (user_id, feature) VALUES (p_user_id, 'publish');

  RETURN jsonb_build_object('allowed', true, 'weekly_used', v_weekly_count + 1);
END;
$$;
