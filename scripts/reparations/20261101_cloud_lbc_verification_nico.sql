-- (01/11, 23:35) SAUVEGARDE avant le redémarrage de l'orchestrateur 810419b : au démarrage, l'arrêt de 22:57 (glissière
-- DataDome Leboncoin dans l'onglet de travail) devient le blocage de Leboncoin SEUL, et l'orchestrateur passe la ligne
-- leboncoin du coffre de Nico « en vérification » (connecte = faux, session gardée chiffrée, cause notée). Ce script ne
-- change RIEN : il garde la ligne telle qu'elle est (connectée, vérifiée à 22:53:35) pour l'inverse.
-- Inverse : 20261101_cloud_lbc_verification_nico_INVERSE.sql (orchestrateur ARRÊTÉ).
BEGIN;
CREATE TABLE public._backup_0111_cloud_lbc_verification AS
  SELECT now() AS le, to_jsonb(c.*) AS ligne FROM public.cloud_coffre c
   WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.plateforme = 'leboncoin';
ALTER TABLE public._backup_0111_cloud_lbc_verification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0111_cloud_lbc_verification FROM PUBLIC, anon, authenticated;
SELECT count(*) AS sauvegardees, bool_and((ligne ->> 'connecte')::boolean) AS connectee FROM public._backup_0111_cloud_lbc_verification;
COMMIT;
