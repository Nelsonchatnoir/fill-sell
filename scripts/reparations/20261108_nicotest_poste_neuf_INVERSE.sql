-- INVERSE de 20261108_nicotest_poste_neuf.sql : remet la ligne cloud_postes de Nicotest telle que sauvegardée,
-- seulement si aucun poste n'a été recréé entre-temps (sinon : rien, à trancher à la main).
BEGIN;
INSERT INTO public.cloud_postes
  SELECT (b).* FROM (
    SELECT (jsonb_populate_record(NULL::public.cloud_postes, to_jsonb(x) - 'sauvegarde_le')) AS b
      FROM public._backup_0811_nicotest_poste x
  ) s
 WHERE NOT EXISTS (SELECT 1 FROM public.cloud_postes WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968');
SELECT count(*) AS postes_nicotest FROM public.cloud_postes WHERE user_id = '5322fa18-c194-458b-a222-7ee4093c4968';
COMMIT;
