-- Founder Plan: is_founder flag + founder_config table

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founder boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS founder_config (
  id int PRIMARY KEY DEFAULT 1,
  slots_total int NOT NULL DEFAULT 100,
  slots_used int NOT NULL DEFAULT 0,
  CHECK (id = 1)
);

INSERT INTO founder_config (id, slots_total, slots_used)
VALUES (1, 100, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE founder_config ENABLE ROW LEVEL SECURITY;

-- Public read: landing page (anonymous) can check remaining slots
CREATE POLICY "founder_config_read_all" ON founder_config
  FOR SELECT USING (true);

-- Atomic slot increment (called from stripe-webhook via service role)
CREATE OR REPLACE FUNCTION increment_founder_slots()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE founder_config
  SET slots_used = LEAST(slots_used + 1, slots_total)
  WHERE id = 1;
$$;
