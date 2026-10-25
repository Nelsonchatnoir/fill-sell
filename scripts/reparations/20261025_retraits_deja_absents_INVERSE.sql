-- INVERSE de scripts/reparations/20261025_retraits_deja_absents.sql : rend aux retraits clos et aux copies closes leur
-- état d'avant (première sauvegarde de chacun dans _backup_2510_retraits_deja_absents) — SEULEMENT s'ils n'ont pas
-- bougé depuis (statut et platform_fields encore ceux posés par la réparation, relevés juste après elle) ; puis les
-- lignes que les déclencheurs avaient datées (annonces_plateforme : retiree_le / disparu_le / retrait_job_id ;
-- inventaire : disparu_le / vinted_status), si elles portent encore la marque de ce retrait.
-- ⚠️ Les déclencheurs de cross_post_jobs sont suspendus le temps de cette transaction seulement
-- (session_replication_role = replica, SET LOCAL) : remis « pending », un retrait serait sinon rejugé et redirigé
-- (retrait_redirige_annonce_remplacee) au lieu de retrouver son état exact. Seules les colonnes sauvegardées sont
-- réécrites. Aucun mail, aucune notification.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL session_replication_role = replica;
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = b.status, error = b.error, platform_fields = b.platform_fields
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2510_retraits_deja_absents s ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE c.id = b.id AND b.pf_apres IS NOT NULL
     AND c.status = b.status_apres AND c.platform_fields = b.pf_apres;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'jobs rendus à leur état d''avant (retraits et copies) : %', n;

  UPDATE public.annonces_plateforme a
     SET disparu_le = b.disparu_le, retiree_le = b.retiree_le, retrait_job_id = b.retrait_job_id,
         proposition = b.proposition, updated_at = b.updated_at
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2510_retraits_deja_absents_annonces s ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE a.id = b.id AND a.retrait_job_id = b.retrait_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'lignes de relevé rendues : %', n;

  UPDATE public.inventaire i
     SET disparu_le = b.disparu_le, vinted_status = b.vinted_status
    FROM (SELECT DISTINCT ON (s.id) s.* FROM public._backup_2510_retraits_deja_absents_fiches s ORDER BY s.id, s.sauvegarde_le ASC) b
   WHERE i.id = b.id AND i.user_id = b.user_id AND i.vinted_item_id IS NOT DISTINCT FROM b.vinted_item_id
     AND EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.id = b.retrait_id AND c.status IS DISTINCT FROM 'deleted');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'fiches Vinted rendues : %', n;
END $$;
SELECT b.role, left(c.id::text, 8) AS job, c.platform, c.status, left(coalesce(c.error, ''), 60) AS message
  FROM public._backup_2510_retraits_deja_absents b JOIN public.cross_post_jobs c ON c.id = b.id
 ORDER BY b.role DESC, c.platform, c.id;
COMMIT;
