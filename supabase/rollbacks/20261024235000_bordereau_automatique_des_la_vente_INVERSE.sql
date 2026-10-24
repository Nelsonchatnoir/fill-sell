-- INVERSE de 20261024235000_bordereau_automatique_des_la_vente : le déclencheur, ses deux fonctions et les deux clés
-- d'interrupteur sortent. Les demandes automatiques déjà créées restent (choix.auto = true) : rien d'autre ne les crée.
BEGIN;
DROP TRIGGER IF EXISTS plateforme_commandes_bordereau_auto ON public.plateforme_commandes;
DROP FUNCTION IF EXISTS public.plateforme_commandes_bordereau_auto();
DROP FUNCTION IF EXISTS public.bordereau_auto_pour_commande(uuid);
DELETE FROM public.coin_config WHERE key IN ('bordereaux_auto', 'bordereaux_auto_depuis');
COMMIT;
