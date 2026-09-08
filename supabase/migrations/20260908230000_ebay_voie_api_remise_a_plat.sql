-- ═══════════════════════════════════════════════════════════════════════════
-- profiles.ebay_voie_api : REMISE À PLAT — DÉJÀ FAITE EN PROD PAR NICO (08/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ce fichier REFLÈTE la prod, il ne la précède pas.
--
-- CONSTAT (08/09 après-midi) : la colonne était en DEFAULT true et valait true
-- sur 2 177 profils sur 2 178 (posée à la main) — l'app grisait eBay à tout
-- le parc comme si chacun avait relié un compte eBay par OAuth, alors que le
-- drapeau ne doit dire qu'UNE chose : « ce profil a un ebay_accounts non
-- révoqué » (le callback OAuth le pose à true sur preuve GetUser, deconnecter
-- et ebay-account-deletion le remettent à false).
--
-- FAIT EN PROD le 08/09/2026 à 22:40 (Europe/Paris), relevé à 23:55 :
--   · sauvegarde profiles_ebay_voie_api_backup_20260908 (id, ebay_voie_api,
--     sauvegarde_le) : 2 178 lignes, 2 177 à true ; RLS activée, aucun droit
--     anon/authenticated ;
--   · DEFAULT false ;
--   · UPDATE → 7 profils à true, tous avec un compte eBay relié non révoqué,
--     2 172 à false ; 0 profil incohérent dans un sens comme dans l'autre.
--
-- IDEMPOTENT PAR CONSTRUCTION (règle du 08/09 soir : les fichiers sont
-- rejoués sur une base où c'est déjà appliqué) :
--   · la sauvegarde n'est créée que si elle n'existe pas (et n'est jamais
--     écrasée : elle photographie l'état d'AVANT, une seule fois) ;
--   · ENABLE ROW LEVEL SECURITY, REVOKE, SET DEFAULT sont sans effet quand
--     déjà faits ;
--   · l'UPDATE ne touche que les lignes DIFFÉRENTES de la vérité
--     (ebay_accounts non révoqué) : sur une base déjà à plat, 0 ligne
--     réécrite — ni trigger réveillé, ni updated_at déplacé.
-- Aucune donnée perdue : la valeur d'avant reste lisible dans la sauvegarde.

CREATE TABLE IF NOT EXISTS public.profiles_ebay_voie_api_backup_20260908 AS
  SELECT p.id, p.ebay_voie_api, now() AS sauvegarde_le
  FROM public.profiles p;

ALTER TABLE public.profiles_ebay_voie_api_backup_20260908 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profiles_ebay_voie_api_backup_20260908 FROM anon, authenticated;

ALTER TABLE public.profiles ALTER COLUMN ebay_voie_api SET DEFAULT false;

UPDATE public.profiles p
SET ebay_voie_api = EXISTS (
  SELECT 1 FROM public.ebay_accounts a
  WHERE a.user_id = p.id AND a.revoked_at IS NULL
)
WHERE p.ebay_voie_api IS DISTINCT FROM EXISTS (
  SELECT 1 FROM public.ebay_accounts a
  WHERE a.user_id = p.id AND a.revoked_at IS NULL
);
