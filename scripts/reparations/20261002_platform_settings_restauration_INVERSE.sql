-- INVERSE de 20261002_platform_settings_restauration.sql (02/10/2026)
-- Retire UNIQUEMENT les clés que la restauration a posées, et seulement si
-- leur valeur n'a pas bougé depuis (une adresse retouchée par la personne
-- n'est jamais retirée). Passe par platform_settings_fusionner : la
-- suppression est demandée explicitement, la garde la laisse passer.
-- La table _backup_0210_platform_settings_restauration est conservée.

BEGIN;

DO $i$
DECLARE
  b   record;
  k   text;
BEGIN
  FOR b IN SELECT * FROM _backup_0210_platform_settings_restauration LOOP
    FOREACH k IN ARRAY b.cles_restaurees LOOP
      IF (SELECT platform_settings -> k FROM profiles WHERE id = b.user_id) = (b.valeurs_restaurees -> k)
         AND NOT (b.platform_settings_avant ? k) THEN
        PERFORM platform_settings_fusionner('{}', NULL, ARRAY[k], b.user_id);
        RAISE NOTICE 'retirée : % → %', b.email, k;
      ELSE
        RAISE NOTICE 'laissée (modifiée depuis ou présente avant) : % → %', b.email, k;
      END IF;
    END LOOP;
  END LOOP;
END
$i$;

SELECT b.email, (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p.platform_settings) k) AS cles_apres_inverse
FROM _backup_0210_platform_settings_restauration b JOIN profiles p ON p.id = b.user_id
ORDER BY b.email;

COMMIT;
