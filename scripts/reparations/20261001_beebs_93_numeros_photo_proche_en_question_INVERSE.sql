-- INVERSE de 20261001_beebs_93_numeros_photo_proche_en_question.sql
-- ⛔ Sur décision seulement : remet sur les dépôts le numéro posé le 30/09 par
-- une photo PROCHE (non prouvé), et rattache de nouveau l'annonce au dépôt.
-- Ne touche que les dépôts et annonces RESTÉS dans l'état laissé par le
-- fichier (question sans réponse) : une question à laquelle la personne a
-- répondu (rattachée par le geste, ou proposition refusée) n'est jamais reprise.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE _inv ON COMMIT DROP AS
SELECT b.job_id, b.job, b.annonce
  FROM public._backup_0110_beebs_photo_proche b
  JOIN public.cross_post_jobs j ON j.id = b.job_id
  JOIN public.annonces_plateforme a ON a.id = (b.annonce ->> 'id')::uuid
 WHERE j.platform_fields ? 'numero_photo_proche_en_question'
   AND j.platform_listing_id IS NULL AND j.listing_url IS NULL
   AND a.inventaire_id IS NULL
   AND a.proposition ->> 'motif' = 'depot_beebs_photo_proche';

UPDATE public.cross_post_jobs j
   SET platform_listing_id = i.job ->> 'platform_listing_id',
       listing_url = i.job ->> 'listing_url',
       platform_fields = i.job -> 'platform_fields'
  FROM _inv i WHERE j.id = i.job_id;

UPDATE public.annonces_plateforme a
   SET inventaire_id = (i.annonce ->> 'inventaire_id')::bigint,
       job_id = (i.annonce ->> 'job_id')::uuid,
       source_rapprochement = i.annonce ->> 'source_rapprochement',
       ignoree_le = (i.annonce ->> 'ignoree_le')::timestamptz,
       proposition = i.annonce -> 'proposition',
       updated_at = now()
  FROM _inv i WHERE a.id = (i.annonce ->> 'id')::uuid;

DELETE FROM public.rapprochements r
 USING _inv i
 WHERE r.annonce_id = (i.annonce ->> 'id')::uuid AND r.detail ->> 'reparation' = '20261001 point 5';

SELECT count(*) AS remis FROM _inv;
COMMIT;
