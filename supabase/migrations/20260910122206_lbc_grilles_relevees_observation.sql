-- ═══════════════════════════════════════════════════════════════════════════
-- RAPATRIEMENT — table `lbc_grilles_relevees` (rapatriée le 2026-09-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- D'OÙ ÇA VIENT : appliquée en prod le 10/09/2026 à 12h22 sous la version
-- 20260910122206 (`lbc_grilles_relevees_observation`), sans fichier dans le
-- dépôt. 0 occurrence du nom avant celui-ci — alors que
-- `enregistrerGrillesLbc()` (chrome-extension/background.js) écrit dedans à
-- chaque menu Leboncoin ouvert pendant un dépôt. Après un reset, l'extension
-- aurait écrit dans le vide.
-- CE QUI SUIT EST LE SQL RÉEL, copié depuis
-- supabase_migrations.schema_migrations.statements — non réécrit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- OBSERVATION DES GRILLES LEBONCOIN — table APPEND-ONLY (2026-09-10)
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI PAS platform_category_aspects : sa clé unique est
-- (platform, category_key, field_key). Or sous la SEULE clé
-- « Mode > Vêtements » / clothing_st, quatre grilles différentes ont été
-- relevées en 45 jours — lettres seules (×27), « 38 - M » (×6), enfant (×1),
-- vide (×4) — et les deux premières sortent toutes les deux sous univers
-- « Femme ». Dans une table à clé unique, elles s'écraseraient l'une l'autre
-- et on ne saurait JAMAIS qu'il y en a plusieurs. Ici on APPEND : chaque
-- relevé est un fait daté, avec le contexte qui peut l'expliquer.
--
-- ⛔ Table d'ENQUÊTE, pas de production : rien ne la lit pour décider quoi que
-- ce soit. Elle sert à trancher, sur preuves, quelle grille Leboncoin sert et
-- pourquoi — avant d'écrire la moindre règle de conversion de taille.
-- Idempotente : CREATE TABLE IF NOT EXISTS, aucune donnée touchée ailleurs.

CREATE TABLE IF NOT EXISTS public.lbc_grilles_relevees (
  id            bigserial PRIMARY KEY,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id        uuid,
  category_key  text,
  field_key     text,
  champ         text,          -- le nom interne du critère côté handler (« taille »)
  valeur_demandee text,        -- ce qu'on cherchait à poser (« 48 »)
  options       jsonb NOT NULL,-- la grille COMPLÈTE, sans cap
  n_options     integer,
  contexte      jsonb,         -- les AUTRES critères et leurs valeurs à cet instant
  handler_build text,
  releve_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lbc_grilles_relevees IS
  'Append-only. Chaque menu Leboncoin ouvert pendant un dépôt : la grille complète + le contexte des autres critères. Sert à identifier le discriminant entre grilles d''une même catégorie (4 grilles sous Mode > Vêtements au 10/09).';

CREATE INDEX IF NOT EXISTS lbc_grilles_relevees_cat_field_idx
  ON public.lbc_grilles_relevees (category_key, field_key, releve_at DESC);

-- Règle du projet : toute nouvelle table du schéma public reçoit ses grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lbc_grilles_relevees TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.lbc_grilles_relevees_id_seq TO authenticated;

ALTER TABLE public.lbc_grilles_relevees ENABLE ROW LEVEL SECURITY;

-- Chacun n'écrit et ne lit que SES propres relevés.
DROP POLICY IF EXISTS lbc_grilles_relevees_insert_self ON public.lbc_grilles_relevees;
CREATE POLICY lbc_grilles_relevees_insert_self ON public.lbc_grilles_relevees
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS lbc_grilles_relevees_select_self ON public.lbc_grilles_relevees;
CREATE POLICY lbc_grilles_relevees_select_self ON public.lbc_grilles_relevees
  FOR SELECT TO authenticated USING (user_id = auth.uid());
