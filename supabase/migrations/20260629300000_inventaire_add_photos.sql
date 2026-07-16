ALTER TABLE public.inventaire
  ADD COLUMN IF NOT EXISTS photos JSONB;
