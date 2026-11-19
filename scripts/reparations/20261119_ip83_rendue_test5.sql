-- (19/11/2026 soir) ORDRE DE NICO : « IP 83 (compte nicolas.svobodny+test5) : rends-la. Elle quitte ce compte de test, n'est
-- attribuée à personne d'autre sans le contrôle d'entrée habituel, et n'est PAS renouvelée à son expiration (16/12). Nico
-- garde son IP 42. […] le Cloud de +test5 ne la réclame pas au prochain démarrage. Aucun autre compte touché. »
-- Compte de test 08918381 : essai Cloud Apple en cours (fin 23/11, renouvellement coupé), IP 83 attribuee_essai.
-- CHEMIN NORMAL, rien de libéré à la main : l'essai de ce compte de test est marqué ARRÊTÉ (cloud_essai_arrete = true) ;
-- le déclencheur profiles_cloud_pool → cloud_compte_synchroniser_pool voit « essai_termine, essaiArrete » (pas de grâce)
-- et rend l'IP par cloud_ip_liberer (repos 7 jours, puis purge prouvée, puis stock). Au prochain démarrage, cloud_etat =
-- essai_termine, actif = false : aucune IP n'est réclamée. Garde : si l'IP 83 est encore attribuée après la mise à jour,
-- tout est annulé (aucune libération forcée). L'IP 42 (compte de Nico) et tout autre compte : jamais touchés.
-- Inverse : 20261119_ip83_rendue_test5_INVERSE.sql.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_1911_ip83_test5 AS
  SELECT now() AS le, 'profil'::text AS quoi, to_jsonb(p) - 'platform_settings' - 'extension_sessions' AS ligne
    FROM (SELECT id, cloud_essai_arrete, cloud_essai_debut, cloud_essai_fin, is_cloud FROM public.profiles
           WHERE id = '08918381-0177-4296-bc8c-3a30f14d0f27') p
  UNION ALL
  SELECT now(), 'ip', to_jsonb(i) FROM public.cloud_ips i WHERE i.id IN (83, 42);
ALTER TABLE public._backup_1911_ip83_test5 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_ip83_test5 FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 83 AND user_id = '08918381-0177-4296-bc8c-3a30f14d0f27' AND etat = 'attribuee_essai') THEN
    RAISE EXCEPTION 'IP 83 : plus attribuée à 08918381 en essai (relire)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 42 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') THEN
    RAISE EXCEPTION 'IP 42 : plus au compte de Nico (relire)';
  END IF;
END $$;
UPDATE public.profiles SET cloud_essai_arrete = true
 WHERE id = '08918381-0177-4296-bc8c-3a30f14d0f27' AND cloud_essai_arrete IS NOT TRUE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 83 AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'IP 83 encore attribuée après l''arrêt de l''essai : rien n''est forcé, tout est annulé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 42 AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND etat = 'attribuee_client') THEN
    RAISE EXCEPTION 'IP 42 touchée : tout est annulé';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cloud_ips WHERE user_id = '08918381-0177-4296-bc8c-3a30f14d0f27') THEN
    RAISE EXCEPTION 'le compte de test a repris une IP : tout est annulé';
  END IF;
END $$;
SELECT id, etat, user_id, dernier_user_id, liberee_le, repos_fin, expire_le FROM public.cloud_ips WHERE id IN (83, 42) ORDER BY id;
SELECT public.cloud_etat('08918381-0177-4296-bc8c-3a30f14d0f27'::uuid) ->> 'etat' AS etat_test5,
       public.cloud_etat('08918381-0177-4296-bc8c-3a30f14d0f27'::uuid) ->> 'actif' AS actif_test5;
COMMIT;
