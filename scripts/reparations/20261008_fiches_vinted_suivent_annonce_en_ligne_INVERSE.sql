-- INVERSE de 20261008_fiches_vinted_suivent_annonce_en_ligne.sql (08/10/2026)
-- Remet l'annonce portée d'avant. Le déclencheur inventaire_vinted_suit_annonce_en_ligne
-- refuserait le recul vers une annonce vendue : il est suspendu le temps de la remise.
BEGIN;
ALTER TABLE public.inventaire DISABLE TRIGGER inventaire_vinted_suit_annonce_en_ligne;
UPDATE public.inventaire i SET vinted_item_id = b.vinted_item_id, vinted_status = b.vinted_status, disparu_le = b.disparu_le,
       vinted_view_count = b.vinted_view_count, vinted_favourite_count = b.vinted_favourite_count, listed_at_guess = b.listed_at_guess
  FROM public._backup_0810_fiches_vinted b WHERE b.id = i.id AND i.vinted_item_id = b.nouvel_id;
ALTER TABLE public.inventaire ENABLE TRIGGER inventaire_vinted_suit_annonce_en_ligne;
SELECT count(*) remises FROM public._backup_0810_fiches_vinted;
COMMIT;
