-- ════════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE D'UN COMPTE AVANT LE RATTRAPAGE « REMISE EN LIGNE VINTED » (08/10/2026 soir)
-- ════════════════════════════════════════════════════════════════════════════
-- Lancée par scripts/reparations/20261008_remises_en_ligne_vinted.mjs --appliquer,
-- APRÈS la migration 20261008160000 et le feu vert nommé de Nico. Tables
-- _backup_0810_remise_* : RLS active, AUCUN accès anon/authenticated. Une ligne
-- par compte et par passage (sauvegarde_le) ; l'inverse relit la plus récente.
-- __USER__ est remplacé par le lanceur.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0810_remise_inventaire (LIKE public.inventaire, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_remise_jobs (LIKE public.cross_post_jobs, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_remise_annonces (LIKE public.annonces_plateforme, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_remise_doublons (LIKE public.inventaire_doublons, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0810_remise_inventaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_remise_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_remise_annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_remise_doublons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0810_remise_inventaire FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_remise_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_remise_annonces FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_remise_doublons FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0810_remise_inventaire SELECT i.*, now() FROM public.inventaire i WHERE i.user_id = '__USER__';
INSERT INTO public._backup_0810_remise_jobs SELECT j.*, now() FROM public.cross_post_jobs j WHERE j.user_id = '__USER__' AND j.platform = 'vinted';
INSERT INTO public._backup_0810_remise_annonces SELECT a.*, now() FROM public.annonces_plateforme a WHERE a.user_id = '__USER__';
INSERT INTO public._backup_0810_remise_doublons SELECT d.*, now() FROM public.inventaire_doublons d WHERE d.user_id = '__USER__';
SELECT count(*) fiches FROM public._backup_0810_remise_inventaire WHERE user_id = '__USER__';
COMMIT;
