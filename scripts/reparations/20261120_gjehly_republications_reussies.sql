-- (20/11/2026, lot « problèmes », point 3 de Nico — gjehly 229c7b07, Business Apple, Brave) LES REPUBLICATIONS
-- RÉUSSIES REMISES À LEUR VRAI ÉTAT. 18 republications Vinted ont RÉUSSI (journal_etapes : deleted → recreated,
-- published, published_at posé), puis un « failed » tardif d'une exécution périmée les a remises à « a_capturer »
-- (17 annulées ensuite par handler-watch « n'est plus en ligne », 222227a3 en pause « suppression non confirmée »).
-- Preuve de l'état réel, lue sur Vinted : relevé du dressing du 20/11 à 09:47-09:48 (inventaire.vinted_item_id = la
-- NOUVELLE annonce de chaque tâche, vinted_status « active », last_synced_at du matin). Aucune autre tâche Vinted active
-- sur ces fiches, aucun retrait en file, aucun arrêt demandé par le client.
-- Hors script : ad1c8d23 (fiche 1793552175934) — sa nouvelle annonce 10861238339 est VENDUE (fiche « vendu ») : pas
-- « en ligne », la tâche reste telle quelle.
-- Sauvegarde : _backup_2011_gjehly_republications. Inverse : 20261120_gjehly_republications_reussies_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _cibles ON COMMIT DROP AS
  SELECT c.id
    FROM public.cross_post_jobs c
    JOIN public.inventaire i ON i.id = c.inventaire_id AND i.user_id = c.user_id
   WHERE c.user_id = '229c7b07-51f8-4ca6-835e-6b658f819427'
     AND c.platform = 'vinted' AND c.action = 'republish'
     AND left(c.id::text, 8) IN ('b9cbb251','a7acdecb','3d8aa1e6','13b00faa','8c5359ff','09e68935','b5ed9204','0a26e94d','d3a13269',
                                 '0bcd4655','24acd378','46d1af57','d7b070c5','adf03306','0201797d','adeee991','0c4a0ca7','6d55f2fc','222227a3')
     AND c.status IN ('cancelled', 'needs_user')
     AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'arret_utilisateur')
     AND c.published_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.platform_fields -> 'journal_etapes') e
                  WHERE e ->> 'etape' = 'recreated' AND e ->> 'statut' = 'published')
     -- l'état réel, lu sur Vinted ce matin : la NOUVELLE annonce est en ligne
     AND i.vinted_item_id = c.platform_listing_id AND i.vinted_status = 'active' AND i.disparu_le IS NULL
     AND i.statut = 'stock' AND i.last_synced_at > '2026-11-20 07:00:00+00'
     -- une seule tâche Vinted vivante par fiche
     AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs o
                      WHERE o.user_id = c.user_id AND o.inventaire_id = c.inventaire_id AND o.platform = 'vinted' AND o.id <> c.id
                        AND o.status IN ('pending', 'processing', 'needs_user', 'published')
                        AND COALESCE(o.action, 'publish') IN ('publish', 'republish', 'delete'));

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _cibles;
  IF n <> 18 THEN
    RAISE EXCEPTION 'compte 229c7b07 : % tâche(s) dans l''état attendu au lieu de 18 — relire avant de réparer', n;
  END IF;
END $$;

CREATE TABLE public._backup_2011_gjehly_republications AS
  SELECT now() AS le, c.id, c.status, c.error, c.platform_fields, c.platform_listing_id, c.listing_url, c.published_at
    FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM _cibles);
ALTER TABLE public._backup_2011_gjehly_republications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2011_gjehly_republications FROM PUBLIC, anon, authenticated;

UPDATE public.cross_post_jobs c
   SET status = 'published',
       error = NULL,
       platform_fields = (c.platform_fields
           - 'annonce_disparue' - 'capture_echec' - 'error_technique' - 'introuvable_404' - 'introuvable_a_confirmer'
           - 'needs_user_actif_ms' - 'needs_user_tick_le' - 'needs_user_vu_erreur' - 'needs_user_vu_le' - 'needs_user_source'
           - 'next_action_after' - 'pas_de_rouge' - 'pas_de_rouge_reprises')
         || jsonb_build_object(
              'republish_step', 'recreated',
              'new_vinted_item_id', c.platform_listing_id,
              'old_vinted_item_id', c.platform_fields ->> 'vinted_item_id',
              'recreated_at', (SELECT max(e ->> 'le') FROM jsonb_array_elements(c.platform_fields -> 'journal_etapes') e
                                WHERE e ->> 'etape' = 'recreated' AND e ->> 'statut' = 'published'),
              'reparation_2011', jsonb_build_object(
                'le', now(), 'par', 'scripts/reparations/20261120_gjehly_republications_reussies.sql',
                'motif', 'republication réussie remise à a_capturer par un rapport tardif (failed d''une exécution périmée) ; nouvelle annonce relue en ligne sur Vinted le 20/11 09:47',
                'statut_avant', c.status))
 WHERE c.id IN (SELECT id FROM _cibles);

SELECT left(c.id::text, 8) AS id, c.status, c.platform_listing_id, c.platform_fields ->> 'republish_step' AS step
  FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM _cibles) ORDER BY 1;
COMMIT;
