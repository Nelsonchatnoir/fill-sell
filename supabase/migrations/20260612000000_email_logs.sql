-- Email tunnel: lang column on profiles + logs table + helper function

-- Add lang column to profiles (default fr)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS lang text DEFAULT 'fr';

CREATE TABLE IF NOT EXISTS email_logs (
  id        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type text       NOT NULL, -- 'welcome' | 'founder_plan' | 'voice_conversion'
  sent_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_logs_user_type ON email_logs (user_id, email_type);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS; no user-facing policy needed

-- Returns all users eligible for the email tunnel (excludes test accounts).
-- Joins auth.users with profiles to get lang + is_premium.
CREATE OR REPLACE FUNCTION email_tunnel_candidates()
RETURNS TABLE(
  user_id    uuid,
  user_email text,
  lang       text,
  is_premium boolean,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email,
    COALESCE(p.lang, 'fr'),
    COALESCE(p.is_premium, false),
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email IS NOT NULL
    AND u.email NOT IN (
      'sbooby.stan@gmail.com',
      'hoosslocal@gmail.com',
      'test@fillsell.app',
      'ornella.berthier@gmail.com',
      'nicolas.svobodny@gmail.com',
      'ornellaracano@icloud.com',
      'nicotest@mail.fr',
      'rhz66yn247@privaterelay.appleid.com',
      'bensvo91@hotmail.fr',
      '4kt629c47h@privaterelay.appleid.com'
    );
$$;
