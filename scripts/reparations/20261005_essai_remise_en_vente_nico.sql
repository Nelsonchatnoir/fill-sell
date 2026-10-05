-- ESSAI RÉEL (05/10) — remise en vente après une vente partielle, compte de Nico
-- (f44b5917…), fiche de TEST 1791142468699 « TEST FILLSELL bobines film Super 8 »
-- (999 €). Étapes : 1) sauvegarde, quantité 2, publication Vinted (copie du
-- dépôt Vinted du 04/10, champs du formulaire seulement) ; 2) vente d'UNE
-- unité nommée Vinted (enregistrer_vente_atomique) ; 3) remises_en_vente_tick
-- pour ce compte seul ; 4) retraits des deux annonces, vente de test et fiche
-- supprimées (point 13). Inverse : 20261005_essai_remise_en_vente_nico_INVERSE.sql
CREATE TABLE IF NOT EXISTS public._essai_0510_remise_fiche AS
  SELECT * FROM public.inventaire WHERE id = 1791142468699;
ALTER TABLE public._essai_0510_remise_fiche ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._essai_0510_remise_fiche FROM anon, authenticated;

UPDATE public.inventaire SET quantite = 2
 WHERE id = 1791142468699 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND statut = 'stock';

INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) || jsonb_build_object('essai_0510', 'remise_en_vente')
  FROM public.cross_post_jobs c
 WHERE c.id = 'c14e9826-861c-4735-8bd7-68b06cdf0dba'
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs x WHERE x.inventaire_id = c.inventaire_id
                    AND x.platform = 'vinted' AND x.status IN ('pending','processing','needs_user','published'))
RETURNING id, status;

-- ── Fin de l'essai (05/10 10:45) : vente de test annulée, deux annonces retirées ──
-- Annonce d'origine 10252130828 (job 4f5fc231, « vendue » par l'essai) et
-- annonce remise en vente 10252167885 (job 52cd334c, créé par remises_en_vente_tick).
CREATE TABLE IF NOT EXISTS public._essai_0510_remise_ventes AS
  SELECT * FROM public.ventes WHERE id = 86184;
DELETE FROM public.ventes WHERE id = 86184 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
DELETE FROM public.ventes_operations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
  AND cle = 'manuel:essai-0510-remise-en-vente';
UPDATE public.cross_post_jobs SET status = 'published', sold_at = NULL,
       platform_fields = platform_fields - 'vente_operation_cle'
 WHERE id = '4f5fc231-05f6-4027-b975-4d72f44770e1' AND status = 'sold';
SELECT public.armer_retrait_job('4f5fc231-05f6-4027-b975-4d72f44770e1', 'essai_0510_fin', '0 seconds') AS retrait_origine,
       public.armer_retrait_job('52cd334c-53a9-47eb-aef9-be949c3808cf', 'essai_0510_fin', '0 seconds') AS retrait_remise;
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, listing_url, platform_listing_id, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'delete', 'pending', c.title, c.listing_url, c.platform_listing_id,
       jsonb_build_object('retrait_par', 'fillsell', 'vinted_account_id', c.platform_fields->>'vinted_account_id', 'essai_0510', 'fin')
  FROM public.cross_post_jobs c
 WHERE c.id IN ('4f5fc231-05f6-4027-b975-4d72f44770e1', '52cd334c-53a9-47eb-aef9-be949c3808cf')
   AND c.status = 'published'
RETURNING id, platform_listing_id;

-- ── ESSAI 2 (05/10) — point 5 b) : marque inconnue remplacée puis RETENUE ──
-- Publication Vinted de la fiche de test avec une marque hors catalogue
-- (« Kodak Ektachrome Super ») : la question « Marque » doit venir, la réponse
-- (marque du catalogue) être retenue, puis appliquée seule à la suivante.
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) || jsonb_build_object('marque', 'Kodak Ektachrome Super', 'essai_0510', 'marque_retenue_1')
  FROM public.cross_post_jobs c
 WHERE c.id = 'c14e9826-861c-4735-8bd7-68b06cdf0dba'
RETURNING id, status;

-- ── ESSAI 2 bis : marque retenue appliquée seule ──
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) || jsonb_build_object('marque', 'Kodak Ektachrome Super', 'essai_0510', 'marque_retenue_2')
  FROM public.cross_post_jobs c
 WHERE c.id = 'c14e9826-861c-4735-8bd7-68b06cdf0dba'
RETURNING id, status;

-- Retraits des deux annonces Vinted de l'essai « marque retenue ».
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, listing_url, platform_listing_id, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'delete', 'pending', c.title, c.listing_url, c.platform_listing_id,
       jsonb_build_object('retrait_par', 'fillsell', 'vinted_account_id', c.platform_fields->>'vinted_account_id', 'essai_0510', 'fin_marque')
  FROM public.cross_post_jobs c
 WHERE c.id IN ('c076506c-6070-41d2-ab16-bbd8ec75f162', '81f96937-562b-4d0b-8c58-2051c1fa194c')
   AND c.status = 'published'
RETURNING id, platform_listing_id;

-- ── ESSAI 3 (0.6.97) : transporteurs Leboncoin exacts ──
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, 1791142468699, 'leboncoin', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) - 'livraison_lbc' || jsonb_build_object('essai_0510', 'lbc_transporteurs')
  FROM public.cross_post_jobs c
 WHERE c.id = '9940f84d-844f-43c0-8e2f-ba849c833ece'
RETURNING id, status, platform_fields->'lbcTransporteurs' t;

-- ── ESSAI 4 (0.6.97) : colis Vinted choisi, Marque générique, mesures ──
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields)
         || jsonb_build_object('marque', 'Marque générique', 'packageSizeId', 3, 'packageSize', 'Grand',
                               'colis_source', 'manuel', 'essai_0510', 'vinted_colis_choisi')
  FROM public.cross_post_jobs c
 WHERE c.id = 'c14e9826-861c-4735-8bd7-68b06cdf0dba'
RETURNING id, status;

-- ── ESSAI 5 (0.6.97) : format de colis Vinted RETENU par rayon ──
SELECT public.platform_settings_fusionner(ARRAY['vinted', 'colis_retenus'],
  jsonb_build_object('Maison > Décoration > Décorations murales > Photographies', jsonb_build_object('id', 9, 'libelle', '10 kg')),
  NULL, 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) AS reglage;
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) || jsonb_build_object('marque', 'Sans marque', 'essai_0510', 'vinted_colis_retenu')
  FROM public.cross_post_jobs c
 WHERE c.id = 'c14e9826-861c-4735-8bd7-68b06cdf0dba'
RETURNING id, status;

-- ── ESSAI 6 (0.6.97) : Beebs dépôt puis retrait ──
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                    title, description, price, photos, platform_fields)
SELECT c.user_id, 1791142468699, 'beebs', 'pending', 'publish', c.photo_option,
       c.title, c.description, 999, c.photos,
       public.remise_en_vente_champs(c.platform_fields) || jsonb_build_object('essai_0510', 'beebs_depot_retrait')
  FROM public.cross_post_jobs c
 WHERE c.id = '6e349379-6c1e-4d23-8ed6-bb7d24b0120a'
RETURNING id, status;

-- Retraits des annonces Vinted des essais 4 et 5 (colis choisi / retenu).
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, listing_url, platform_listing_id, platform_fields)
SELECT c.user_id, c.inventaire_id, 'vinted', 'delete', 'pending', c.title, c.listing_url, c.platform_listing_id,
       jsonb_build_object('retrait_par', 'fillsell', 'vinted_account_id', c.platform_fields->>'vinted_account_id', 'essai_0510', 'fin_colis')
  FROM public.cross_post_jobs c
 WHERE c.id IN ('7eadeb5b-cada-47eb-9ccd-967f93de3122', 'c940bc5b-f63a-483d-b688-727cc39b34a4')
   AND c.status = 'published'
RETURNING id, platform_listing_id;

-- Retrait de l'annonce Beebs de l'essai 6 (clic de suppression attendu).
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, listing_url, platform_listing_id, platform_fields)
SELECT c.user_id, c.inventaire_id, 'beebs', 'delete', 'pending', c.title, c.listing_url, c.platform_listing_id,
       jsonb_build_object('retrait_par', 'fillsell', 'adresse', c.platform_fields->>'adresse', 'essai_0510', 'fin_beebs')
  FROM public.cross_post_jobs c
 WHERE c.id = '14b25a69-fc62-403e-84a4-72c15ac8def8' AND c.status = 'published'
RETURNING id, platform_listing_id;

-- Retrait de l'annonce Leboncoin republiée de l'essai (3282626762).
INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, title, listing_url, platform_listing_id, platform_fields)
SELECT c.user_id, c.inventaire_id, 'leboncoin', 'delete', 'pending', c.title,
       COALESCE(c.platform_fields->>'new_listing_url', c.listing_url), c.platform_listing_id,
       jsonb_build_object('retrait_par', 'fillsell', 'adresse', c.platform_fields->>'adresse', 'essai_0510', 'fin_lbc')
  FROM public.cross_post_jobs c
 WHERE c.id = '468bfba2-f502-47de-a51c-aedf010fdac5' AND c.status = 'published'
RETURNING id, platform_listing_id, listing_url;
