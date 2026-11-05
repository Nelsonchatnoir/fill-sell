-- INVERSE de 20261105_visites_controle_lbc_servies_devant.sql : l'essai retiré (et le compteur `essais`) revient tel que
-- sauvegardé, seulement pour un compte où le serveur n'a pas posé d'essai depuis (essai absent) et dont la pause n'a pas
-- été levée entre-temps.
BEGIN;
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN SELECT b.* FROM public._backup_0511_visites_controle_lbc b JOIN public.profiles p ON p.id = b.user_id
            WHERE p.platform_settings #> '{leboncoin,blocage_acces,essai}' IS NULL
              AND p.platform_settings #> '{leboncoin,blocage_acces,leve_le}' IS NULL LOOP
    PERFORM public.platform_settings_fusionner(ARRAY['leboncoin', 'blocage_acces'],
      jsonb_strip_nulls(jsonb_build_object('essai', v.blocage -> 'essai', 'essais', v.blocage -> 'essais')), '{}', v.user_id);
  END LOOP;
END $$;
SELECT left(b.user_id::text, 8) AS compte, p.platform_settings #> '{leboncoin,blocage_acces,essai}' AS essai
  FROM public._backup_0511_visites_controle_lbc b JOIN public.profiles p ON p.id = b.user_id;
COMMIT;
