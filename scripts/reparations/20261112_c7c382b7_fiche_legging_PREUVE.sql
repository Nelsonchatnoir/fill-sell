-- LECTURE SEULE (12/11/2026) — fiche « legging » 1793630721658 du compte c7c382b7 (20261112_c7c382b7_fiche_legging.sql).
-- Montre la fiche (taille et marque d'attribut, étiquette lue, colonne marque), ses tâches et ses annonces (heures de Paris),
-- le journal de la fiche, et si la migration 20261112213000 est en place. N'écrit rien.
--   npx supabase db query --linked --read-only -f scripts/reparations/20261112_c7c382b7_fiche_legging_PREUVE.sql
SELECT i.id, left(i.user_id::text, 8) AS compte, i.marque AS marque_colonne,
       i.attributs -> 'attributs_visibles' -> 'v' ->> 'taille' AS etiquette,
       i.attributs -> 'taille' ->> 'v' AS taille, i.attributs -> 'taille' ->> 'source' AS source_taille, i.attributs -> 'taille' ->> 'at' AS taille_at,
       i.attributs -> 'marque' ->> 'v' AS marque, i.attributs -> 'marque' ->> 'source' AS source_marque,
       (SELECT count(*) FROM public.inventaire_journal j WHERE j.inventaire_id = i.id) AS lignes_journal,
       to_regprocedure('public.annonce_vient_de_notre_depot(bigint,uuid,text,text,uuid)') IS NOT NULL AS migration_en_place,
       to_regclass('public._backup_1112_c7c382b7_fiche_legging') IS NOT NULL AS reparation_passee
  FROM public.inventaire i
 WHERE i.id = 1793630721658 AND i.user_id::text LIKE 'c7c382b7%';

SELECT left(j.id::text, 8) AS tache, j.platform, j.action, j.status, j.platform_listing_id,
       j.created_at AT TIME ZONE 'Europe/Paris' AS creee_paris, j.published_at AT TIME ZONE 'Europe/Paris' AS publiee_paris,
       j.platform_fields ->> 'taille' AS taille_envoyee, j.platform_fields ->> 'depopTaille' AS taille_depop
  FROM public.cross_post_jobs j
 WHERE j.inventaire_id = 1793630721658 AND j.user_id::text LIKE 'c7c382b7%'
 ORDER BY j.created_at;

SELECT a.platform, a.listing_id, left(a.job_id::text, 8) AS tache, a.source_rapprochement, a.disparu_le,
       a.capture ->> 'taille' AS taille_lue, a.capture ->> 'marque' AS marque_lue,
       a.updated_at AT TIME ZONE 'Europe/Paris' AS maj_paris
  FROM public.annonces_plateforme a
 WHERE a.inventaire_id = 1793630721658;
