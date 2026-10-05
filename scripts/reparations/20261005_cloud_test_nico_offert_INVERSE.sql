-- Inverse de 20261005_cloud_test_nico_offert.sql : Nico repasse SANS option,
-- colonnes Cloud remises exactement comme avant le test (toutes nulles). Le
-- déclencheur libère son IP (repos 7 jours ; s'il revient pendant le repos, il
-- reprend SA propre IP), l'orchestrateur purge et dépose sa preuve
-- (cloud_ip_noter_purge). Révoquer ensuite toute session fabriquée par
-- l'orchestrateur (cloud_session_revoquer) — test-complet.md § 6.
BEGIN;
UPDATE public.profiles
   SET is_cloud = NULL, cloud_canal = NULL
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   AND cloud_canal = 'offert';
SELECT is_cloud, cloud_canal, public.cloud_etat(id) ->> 'etat' AS etat,
       (SELECT etat FROM public.cloud_ips WHERE dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' OR user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' LIMIT 1) AS ip
  FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
