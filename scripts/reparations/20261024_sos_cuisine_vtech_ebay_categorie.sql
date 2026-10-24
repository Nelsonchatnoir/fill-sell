-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 soir — sos.cuisine.valenciennes : job eBay a5d7f0c9 (« VTech Switch & Go Dinos Rotor le
-- Vélociraptor », inventaire 1792837464698008), refusé 3 fois « État manquant dans le brouillon ».
-- Deux causes, deux RÈGLES corrigées pour tous les comptes :
--   1. la catégorie : « switch » lu comme la console Nintendo → « Jeux vidéo, consoles > Jeux » (139973), aspects
--      « Plateforme : Nintendo Switch » et « Nom du jeu vidéo : 3rd Birthday » posés sur un jouet. Règle : la gamme
--      VTech « Switch & Go » est un jouet 🦸 (src/utils/shared.js, src/utils/jeuxVideo.js ; selftest lot-2410-soir).
--      Le chemin que la règle donne à 🦸 chez eBay : « Jouets et jeux > Figurines, statues > TV, film, jeux vidéo »
--      (75708), seul requis « Marque » (texte libre) = « VTech », la marque de la fiche.
--   2. l'état : 139973 n'accepte pas 3000 (1000/2750/4000/5000/6000, lu chez eBay le 24/10) → brouillon sans état.
--      Règle : l'extension choisit l'état parmi ceux du rayon (0.6.140, fetch-ebay-aspects v18). Ici, 75708 accepte
--      1000 et 3000 (lu chez eBay le 24/10) : l'état « Bon état » part en 3000 « Occasion » même avec la 0.6.131 du
--      poste.
-- Le job repart (pending, compteur d'essais remis à 0, échéance levée) ; rien d'autre n'est touché. Le brouillon
-- eBay précédent reste consigné (ebay_draft_id) : il déclenche le contrôle anti-doublon par titre avant dépôt.
-- Sauvegarde : _backup_2410_sos_vtech_ebay. Inverse : 20261024_sos_cuisine_vtech_ebay_categorie_INVERSE.sql.
-- Aucun mail, aucune notification.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_sos_vtech_ebay AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_sos_vtech_ebay ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_sos_vtech_ebay FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_sos_vtech_ebay SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = 'a5d7f0c9-0f03-40a6-a308-13222390247f' AND c.status = 'pending';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET error = NULL,
         platform_fields = (c.platform_fields - 'categorie_par_mot' - 'categorie_preuve_aspects' - 'ebay_api_publish'
                              - 'publish_proof' - 'next_action_after' - 'processing_since' - 'needsUserAttempts'
                              - 'categorie_mot_cle_titre')
           || jsonb_build_object(
                'ebayCategoryId', '75708',
                'ebayCategoryPath', jsonb_build_array('Jouets et jeux', 'Figurines, statues', 'TV, film, jeux vidéo'),
                'ebayRequiredAspects', jsonb_build_array('Marque'),
                'ebayAspects', jsonb_build_object('Marque', 'VTech'),
                'categorie_icone', '🦸',
                'categorie_mot_cle_titre', 'switch & go',
                'categorie_source', 'reparation_switch_and_go',
                'categorie_reparee', jsonb_build_object(
                  'le', now(), 'par', 'Claude — 24/10 soir (décision 4 de Nico)',
                  'pose_par', 'scripts/reparations/20261024_sos_cuisine_vtech_ebay_categorie.sql',
                  'avant', jsonb_build_object('ebayCategoryId', c.platform_fields->'ebayCategoryId',
                                              'ebayCategoryPath', c.platform_fields->'ebayCategoryPath',
                                              'ebayAspects', c.platform_fields->'ebayAspects',
                                              'categorie_icone', c.platform_fields->'categorie_icone'),
                  'regle', '« Switch & Go » = gamme de jouets VTech, jamais la console (shared.js, jeuxVideo.js)'))
   WHERE c.id = 'a5d7f0c9-0f03-40a6-a308-13222390247f' AND c.status = 'pending'
     AND c.platform_fields->>'ebayCategoryId' = '139973';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job réparé, obtenu % (job en cours ou déjà changé : rien n''est fait)', n; END IF;
  RAISE NOTICE 'job a5d7f0c9 : catégorie 75708, aspects { Marque : VTech }, repart (pending)';
END $$;
COMMIT;
