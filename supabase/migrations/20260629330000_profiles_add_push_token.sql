ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;
