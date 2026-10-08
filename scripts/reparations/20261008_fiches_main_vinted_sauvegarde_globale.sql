-- ════════════════════════════════════════════════════════════════════════════
-- SAUVEGARDE GLOBALE AVANT 20261008150000 ET LE RATTRAPAGE « FICHE À LA MAIN /
-- FICHE VINTED » (08/10/2026 soir) — 31 comptes touchés par le rejeu
-- ════════════════════════════════════════════════════════════════════════════
-- Tables _backup_0810_fiches_main_* : RLS active, AUCUN accès anon/authenticated.
-- · rapprochement_comptes (la migration y ajoute une colonne) : toutes les lignes ;
-- · pour les comptes du rejeu : leurs fiches (hors relevés), leurs questions, et
--   chaque lien qui pointe sur ces fiches (jobs, annonces, ventes, captures…) —
--   ce qu'une fusion déplace (inventaire_defusionner_pour le rend aussi).
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0810_fiches_main_inventaire (LIKE public.inventaire, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_fiches_main_doublons (LIKE public.inventaire_doublons, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_fiches_main_comptes (LIKE public.rapprochement_comptes, sauvegarde_le timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public._backup_0810_fiches_main_liens (table_source text NOT NULL, ligne text NOT NULL, inventaire_id bigint, user_id uuid, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0810_fiches_main_inventaire ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_fiches_main_doublons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_fiches_main_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_0810_fiches_main_liens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0810_fiches_main_inventaire FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_fiches_main_doublons FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_fiches_main_comptes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public._backup_0810_fiches_main_liens FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0810_fiches_main_comptes SELECT c.*, now() FROM public.rapprochement_comptes c;
CREATE TEMP TABLE _u (user_id uuid) ON COMMIT DROP;
INSERT INTO _u VALUES ('0a24c951-4612-455a-aba2-47bb8f05fff1'::uuid),('f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid),('53efea05-dc2d-4467-a8cd-c6fa52a47a61'::uuid),('f8aa02a5-23cb-4325-bba8-127f61a75741'::uuid),('70803863-e2d2-4067-b8cf-98a8e0ad54b0'::uuid),('2390cb15-77c1-4847-a97f-89574b9b1863'::uuid),('f1e0cd59-a404-4128-a289-310355cf7258'::uuid),('fabae8f2-2c28-4a89-9df2-a0f0152aa020'::uuid),('22659b79-2127-414d-a360-da6b5606c9fe'::uuid),('d3c2ace7-f695-4433-a676-396895348303'::uuid),('46709909-9416-445d-9b5d-2c6477559e86'::uuid),('273e3013-616f-42cb-9170-8135ad6d70f8'::uuid),('f9423b85-9b35-4a18-b07f-505c1f22d4b1'::uuid),('efb8dffa-3b77-46e7-b778-06f2e664c8d9'::uuid),('14c1c378-2b8a-4d63-9d20-985c275e7c56'::uuid),('bd380fbf-a120-4647-ab17-6bfdea14bafa'::uuid),('c2adf3be-4f13-47b3-94b2-088b9fbde50f'::uuid),('c9bc91bd-09b3-4bec-888b-c943294429b3'::uuid),('d26a37ad-5dfe-44b3-af09-72f5899a6069'::uuid),('ec8a6da4-2fd3-4150-8f64-67150cad0dc5'::uuid),('f078cf94-7a39-434e-949b-84a3d34738af'::uuid),('001107c2-07be-4149-857c-231a63cde8ba'::uuid),('02ca0f20-a25d-443d-b41d-016c871ed336'::uuid),('1dce181a-6b0f-48ff-8afc-060753e36b55'::uuid),('222b967a-0fd8-4471-860a-7bb8e2c57e30'::uuid),('2eec0ad9-784e-419f-ad00-0df1fbfbb457'::uuid),('35892b98-74d2-47fa-b429-21a65d58140d'::uuid),('4225c547-7312-4ca0-8e07-266b6d8f20dc'::uuid),('44061130-585b-4cf2-b880-29b04a339f87'::uuid),('7373c96c-c0ed-4947-a4c5-ee1b0d2b8d28'::uuid),('9148e867-dfb8-469d-b0d8-9a7d0fd00bee'::uuid);
CREATE TEMP TABLE _f ON COMMIT DROP AS
  SELECT i.id, i.user_id FROM public.inventaire i JOIN _u USING (user_id)
   WHERE i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu') AND COALESCE(i.origine, '') NOT LIKE 'releve\_%';
INSERT INTO public._backup_0810_fiches_main_inventaire SELECT i.*, now() FROM public.inventaire i WHERE i.id IN (SELECT id FROM _f);
INSERT INTO public._backup_0810_fiches_main_doublons SELECT d.*, now() FROM public.inventaire_doublons d JOIN _u USING (user_id);
INSERT INTO public._backup_0810_fiches_main_liens (table_source, ligne, inventaire_id, user_id)
  SELECT 'cross_post_jobs', x.id::text, x.inventaire_id, x.user_id FROM public.cross_post_jobs x WHERE x.inventaire_id IN (SELECT id FROM _f)
  UNION ALL SELECT 'annonces_plateforme', x.id::text, x.inventaire_id, x.user_id FROM public.annonces_plateforme x WHERE x.inventaire_id IN (SELECT id FROM _f)
  UNION ALL SELECT 'ventes', x.id::text, x.inventaire_id, x.user_id FROM public.ventes x WHERE x.inventaire_id IN (SELECT id FROM _f)
  UNION ALL SELECT 'vinted_listing_snapshots', x.id::text, x.inventaire_id, NULL FROM public.vinted_listing_snapshots x WHERE x.inventaire_id IN (SELECT id FROM _f)
  UNION ALL SELECT 'vinted_republish_captures', x.id::text, x.inventaire_id, NULL FROM public.vinted_republish_captures x WHERE x.inventaire_id IN (SELECT id FROM _f)
  UNION ALL SELECT 'push_ventes', x.id::text, x.inventaire_id, x.user_id FROM public.push_ventes x WHERE x.inventaire_id IN (SELECT id FROM _f)
  UNION ALL SELECT 'remises_en_vente', x.id::text, x.inventaire_id, x.user_id FROM public.remises_en_vente x WHERE x.inventaire_id IN (SELECT id FROM _f)
  UNION ALL SELECT 'rapprochements', x.id::text, x.inventaire_id, x.user_id FROM public.rapprochements x WHERE x.inventaire_id IN (SELECT id FROM _f);
SELECT (SELECT count(*) FROM public._backup_0810_fiches_main_inventaire) fiches, (SELECT count(*) FROM public._backup_0810_fiches_main_doublons) questions,
       (SELECT count(*) FROM public._backup_0810_fiches_main_comptes) comptes, (SELECT count(*) FROM public._backup_0810_fiches_main_liens) liens;
COMMIT;
