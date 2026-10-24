-- INVERSE de 20261025_ventes_en_double.sql : remet les lignes `ventes` retirées, telles quelles (même id).
BEGIN;
SET LOCAL statement_timeout = '60s';
-- Les déclencheurs d'insertion de ventes (push de vente, garde d'annonce, retraits) ne doivent PAS rejouer : remise
-- d'une ligne existante, pas une vente neuve.
SET LOCAL session_replication_role = replica;
INSERT INTO public.ventes
SELECT (jsonb_populate_record(NULL::public.ventes, to_jsonb(b) - 'sauvegarde_le' - 'id_garde')).*
  FROM public._backup_2510_ventes_doublons b
 WHERE NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = b.id);
SELECT count(*) AS remises FROM public.ventes v WHERE v.id IN (SELECT id FROM public._backup_2510_ventes_doublons);
COMMIT;
