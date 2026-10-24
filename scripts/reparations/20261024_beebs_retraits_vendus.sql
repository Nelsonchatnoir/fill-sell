-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 (clôture, point 1 URGENT) — DEUX RETRAITS BEEBS « EN RETARD » DÉJÀ FAITS : L'ANNONCE EST « VENDU »
-- SUR BEEBS, PLUS ACHETABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Nos retraits choisissent le motif « Vendu via une autre plateforme » (règle du 11/09) : Beebs ne supprime pas
-- l'annonce, il la passe « Vendu » et la garde dans « Mes annonces ». La preuve d'absence n'arrivait donc jamais :
-- « Suppression envoyée… encore dans Mes annonces » à chaque passage (essais 3 et 4), retraits « en retard ».
-- Pages publiques relues le 24/10 à 11:2x (sans connexion) :
--   · Beebs 34083968 (retrait ecd27eef, recrutementgroupezk704, article vendu le 14/10) : badge « Vendu », aucun
--     « Ajouter au panier » / « Faire une offre » ; ld+json Product sku 34083968, availability SoldOut ;
--   · Beebs 34116769 (retrait f008ca92, josephinecerni, article vendu le 22/10) : idem, sku 34116769, SoldOut ;
--   · témoin : Beebs 34222058 (Johan, en vente) : InStock, « Ajouter au panier ».
-- La règle est corrigée pour tous (extension 0.6.133 : la fiche produit du numéro exact qui dit SoldOut prouve le
-- retrait ; update-job-status l'accepte). Ces deux-là sont clos ici avec la même preuve, et la publication d'origine
-- est close comme l'extension le fait après tout retrait (cancelPublishAfterDelete). Aucune vente, aucun mail.
-- Le 3e retrait de recrutementgroupezk704 (53cff028, Beebs 34083555) reste en file : l'annonce est encore « en
-- vérification » chez Beebs (aucune page publique) ; s'il la met en ligne, le retrait la retire.
-- Sauvegarde : _backup_2410_beebs_retraits_vendus. Inverse : …_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE public._backup_2410_beebs_retraits_vendus AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.id IN ('ecd27eef-250d-4506-9164-00bf84ecbf80', 'f008ca92-70af-4f1d-a0f0-bdc5a17fdeff',
                  '414159c7-85b9-4990-abf0-9607b3c93a3e', 'e0884c32-bfb3-42a3-a967-69a45a5ffd51');
ALTER TABLE public._backup_2410_beebs_retraits_vendus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_beebs_retraits_vendus FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
  n integer;
BEGIN
  IF (SELECT count(*) FROM public._backup_2410_beebs_retraits_vendus) <> 4 THEN RAISE EXCEPTION 'sauvegarde : 4 jobs attendus'; END IF;
  FOR r IN SELECT * FROM (VALUES
      ('ecd27eef-250d-4506-9164-00bf84ecbf80'::uuid, '34083968', '414159c7-85b9-4990-abf0-9607b3c93a3e'::uuid),
      ('f008ca92-70af-4f1d-a0f0-bdc5a17fdeff'::uuid, '34116769', 'e0884c32-bfb3-42a3-a967-69a45a5ffd51'::uuid)) v(retrait, produit, source)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d JOIN public.inventaire i ON i.id = d.inventaire_id
                    WHERE d.id = r.retrait AND d.platform = 'beebs' AND d.action = 'delete' AND d.status = 'pending'
                      AND btrim(d.platform_listing_id) = r.produit AND i.statut = 'vendu') THEN
      RAISE EXCEPTION 'retrait % : état inattendu — rien n''est fait', r.retrait;
    END IF;
    -- Le retrait : fait, avec la preuve de la fiche produit (forme de l'extension 0.6.133).
    UPDATE public.cross_post_jobs d
       SET status = 'deleted', error = NULL,
           platform_fields = (coalesce(d.platform_fields, '{}'::jsonb) - 'next_action_after' - 'processing_since')
             || jsonb_build_object(
                  'preuve_retrait', jsonb_build_object('source', 'page_produit', 'vendue', true, 'numero', r.produit,
                    'disponibilite', 'SoldOut', 'moment', 'releve_support', 'lu_le', '2026-10-24T09:25:00Z',
                    'par', 'support (Claude) : page publique relue le 24/10, ld+json Product sku exact, availability SoldOut ; badge « Vendu », aucun bouton d''achat'),
                  'erreurs_archivees', coalesce(CASE WHEN jsonb_typeof(d.platform_fields -> 'erreurs_archivees') = 'array' THEN d.platform_fields -> 'erreurs_archivees' END, '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object('le', now(), 'statut', d.status, 'erreur', left(coalesce(d.error, ''), 600), 'par', 'reparation_20261024_beebs_retraits_vendus')),
                  'ferme_par_support', jsonb_build_object('le', now(), 'decision', 'Nico, 24/10 (clôture, point 1)',
                    'pose_par', 'scripts/reparations/20261024_beebs_retraits_vendus.sql'))
     WHERE d.id = r.retrait AND d.status = 'pending';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'retrait % : % ligne(s)', r.retrait, n; END IF;
    -- La publication d'origine : close comme l'extension le fait après un retrait (cancelPublishAfterDelete).
    UPDATE public.cross_post_jobs s
       SET status = 'cancelled',
           error = 'Annonce retirée par le vendeur (retrait ciblé depuis l''app) — pas une vente',
           platform_fields = (coalesce(s.platform_fields, '{}'::jsonb) - 'unavailable_since' - 'sale_signal' - 'detected_price' - 'unavailable_pending_since')
             || CASE WHEN s.platform_fields ? 'unavailable_pending_since'
                     THEN jsonb_build_object('unavailable_pending_at_delete', s.platform_fields -> 'unavailable_pending_since', 'unavailable_pending_archived_at', now())
                     ELSE '{}'::jsonb END
             || jsonb_build_object('removed_by_user', true)
     WHERE s.id = r.source AND s.status = 'published' AND s.platform = 'beebs' AND btrim(s.platform_listing_id) = r.produit;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'publication % : % ligne(s)', r.source, n; END IF;
  END LOOP;
END $$;

SELECT c.id, c.action, c.status, c.platform_listing_id, left(coalesce(c.error, ''), 70) AS message,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM public._backup_2410_beebs_retraits_vendus) ORDER BY c.action, c.id;
COMMIT;
