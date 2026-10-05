-- ═══════════════════════════════════════════════════════════════════════════
-- PLUS AUCUNE REPRISE AUTOMATIQUE, MÊME PAR UNE EXTENSION ANCIENNE (05/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Suite de 20261005200000_releves_sur_geste (règle de Nico : un relevé ne part
-- que sur « Synchroniser »). La garde d'INSERTION ne voit pas les reprises que
-- les extensions d'avant la 0.6.99 font en RÉ-OUVRANT une ligne existante :
--   · reprise-auto (3/7/15 min) : failed/incomplete/expired → running
--     (Marine : armée à 19:12:40, partie à 19:15:44 sur un compte supprimé) ;
--   · reprise 403 (5/10/20 min) : failed → running ;
--   · remise en file technique des relevés d'annonces : running → queued.
-- Mesuré sur 7 jours : 13 relevés rouverts ainsi, chez 11 comptes.
--
-- CE QUI RESTE PERMIS (les gestes et la vie normale d'un relevé) :
--   · queued → running            la prise d'une demande (geste ou veille) ;
--   · incomplete → running        « Synchroniser » reprend un relevé incomplet
--                                 de moins de 2 h (chemin de l'extension) ;
--   · running → done/failed/expired/absente/incomplete/interrupted/cancelled ;
--   · queued → cancelled/expired.
-- CE QUI EST REFUSÉ (la ligne reste telle quelle, la mise à jour n'a pas lieu) :
--   · failed/expired/interrupted/cancelled/done/absente → queued/running ;
--   · running → queued.
-- La redemande d'une demande expirée (get-pending-jobs) CRÉE une ligne neuve :
-- elle n'est pas concernée (et la garde d'insertion la juge déjà).
--
-- ⛔ AUCUNE DONNÉE TOUCHÉE. Inverse : supabase/rollbacks/20261005210000_reprises_sur_geste_INVERSE.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.garde_reprise_sans_geste()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.kind NOT IN ('dressing', 'annonces') THEN RETURN NEW; END IF;
  IF (OLD.status IN ('failed', 'expired', 'interrupted', 'cancelled', 'done', 'absente') AND NEW.status IN ('queued', 'running'))
     OR (OLD.status = 'running' AND NEW.status = 'queued') THEN
    RAISE LOG 'garde_reprise_sans_geste : reprise automatique refusée (run %, % %, % → %, user %)',
      OLD.id, OLD.kind, COALESCE(OLD.platform, 'vinted'), OLD.status, NEW.status, OLD.user_id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS garde_reprise_sans_geste ON public.vinted_sync_runs;
CREATE TRIGGER garde_reprise_sans_geste BEFORE UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_reprise_sans_geste();

COMMIT;
