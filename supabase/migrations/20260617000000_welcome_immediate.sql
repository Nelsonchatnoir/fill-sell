-- Immediate welcome email on signup via pg_net
-- Extends handle_new_user to fire email-tunnel right after profile creation.
-- pg_net sends the HTTP request asynchronously (after TX commit), so no
-- transaction blocking. The cron's alreadySent() check prevents duplicates.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;

  IF new.email IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/email-tunnel',
      headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
      body    := json_build_object(
        'welcome_now',  true,
        'user_id',      new.id::text,
        'user_email',   new.email
      )::jsonb
    );
  END IF;

  RETURN new;
END;
$$;
