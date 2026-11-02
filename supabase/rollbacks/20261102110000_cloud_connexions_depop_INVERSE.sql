-- INVERSE de 20261102110000_cloud_connexions_depop.sql — les lignes Depop du journal partent d'abord (la contrainte
-- d'avant les refuserait).
SET lock_timeout = '5s';
BEGIN;
DELETE FROM public.cloud_connexions WHERE plateforme = 'depop';
ALTER TABLE public.cloud_connexions DROP CONSTRAINT cloud_connexions_plateforme_check;
ALTER TABLE public.cloud_connexions ADD CONSTRAINT cloud_connexions_plateforme_check
  CHECK (plateforme = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text]));
COMMIT;
