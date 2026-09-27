-- ═══════════════════════════════════════════════════════════════════════════
-- RELEVÉS : SESSION OPLA EXPIRÉE NOMMÉE · REPRISE DES RELEVÉS INCOMPLETS
-- LAISSÉS AVANT LA RÈGLE (27/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. « [incomplet] session Opla refusée (HTTP 401) » : 8 comptes (choupette06,
--    nicolas.menar, ornellaracano, tiffany.froment, thomas.vinted590002…) —
--    Opla a refusé la liste des annonces de la personne depuis une page
--    opla.co : sa session Opla est fermée. L'app l'affichait en « échec » avec
--    le texte brut. C'est un MUR (bouton « Me connecter »), pas une panne :
--    statut 'absente', phrase claire, jamais de reprise en boucle (la reprise
--    ne sait pas reconnecter quelqu'un). Rien n'est conclu sur les annonces.
-- 2. La reprise automatique (20260927223000) ne vaut que pour les relevés
--    clos APRÈS elle. Les derniers relevés restés incomplets ou expirés
--    avant 21:34, sans relevé plus récent ni demande en file, sont remis en
--    file une fois (déclencheur 'reprise') — lecture seule, rien n'est retiré.

CREATE OR REPLACE FUNCTION public.releve_opla_session_nommee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(NEW.items_vus, 0) > 0 THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('failed', 'done') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.erreur, '') !~* 'session opla refus[ée]e \(http 401\)' THEN RETURN NEW; END IF;
  NEW.status := 'absente';
  NEW.finished_at := COALESCE(NEW.finished_at, now());
  NEW.erreur := '[incomplet] session opla : page de connexion — ta session Opla est fermée (Opla a refusé la liste de tes annonces) : '
             || 'reconnecte-toi sur opla.co, le prochain relevé la prendra. Rien n''est conclu sur tes annonces.';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS releve_opla_session_nommee ON public.vinted_sync_runs;
CREATE TRIGGER releve_opla_session_nommee
  BEFORE UPDATE OF erreur ON public.vinted_sync_runs
  FOR EACH ROW WHEN (NEW.platform = 'opla' AND NEW.kind = 'annonces')
  EXECUTE FUNCTION public.releve_opla_session_nommee();

-- Les derniers relevés Opla déjà clos ainsi : même phrase, même statut.
UPDATE vinted_sync_runs r SET erreur = r.erreur
 WHERE r.kind = 'annonces' AND r.platform = 'opla' AND r.status = 'failed'
   AND COALESCE(r.items_vus, 0) = 0
   AND r.erreur ~* 'session opla refus[ée]e \(http 401\)'
   AND r.started_at > now() - interval '7 days';

-- 2. Reprises des relevés incomplets / expirés laissés avant la règle.
WITH derniers AS (
  SELECT DISTINCT ON (user_id, platform) id, user_id, platform, status, erreur, started_at
    FROM vinted_sync_runs
   WHERE kind = 'annonces' AND platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
     AND started_at > now() - interval '4 days'
     AND status IN ('done', 'failed', 'expired', 'absente')
   ORDER BY user_id, platform, started_at DESC)
INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
SELECT d.user_id, 'annonces', d.platform, 'queued', 'reprise', now()
  FROM derniers d
 WHERE (d.status IN ('failed', 'expired') OR (d.status = 'done' AND COALESCE(d.erreur, '') LIKE '[incomplet]%'))
   AND NOT releve_cause_utilisateur(d.erreur)
   AND NOT plateforme_ecartee_pour(d.user_id, d.platform)
   AND NOT EXISTS (SELECT 1 FROM vinted_sync_runs q
                    WHERE q.user_id = d.user_id AND q.kind = 'annonces' AND q.platform = d.platform
                      AND q.status IN ('queued', 'running'))
   AND NOT EXISTS (SELECT 1 FROM vinted_sync_runs q
                    WHERE q.user_id = d.user_id AND q.kind = 'annonces' AND q.platform = d.platform
                      AND q.declencheur = 'reprise' AND q.queued_at > now() - interval '6 hours');
