-- INVERSE de 20261112_c7c382b7_fiche_legging.sql (fiche 1793630721658, compte c7c382b7) : les clés attributs.taille et
-- attributs.marque reprennent leur valeur d'avant la réparation (public._backup_1112_c7c382b7_fiche_legging : taille_avant,
-- marque_avant — les valeurs du relevé Beebs du 12/11 21:10), SEULEMENT si personne n'a reposé ces clés depuis.
-- ⚠️ Passe SANS déclencheurs (session_replication_role = replica, SET LOCAL) : avec la migration 20261112213000, la base
--    refuserait d'écrire une valeur releve_beebs sur une fiche que FillSell a déposée sur Beebs — c'est voulu, mais
--    l'inverse doit pouvoir remettre l'état d'avant tel quel. Seule la colonne attributs de cette fiche est écrite.
-- ⛔ Aucune annonce ni tâche touchée.
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261112_c7c382b7_fiche_legging_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1112_c7c382b7_fiche_legging') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : la réparation n''a pas été passée, rien à défaire';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1793630721658 AND (attributs ? 'taille' OR attributs ? 'marque')) THEN
    RAISE EXCEPTION 'la fiche porte de nouveau une taille ou une marque d''attribut (écrite depuis la réparation) : rien n''est écrit';
  END IF;
END
$garde$;

SET LOCAL session_replication_role = replica;
UPDATE public.inventaire i
   SET attributs = i.attributs || jsonb_build_object('taille', b.taille_avant, 'marque', b.marque_avant)
  FROM public._backup_1112_c7c382b7_fiche_legging b
 WHERE i.id = b.inventaire_id AND i.user_id = b.user_id
   AND NOT (i.attributs ? 'taille') AND NOT (i.attributs ? 'marque');
SET LOCAL session_replication_role = origin;

SELECT i.id, i.attributs -> 'taille' ->> 'v' AS taille, i.attributs -> 'taille' ->> 'source' AS source_taille,
       i.attributs -> 'marque' ->> 'v' AS marque, i.attributs -> 'marque' ->> 'source' AS source_marque
  FROM public.inventaire i WHERE i.id = 1793630721658;
COMMIT;
