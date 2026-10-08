-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE du rattrapage des ventes prouvées
-- (scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs --appliquer).
-- ═══════════════════════════════════════════════════════════════════════════
-- Défait UNIQUEMENT ce que le journal public._rattrapage_0810_ventes_prouvees
-- a enregistré (issue « enregistree »), à partir des sauvegardes prises AVANT
-- (_backup_0810_ventes_prouvees_inventaire / _jobs). Prouvé sur le banc
-- (scripts/ventes-prouvees-banc.mjs, S12).
-- ⛔ IRRÉVERSIBLE : un retrait de copie déjà EXÉCUTÉ (status 'deleted') —
--    l'annonce n'existe plus sur la plateforme. La requête 0 les liste ; si la
--    vente était fausse, republier depuis la fiche (une annonce neuve).
-- 0. (à lancer d'abord, lecture) Ce qui ne se défait pas :
--    SELECT d.id, d.platform, d.platform_listing_id, d.inventaire_id FROM public.cross_post_jobs d
--     WHERE d.status = 'deleted' AND d.id IN (SELECT unnest(retraits) FROM public._rattrapage_0810_ventes_prouvees
--                                              WHERE resultat ->> 'issue' = 'enregistree');
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '3s';
CREATE TEMP TABLE _j ON COMMIT DROP AS
  SELECT * FROM public._rattrapage_0810_ventes_prouvees
   WHERE coalesce(resultat ->> 'issue', '') = 'enregistree' AND NOT (resultat ? 'defait_le');
CREATE TEMP TABLE _v ON COMMIT DROP AS
  SELECT (jsonb_array_elements_text(resultat -> 'ventes_ids'))::bigint AS id FROM _j;

-- 1. Les ventes et leurs reçus. La trace « vente supprimée » qu'écrit le
--    déclencheur ventes_suppression_trace est retirée aussi : ce n'est pas un
--    geste de la personne (un relevé de commande légitime doit rester possible).
DELETE FROM public.ventes WHERE id IN (SELECT id FROM _v);
DELETE FROM public.ventes_supprimees WHERE vente_id IN (SELECT id FROM _v);
DELETE FROM public.ventes_operations WHERE job_id IN (SELECT job_id FROM _j);

-- 2. Les fiches reviennent telles que sauvegardées (vendu → stock : le
--    déclencheur inventaire_vente_annulee_retraits annule alors les retraits
--    encore en attente, comme pour une vente annulée par la personne).
UPDATE public.inventaire i
   SET statut = b.statut, quantite = b.quantite, prix_vente = b.prix_vente, margin = b.margin,
       margin_pct = b.margin_pct, selling_fees = b.selling_fees, plateforme = b.plateforme, date = b.date
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_0810_ventes_prouvees_inventaire ORDER BY id, sauve_le) b
 WHERE i.id = b.id AND b.id IN (SELECT inventaire_id FROM _j);

-- 3. Les retraits encore en attente (si le déclencheur ne les a pas tous vus) : annulés.
UPDATE public.cross_post_jobs
   SET status = 'cancelled', error = 'Rattrapage du 08/10 défait : retrait annulé avant exécution. Ton annonce reste en ligne.'
 WHERE id IN (SELECT unnest(retraits) FROM _j) AND status IN ('pending', 'needs_user');

-- 4. L'annonce vendue et les publications arrêtées reprennent leur état sauvegardé.
UPDATE public.cross_post_jobs j
   SET status = b.status, sold_at = b.sold_at, platform_fields = b.platform_fields, error = b.error, last_checked_at = b.last_checked_at
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_0810_ventes_prouvees_jobs ORDER BY id, sauve_le) b
 WHERE j.id = b.id AND (j.id IN (SELECT job_id FROM _j) OR j.id IN (SELECT unnest(publications_arretees) FROM _j));

-- 4 bis. Les copies de ces fiches : les marqueurs posés par la vente
--    (vente_operation_cle, retrait_arme, pending_removal) reprennent leur valeur sauvegardée.
UPDATE public.cross_post_jobs j
   SET platform_fields = (coalesce(j.platform_fields, '{}'::jsonb) - 'vente_operation_cle' - 'retrait_arme' - 'pending_removal')
       || jsonb_strip_nulls(jsonb_build_object(
            'vente_operation_cle', b.platform_fields -> 'vente_operation_cle',
            'retrait_arme', b.platform_fields -> 'retrait_arme',
            'pending_removal', b.platform_fields -> 'pending_removal'))
  FROM (SELECT DISTINCT ON (id) * FROM public._backup_0810_ventes_prouvees_jobs ORDER BY id, sauve_le) b
 WHERE j.id = b.id AND j.inventaire_id IN (SELECT inventaire_id FROM _j)
   AND j.id NOT IN (SELECT job_id FROM _j) AND j.action IN ('publish', 'republish');

-- 5. Les questions « Déjà vendu ? » posées par le rattrapage et encore sans réponse.
DELETE FROM public.inventaire_doublons WHERE id IN (SELECT unnest(questions) FROM _j) AND statut = 'proposee';

-- 6. Le journal garde la trace.
UPDATE public._rattrapage_0810_ventes_prouvees r
   SET resultat = r.resultat || jsonb_build_object('defait_le', now())
 WHERE r.job_id IN (SELECT job_id FROM _j);
COMMIT;
