-- ═══════════════════════════════════════════════════════════════════════════
-- RAPATRIEMENT — vue `v_categorie_arbitrage_extension` (rapatriée 2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : appliquée en prod le 07/09/2026 à 17h25 sous la version
-- 20260907172549 (`v_categorie_arbitrage_extension`), sans fichier dans le
-- dépôt. 0 occurrence du nom avant celui-ci.
-- CE QUI SUIT EST LE SQL RÉEL, copié depuis
-- supabase_migrations.schema_migrations.statements — non réécrit.
-- ═══════════════════════════════════════════════════════════════════════════

-- Les arbitrages faits DANS LA PAGE (Vinted, Leboncoin) ne passent pas par
-- resolve-categorie quand ils échouent avant l'appel — pas de session, délai
-- dépassé, erreur. L'extension les pose donc dans le canal EXISTANT
-- platform_fields.warnings, en forme structurée {code:'categorie_arbitrage'}.
-- Cette vue les compte, par jour de Paris et par plateforme.
CREATE OR REPLACE VIEW public.v_categorie_arbitrage_extension AS
SELECT
  (j.created_at AT TIME ZONE 'Europe/Paris')::date AS jour,
  coalesce(w->>'plateforme', j.platform)           AS plateforme,
  w->>'motif'                                      AS motif,
  count(*)                                         AS n,
  sum((w->>'n_candidats')::int)                    AS candidats_cumules
FROM public.cross_post_jobs j,
     LATERAL jsonb_array_elements(coalesce(j.platform_fields->'warnings', '[]'::jsonb)) w
WHERE w->>'code' = 'categorie_arbitrage'
GROUP BY 1, 2, 3;

GRANT SELECT ON public.v_categorie_arbitrage_extension TO authenticated;
