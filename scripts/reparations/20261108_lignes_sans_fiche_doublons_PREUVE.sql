-- LECTURE PRÉALABLE (rien n'écrit) du rattrapage 20261108_lignes_sans_fiche_doublons : ce que la règle clôturerait.
-- npx supabase db query --linked --read-only -f scripts/reparations/20261108_lignes_sans_fiche_doublons_PREUVE.sql
-- Mesure du 08/11 (ayadi007) : 440 lignes.
SELECT o.platform, COALESCE(o.action, 'publish') AS action, o.status, count(*) AS lignes
  FROM cross_post_jobs o
 WHERE o.user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37'::uuid
   AND o.inventaire_id IS NULL AND o.status IN ('published', 'pending', 'needs_user')
   AND COALESCE(o.action, 'publish') IN ('publish', 'republish')
   AND EXISTS (SELECT 1 FROM cross_post_jobs k JOIN inventaire i ON i.id = k.inventaire_id
                WHERE k.user_id = o.user_id AND k.platform = o.platform AND btrim(k.platform_listing_id) = btrim(o.platform_listing_id)
                  AND k.status IN ('published', 'sold') AND COALESCE(k.action, 'publish') IN ('publish', 'republish')
                  AND i.fusionne_dans IS NULL)
 GROUP BY 1, 2, 3 ORDER BY 4 DESC;
