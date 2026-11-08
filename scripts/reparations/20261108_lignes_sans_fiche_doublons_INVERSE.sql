-- INVERSE du rattrapage 20261108_lignes_sans_fiche_doublons : chaque ligne close PAR CE RATTRAPAGE reprend son statut,
-- son erreur et ses platform_fields d'avant (public._backup_0811_lignes_sans_fiche). Une ligne qui a bougé depuis
-- (statut ≠ « cancelled » ou trace de clôture absente) n'est pas touchée.
BEGIN;
UPDATE public.cross_post_jobs j
   SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0811_lignes_sans_fiche b
 WHERE j.id = b.id AND j.status = 'cancelled'
   AND j.platform_fields #>> '{ligne_sans_fiche_close,par}' = 'rattrapage_0811';
SELECT count(*) AS rouvertes FROM public.cross_post_jobs j JOIN public._backup_0811_lignes_sans_fiche b ON b.id = j.id
 WHERE j.status = b.status AND NOT (j.platform_fields ? 'ligne_sans_fiche_close');
COMMIT;
