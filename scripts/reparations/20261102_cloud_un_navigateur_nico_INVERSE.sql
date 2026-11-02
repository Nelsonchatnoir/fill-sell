-- Inverse de 20261102_cloud_un_navigateur_nico.sql : les deux IP reprennent leur ligne d'avant (sauvegarde
-- _backup_0211_cloud_ip_5), l'échéance prolongée de l'id 39 gardée (la prolongation est payée), et
-- platform_settings.beebs.cloud_isole revient. Orchestrateur ARRÊTÉ, aucune tâche en cours. À lancer avec l'inverse de
-- l'outil 20261102_cloud_beebs_isole_vers_principal_nico.mjs (ligne Beebs du coffre) et le retour du code d'avant.
BEGIN;
UPDATE public.cloud_ips c SET etat = b.etat, user_id = b.user_id, attributions = b.attributions, dernier_user_id = b.dernier_user_id,
       derniere_origine = b.derniere_origine, attribuee_le = b.attribuee_le, rebut_critere = b.rebut_critere, rebut_le = b.rebut_le,
       liberee_le = b.liberee_le, repos_fin = b.repos_fin, reserve_pour = b.reserve_pour, reserve_jusqu_au = b.reserve_jusqu_au,
       maj_le = now()
  FROM public._backup_0211_cloud_ip_5 b WHERE c.id = b.id;
SELECT public.cloud_journal(39, 'retour_meme_compte', NULL, jsonb_build_object('par', 'inverse 02/11 soir'));
SELECT public.platform_settings_fusionner(ARRAY['beebs', 'cloud_isole'], b.cloud_isole, '{}', b.id)
  FROM public._backup_0211_cloud_beebs_isole b WHERE b.cloud_isole IS NOT NULL;
SELECT id, ip, etat, user_id IS NOT NULL AS a_nico FROM public.cloud_ips WHERE id IN (3, 39) ORDER BY id;
COMMIT;
