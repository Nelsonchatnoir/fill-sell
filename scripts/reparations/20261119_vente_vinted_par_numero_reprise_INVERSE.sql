-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de la reprise 20261119_vente_vinted_par_numero_reprise (19/11/2026, terminal t5, P2)
-- ═══════════════════════════════════════════════════════════════════════════
-- Annule les retraits nés de la reprise qui n'ont PAS encore commencé (pending, arme_par.chemin =
-- reprise_1911_commande_vinted) — un retrait en cours, fait ou échoué n'est jamais défait —, retire les questions nées de
-- la reprise encore ouvertes, rend aux dépôts leurs champs d'avant (sauvegarde) quand leur retrait a été annulé ici,
-- puis retire la sauvegarde.
-- Jouer : npx supabase db query --linked -f scripts/reparations/20261119_vente_vinted_par_numero_reprise_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _annules_1911_p2 ON COMMIT DROP AS
WITH u AS (
  UPDATE public.cross_post_jobs d
     SET status = 'cancelled',
         error = 'Retrait annulé : inverse de la reprise du 19/11 (aucune action sur la plateforme).'
   WHERE d.action = 'delete' AND d.status = 'pending'
     AND d.platform_fields #>> '{arme_par,chemin}' = 'reprise_1911_commande_vinted'
  RETURNING d.id, d.platform_fields #>> '{arme_par,depot}' AS depot)
SELECT * FROM u;

UPDATE public.cross_post_jobs j
   SET platform_fields = b.platform_fields
  FROM public._backup_1911_vinted_numero_depots b
 WHERE j.id = b.id AND j.id::text IN (SELECT depot FROM _annules_1911_p2);

DELETE FROM public.inventaire_doublons q
 WHERE q.statut = 'proposee' AND q.source = 'vente:reprise_1911_commande_vinted';

DROP TABLE public._backup_1911_vinted_numero_depots;

COMMIT;
