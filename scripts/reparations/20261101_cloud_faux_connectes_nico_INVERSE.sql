-- INVERSE de 20261101_cloud_faux_connectes_nico.sql : les lignes leboncoin et depop du coffre de Nico reviennent telles
-- quelles (chiffrées, connecte = vrai), les deux connexions Leboncoin de 21:05 redeviennent « connectee ».
-- ⚠️ Les cookies effacés du profil du navigateur ne reviennent PAS du coffre par cet inverse seul : le coffre les
-- réinjecte au prochain démarrage du navigateur (cookiesARestaurer), une fois les lignes revenues.
-- À passer orchestrateur ARRÊTÉ, comme l'aller.
BEGIN;
INSERT INTO public.cloud_coffre (user_id, plateforme, chiffre, iv, cle_version, connecte, maj_le)
SELECT (ligne ->> 'user_id')::uuid, ligne ->> 'plateforme', ligne ->> 'chiffre', ligne ->> 'iv',
       (ligne ->> 'cle_version')::int, (ligne ->> 'connecte')::boolean, (ligne ->> 'maj_le')::timestamptz
  FROM public._backup_0111_cloud_faux_connectes WHERE source = 'cloud_coffre'
ON CONFLICT (user_id, plateforme) DO NOTHING;
UPDATE public.cloud_connexions x SET statut = b.ligne ->> 'statut', raison = b.ligne ->> 'raison'
  FROM public._backup_0111_cloud_faux_connectes b
 WHERE b.source = 'cloud_connexions' AND x.id = (b.ligne ->> 'id')::uuid;
SELECT (SELECT jsonb_agg(jsonb_build_object('plateforme', plateforme, 'connecte', connecte) ORDER BY plateforme)
          FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS coffre;
COMMIT;
