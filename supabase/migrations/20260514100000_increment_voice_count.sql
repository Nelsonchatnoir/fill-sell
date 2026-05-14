-- Atomic voice counter: check limit + increment in one transaction (no race condition)
-- Returns: 0 = premium (no limit), positive = new count, -1 = limit hit or not found
CREATE OR REPLACE FUNCTION increment_voice_count(p_user_id uuid, p_today text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_premium boolean;
  v_count      int;
  v_new_count  int;
BEGIN
  SELECT is_premium,
    CASE WHEN voice_count_date = p_today THEN COALESCE(voice_count_today, 0) ELSE 0 END
  INTO v_is_premium, v_count
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF v_is_premium THEN RETURN 0; END IF;
  IF v_count >= 5 THEN RETURN -1; END IF;

  UPDATE profiles
  SET voice_count_today = v_count + 1,
      voice_count_date  = p_today
  WHERE id = p_user_id;

  RETURN v_count + 1;
END;
$$;
