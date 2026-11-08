-- FIN DE LA PREUVE (inverse de 20261108n_nicotest_preuve_sso.sql) — compte de TEST Nicotest seulement. À lancer APRÈS
-- la fermeture du poste par l'orchestrateur (compte inactif) : l'accès Cloud retiré, le profil remis tel que sauvegardé
-- (référence Apple, canal, cloud_voie, platform_settings), la session du poste de test révoquée, le poste et le coffre
-- de test retirés, et CHAQUE IP touchée pendant la preuve remise EXACTEMENT dans son état sauvegardé.
BEGIN;
-- 1. Plus Cloud (le déclencheur met l'IP au repos ; l'étape 4 la remet comme avant).
UPDATE public.profiles SET is_cloud = false
 WHERE id = '5322fa18-c194-458b-a222-7ee4093c4968' AND is_cloud IS TRUE;
-- 2. Le profil d'avant.
UPDATE public.profiles p
   SET cloud_ref = b.ligne ->> 'cloud_ref', cloud_canal = b.ligne ->> 'cloud_canal',
       cloud_voie = (b.ligne ->> 'cloud_voie')::boolean, platform_settings = b.platform_settings
  FROM public._backup_0811n_nicotest b
 WHERE b.quoi = 'profil' AND p.id = '5322fa18-c194-458b-a222-7ee4093c4968';
-- 3. Le poste et le coffre de TEST retirés (session révoquée d'abord).
SELECT public.cloud_session_revoquer('5322fa18-c194-458b-a222-7ee4093c4968', p.session_fillsell_id)
  FROM public.cloud_postes p WHERE p.user_id = '5322fa18-c194-458b-a222-7ee4093c4968' AND p.session_fillsell_id IS NOT NULL;
DELETE FROM public.cloud_coffre WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968';
DELETE FROM public.cloud_postes WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968' AND etat = 'eteint';
-- 4. Les IP touchées par la preuve (celles de Nicotest, ou rendues/libérées depuis), remises ligne pour ligne.
UPDATE public.cloud_ips i
   SET etat = b.ligne ->> 'etat', user_id = NULLIF(b.ligne ->> 'user_id', '')::uuid,
       attribuee_le = (b.ligne ->> 'attribuee_le')::timestamptz, liberee_le = (b.ligne ->> 'liberee_le')::timestamptz,
       repos_fin = (b.ligne ->> 'repos_fin')::timestamptz, attributions = (b.ligne ->> 'attributions')::int,
       derniere_origine = b.ligne ->> 'derniere_origine', dernier_user_id = NULLIF(b.ligne ->> 'dernier_user_id', '')::uuid,
       reserve_pour = NULLIF(b.ligne ->> 'reserve_pour', '')::uuid, reserve_jusqu_au = (b.ligne ->> 'reserve_jusqu_au')::timestamptz,
       maj_le = now()
  FROM public._backup_0811n_nicotest b
 WHERE b.quoi = 'ip' AND (b.ligne ->> 'id')::bigint = i.id
   AND (i.user_id = '5322fa18-c194-458b-a222-7ee4093c4968' OR i.dernier_user_id = '5322fa18-c194-458b-a222-7ee4093c4968')
   AND (i.etat IS DISTINCT FROM b.ligne ->> 'etat' OR i.user_id IS DISTINCT FROM NULLIF(b.ligne ->> 'user_id', '')::uuid
        OR i.attributions IS DISTINCT FROM (b.ligne ->> 'attributions')::int);
SELECT p.is_cloud, p.cloud_voie, p.cloud_ref IS NOT NULL AS ref_remise, (public.cloud_etat(p.id) ->> 'etat') AS etat,
       (SELECT count(*) FROM public.cloud_ips WHERE user_id = p.id) AS ip_attribuees,
       (SELECT count(*) FROM public.cloud_postes WHERE user_id = p.id) AS postes,
       (SELECT jsonb_agg(jsonb_build_object('id', i.id, 'etat', i.etat, 'repos_fin', i.repos_fin)) FROM public.cloud_ips i WHERE i.id = 2) AS ip2
  FROM public.profiles p WHERE p.id = '5322fa18-c194-458b-a222-7ee4093c4968';
COMMIT;
