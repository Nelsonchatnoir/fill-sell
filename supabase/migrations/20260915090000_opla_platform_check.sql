-- ═══════════════════════════════════════════════════════════════════════════
-- OPLA — LOT 4 (a) : ouvrir la contrainte de plateforme
-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ APPLIQUÉE EN PROD LE 2026-09-15, sur validation explicite de Nico, qui avait
--    relu l'état des deux contraintes avant de lever l'interdiction.
--    Appliquée SEULE (jamais `supabase db push`, toujours interdit : historiques
--    divergents). Les deux blocs DO ci-dessous ont été passés mot pour mot ; seul
--    le BEGIN/COMMIT externe a été omis, l'outil d'application gérant sa propre
--    transaction. Il reste dans le fichier pour un passage manuel au psql.
--
--    ÉTAT LU APRÈS APPLICATION (pg_get_constraintdef, recopié tel quel) :
--      cross_post_jobs_platform_check
--        CHECK ((platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text,
--               'beebs'::text, 'ebay'::text, 'vestiaire'::text, 'opla'::text])))
--      platform_category_aspects_platform_check
--        CHECK ((platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text,
--               'beebs'::text, 'ebay'::text, 'opla'::text])))
--
--    IDEMPOTENCE PROUVÉE, pas seulement annoncée : second passage des deux blocs,
--    OID des contraintes INCHANGÉS (84342 et 84343) — rien n'a été recréé.
--
-- POURQUOI. Aujourd'hui un job Opla ne peut pas exister : la contrainte
-- `cross_post_jobs_platform_check` n'accepte que vinted / leboncoin / beebs /
-- ebay / vestiaire. Toute la plomberie du lot 4 est théorique tant qu'elle
-- n'est pas levée. Vérifié en prod le 15/09 :
--   CHECK ((platform = ANY (ARRAY['vinted','leboncoin','beebs','ebay','vestiaire'])))
--
-- Deuxième contrainte, même famille, relevée en même temps :
--   platform_category_aspects_platform_check → vinted / leboncoin / beebs / ebay
-- Elle porte le catalogue des champs par catégorie (la table qui a servi à
-- établir que `language_book` n'est jamais déclaré par le formulaire Vinted).
-- Sans elle, aucun champ Opla ne pourrait être catalogué.
--
-- ⚠️ CE QUE CETTE MIGRATION NE FAIT PAS, ET NE DOIT PAS FAIRE :
--   · elle n'active RIEN. `OPLA_ACTIF = false` dans handlers/opla.js reste le
--     seul interrupteur, et il reste éteint ;
--   · elle ne crée aucune table, donc aucun GRANT n'est requis (la règle
--     « GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated » vaut pour
--     toute table NEUVE du schéma public — il n'y en a pas ici) ;
--   · elle ne touche à aucune donnée existante : ajouter une valeur à une
--     liste blanche n'invalide aucune ligne déjà écrite.
--
-- IDEMPOTENTE : rejouable sans effet de bord. Chaque contrainte est reposée
-- seulement si sa définition n'est pas déjà celle voulue.

BEGIN;

DO $$
DECLARE
  def_actuelle text;
  def_voulue   text := 'CHECK ((platform = ANY (ARRAY[''vinted''::text, ''leboncoin''::text, ''beebs''::text, ''ebay''::text, ''vestiaire''::text, ''opla''::text])))';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def_actuelle
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'public'
     AND r.relname = 'cross_post_jobs'
     AND c.conname = 'cross_post_jobs_platform_check';

  IF def_actuelle IS DISTINCT FROM def_voulue THEN
    ALTER TABLE public.cross_post_jobs
      DROP CONSTRAINT IF EXISTS cross_post_jobs_platform_check;
    ALTER TABLE public.cross_post_jobs
      ADD CONSTRAINT cross_post_jobs_platform_check
      CHECK (platform IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'vestiaire', 'opla'));
    RAISE NOTICE 'cross_post_jobs_platform_check : opla ajoute';
  ELSE
    RAISE NOTICE 'cross_post_jobs_platform_check : deja a jour, rien fait';
  END IF;
END $$;

DO $$
DECLARE
  def_actuelle text;
  def_voulue   text := 'CHECK ((platform = ANY (ARRAY[''vinted''::text, ''leboncoin''::text, ''beebs''::text, ''ebay''::text, ''opla''::text])))';
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def_actuelle
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'public'
     AND r.relname = 'platform_category_aspects'
     AND c.conname = 'platform_category_aspects_platform_check';

  IF def_actuelle IS DISTINCT FROM def_voulue THEN
    ALTER TABLE public.platform_category_aspects
      DROP CONSTRAINT IF EXISTS platform_category_aspects_platform_check;
    ALTER TABLE public.platform_category_aspects
      ADD CONSTRAINT platform_category_aspects_platform_check
      CHECK (platform IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'opla'));
    RAISE NOTICE 'platform_category_aspects_platform_check : opla ajoute';
  ELSE
    RAISE NOTICE 'platform_category_aspects_platform_check : deja a jour, rien fait';
  END IF;
END $$;

COMMIT;

-- ── CONTRÔLE APRÈS APPLICATION (à lire, pas à déduire) ──────────────────────
-- SELECT r.relname, c.conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class r ON r.oid = c.conrelid
--   JOIN pg_namespace n ON n.oid = r.relnamespace
--  WHERE n.nspname = 'public' AND c.contype = 'c'
--    AND pg_get_constraintdef(c.oid) ILIKE '%opla%';
-- Attendu : 2 lignes.
--
-- ── RETOUR ARRIÈRE ──────────────────────────────────────────────────────────
-- Rejouer les deux blocs avec la liste d'origine (sans 'opla'). Sans risque
-- tant qu'aucune ligne 'opla' n'existe ; s'il y en a, les traiter d'abord —
-- une contrainte CHECK refuse d'être posée si des lignes la violent.
