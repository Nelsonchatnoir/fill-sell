-- 20261118_ebay_vendeur_renomme_f5fab0e0_INVERSE.sql — remet les 5 lignes ebay_vendeurs_annonces du compte f5fab0e0
-- telles qu'elles étaient AVANT 20261118_ebay_vendeur_renomme_f5fab0e0.sql (sauvegarde
-- public._backup_1811_ebay_vendeur_renomme), SEULEMENT celles qui portent encore le pseudo posé par la réparation
-- (le pseudo de ebay_accounts au moment de la réparation, relu ici) : une ligne réécrite depuis par une autre source n'est pas touchée, et on le dit.
BEGIN;
DO $$
DECLARE
  b record;
  v_actuel text;
  v_pose text := (SELECT a.ebay_user_id FROM public.ebay_accounts a WHERE a.user_id = 'f5fab0e0-253b-4511-b52f-bf249237414d');
BEGIN
  FOR b IN SELECT DISTINCT ON (listing_id) * FROM public._backup_1811_ebay_vendeur_renomme ORDER BY listing_id, sauve_le LOOP
    SELECT vendeur INTO v_actuel FROM public.ebay_vendeurs_annonces WHERE listing_id = b.listing_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE NOTICE 'annonce % : ligne absente — rien fait', b.listing_id;
      CONTINUE;
    END IF;
    IF v_pose IS NULL OR v_actuel IS DISTINCT FROM v_pose THEN
      RAISE NOTICE 'annonce % : porte « % », pas le pseudo de la réparation — rien fait', b.listing_id, v_actuel;
      CONTINUE;
    END IF;
    UPDATE public.ebay_vendeurs_annonces
       SET vendeur = b.vendeur, vendeur_id = b.vendeur_id, source = b.source, vu_le = b.vu_le
     WHERE listing_id = b.listing_id AND vendeur = v_pose;
    RAISE NOTICE 'annonce % remise à son pseudo d''avant (sauvegarde du %)', b.listing_id, b.sauve_le;
  END LOOP;
END $$;
COMMIT;
