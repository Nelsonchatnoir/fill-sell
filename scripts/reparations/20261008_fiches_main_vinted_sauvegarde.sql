-- ════════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE D'UN COMPTE AVANT LE RATTRAPAGE « FICHE À LA MAIN / FICHE VINTED »
-- (08/10/2026 soir) — lancée par 20261008_fiches_main_vinted.mjs --appliquer
-- ════════════════════════════════════════════════════════════════════════════
-- Tables _backup_0810_fiches_main_* : RLS active, AUCUN accès anon/authenticated.
-- Une ligne par compte et par passage (sauvegarde_le) ; l'inverse relit la plus
-- récente. __USER__ est remplacé par le lanceur.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0810_fiches_main_inventaire (LIKE public.inventaire, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_fiches_main_doublons (LIKE public.inventaire_doublons, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0810_fiches_main_inventaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_fiches_main_doublons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0810_fiches_main_inventaire FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_fiches_main_doublons FROM PUBLIC, anon, authenticated;

-- les fiches à la main et les fiches Vinted du compte (les seules que la règle touche)
INSERT INTO public._backup_0810_fiches_main_inventaire
SELECT i.*, now() FROM public.inventaire i
 WHERE i.user_id = '__USER__' AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
   AND COALESCE(i.origine, '') NOT LIKE 'releve\_%';
INSERT INTO public._backup_0810_fiches_main_doublons SELECT d.*, now() FROM public.inventaire_doublons d WHERE d.user_id = '__USER__';
SELECT count(*) fiches FROM public._backup_0810_fiches_main_inventaire WHERE user_id = '__USER__';
COMMIT;
