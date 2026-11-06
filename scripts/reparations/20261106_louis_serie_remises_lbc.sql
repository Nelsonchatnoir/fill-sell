-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS (Amiral) — LES REMISES EN VENTE LEBONCOIN REPARTENT UNE PAR UNE (06/11 soir, décision de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle A retirée (get-pending-jobs) : sans ce marqueur, les 9 remises en attente partiraient ensemble au prochain
-- passage de son extension — exactement la rafale que Leboncoin a bloquée le matin. Ce script pose la série
-- (_shared/serie-un-par-un.js) : une à la fois, chacune vue en ligne avant la suivante, 60 min au moins entre deux
-- dépôts, arrêt au premier refus. Rien d'autre n'est touché (ni texte, ni photos, ni prix, ni statut).
-- À appliquer AVANT le déploiement de get-pending-jobs sans règle A (la règle A les retient encore d'ici là).
-- Lecture du 06/11 19:40 : les 7 dépôts refusés du matin (3303252818 … 3303254205) n'ont jamais été vus par un relevé
-- (relevé complet de son poste à 19:09 : 399/399, aucun des 7) → aucun doublon possible.
-- Ordre : celui des dépôts refusés du matin (07:22 → 07:29), puis les 2 remises nées à 19:20.
-- Inverse : 20261106_louis_serie_remises_lbc_INVERSE.sql (⚠ sans règle A, retirer la série relâche tout d'un coup).

CREATE TABLE IF NOT EXISTS public._backup_0611_louis_serie_remises AS
  SELECT id, status, platform_fields, now() AS sauve_le FROM public.cross_post_jobs WHERE false;
ALTER TABLE public._backup_0611_louis_serie_remises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_louis_serie_remises FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0611_louis_serie_remises (id, status, platform_fields, sauve_le)
SELECT j.id, j.status, j.platform_fields, now()
  FROM public.cross_post_jobs j
 WHERE j.id IN ('18af38a2-8b0d-4c93-b86e-db04086bf1d5', '1089e37e-f97d-432c-a8e3-e61283c74527',
                'fdda158a-3bcf-4ac6-9695-8615379a035c', '9e3f4b0a-1f5e-4dcc-9506-56f3d0763f6a',
                '7ef7d84f-9101-41c8-bcf1-481aaa70b276', '6e6cd97d-1156-4d68-b951-fcb5897439d9',
                'cc247496-7952-4b5a-b2e9-52c7e4071482', '886605bf-8aaa-42d2-98ed-75b56756a5ae',
                '951cc7fc-5fb1-4698-9895-6664ece9c21d')
   AND NOT EXISTS (SELECT 1 FROM public._backup_0611_louis_serie_remises b WHERE b.id = j.id);

UPDATE public.cross_post_jobs j
   SET platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object('serie_un_par_un', jsonb_build_object(
         'serie', 'louis-remises-lbc-0611', 'rang', r.rang, 'intervalle_min', 60, 'le', now(),
         'pose_par', 'réparation 06/11 soir (Nico : règle A retirée, remises de Louis une par une)'))
  FROM (VALUES ('18af38a2-8b0d-4c93-b86e-db04086bf1d5'::uuid, 1), ('1089e37e-f97d-432c-a8e3-e61283c74527'::uuid, 2),
               ('fdda158a-3bcf-4ac6-9695-8615379a035c'::uuid, 3), ('9e3f4b0a-1f5e-4dcc-9506-56f3d0763f6a'::uuid, 4),
               ('7ef7d84f-9101-41c8-bcf1-481aaa70b276'::uuid, 5), ('6e6cd97d-1156-4d68-b951-fcb5897439d9'::uuid, 6),
               ('cc247496-7952-4b5a-b2e9-52c7e4071482'::uuid, 7), ('886605bf-8aaa-42d2-98ed-75b56756a5ae'::uuid, 8),
               ('951cc7fc-5fb1-4698-9895-6664ece9c21d'::uuid, 9)) AS r(id, rang)
 WHERE j.id = r.id
   AND j.user_id = (SELECT id FROM auth.users WHERE email = 'louis@ttfamily.fr')
   AND j.platform = 'leboncoin' AND j.action = 'publish' AND j.status = 'pending'
   AND j.platform_fields ? 'remise_en_vente'
   AND NOT (j.platform_fields ? 'serie_un_par_un');

SELECT j.id, j.status, j.platform_fields #>> '{serie_un_par_un,rang}' AS rang, left(j.title, 40) AS titre
  FROM public.cross_post_jobs j
 WHERE j.platform_fields #>> '{serie_un_par_un,serie}' = 'louis-remises-lbc-0611'
 ORDER BY (j.platform_fields #>> '{serie_un_par_un,rang}')::int;
