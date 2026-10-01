-- INVERSE de 20261001_ventes_ebay_non_vues.sql — sur décision seulement.
-- Défait les ventes enregistrées (ligne de vente, reçu, stock, job eBay) et
-- ANNULE les retraits armés par elles QUI N'ONT PAS ENCORE TOURNÉ (pending).
-- ⚠️ Un retrait déjà exécuté par l'extension (annonce retirée) ne se défait pas.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE _inv ON COMMIT DROP AS
SELECT b.job_id, b.job, b.fiche, b.resultat, 'annonce:ebay:' || (b.job ->> 'platform_listing_id') AS cle
  FROM public._backup_0110_ventes_ebay b
 WHERE b.resultat ->> 'ok' = 'true';

UPDATE cross_post_jobs d SET status = 'cancelled', error = 'Retrait annulé : la vente eBay a été défaite (inverse 20261001).'
  FROM _inv i
 WHERE d.inventaire_id = (i.fiche ->> 'id')::bigint AND d.action = 'delete' AND d.status = 'pending'
   AND d.platform_fields #>> '{arme_par,chemin}' IN ('vente_copie_prouvee', 'vente_article_serveur')
   AND d.created_at >= (SELECT min(le) FROM public._backup_0110_ventes_ebay);

DELETE FROM ventes v USING _inv i
 WHERE v.id IN (SELECT jsonb_array_elements_text(i.resultat -> 'ventes_ids')::bigint);
DELETE FROM ventes_operations o USING _inv i WHERE o.cle = i.cle;

UPDATE inventaire f SET statut = i.fiche ->> 'statut', quantite = (i.fiche ->> 'quantite')::int,
       prix_vente = (i.fiche ->> 'prix_vente')::numeric, plateforme = i.fiche ->> 'plateforme', date = i.fiche ->> 'date'
  FROM _inv i WHERE f.id = (i.fiche ->> 'id')::bigint;

UPDATE cross_post_jobs j SET status = i.job ->> 'status', sold_at = NULL, platform_fields = i.job -> 'platform_fields'
  FROM _inv i WHERE j.id = i.job_id;

SELECT count(*) AS ventes_defaites FROM _inv;
COMMIT;
