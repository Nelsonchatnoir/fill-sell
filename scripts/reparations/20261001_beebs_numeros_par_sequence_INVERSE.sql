-- INVERSE de 20261001_beebs_numeros_par_sequence.sql — sur décision seulement.
-- Retire les numéros posés par la séquence (platform_fields.numero_par_sequence)
-- et rend aux annonces leur état d'avant (sauvegarde _backup_0110_beebs_sequence),
-- uniquement là où rien n'a bougé depuis : numéro toujours celui posé, annonce
-- toujours rattachée par la séquence, aucun retrait du dépôt armé depuis.
-- Les questions posées (proposition depot_beebs_a_confirmer sans réponse)
-- reviennent à leur état d'avant.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE _inv ON COMMIT DROP AS
SELECT j.id AS job_id, (j.platform_fields -> 'numero_par_sequence' ->> 'annonce')::uuid AS annonce_id,
       b.ligne AS job_avant
  FROM cross_post_jobs j
  JOIN public._backup_0110_beebs_sequence b ON b.quoi = 'job' AND b.id = j.id
 WHERE j.platform_fields ? 'numero_par_sequence'
   AND j.platform_listing_id = j.platform_fields -> 'numero_par_sequence' ->> 'numero'
   AND NOT EXISTS (SELECT 1 FROM cross_post_jobs d WHERE d.inventaire_id = j.inventaire_id AND d.platform = 'beebs'
                    AND d.action = 'delete' AND d.created_at > (j.platform_fields -> 'numero_par_sequence' ->> 'le')::timestamptz);

UPDATE cross_post_jobs j
   SET platform_listing_id = NULL, listing_url = NULL, platform_fields = i.job_avant -> 'platform_fields'
  FROM _inv i WHERE j.id = i.job_id;

UPDATE annonces_plateforme a
   SET inventaire_id = (b.ligne ->> 'inventaire_id')::bigint, job_id = (b.ligne ->> 'job_id')::uuid,
       source_rapprochement = b.ligne ->> 'source_rapprochement',
       ignoree_le = (b.ligne ->> 'ignoree_le')::timestamptz, proposition = b.ligne -> 'proposition',
       updated_at = now()
  FROM _inv i JOIN public._backup_0110_beebs_sequence b ON b.quoi = 'annonce' AND b.id = i.annonce_id
 WHERE a.id = i.annonce_id AND a.job_id = i.job_id;

DELETE FROM rapprochements r USING _inv i
 WHERE r.annonce_id = i.annonce_id AND r.detail ->> 'motif' = 'sequence_depot_beebs';

-- Questions sans réponse
UPDATE annonces_plateforme a
   SET ignoree_le = (b.ligne ->> 'ignoree_le')::timestamptz, proposition = b.ligne -> 'proposition', updated_at = now()
  FROM public._backup_0110_beebs_sequence b
 WHERE b.quoi = 'annonce' AND b.id = a.id AND a.inventaire_id IS NULL
   AND a.proposition ->> 'motif' = 'depot_beebs_a_confirmer';
DELETE FROM rapprochements r USING public._backup_0110_beebs_sequence b
 WHERE b.quoi = 'annonce' AND r.annonce_id = b.id AND r.detail ->> 'motif' = 'depot_beebs_a_confirmer';

SELECT count(*) AS numeros_retires FROM _inv;
COMMIT;
