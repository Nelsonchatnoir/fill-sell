-- L'IP de test 94.194.94.233 (cloud_ips id 1, commande IPRoyal 84458881) a été
-- mise au REBUT à son contrôle d'entrée le 05/10 à 16:07:58 Paris : Vinted et
-- Leboncoin jugés « bloque » parce que le motif des murs contenait le mot
-- « datadome », présent sur leurs pages OUVERTES (script DataDome). Relu par une
-- lecture de diagnostic par la même IP à 16:2x : « Vinted | Toute la seconde main… »
-- et « leboncoin, site de petites annonces gratuites », menus et « Se connecter »
-- présents, seul indice = la balise du script. Correctif : serveur-cloud/src/
-- controle.js (verdictPage, test « contrôle d'une IP »).
-- La ligne repasse « achetee » : le prochain entretien refait le contrôle
-- d'entrée avec le verdict corrigé (disponible, ou rebut s'il voit un vrai mur).
-- Sauvegarde (relue avant) : etat rebut, rebut_critere controle_entree,
-- rebut_le = liberee_le = 2026-10-05T14:07:58.909305+00, user_id / dernier_user_id
-- NULL, attributions 0. Journal : événements 1 (achat), 2 (controle_entree),
-- 3 (signalement), 4 (rebut) — gardés tels quels.
-- Inverse : 20261005_cloud_ip1_rebut_a_tort_INVERSE.sql.
BEGIN;
UPDATE public.cloud_ips
   SET etat = 'achetee', rebut_critere = NULL, rebut_le = NULL, liberee_le = NULL, maj_le = now()
 WHERE id = 1 AND etat = 'rebut' AND rebut_critere = 'controle_entree' AND user_id IS NULL AND attributions = 0;
SELECT public.cloud_journal(1, 'incident', NULL, jsonb_build_object(
  'raison', 'rebut_a_tort_controle_entree',
  'detail', 'motif des murs : « datadome » présent sur les pages ouvertes de Vinted et Leboncoin ; corrigé (verdictPage)',
  'reparation', 'scripts/reparations/20261005_cloud_ip1_rebut_a_tort.sql'));
SELECT id, host(ip) AS ip, etat, rebut_critere FROM public.cloud_ips WHERE id = 1;
COMMIT;
