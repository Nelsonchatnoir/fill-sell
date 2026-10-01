-- INVERSE de 20261001_nicolas_menar_ebay_377453677328_detache.sql
-- ⛔ À NE LANCER QUE SUR DÉCISION : remet l'annonce eBay 377453677328 sur la
-- fiche vendue 1790106699473000 (rattachement par titre, non prouvé).
-- Supprime la fiche créée par l'import, son job de suivi, la question posée et
-- la ligne de rapprochement ; restaure les deux jobs et l'annonce depuis la
-- sauvegarde _backup_0110_ebay_377453677328.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $i$
DECLARE v_fiche bigint; v_job uuid;
BEGIN
  SELECT (ligne ->> 'inventaire_id')::bigint, (ligne ->> 'job_id')::uuid INTO v_fiche, v_job
    FROM public._backup_0110_ebay_377453677328 WHERE quoi = 'import';
  IF v_fiche IS NULL THEN RAISE EXCEPTION 'pas d''import sauvegardé : rien à défaire'; END IF;
  -- La personne a déjà tranché la question : on ne défait pas sa décision.
  IF EXISTS (SELECT 1 FROM inventaire_doublons WHERE absorbe = v_fiche AND statut <> 'proposee') THEN
    RAISE EXCEPTION 'question déjà tranchée par la personne : inverse refusé';
  END IF;
  DELETE FROM inventaire_doublons WHERE absorbe = v_fiche AND statut = 'proposee';
  DELETE FROM rapprochements WHERE annonce_id = 'a422a5c9-89db-48c8-8386-10a3f5876be4' AND inventaire_id = v_fiche AND decision = 'import';
  UPDATE annonces_plateforme SET inventaire_id = NULL, job_id = NULL WHERE id = 'a422a5c9-89db-48c8-8386-10a3f5876be4';
  DELETE FROM cross_post_jobs WHERE id = v_job;
  DELETE FROM inventaire WHERE id = v_fiche;
END $i$;

UPDATE cross_post_jobs j SET status = b.ligne ->> 'status', platform_fields = b.ligne -> 'platform_fields'
  FROM public._backup_0110_ebay_377453677328 b
 WHERE b.quoi = 'job_suivi' AND j.id = (b.ligne ->> 'id')::uuid;

UPDATE annonces_plateforme a SET
  inventaire_id = (b.ligne ->> 'inventaire_id')::bigint, job_id = (b.ligne ->> 'job_id')::uuid,
  source_rapprochement = b.ligne ->> 'source_rapprochement',
  retiree_le = (b.ligne ->> 'retiree_le')::timestamptz, retrait_job_id = (b.ligne ->> 'retrait_job_id')::uuid,
  updated_at = now()
  FROM public._backup_0110_ebay_377453677328 b
 WHERE b.quoi = 'annonce' AND a.id = (b.ligne ->> 'id')::uuid;
COMMIT;
