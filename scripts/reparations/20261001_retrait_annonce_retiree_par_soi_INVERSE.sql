-- INVERSE de 20261001_retrait_annonce_retiree_par_soi.sql — sur décision seulement.
-- Remet les retraits clos dans leur état d'avant (sauvegarde), s'ils n'ont pas bougé depuis.
BEGIN;
SET LOCAL lock_timeout = '3s';
UPDATE cross_post_jobs d
   SET status = b.ligne ->> 'status', error = b.ligne ->> 'error', platform_fields = b.ligne -> 'platform_fields'
  FROM public._backup_0110_retraits_declares b
 WHERE d.id = b.job_id AND d.status = 'cancelled' AND d.platform_fields ? 'clos_par_declaration';
COMMIT;
