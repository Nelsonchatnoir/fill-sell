-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — LE DRAPEAU PAR COMPTE (01/11/2026, demande de Nico : « comme ebay_voie_api »)
--
-- profiles.cloud_voie boolean NOT NULL DEFAULT false.
--   · true  = le Cloud exécute les tâches du compte sur Vinted, Leboncoin, Beebs et Depop (publications,
--             republications, retraits) ; l'ordinateur du compte n'en reçoit plus aucune (get-pending-jobs).
--             Une plateforme pas, ou plus, connectée au Cloud attend la reconnexion : aucun poste ne la prend.
--   · false = tout le parc : rien ne change.
-- Posé par un script de réparation (scripts/reparations/), jamais par le client : les GRANT UPDATE de profiles sont
-- par colonne et celle-ci n'y est pas (REVOKE redit par prudence). Lisible par le client (SELECT de profiles).
--
-- Inverse : supabase/rollbacks/20261101180000_cloud_voie_drapeau_INVERSE.sql (APRÈS le retour de get-pending-jobs).
-- Idempotente. db push INTERDIT.
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cloud_voie boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.cloud_voie IS
  'Drapeau Cloud par compte (01/11/2026) : true = le Cloud exécute les tâches Vinted, Leboncoin, Beebs, Depop du compte et l''ordinateur n''en reçoit plus (get-pending-jobs). Posé par script, jamais par le client.';

REVOKE UPDATE (cloud_voie) ON public.profiles FROM anon, authenticated;
