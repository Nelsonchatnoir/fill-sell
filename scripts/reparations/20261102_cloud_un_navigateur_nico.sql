-- (02/11 soir, décision de Nico : « un Cloud PROPRE, comme l'aurait un nouvel utilisateur — UN navigateur, UNE IP »)
-- Le navigateur PRINCIPAL du compte de Nico passe sur 176.103.182.215 (pool id 39, IPRoyal 87284262), l'IP où la session
-- Beebs est née (essai « langues » du 02/11 14:37) — prolongée à 30 jours le 02/11 à 15:55 (4 $, échéance IPRoyal
-- 03/12/2026 13:09:55 UTC). 81.181.239.136 (id 3) est GRILLÉE pour Beebs : mise au rebut (plus jamais attribuée par le
-- pool), gardée payée en secours jusqu'au 29/11, sans être utilisée. L'app ne dit plus « navigateur réservé » :
-- platform_settings.beebs.cloud_isole part (Beebs revient au coffre du principal, outil
-- 20261102_cloud_beebs_isole_vers_principal_nico.mjs). Orchestrateur ARRÊTÉ pendant la bascule, aucune tâche en cours
-- (relu). Inverse : 20261102_cloud_un_navigateur_nico_INVERSE.sql.
BEGIN;
CREATE TABLE public._backup_0211_cloud_ip_5 AS SELECT * FROM public.cloud_ips WHERE id IN (3, 39);
ALTER TABLE public._backup_0211_cloud_ip_5 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0211_cloud_ip_5 FROM PUBLIC, anon, authenticated;
CREATE TABLE public._backup_0211_cloud_beebs_isole AS
  SELECT id, platform_settings -> 'beebs' -> 'cloud_isole' AS cloud_isole FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
ALTER TABLE public._backup_0211_cloud_beebs_isole ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0211_cloud_beebs_isole FROM PUBLIC, anon, authenticated;
-- 1. L'échéance de la prolongation (lue chez IPRoyal), par la fonction du pool.
SELECT public.cloud_ip_renouvelee(39, '2026-12-03 13:09:55+00');
-- 2. 81.181.239.136 : au rebut (grillée pour Beebs), rendue par le compte.
UPDATE public.cloud_ips SET etat = 'rebut', rebut_critere = 'blocage_anti_robot', rebut_le = now(), user_id = NULL, liberee_le = now(), maj_le = now()
 WHERE id = 3 AND etat = 'attribuee_client' AND user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
SELECT public.cloud_journal(3, 'rebut', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
  jsonb_build_object('critere', 'blocage_anti_robot', 'plateforme', 'beebs', 'secours_jusqu_au', '2026-11-29', 'par', 'réparation 02/11 soir (décision de Nico)'));
-- 3. 176.103.182.215 : l'IP du compte (« client »).
UPDATE public.cloud_ips SET etat = 'attribuee_client', user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', attributions = attributions + 1,
       dernier_user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18', derniere_origine = 'client', attribuee_le = now(),
       reserve_pour = NULL, reserve_jusqu_au = NULL, liberee_le = NULL, repos_fin = NULL, maj_le = now()
 WHERE id = 39 AND etat = 'disponible' AND user_id IS NULL;
SELECT public.cloud_journal(39, 'attribution', 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid,
  jsonb_build_object('nature', 'client', 'par', 'réparation 02/11 soir (un navigateur, une IP — décision de Nico)'));
-- 4. Plus de « navigateur réservé » dans l'app.
SELECT public.platform_settings_fusionner(ARRAY['beebs'], NULL, ARRAY['cloud_isole'], 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) IS NOT NULL AS fusionne;
SELECT id, ip, etat, user_id IS NOT NULL AS a_nico, expire_le FROM public.cloud_ips WHERE id IN (3, 39) ORDER BY id;
SELECT platform_settings -> 'beebs' ? 'cloud_isole' AS isole_reste FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
