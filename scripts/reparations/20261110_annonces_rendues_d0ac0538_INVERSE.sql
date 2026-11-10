-- INVERSE de 20261110_annonces_rendues_d0ac0538.sql : les 6 lignes reprennent leur feature et leurs métadonnées
-- d'origine (le décompte de la cliente redevient celui d'avant la réparation).
BEGIN;
DO $ecrit$ DECLARE n int; BEGIN
  UPDATE public.usage_logs u SET feature = b.feature, metadata = b.metadata
    FROM public._backup_1011_annonces_rendues_d0ac0538 b
   WHERE u.id = b.id AND u.feature = 'generate_listing_rendue';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'attendu 6 lignes, % trouvées : rien n''est écrit', n; END IF;
END $ecrit$;
DROP TABLE public._backup_1011_annonces_rendues_d0ac0538;
COMMIT;
