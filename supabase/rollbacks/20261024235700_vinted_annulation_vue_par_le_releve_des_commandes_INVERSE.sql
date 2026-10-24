-- INVERSE de 20261024235700_vinted_annulation_vue_par_le_releve_des_commandes : la règle retirée (déclencheur et
-- fonctions). Les annulations déjà traitées restent traitées : une vente retirée l'est par vente_commande_annulee_vinted,
-- dont la trace (usage_logs « vente_retiree », la ligne entière ; ventes_supprimees) permet de la rendre par une
-- réparation si besoin — ce n'est pas l'objet de cet inverse.
BEGIN;
DROP TRIGGER IF EXISTS plateforme_commandes_vente_annulee_vinted ON public.plateforme_commandes;
DROP FUNCTION IF EXISTS public.plateforme_commandes_vente_annulee_vinted();
DROP FUNCTION IF EXISTS public.vente_vinted_annulee_par_commande(uuid, text, timestamptz, boolean);
COMMIT;
