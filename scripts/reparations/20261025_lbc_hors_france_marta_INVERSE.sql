-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261025_lbc_hors_france_marta.sql — remet les jobs Leboncoin de Marta (ac19c8c9) tels qu'ils étaient
-- (statut, erreur, platform_fields) AVANT leur clôture « hors de France », depuis _backup_2510_lbc_hors_france_marta.
-- ⛔ Seulement les jobs que CE script a clos et que rien n'a touchés depuis : toujours 'cancelled', toujours marqués
--    lbc_hors_france par ce script. Un job clos ensuite par get-pending-jobs (par = 'get-pending-jobs') n'est pas
--    concerné : il n'est pas dans la sauvegarde.
-- ⚠️ Rendre ces jobs à la file les fait REPARTIR vers Leboncoin, qui refusera l'adresse (et get-pending-jobs, une
--    fois déployé, les refermera aussitôt tant que l'adresse est hors de France). Aucun mail.
-- Une sauvegarde reprise deux fois (script rejoué) : la plus récente par job fait foi.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (id) * FROM public._backup_2510_lbc_hors_france_marta ORDER BY id, sauvegarde_le DESC) b
   WHERE c.id = b.id
     AND c.user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3'
     AND c.status = 'cancelled'
     AND c.platform_fields->'lbc_hors_france'->>'par' = 'scripts/reparations/20261025_lbc_hors_france_marta.sql';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% job(s) Leboncoin de Marta remis dans leur état d''avant la clôture', n;
END $$;
SELECT c.status, count(*) AS n, count(*) FILTER (WHERE c.platform_fields ? 'lbc_hors_france') AS encore_marques
  FROM public.cross_post_jobs c
 WHERE c.user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3' AND c.platform = 'leboncoin'
 GROUP BY c.status ORDER BY c.status;
COMMIT;
