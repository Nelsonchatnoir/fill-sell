-- (24/10, point 6) Réparation : 4 publications dont le motif disait un refus qui n'en était pas un.
-- La règle est corrigée pour tout le parc (migration 20261024140000, src/utils/relanceDepotMort.js) ; ces 4 jobs,
-- jugés avant, reçoivent le motif vrai — exactement la clôture que la règle neuve écrit :
--   · jocabroc8 55039410 (tableau « paysage lierre pilier », eBay 407277712724) et 20587777 (estampe « Scène
--     Mystérieuse », eBay 407283170246) : en ligne sur eBay, arrêtées par le vendeur sur eBay 2 et 17 min après
--     (pages eBay relues le 23/10) ; failed → cancelled « arrêtée sur eBay le … — pas par FillSell ».
--   · louis-seller a32b31ec (Short Okaïdi 9 ans) : déjà en ligne chez le compte relié louis@ (3286756945) ;
--     failed « Publication non confirmée » → cancelled « DÉJÀ en ligne … par ton compte FillSell relié ».
--   · louis-seller 4a6fcc93 (T.shirt motif raiponce 8 ans) : refusé le 18/10 (3290885485), relancé le 23/10 à
--     18:33, redéposé sous 3293872836 — en ligne, suivi par le job db986536 ; le job gardait le numéro mort :
--     published → cancelled « redéposée : l'annonce en ligne est 3293872836 ». db986536 n'est pas touché.
-- Gardes : chaque ligne seulement dans l'état relu le 23/10 au soir ; 4 lignes ou rien. Aucune vente, aucun retrait,
-- aucun mail, aucun quota (statuts terminaux, réservations déjà soldées). Sauvegarde protégée avant.
-- Inverse : scripts/reparations/20261024_refus_plateformes_vraie_cause_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';

CREATE TABLE public._backup_2410_refus_plateformes AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.id IN ('55039410-25bd-4393-b4f2-9f7186592cd0', '20587777-4821-4548-ac1b-9c14722a4c43',
                  'a32b31ec-f5ac-4eb1-baa6-44ebcffdfcd0', '4a6fcc93-b270-4fea-a61e-fc5da668862c');
ALTER TABLE public._backup_2410_refus_plateformes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_refus_plateformes FROM PUBLIC, anon, authenticated;

DO $$
DECLARE n integer := 0; m integer;
BEGIN
  IF (SELECT count(*) FROM public._backup_2410_refus_plateformes) <> 4 THEN RAISE EXCEPTION 'sauvegarde : 4 lignes attendues'; END IF;

  -- jocabroc8, tableau : arrêtée sur eBay le 09/10 à 08h35 (fin_ebay.fin 06:35:10Z) ; article en ligne nulle part
  -- sous cette fiche (la publication avait déjà été rendue : refund du 22/10, rien de plus).
  UPDATE public.cross_post_jobs c SET status = 'cancelled',
    error = 'Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le 09/10 à 08h35 — pas par FillSell, et sans vente. '
         || 'Ce n''est pas un refus d''eBay. Ton article reste dans ton stock ; si cet arrêt n''était pas voulu, relance la publication depuis la fiche.',
    platform_fields = c.platform_fields || jsonb_build_object(
      'depot_jamais_en_ligne', (c.platform_fields -> 'depot_jamais_en_ligne') || jsonb_build_object(
        'issue', 'arretee_sur_ebay', 'fin', c.platform_fields #>> '{fin_ebay,fin}', 'issue_avant', c.platform_fields #>> '{depot_jamais_en_ligne,issue}'),
      'reparation_2410_refus', jsonb_build_object('le', now(), 'statut_avant', c.status, 'motif', 'arretee_sur_ebay'))
   WHERE c.id = '55039410-25bd-4393-b4f2-9f7186592cd0' AND c.status = 'failed' AND c.platform = 'ebay'
     AND c.platform_fields #>> '{depot_jamais_en_ligne,issue}' = 'refus_moderation_probable'
     AND c.platform_fields #>> '{fin_ebay,fin}' = '2026-10-09T06:35:10.000Z';
  GET DIAGNOSTICS m = ROW_COUNT; n := n + m;

  -- jocabroc8, estampe : arrêtée sur eBay le 11/10 à 18h27 (16:27:41Z) ; l'article est en ligne sous 407302958488
  -- (même fiche 1791040801501).
  UPDATE public.cross_post_jobs c SET status = 'cancelled',
    error = 'Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le 11/10 à 18h27 — pas par FillSell, et sans vente. '
         || 'Ce n''est pas un refus d''eBay. Ton article y est en ligne sous l''annonce 407302958488 : rien à refaire.',
    platform_fields = c.platform_fields || jsonb_build_object(
      'depot_jamais_en_ligne', (c.platform_fields -> 'depot_jamais_en_ligne') || jsonb_build_object(
        'issue', 'arretee_sur_ebay', 'fin', c.platform_fields #>> '{fin_ebay,fin}', 'annonce_en_ligne', '407302958488',
        'issue_avant', c.platform_fields #>> '{depot_jamais_en_ligne,issue}'),
      'reparation_2410_refus', jsonb_build_object('le', now(), 'statut_avant', c.status, 'motif', 'arretee_sur_ebay'))
   WHERE c.id = '20587777-4821-4548-ac1b-9c14722a4c43' AND c.status = 'failed' AND c.platform = 'ebay'
     AND c.platform_fields #>> '{depot_jamais_en_ligne,issue}' = 'refus_moderation_probable'
     AND c.platform_fields #>> '{fin_ebay,fin}' = '2026-10-11T16:27:41.000Z'
     AND EXISTS (SELECT 1 FROM public.annonces_plateforme ap WHERE ap.user_id = c.user_id AND ap.platform = 'ebay'
                  AND ap.listing_id = '407302958488' AND ap.inventaire_id = c.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL);
  GET DIAGNOSTICS m = ROW_COUNT; n := n + m;

  -- louis-seller, Short Okaïdi : en ligne par le compte relié (3286756945), relu par article_en_ligne_ailleurs.
  UPDATE public.cross_post_jobs c SET status = 'cancelled',
    error = 'Ce dépôt n''a pas été mis en ligne par Leboncoin : ton article y est DÉJÀ en ligne sous l''annonce 3286756945, '
         || 'publiée par ton compte FillSell relié — Leboncoin refuse les doublons. Rien à refaire, rien n''est vendu.',
    platform_fields = (c.platform_fields - 'listing_url_abandon') || jsonb_build_object(
      'depot_jamais_en_ligne', jsonb_build_object('le', now(), 'source', 'reparation_2410', 'issue', 'en_ligne_par_compte_relie',
        'annonce_en_ligne', '3286756945', 'abandon_avant', c.platform_fields -> 'listing_url_abandon'),
      'reparation_2410_refus', jsonb_build_object('le', now(), 'statut_avant', c.status, 'motif', 'en_ligne_par_compte_relie'))
   WHERE c.id = 'a32b31ec-f5ac-4eb1-baa6-44ebcffdfcd0' AND c.status = 'failed' AND c.platform = 'leboncoin'
     AND c.listing_url IS NULL AND c.platform_listing_id IS NULL AND c.platform_fields ? 'listing_url_abandon'
     AND public.article_en_ligne_ailleurs(c.user_id, 'leboncoin', c.inventaire_id, ARRAY[]::text[])
         = '{"issue": "en_ligne_par_compte_relie", "listing_id": "3286756945"}'::jsonb;
  GET DIAGNOSTICS m = ROW_COUNT; n := n + m;

  -- louis-seller, Raiponce : le redépôt (3293872836, adsubmit 201) est en ligne et suivi par db986536 ; ce job
  -- gardait le numéro mort du premier dépôt (3290885485).
  UPDATE public.cross_post_jobs c SET status = 'cancelled',
    error = 'Redéposée le 23/10 à 18h35 : l''annonce en ligne sur Leboncoin est la 3293872836, suivie par FillSell. '
         || 'L''annonce du premier dépôt (3290885485, refusée par Leboncoin) n''existe plus. Rien à refaire, rien n''est vendu.',
    platform_fields = (c.platform_fields - ARRAY['unavailable_pending_since', 'unavailable_since', 'sale_signal']) || jsonb_build_object(
      'depot_jamais_en_ligne', (c.platform_fields -> 'depot_jamais_en_ligne') || jsonb_build_object(
        'issue', 'redeposee_suivie_ailleurs', 'annonce_en_ligne', '3293872836', 'suivie_par', 'db986536-02af-4706-a0a8-de17a090b1d0',
        'issue_avant', c.platform_fields #>> '{depot_jamais_en_ligne,issue}'),
      'reparation_2410_refus', jsonb_build_object('le', now(), 'statut_avant', c.status, 'motif', 'redeposee_suivie_ailleurs',
        'unavailable_pending_since_avant', c.platform_fields -> 'unavailable_pending_since'))
   WHERE c.id = '4a6fcc93-b270-4fea-a61e-fc5da668862c' AND c.status = 'published' AND c.platform = 'leboncoin'
     AND btrim(c.platform_listing_id) = '3290885485' AND c.platform_fields #>> '{lbc_depot,adsubmit,id}' = '3293872836'
     AND EXISTS (SELECT 1 FROM public.cross_post_jobs d WHERE d.id = 'db986536-02af-4706-a0a8-de17a090b1d0' AND d.status = 'published'
                  AND btrim(d.platform_listing_id) = '3293872836' AND d.inventaire_id = c.inventaire_id)
     AND EXISTS (SELECT 1 FROM public.annonces_plateforme ap WHERE ap.user_id = c.user_id AND ap.platform = 'leboncoin'
                  AND ap.listing_id = '3293872836' AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL);
  GET DIAGNOSTICS m = ROW_COUNT; n := n + m;

  IF n <> 4 THEN RAISE EXCEPTION 'réparation : % ligne(s) sur 4 — rien n''est écrit', n; END IF;
END $$;

SELECT c.id, c.status, left(c.error, 120) AS motif, c.platform_fields #>> '{depot_jamais_en_ligne,issue}' AS issue
  FROM public.cross_post_jobs c WHERE c.platform_fields ? 'reparation_2410_refus' ORDER BY c.id;
COMMIT;
