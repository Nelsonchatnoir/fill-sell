-- SAUVEGARDE avant la migration 20261111230000_essai_cloud_seul_droits_pro (11/11/2026, offres Cloud, décision 1 de Nico :
-- « un essai du Cloud seul en cours sur un compte gratuit = droits Pro jusqu'à la fin de l'essai »).
-- La migration n'écrit AUCUNE ligne : elle réécrit quatre fonctions (palier_de, quotas_etat, spend_coins_for_generate,
-- spend_coins_for_lens). Ce qui est sauvegardé : (1) leurs quatre définitions de prod, empreinte et droits, juste avant ;
-- (2) l'état des comptes que la règle touche aujourd'hui (d607ba20, d0ac0538, b695d990 : désignés par leur id8, lus par
-- la clé primaire), pour comparer après. Rien d'autre.
-- ⛔ Garde : si une des quatre fonctions a changé en prod depuis la lecture du 11/11/2026 vers 22:53 (md5 ci-dessous),
--    RIEN n'est écrit et la migration ne doit PAS être appliquée (elle est faite depuis ces définitions-là).
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261111_essai_cloud_droits_pro_SAUVEGARDE.sql
-- Retour : supabase/rollbacks/20261111230000_essai_cloud_seul_droits_pro_INVERSE.sql (les mêmes quatre définitions).
DO $garde$
DECLARE v text;
BEGIN
  SELECT string_agg(p.proname || '=' || md5(pg_get_functiondef(p.oid)), ' ' ORDER BY p.proname) INTO v
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('palier_de', 'quotas_etat', 'spend_coins_for_generate', 'spend_coins_for_lens');
  IF v IS DISTINCT FROM 'palier_de=52173f13c0f202187d593c90ad645cb6 quotas_etat=8c18278821e7884d00b0faaba5d65f2d '
                     || 'spend_coins_for_generate=00d31c6c22b7b028ead28bfb1f5ee03d spend_coins_for_lens=f20a612820a4c8a6f6230ddcd2d66653' THEN
    RAISE EXCEPTION 'une des quatre fonctions a changé en prod depuis le 11/11 22:53 (%) : rien n''est écrit, NE PAS appliquer la migration', v;
  END IF;
END $garde$;

CREATE TABLE public._backup_1111_essai_cloud_droits_pro_fonctions AS
SELECT now() AS le, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl::text AS droits
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('palier_de', 'quotas_etat', 'spend_coins_for_generate', 'spend_coins_for_lens');
ALTER TABLE public._backup_1111_essai_cloud_droits_pro_fonctions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1111_essai_cloud_droits_pro_fonctions FROM PUBLIC, anon, authenticated;

CREATE TABLE public._backup_1111_essai_cloud_droits_pro_comptes AS
SELECT now() AS le, c.id8, p.id, public.palier_de(p.id) AS palier_avant,
       p.is_premium, p.is_pro, p.is_business, p.is_comped, p.is_cloud, p.cloud_canal, p.cloud_ref,
       p.cloud_essai_debut, p.cloud_essai_fin, p.cloud_essai_arrete, p.cloud_periode_fin, p.cloud_voie
  FROM (VALUES ('d607ba20'), ('d0ac0538'), ('b695d990')) AS c(id8)
  JOIN LATERAL (SELECT * FROM public.profiles pp
                 WHERE pp.id >= (c.id8 || '-0000-0000-0000-000000000000')::uuid
                   AND pp.id <= (c.id8 || '-ffff-ffff-ffff-ffffffffffff')::uuid LIMIT 2) p ON true;
ALTER TABLE public._backup_1111_essai_cloud_droits_pro_comptes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1111_essai_cloud_droits_pro_comptes FROM PUBLIC, anon, authenticated;

SELECT 'fonctions' AS quoi, count(*) AS n, string_agg(nom || '=' || md5, ' ' ORDER BY nom) AS detail
  FROM public._backup_1111_essai_cloud_droits_pro_fonctions
UNION ALL
SELECT 'comptes', count(*), string_agg(id8 || ':' || palier_avant || ':fin ' || to_char(cloud_essai_fin AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'), ' ' ORDER BY id8)
  FROM public._backup_1111_essai_cloud_droits_pro_comptes;
-- Attendu : fonctions 4 (les md5 de la garde) ; comptes 3, palier_avant free, fins 15/11 15:16, 17/11 11:46, 17/11 11:52.
