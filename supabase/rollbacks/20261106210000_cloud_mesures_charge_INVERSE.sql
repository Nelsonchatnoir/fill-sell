-- INVERSE de supabase/migrations/20261106210000_cloud_mesures_charge.sql (06/11/2026 soir) : les vues, l'écriture et la
-- table des mesures retirées (les mesures déjà écrites sont perdues ; rien d'autre n'en dépend). Arrêter d'abord l'agent
-- de l'hôte (systemctl disable --now fillsell-mesure), sinon il dit « envoi raté » toutes les 5 min.
-- À lancer : npx supabase db query --linked -f <ce fichier>, sur ordre de Nico. Idempotent.
SET lock_timeout = '5s';
DROP VIEW IF EXISTS public.cloud_charge_comptes;
DROP VIEW IF EXISTS public.cloud_charge_heures;
DROP VIEW IF EXISTS public.cloud_jobs_mesures;
DROP FUNCTION IF EXISTS public.cloud_mesure_noter(text, jsonb, jsonb);
DROP TABLE IF EXISTS public.cloud_mesures;
