-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261113_de63ca45_date_de_test.sql — la phrase de test retourne dans le texte, la date sort des attributs
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Chaque fiche réparée retrouve son texte d'avant (description_avant de la sauvegarde) et perd attributs.teste_le —
-- SEULEMENT si elle porte encore exactement ce que la réparation a écrit (texte et date) : une fiche retouchée depuis par
-- la personne n'est jamais touchée (elle est listée en fin de script).
-- ⚠️ La fusion des attributs (inventaire_attributs_fusion_trg) n'enlève jamais une clé : la suppression passe SANS
--    déclencheurs, pour cette transaction seulement (session_replication_role = replica, SET LOCAL), comme les inverses
--    du 25/10 et du 12/11 — seules les colonnes description et attributs des fiches de la sauvegarde sont écrites.
-- La sauvegarde reste en place (preuve) ; à supprimer à la main une fois l'inverse validé.
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261113_de63ca45_date_de_test_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1113_de63ca45_date_de_test') IS NULL THEN
    RAISE EXCEPTION 'sauvegarde absente : la réparation n''a pas été jouée, rien à rendre';
  END IF;
END
$garde$;

CREATE TEMP TABLE _a_rendre ON COMMIT DROP AS
  SELECT b.inventaire_id
    FROM public._backup_1113_de63ca45_date_de_test b JOIN public.inventaire i ON i.id = b.inventaire_id
   WHERE i.description = b.description_apres
     AND i.attributs -> 'teste_le' ->> 'v' = to_char(b.teste_le, 'YYYY-MM-DD')
     AND i.attributs -> 'teste_le' ->> 'origine' = 'reparation_20261113_date_de_test';

SET LOCAL session_replication_role = replica;
UPDATE public.inventaire i
   SET description = b.description_avant,
       attributs = i.attributs - 'teste_le'
  FROM public._backup_1113_de63ca45_date_de_test b
 WHERE i.id = b.inventaire_id AND i.id IN (SELECT inventaire_id FROM _a_rendre);
SET LOCAL session_replication_role = origin;

DO $verif$
DECLARE n int; rendus int;
BEGIN
  SELECT count(*) INTO n FROM _a_rendre;
  SELECT count(*) INTO rendus FROM public._backup_1113_de63ca45_date_de_test b JOIN public.inventaire i ON i.id = b.inventaire_id
   WHERE i.id IN (SELECT inventaire_id FROM _a_rendre) AND i.description = b.description_avant AND NOT (i.attributs ? 'teste_le');
  IF rendus <> n THEN RAISE EXCEPTION 'inverse incomplet (% rendues sur %) : rien n''est écrit', rendus, n; END IF;
END
$verif$;

SELECT (SELECT count(*) FROM _a_rendre) AS fiches_rendues,
       (SELECT count(*) FROM public._backup_1113_de63ca45_date_de_test) AS fiches_reparees,
       (SELECT string_agg(b.inventaire_id::text, ', ') FROM public._backup_1113_de63ca45_date_de_test b
         WHERE b.inventaire_id NOT IN (SELECT inventaire_id FROM _a_rendre)) AS retouchees_depuis_non_rendues;
COMMIT;
