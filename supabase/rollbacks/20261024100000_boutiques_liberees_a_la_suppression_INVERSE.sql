-- Inverse de supabase/migrations/20261024100000_boutiques_liberees_a_la_suppression.sql
-- Retire les trois liens vers auth.users et remet les réservations orphelines sauvegardées (si on le veut vraiment :
-- elles bloquaient l'import de comptes recréés).
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.boutiques_plateforme DROP CONSTRAINT IF EXISTS boutiques_plateforme_user_id_fkey;
ALTER TABLE public.comptes_lies DROP CONSTRAINT IF EXISTS comptes_lies_user_a_fkey, DROP CONSTRAINT IF EXISTS comptes_lies_user_b_fkey;
ALTER TABLE public.fiches_liees_comptes DROP CONSTRAINT IF EXISTS fiches_liees_comptes_user_a_fkey, DROP CONSTRAINT IF EXISTS fiches_liees_comptes_user_b_fkey;
-- Remise des orphelines (désactivé par défaut) :
-- INSERT INTO public.boutiques_plateforme (platform, compte_ref, user_id, depuis, source)
--   SELECT platform, compte_ref, user_id, depuis, source FROM public._backup_2410_boutiques_orphelines
--   ON CONFLICT (platform, compte_ref) DO NOTHING;
COMMIT;
