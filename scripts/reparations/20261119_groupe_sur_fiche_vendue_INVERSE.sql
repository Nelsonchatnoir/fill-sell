-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de la reprise 20261119_groupe_sur_fiche_vendue (19/11/2026, terminal t5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Rend à chaque suivi repris son statut et ses champs d'avant (sauvegarde _backup_1911_groupe_vendu_jobs), SEULEMENT
-- s'il porte encore la marque de la reprise (branche reprise_1911) et n'a pas bougé depuis (toujours « cancelled » avec
-- pending_removal) : un « Retirer » ou un « Plus tard » de la personne n'est jamais défait. Puis retire la sauvegarde.
-- Jouer : npx supabase db query --linked -f scripts/reparations/20261119_groupe_sur_fiche_vendue_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

UPDATE public.cross_post_jobs j
   SET status = b.status, platform_fields = b.platform_fields
  FROM public._backup_1911_groupe_vendu_jobs b
 WHERE j.id = b.id
   AND j.status = 'cancelled'
   AND j.platform_fields #>> '{vendu_encore_en_ligne,branche}' = 'reprise_1911'
   AND COALESCE(j.platform_fields ->> 'pending_removal', '') = 'true'
   AND NOT (j.platform_fields ? 'pending_removal_reporte_le');

DROP TABLE public._backup_1911_groupe_vendu_jobs;

COMMIT;
