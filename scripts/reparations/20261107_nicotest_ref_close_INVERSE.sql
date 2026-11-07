-- INVERSE de scripts/reparations/20261107_nicotest_ref_close.sql : la référence Apple 2000001262935799 de Nicotest
-- redevient ouverte (un renouvellement bac à sable rallumerait de nouveau son Cloud, comme avant le 07/11).
DELETE FROM public.cloud_refs_closes
 WHERE ref = '2000001262935799' AND user_id = '5322fa18-c194-458b-a222-7ee4093c4968'
RETURNING ref, canal, user_id, raison, close_le AT TIME ZONE 'Europe/Paris' AS close_le_paris, par;
