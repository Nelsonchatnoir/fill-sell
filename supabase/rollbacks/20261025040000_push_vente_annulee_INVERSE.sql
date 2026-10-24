-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261025040000_push_vente_annulee (notification push « Vente annulée »).
-- Plus léger d'abord : l'interrupteur — `update coin_config set value = 0 where key = 'push_annulations_depuis';`
-- (plus rien ne naît ni ne part ; le cron ne réveille plus push-ventes). Cet inverse retire TOUT :
-- le cron à part, les fonctions, l'index des propositions, la clé d'armement, et la table (sauvegardée d'abord).
-- push-ventes v14 tolère l'absence des fonctions (PGRST202/42883 : rien, aucune erreur) — redéployer v13 n'est pas requis.
-- Le cron 34 (push-ventes-1min), push_ventes, remises_en_vente (lignes), les fiches et les dépôts : jamais touchés.
--   npx supabase db query --linked -f supabase/rollbacks/20261025040000_push_vente_annulee_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-annulations-1min';

DO $inverse$
BEGIN
  IF to_regclass('public.push_annulations') IS NOT NULL THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS public._backup_2510_push_annulations AS SELECT * FROM public.push_annulations';
  END IF;
END
$inverse$;

DROP FUNCTION IF EXISTS public.push_annulations_apercu(uuid);
DROP FUNCTION IF EXISTS public.push_annulations_resultat(jsonb);
DROP FUNCTION IF EXISTS public.push_annulations_a_envoyer(integer);
DROP FUNCTION IF EXISTS public.push_annulations_en_attente();
DROP FUNCTION IF EXISTS public.push_annulations_neuves(timestamptz);
DROP FUNCTION IF EXISTS public.push_annulation_le(jsonb);
DROP FUNCTION IF EXISTS public.push_annulation_cle(jsonb);
DROP FUNCTION IF EXISTS public.push_annulation_plateforme(jsonb);
DROP INDEX IF EXISTS public.remises_en_vente_proposees;
DROP TABLE IF EXISTS public.push_annulations;
DELETE FROM public.coin_config WHERE key = 'push_annulations_depuis';
COMMIT;

-- Vérifications (lecture seule) :
-- select to_regclass('public.push_annulations'), to_regclass('public.remises_en_vente_proposees');   -- ∅, ∅
-- select count(*) from cron.job where jobname = 'push-annulations-1min';                              -- 0
-- select count(*) from pg_proc where proname like 'push_annulation%';                                  -- 0
