CREATE TABLE IF NOT EXISTS usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL, -- 'voice', 'lens', 'deal'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own logs" ON usage_logs FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS usage_logs_user_feature_created ON usage_logs (user_id, feature, created_at);

CREATE OR REPLACE FUNCTION check_and_log_usage(
  p_user_id uuid,
  p_feature text,
  p_is_premium boolean,
  p_daily_limit_free int,
  p_monthly_limit_free int,
  p_daily_limit_premium int DEFAULT NULL,
  p_monthly_limit_premium int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_daily_count int;
  v_monthly_count int;
  v_daily_limit int;
  v_monthly_limit int;
BEGIN
  SELECT COUNT(*) INTO v_daily_count
  FROM usage_logs
  WHERE user_id = p_user_id
    AND feature = p_feature
    AND created_at >= date_trunc('day', now());

  SELECT COUNT(*) INTO v_monthly_count
  FROM usage_logs
  WHERE user_id = p_user_id
    AND feature = p_feature
    AND created_at >= date_trunc('month', now());

  IF p_is_premium THEN
    v_daily_limit := p_daily_limit_premium;
    v_monthly_limit := p_monthly_limit_premium;
  ELSE
    v_daily_limit := p_daily_limit_free;
    v_monthly_limit := p_monthly_limit_free;
  END IF;

  IF v_daily_limit IS NOT NULL AND v_daily_count >= v_daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'limit', v_daily_limit);
  END IF;

  IF v_monthly_limit IS NOT NULL AND v_monthly_count >= v_monthly_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'monthly_limit', 'limit', v_monthly_limit);
  END IF;

  INSERT INTO usage_logs (user_id, feature) VALUES (p_user_id, p_feature);

  RETURN jsonb_build_object('allowed', true, 'daily_used', v_daily_count + 1, 'monthly_used', v_monthly_count + 1);
END;
$$;
