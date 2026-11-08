-- 08/11/2026 soir — fin du test serveur de Nicotest (20261108_nicotest_cloud_essai_serveur.sql) : ce que le test a laissé
-- est retiré, Nicotest revient exactement à l'état d'avant (aucun poste, coffre vide, aucune session FillSell de serveur).
--   · la session FillSell fabriquée par le poste du test (« session_fillsell_fabriquee » 7cd335df, 18:49:47 UTC) : révoquée
--     (elle seule : cloud_session_revoquer, la RPC du socle) ;
--   · la ligne cloud_coffre « fillsell » de Nicotest (le coffre du test) et sa ligne cloud_postes (éteinte, compte_inactif).
-- Sauvegarde : public._backup_0811_nicotest_test (poste et coffre, chiffrés tels quels). Les lignes cloud_connexions du test
-- (leboncoin ×2, vinted, beebs, depop, « remplacee »/« navigateur_ferme ») et l'historique de l'IP 2 RESTENT : c'est la trace
-- vraie du test.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0811_nicotest_test AS
  SELECT 'poste'::text AS quoi, to_jsonb(p) AS ligne, now() AS sauvegarde_le FROM public.cloud_postes p
   WHERE p.user_id = '5322fa18-c194-458b-a222-7ee4093c4968'
  UNION ALL
  SELECT 'coffre', to_jsonb(c), now() FROM public.cloud_coffre c WHERE c.user_id = '5322fa18-c194-458b-a222-7ee4093c4968';
REVOKE ALL ON public._backup_0811_nicotest_test FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_0811_nicotest_test ENABLE ROW LEVEL SECURITY;
SELECT public.cloud_session_revoquer('5322fa18-c194-458b-a222-7ee4093c4968', p.session_fillsell_id)
  FROM public.cloud_postes p WHERE p.user_id = '5322fa18-c194-458b-a222-7ee4093c4968' AND p.session_fillsell_id IS NOT NULL;
DELETE FROM public.cloud_coffre WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968';
DELETE FROM public.cloud_postes WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968' AND etat = 'eteint';
SELECT (SELECT count(*) FROM public._backup_0811_nicotest_test) AS sauvegardees,
       (SELECT count(*) FROM public.cloud_postes WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968') AS postes,
       (SELECT count(*) FROM public.cloud_coffre WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968') AS coffre;
COMMIT;
