-- INVERSE de 20261101_cloud_lbc_verification_nico.sql : la ligne leboncoin du coffre de Nico redevient celle de 23:35
-- (connectée). À passer orchestrateur ARRÊTÉ, puis retirer le blocage en cours de etat/endurance/blocages.json
-- (debloquee_le), sinon l'orchestrateur la repasse en vérification à son démarrage.
BEGIN;
UPDATE public.cloud_coffre c SET chiffre = b.ligne ->> 'chiffre', iv = b.ligne ->> 'iv', cle_version = (b.ligne ->> 'cle_version')::int,
       connecte = (b.ligne ->> 'connecte')::boolean, maj_le = now()
  FROM public._backup_0111_cloud_lbc_verification b
 WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.plateforme = 'leboncoin';
SELECT plateforme, connecte FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' ORDER BY plateforme;
COMMIT;
