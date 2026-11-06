-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS (Amiral) — LA SÉRIE REPREND AVEC LE CORRECTIF DE LA MARQUE (06/11 ~21:20, décision de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cause confirmée par l'essai de Louis (3303702852 acceptée quand il a retiré SEUL la marque « SEB ») : ses rangements
-- sont COMPATIBLES avec la yaourtière SEB Multidélices. Les remises « SEB » ne repartent qu'avec l'extension 0.6.176
-- (le pré-rempli « SEB » de Leboncoin n'y est plus gardé ; la 0.6.175 le garde quoi que le serveur envoie) : la série les
-- marque `exige_version` 0.6.176 (propre à cette série, jamais une retenue générale). Le serveur (get-pending-jobs v345)
-- enlève déjà la marque de compatibilité du job lui-même.
-- Nouvel ordre : la 1 reste (3303702852, publiée, attend d'être vue en ligne) ; puis les 6 rangements/adaptateurs SEB ;
-- puis les 2 inserts Zombicide (« Sans marque » déjà ce matin, refusés quand même : cause non expliquée par la marque,
-- en dernier pour ne pas arrêter la série avant les remises dont la cause est connue).
-- Texte, photos, prix : inchangés. Inverse : 20261106_louis_serie_marque_seb_INVERSE.sql.

CREATE TABLE IF NOT EXISTS public._backup_0611_louis_serie_marque AS
  SELECT id, status, platform_fields, now() AS sauve_le FROM public.cross_post_jobs WHERE false;
ALTER TABLE public._backup_0611_louis_serie_marque ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_louis_serie_marque FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0611_louis_serie_marque (id, status, platform_fields, sauve_le)
SELECT j.id, j.status, j.platform_fields, now()
  FROM public.cross_post_jobs j
 WHERE j.platform_fields #>> '{serie_un_par_un,serie}' = 'louis-remises-lbc-0611' AND j.status = 'pending'
   AND NOT EXISTS (SELECT 1 FROM public._backup_0611_louis_serie_marque b WHERE b.id = j.id);

UPDATE public.cross_post_jobs j
   SET platform_fields = jsonb_set(j.platform_fields, '{serie_un_par_un}',
         (j.platform_fields -> 'serie_un_par_un') || jsonb_build_object('rang', r.rang, 'reordonnee_le', now(),
           'reordonnee_par', 'réparation 06/11 ~21:20 (Nico : marque SEB retirée, série reprise)')
         || CASE WHEN r.exige THEN jsonb_build_object('exige_version', '0.6.176') ELSE '{}'::jsonb END)
  FROM (VALUES ('fdda158a-3bcf-4ac6-9695-8615379a035c'::uuid, 2, true), ('9e3f4b0a-1f5e-4dcc-9506-56f3d0763f6a'::uuid, 3, true),
               ('6e6cd97d-1156-4d68-b951-fcb5897439d9'::uuid, 4, true), ('cc247496-7952-4b5a-b2e9-52c7e4071482'::uuid, 5, true),
               ('886605bf-8aaa-42d2-98ed-75b56756a5ae'::uuid, 6, true), ('951cc7fc-5fb1-4698-9895-6664ece9c21d'::uuid, 7, true),
               ('1089e37e-f97d-432c-a8e3-e61283c74527'::uuid, 8, false), ('7ef7d84f-9101-41c8-bcf1-481aaa70b276'::uuid, 9, false))
       AS r(id, rang, exige)
 WHERE j.id = r.id AND j.status = 'pending'
   AND j.platform_fields #>> '{serie_un_par_un,serie}' = 'louis-remises-lbc-0611';

SELECT (j.platform_fields #>> '{serie_un_par_un,rang}')::int AS rang, j.status,
       j.platform_fields #>> '{serie_un_par_un,exige_version}' AS exige, left(j.title, 45) AS titre
  FROM public.cross_post_jobs j
 WHERE j.platform_fields #>> '{serie_un_par_un,serie}' = 'louis-remises-lbc-0611'
 ORDER BY 1;
