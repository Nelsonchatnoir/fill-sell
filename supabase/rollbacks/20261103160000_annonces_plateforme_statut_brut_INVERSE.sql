-- Inverse de 20261103160000_annonces_plateforme_statut_brut : la colonne part (l'extension ≥ 0.6.170 n'écrit le statut
-- brut que si la colonne existe : sans elle, le relevé continue à l'identique).
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.annonces_plateforme DROP COLUMN IF EXISTS statut_brut;
COMMIT;
