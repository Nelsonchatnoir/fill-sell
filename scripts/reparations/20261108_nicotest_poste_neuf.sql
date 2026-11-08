-- 08/11/2026 soir — ordre de Nico (urgence Leboncoin) : préparer Nicotest pour qu'un essai Cloud Apple bac à sable crée
-- un poste DE ZÉRO (« aucun poste existant, comme un vrai nouveau client »), afin de prouver en réel la correction de la
-- course d'ouverture (304369a, déployé sur cloud-2 à 19:26).
-- Compte de TEST uniquement : Nicotest 5322fa18-c194-458b-a222-7ee4093c4968 (jamais un client, jamais un compte de relecture).
-- Ce qui change : sa ligne cloud_postes (éteinte depuis le 07/11, profil p-5322fa18-d492cd7149d0) est retirée.
-- Rien d'autre : ni le profil (abonnements, drapeaux), ni le coffre (vide), ni les IP (aucune attribuée).
-- Sauvegarde : public._backup_0811_nicotest_poste. Inverse : 20261108_nicotest_poste_neuf_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0811_nicotest_poste AS
  SELECT p.*, now() AS sauvegarde_le FROM public.cloud_postes p WHERE p.user_id = '5322fa18-c194-458b-a222-7ee4093c4968';
REVOKE ALL ON public._backup_0811_nicotest_poste FROM PUBLIC, anon, authenticated;
ALTER TABLE public._backup_0811_nicotest_poste ENABLE ROW LEVEL SECURITY;
DELETE FROM public.cloud_postes p
 WHERE p.user_id = '5322fa18-c194-458b-a222-7ee4093c4968'
   AND p.etat = 'eteint'
   AND EXISTS (SELECT 1 FROM public._backup_0811_nicotest_poste b WHERE b.user_id = p.user_id);
SELECT (SELECT count(*) FROM public._backup_0811_nicotest_poste) AS sauvegardees,
       (SELECT count(*) FROM public.cloud_postes WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968') AS restantes;
COMMIT;
