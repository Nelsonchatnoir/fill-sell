-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260903195440 « backfill_vinted_account_id_fenetres_relance » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- Relance de la RÈGLE 2 (fenêtres de runs) — 03/09 22:0x
-- Nouveaux comptes devenus multi-identités depuis la première passe.
-- Mêmes garde-fous : garde IS NULL, une seule fenêtre couvrante, trace
-- avant UPDATE, UPDATE piloté par la trace, aucune suppression.

WITH multi AS (
  SELECT user_id FROM public.vinted_sync_runs
  WHERE kind = 'dressing' AND vinted_user_id IS NOT NULL AND items_vus > 0
  GROUP BY user_id HAVING count(DISTINCT vinted_user_id) >= 2
),
candidats AS (
  SELECT i.id AS article_id, i.user_id, min(r.vinted_user_id) AS ident
  FROM public.inventaire i
  JOIN multi m ON m.user_id = i.user_id
  JOIN public.vinted_sync_runs r
    ON r.user_id = i.user_id AND r.kind = 'dressing'
   AND r.vinted_user_id IS NOT NULL AND r.items_vus > 0
   AND i.last_synced_at BETWEEN r.started_at - interval '5 minutes'
     AND COALESCE(r.finished_at, r.started_at + interval '30 minutes') + interval '5 minutes'
  WHERE i.origine = 'vinted_sync' AND i.vinted_account_id IS NULL
  GROUP BY i.id, i.user_id
  HAVING count(*) = 1
)
INSERT INTO public.backfill_vinted_account_trace (article_id, user_id, ancien, nouveau, regle)
SELECT c.article_id, c.user_id, NULL, c.ident, 'fenetre_run'
FROM candidats c;

UPDATE public.inventaire i
SET vinted_account_id = t.nouveau
FROM public.backfill_vinted_account_trace t
WHERE t.regle = 'fenetre_run'
  AND t.article_id = i.id
  AND t.user_id = i.user_id
  AND i.vinted_account_id IS NULL;
