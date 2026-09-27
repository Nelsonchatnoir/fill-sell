-- ═══════════════════════════════════════════════════════════════════════════
-- LES ANNONCES COLLÉES À UNE FICHE VENDUE PAR LEUR SEUL TITRE REDEVIENNENT
-- LEURS PROPRES FICHES (27/09 soir, suite de 20260928001000)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le rattrapage du 27/09 20:27 (20260927211000, chemin releve_fiche_vendue) a
-- collé 13 annonces à des fiches VENDUES sur leur seul titre. 5 ont déjà été
-- retirées (louis ×1, nicolas.menar ×3 + eBay, thomas.vinted590002 ×1 — voir le
-- rapport). Les 7 encore en vente (44310spgl ×4 Opla, misscat801 Beebs,
-- van-breugel.sandra Beebs + Opla) sont détachées : leur job de suivi est
-- annulé (marqueur detache_titre_non_prouve), l'annonce est ré-importée comme
-- sa propre fiche EN STOCK, et la question « Déjà vendu ? » est posée par
-- rapprocher_importer contre la fiche vendue de même titre. La personne
-- tranche ; rien n'est retiré.
-- (nicolas.menar eBay 377453677328 est exclue : son retrait a été exécuté ce
-- soir, l'annonce n'est plus en vente.)

WITH cibles AS (
  SELECT j.id AS job, ap.id AS annonce, j.user_id
    FROM cross_post_jobs j
    JOIN annonces_plateforme ap ON ap.job_id = j.id
   WHERE j.platform_fields #>> '{rattachement,motif}' = 'releve_fiche_vendue'
     AND j.status = 'published'
     AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.statut_plateforme = 'en_ligne'
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d
                      WHERE d.inventaire_id = j.inventaire_id AND d.platform = j.platform AND d.action = 'delete'
                        AND d.status IN ('deleted', 'processing'))
), annules AS (
  UPDATE cross_post_jobs j SET
    status = 'cancelled',
    platform_fields = j.platform_fields || jsonb_build_object('detache_titre_non_prouve', jsonb_build_object(
      'le', now(), 'par', 'migration 20260928002000', 'fiche_vendue', j.inventaire_id))
   FROM cibles c WHERE j.id = c.job
  RETURNING c.annonce, c.user_id
), detaches AS (
  UPDATE annonces_plateforme ap SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, updated_at = now()
    FROM annules a WHERE ap.id = a.annonce
  RETURNING ap.id, ap.user_id
)
SELECT d.id AS annonce, rapprocher_importer(d.user_id, d.id, 'auto') AS import FROM detaches d;
