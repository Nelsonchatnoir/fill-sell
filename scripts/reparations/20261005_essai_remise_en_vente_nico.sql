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
