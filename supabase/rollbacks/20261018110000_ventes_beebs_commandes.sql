-- Inverse de supabase/migrations/20261018110000_ventes_beebs_commandes.sql (ventes Beebs par la page des ventes, lot 4).
-- Effet : la porte d'entrée disparaît (l'extension qui l'appelle reçoit une erreur « fonction inconnue » et n'en tire
-- rien : aucune vente n'est décidée sans elle) ; l'interrupteur est retiré. Éteindre suffit à tout arrêter sans rien
-- supprimer :  update coin_config set value = 0 where key = 'ventes_beebs_commandes';
-- Ce qui a été écrit pendant que l'interrupteur valait 1 (preuves sale_evidence source 'commande_beebs', ventes
-- enregistrées par ventes_prouvees_tick, retraits de copies) n'est PAS défait par ce fichier : une vente prouvée se
-- retire par le circuit des ventes, jamais en masse ici. Les bilans usage_logs « ventes_beebs_commandes » restent.
-- Application :
--   npx supabase db query --linked -f supabase/rollbacks/20261018110000_ventes_beebs_commandes.sql
--   npx supabase migration repair --linked --status reverted 20261018110000
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS public.commandes_beebs_noter(jsonb, uuid, jsonb);
DROP FUNCTION IF EXISTS public.beebs_commande_classe(text);
DELETE FROM public.coin_config WHERE key = 'ventes_beebs_commandes';
COMMIT;
