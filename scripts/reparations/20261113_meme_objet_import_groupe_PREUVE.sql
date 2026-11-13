-- PREUVE (LECTURE SEULE) du rattrapage 20261113_meme_objet_import_groupe.sql (13/11/2026, lot du 13/11, agent N6a).
-- Les questions « Est-ce le même article ? » posées par la passe parce que l'import n'était pas « intact »
-- (preuves.article_modifie), encore OUVERTES, que la règle de la migration 20261113180000 aurait réunies d'elle-même :
-- l'import intact SAUF le nombre de ses annonces, toutes ses annonces vivantes dans le groupe fort de la passe
-- (preuves.groupe), aucune posée par la personne ni par un dépôt, aucune plateforme des deux côtés (annonces vivantes,
-- ni tâche de dépôt publiée ou en file de la fiche du dressing sur une plateforme de l'import). Rien n'est écrit.
-- Mêmes critères, ligne pour ligne, que rapprochement_v3_import_rattachable (la migration) : cette preuve tourne AVANT la
-- migration (la fonction n'existe pas encore en prod).
--   npx supabase db query --linked --read-only -f scripts/reparations/20261113_meme_objet_import_groupe_PREUVE.sql
-- Relue le 13/11/2026 (lecture seule) : voir le rapport du lot (lot1311/N6a.md).
WITH q AS (
  SELECT d.id, d.user_id, d.garde, d.absorbe, d.preuves -> 'groupe' AS groupe, d.created_at
    FROM inventaire_doublons d
   WHERE d.statut = 'proposee' AND d.motif = 'photo_identique' AND d.preuves ->> 'article_modifie' = 'true'
     AND d.preuves ? 'vinted_nouvelle' AND jsonb_typeof(d.preuves -> 'groupe') = 'array')
SELECT left(q.user_id::text, 8) AS compte, left(q.id::text, 8) AS question, q.garde AS fiche_dressing, q.absorbe AS import,
       to_char(q.created_at AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS posee_le,
       (SELECT string_agg(x.platform || ' ' || x.listing_id, ', ' ORDER BY x.platform) FROM annonces_plateforme x
         WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL) AS annonces_import
  FROM q
  JOIN inventaire g ON g.id = q.garde AND g.user_id = q.user_id
  JOIN inventaire i ON i.id = q.absorbe AND i.user_id = q.user_id
 WHERE g.origine = 'vinted_sync' AND g.statut = 'stock' AND g.fusionne_dans IS NULL
   AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = g.id)
   -- l'import, intact sauf le nombre de ses annonces (rapprochement_v3_import_rattachable)
   AND i.origine LIKE 'releve\_%' AND i.statut = 'stock' AND i.fusionne_dans IS NULL AND COALESCE(i.quantite, 1) <= 1
   AND i.prix_achat IS NULL AND NOT COALESCE(i.prix_achat_inconnu, false)
   AND i.prix_vente_change_par IS DISTINCT FROM 'app' AND i.poids_change_par IS DISTINCT FROM 'app'
   AND NOT EXISTS (SELECT 1 FROM ventes v WHERE v.inventaire_id = i.id)
   AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id
                     AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve' OR j.status IN ('pending', 'processing', 'needs_user')))
   AND NOT EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = i.id)
   AND NOT EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = i.id)
   AND NOT EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = i.id)
   AND NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(i.attributs) = 'object' THEN i.attributs ELSE '{}'::jsonb END) e
                    WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel')
   AND EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL)
   AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = i.id AND x.disparu_le IS NULL
                     AND (NOT (q.groupe ? ('A' || x.id::text)) OR COALESCE(x.source_rapprochement, '') IN ('manuel', 'job')
                          OR EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = x.id AND r.par = 'utilisateur')))
   -- aucune plateforme des deux côtés (annonces vivantes ; dépôt publié ou en file de la fiche du dressing)
   AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                    WHERE x.inventaire_id = i.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL)
   AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN annonces_plateforme x ON x.platform = j.platform
                    WHERE j.inventaire_id = g.id AND x.inventaire_id = i.id AND x.disparu_le IS NULL
                      AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
                      AND j.status IN ('published', 'pending', 'processing', 'needs_user'))
 ORDER BY 1, q.created_at;
