-- INVERSE de scripts/reparations/20261025_published_marqueurs_residuels.sql : rend à chaque tâche publiée ses
-- platform_fields d'avant (sauvegarde _backup_2510_published_marqueurs) — SEULEMENT si la ligne n'a pas bougé depuis
-- la réparation (platform_fields encore exactement ceux relevés juste après elle, statut encore published). Une
-- tâche touchée depuis (veille, vente, retrait) garde son état : elle se répare à la main, jamais à l'aveugle.
-- Seule la colonne platform_fields est réécrite ; fillsell.restauration écarte les déclencheurs qui le lisent.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('fillsell.restauration', 'on', true);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2510_published_marqueurs s ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE c.id = b.id AND b.pf_apres IS NOT NULL
     AND c.status = 'published' AND c.platform_fields = b.pf_apres;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'tâches rendues à leurs platform_fields d''avant : %', n;
END $$;
SELECT count(*) AS sauvegardees,
       count(*) FILTER (WHERE c.platform_fields = b.platform_fields) AS rendues,
       count(*) FILTER (WHERE c.platform_fields ? 'attente_close_par_reparation') AS encore_reparees_a_voir
  FROM public._backup_2510_published_marqueurs b JOIN public.cross_post_jobs c ON c.id = b.id;
COMMIT;
