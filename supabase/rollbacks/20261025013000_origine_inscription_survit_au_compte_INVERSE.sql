-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261025013000_origine_inscription_survit_au_compte.sql (PROPOSITION, 25/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Place prévue : supabase/rollbacks/20261025013000_origine_inscription_survit_au_compte_INVERSE.sql
-- Puis : npx supabase migration repair --linked --status reverted 20261025013000
--
-- Ce qui est retiré : la vue, le déclencheur, la RPC, le nettoyeur, l'archive. L'archive est d'abord
-- SAUVEGARDÉE dans une table protégée (RLS, aucun droit client) : rien de ce qu'elle a gardé n'est perdu.
-- Ce qui reste : les origines déjà posées sur les profils vivants (profiles_acquisition_immuable les garde,
-- comme avant). Une app qui appelle encore la RPC reçoit « fonction introuvable », avalée par
-- poserSourceSurProfil : on revient au silence d'avant (aucune origine posée), sans panne.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DROP VIEW IF EXISTS public.origines_inscriptions;
DROP TRIGGER IF EXISTS profiles_origine_survit_trg ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_origine_survit();
DROP FUNCTION IF EXISTS public.poser_origine_inscription(text, text, text, text, text, text, timestamptz);

DO $$
BEGIN
  IF to_regclass('public.origines_comptes_supprimes') IS NOT NULL THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public._backup_inverse_origines_comptes_supprimes AS '
         || 'SELECT o.*, now() AS sauvegarde_le FROM public.origines_comptes_supprimes o';
    EXECUTE 'ALTER TABLE public._backup_inverse_origines_comptes_supprimes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public._backup_inverse_origines_comptes_supprimes FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

DROP TABLE IF EXISTS public.origines_comptes_supprimes;
DROP FUNCTION IF EXISTS public.origine_valeur_propre(text);

COMMIT;
