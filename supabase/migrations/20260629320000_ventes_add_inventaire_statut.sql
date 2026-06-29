ALTER TABLE public.ventes
  ADD COLUMN IF NOT EXISTS inventaire_id BIGINT REFERENCES public.inventaire(id),
  ADD COLUMN IF NOT EXISTS statut TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventes TO authenticated;
