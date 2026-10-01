-- INVERSE de 20261001_beebs_93_questions_photo_numeros.sql — sur décision seulement.
-- Remet la question « Est-ce cette annonce ? » sur les dépôts dont le numéro a été
-- posé ici et que rien n'a touché depuis (numéro toujours celui de la séquence,
-- aucun retrait armé depuis).
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE _inv ON COMMIT DROP AS
SELECT b.id AS job_id, b.ligne AS job_avant, (j.platform_fields -> 'numero_par_sequence' ->> 'annonce')::uuid AS annonce_id
  FROM public._backup_0110_beebs_q93 b JOIN cross_post_jobs j ON j.id = b.id
 WHERE b.quoi = 'job' AND j.platform_fields ? 'numero_par_sequence'
   AND j.platform_listing_id = j.platform_fields -> 'numero_par_sequence' ->> 'numero'
   AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d WHERE d.inventaire_id = j.inventaire_id AND d.platform = 'beebs'
                    AND d.action = 'delete' AND d.created_at > (j.platform_fields -> 'numero_par_sequence' ->> 'le')::timestamptz);

UPDATE cross_post_jobs j SET platform_listing_id = NULL, listing_url = NULL, platform_fields = i.job_avant -> 'platform_fields'
  FROM _inv i WHERE j.id = i.job_id;
UPDATE annonces_plateforme a SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL,
       ignoree_le = NULL, proposition = b.ligne -> 'proposition', updated_at = now()
  FROM _inv i JOIN public._backup_0110_beebs_q93 b ON b.quoi = 'annonce' AND b.id = i.annonce_id
 WHERE a.id = i.annonce_id AND a.job_id = i.job_id;
DELETE FROM rapprochements r USING _inv i
 WHERE r.annonce_id = i.annonce_id AND r.detail ->> 'motif' = 'sequence_depot_beebs' AND r.created_at > now() - interval '30 days';
SELECT count(*) AS questions_remises FROM _inv;
COMMIT;
