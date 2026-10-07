-- ════════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE D'UN COMPTE AVANT LA RÉPARATION v3 (08/10/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Tables _backup_0810_v3_* : RLS active, AUCUN accès anon/authenticated. Une
-- ligne par compte et par passage (colonne sauvegarde_le) ; l'inverse relit
-- la plus récente. __USER__ est remplacé par le lanceur.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0810_v3_inventaire (LIKE public.inventaire, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_v3_annonces (LIKE public.annonces_plateforme, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_v3_doublons (LIKE public.inventaire_doublons, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_v3_jobs_ids (user_id uuid, id uuid, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0810_v3_inventaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_v3_annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_v3_doublons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_v3_jobs_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0810_v3_inventaire FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_v3_annonces FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_v3_doublons FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_v3_jobs_ids FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0810_v3_inventaire SELECT i.*, now() FROM public.inventaire i WHERE i.user_id = '__USER__';
INSERT INTO public._backup_0810_v3_annonces SELECT a.*, now() FROM public.annonces_plateforme a WHERE a.user_id = '__USER__';
INSERT INTO public._backup_0810_v3_doublons SELECT d.*, now() FROM public.inventaire_doublons d WHERE d.user_id = '__USER__';
INSERT INTO public._backup_0810_v3_jobs_ids SELECT j.user_id, j.id, now() FROM public.cross_post_jobs j WHERE j.user_id = '__USER__';
SELECT count(*) fiches FROM public._backup_0810_v3_inventaire WHERE user_id = '__USER__';
COMMIT;
