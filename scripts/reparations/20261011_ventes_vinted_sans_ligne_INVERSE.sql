-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE du rattrapage des ventes Vinted passées « vendu » sans ligne (11/10, A5)
-- (scripts/reparations/20261011_ventes_vinted_sans_ligne.mjs --appliquer).
-- ═══════════════════════════════════════════════════════════════════════════
-- Défait UNIQUEMENT ce que le journal public._rattrapage_1110_ventes_vinted a
-- enregistré, à partir des sauvegardes prises AVANT
-- (_backup_1110_ventes_vinted_inventaire / _jobs) : fiches remises « vendu »
-- (leur état d'avant), signaux posés retirés, ventes et reçus créés supprimés,
-- retraits encore en attente annulés.
-- ⛔ IRRÉVERSIBLE : un retrait de copie déjà EXÉCUTÉ (status 'deleted').
-- 0. (lecture d'abord) Ce qui ne se défait pas :
--    SELECT d.id, d.platform, d.platform_listing_id, d.inventaire_id FROM public.cross_post_jobs d
--     WHERE d.status = 'deleted' AND d.id IN (SELECT unnest(retraits) FROM public._rattrapage_1110_ventes_vinted);
--   npx supabase db query --linked -f scripts/reparations/20261011_ventes_vinted_sans_ligne_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '3s';
CREATE TEMP TABLE _j ON COMMIT DROP AS SELECT * FROM public._rattrapage_1110_ventes_vinted WHERE NOT (resultat ? 'defait_le');
CREATE TEMP TABLE _v ON COMMIT DROP AS
  SELECT (jsonb_array_elements_text(resultat -> 'ventes_ids'))::bigint AS id FROM _j WHERE resultat ->> 'issue' = 'enregistree';
DELETE FROM public.ventes WHERE id IN (SELECT id FROM _v);
DELETE FROM public.ventes_supprimees WHERE vente_id IN (SELECT id FROM _v);
DELETE FROM public.ventes_operations WHERE job_id IN (SELECT job_id FROM _j WHERE resultat ->> 'issue' = 'enregistree');
UPDATE public.cross_post_jobs
   SET status = 'cancelled', error = 'Rattrapage du 11/10 défait : retrait annulé avant exécution. Ton annonce reste en ligne.'
 WHERE id IN (SELECT unnest(retraits) FROM _j) AND status IN ('pending', 'needs_user');
UPDATE public.inventaire i
   SET statut = b.statut, quantite = b.quantite, prix_vente = b.prix_vente, margin = b.margin,
       margin_pct = b.margin_pct, selling_fees = b.selling_fees, plateforme = b.plateforme, date = b.date
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_1110_ventes_vinted_inventaire ORDER BY id, sauve_le) b
 WHERE i.id = b.id AND b.id IN (SELECT inventaire_id FROM _j);
UPDATE public.cross_post_jobs j
   SET status = b.status, sold_at = b.sold_at, platform_fields = b.platform_fields, error = b.error
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_1110_ventes_vinted_jobs ORDER BY id, sauve_le) b
 WHERE j.id = b.id AND j.id IN (SELECT job_id FROM _j);
UPDATE public._rattrapage_1110_ventes_vinted r
   SET resultat = r.resultat || jsonb_build_object('defait_le', now())
 WHERE r.job_id IN (SELECT job_id FROM _j);
COMMIT;
