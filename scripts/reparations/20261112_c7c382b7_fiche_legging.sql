-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION 12/11 (point 1a de Nico) — la fiche « legging » 1793630721658 du compte c7c382b7, réécrite depuis NOTRE dépôt
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- NON EXÉCUTÉE : feu vert de Nico requis, et APRÈS la migration 20261112213000_releve_jamais_depuis_notre_depot (sinon le
-- relevé suivant de l'annonce Beebs, toujours en ligne avec « Naissance », réécrirait la fiche aussitôt : garde ci-dessous).
-- Ce qui s'est passé (lecture seule, 12/11 vers 22:00) :
--   · fiche créée le 02/11 15:45 (Paris) par Lens : attributs_visibles.taille = « EU 140cm » (l'étiquette), colonne marque
--     « River Island » ; AUCUNE clé attributs.taille ni attributs.marque ;
--   · 12/11 20:23:27 et 20:24:14 : nos dépôts Beebs 8c447bfa (« Naissance - 0 mois (45-50 cm) ») et Vinted e05bc4ae
--     (« 9 ans / 134 cm ») — deux tailles de copie qui contredisaient l'étiquette (corrigé par la règle commune, point b) ;
--   · 12/11 21:10:40 : le relevé de l'extension sur l'annonce Beebs 34348231 pose attributs.taille = « Naissance - 0 mois
--     (45-50 cm) » et attributs.marque = « Autre » (le repli générique de notre dépôt), source releve_beebs,
--     at 2026-11-12T20:10:40.921Z. Aucune ligne d'inventaire_journal sur la fiche (le relevé de l'extension n'en écrit pas).
-- LA VALEUR D'AVANT : aucune trace ne prouve une valeur antérieure de ces deux clés. Le seul écrivain possible entre le
-- 02/11 et le 12/11 21:10 est la synchro Vinted (vinted_liste, 20:24:45) — elle n'aurait relu que NOTRE dépôt Vinted
-- (« 9 ans / 134 cm », faux lui aussi), et le relevé l'aurait écrasée (rang 3 ≥ 2). Rien n'est donc inventé : les deux
-- clés sont RETIRÉES, la fiche retombe sur ce qu'elle prouve elle-même (l'étiquette « EU 140cm », la marque « River Island »
-- de la colonne). ⛔ Rien n'est remis si l'une des deux valeurs a changé depuis le relevé (garde).
-- ⛔ AUCUNE ANNONCE NI AUCUNE TÂCHE N'EST TOUCHÉE : Vinted 10782832009 et Beebs 34348231 restent en ligne telles quelles
--    (décision de Nico : il prévient la personne lui-même) ; aucun mail.
-- ⚠️ La fusion des attributs (inventaire_attributs_fusion_trg) n'enlève jamais une clé : la suppression passe SANS
--    déclencheurs, pour cette transaction seulement (session_replication_role = replica, SET LOCAL), comme les inverses du
--    25/10 — seule la colonne attributs de cette fiche est écrite.
-- Sauvegarde : public._backup_1112_c7c382b7_fiche_legging (RLS, aucun accès client). Inverse : 20261112_c7c382b7_fiche_legging_INVERSE.sql.
-- Lecture : 20261112_c7c382b7_fiche_legging_PREUVE.sql. Essai : remplacer COMMIT par ROLLBACK.
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261112_c7c382b7_fiche_legging.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
DECLARE i public.inventaire%ROWTYPE;
BEGIN
  IF to_regclass('public._backup_1112_c7c382b7_fiche_legging') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
  IF to_regprocedure('public.annonce_vient_de_notre_depot(bigint,uuid,text,text,uuid)') IS NULL
     OR pg_get_functiondef('public.inventaire_attributs_avant_update()'::regprocedure) NOT LIKE '%annonce_vient_de_notre_depot%' THEN
    RAISE EXCEPTION 'migration 20261112213000 absente : le prochain relevé Beebs réécrirait la fiche — appliquer la migration d''abord, rien n''est écrit';
  END IF;
  SELECT * INTO i FROM public.inventaire WHERE id = 1793630721658 FOR UPDATE;
  IF i.id IS NULL OR i.user_id::text NOT LIKE 'c7c382b7%' THEN
    RAISE EXCEPTION 'fiche 1793630721658 du compte c7c382b7 introuvable : rien n''est écrit';
  END IF;
  IF i.attributs -> 'taille' ->> 'v' IS DISTINCT FROM 'Naissance - 0 mois (45-50 cm)' OR i.attributs -> 'taille' ->> 'source' IS DISTINCT FROM 'releve_beebs'
     OR i.attributs -> 'marque' ->> 'v' IS DISTINCT FROM 'Autre' OR i.attributs -> 'marque' ->> 'source' IS DISTINCT FROM 'releve_beebs' THEN
    RAISE EXCEPTION 'la fiche ne porte plus les valeurs du relevé du 12/11 21:10 (taille %, marque %) : quelqu''un y a touché, rien n''est écrit',
      i.attributs -> 'taille', i.attributs -> 'marque';
  END IF;
  IF i.attributs -> 'attributs_visibles' -> 'v' ->> 'taille' IS DISTINCT FROM 'EU 140cm' THEN
    RAISE EXCEPTION 'l''étiquette lue n''est plus « EU 140cm » : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1112_c7c382b7_fiche_legging AS
  SELECT i.id AS inventaire_id, i.user_id, i.marque AS marque_colonne, i.attributs AS attributs_avant,
         i.attributs -> 'taille' AS taille_avant, i.attributs -> 'marque' AS marque_avant, NULL::jsonb AS attributs_apres,
         now() AS sauvegarde_le
    FROM public.inventaire i WHERE i.id = 1793630721658;
ALTER TABLE public._backup_1112_c7c382b7_fiche_legging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1112_c7c382b7_fiche_legging FROM PUBLIC, anon, authenticated;

SET LOCAL session_replication_role = replica;
UPDATE public.inventaire i
   SET attributs = i.attributs - 'taille' - 'marque'
  FROM public._backup_1112_c7c382b7_fiche_legging b
 WHERE i.id = b.inventaire_id
   AND i.attributs -> 'taille' = b.taille_avant AND i.attributs -> 'marque' = b.marque_avant;
SET LOCAL session_replication_role = origin;

UPDATE public._backup_1112_c7c382b7_fiche_legging b SET attributs_apres = i.attributs
  FROM public.inventaire i WHERE i.id = b.inventaire_id;

DO $verif$
DECLARE a jsonb;
BEGIN
  SELECT attributs INTO a FROM public.inventaire WHERE id = 1793630721658;
  IF a ? 'taille' OR a ? 'marque' OR a -> 'attributs_visibles' -> 'v' ->> 'taille' IS DISTINCT FROM 'EU 140cm'
     OR (SELECT count(*) FROM public._backup_1112_c7c382b7_fiche_legging) <> 1
     OR a <> ((SELECT attributs_avant FROM public._backup_1112_c7c382b7_fiche_legging) - 'taille' - 'marque') THEN
    RAISE EXCEPTION 'réparation incomplète ou débordante : rien n''est écrit';
  END IF;
END
$verif$;

SELECT b.inventaire_id, b.taille_avant ->> 'v' AS taille_avant, b.marque_avant ->> 'v' AS marque_avant,
       b.attributs_apres ? 'taille' AS taille_apres_presente, b.attributs_apres ? 'marque' AS marque_apres_presente,
       b.attributs_apres -> 'attributs_visibles' -> 'v' ->> 'taille' AS etiquette, b.marque_colonne,
       b.sauvegarde_le AT TIME ZONE 'Europe/Paris' AS sauvegarde_paris
  FROM public._backup_1112_c7c382b7_fiche_legging b;
COMMIT;
