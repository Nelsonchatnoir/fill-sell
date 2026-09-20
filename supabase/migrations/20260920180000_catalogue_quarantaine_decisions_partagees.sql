-- ═══════════════════════════════════════════════════════════════════════════
-- LES ARBITRAGES DU CATALOGUE SONT PARTAGÉS (2026-09-20, passe 2, point 6-b)
-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIQUÉE EN PROD LE 2026-09-20 (feu vert de Nico, passe 2).
--
-- L'écran Réglages › « Champs des plateformes » journalisait ses REFUS dans
-- `usage_logs`, dont la RLS est `auth.uid() = user_id`. Il y a DEUX comptes
-- arbitres (nicolas.svobodny@ et hoosslocal@) : un refus posé depuis l'un
-- n'était pas vu depuis l'autre, et la ligne réapparaissait dans la file.
-- Défaut introduit le 20/09 avec l'écran lui-même.
--
-- Une décision d'arbitrage n'est pas une trace d'usage : elle engage TOUT le
-- parc (valider un champ le rend obligatoire pour tout le monde). Elle a donc
-- sa table, lisible par tous et écrite par un compte connecté — même posture
-- que `platform_category_aspects`, que cet écran modifie déjà.
--
-- ⛔ AUCUNE GARDE N'EST LEVÉE : la corroboration (deux témoins distincts), la
--    garde « question posable » et le gel Leboncoin du 16/09 restent exactement
--    ce qu'ils sont. Cette table ne dit QUE « cette ligne a été tranchée ».
-- ⛔ ELLE NE DÉCIDE RIEN TOUTE SEULE : elle est lue pour EXCLURE une ligne de
--    la file, jamais pour rendre un champ obligatoire.
-- ⛔ `usage_logs` reste écrite en plus : c'est la trace « qui, quand, quoi »
--    du parc, et on ne la remplace pas.

CREATE TABLE IF NOT EXISTS public.catalogue_quarantaine_decisions (
  platform      text        NOT NULL,
  category_key  text        NOT NULL,
  field_key     text        NOT NULL,
  decision      text        NOT NULL CHECK (decision IN ('valide', 'refuse')),
  par           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_label   text,
  temoins       integer,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, category_key, field_key)
);

COMMENT ON TABLE public.catalogue_quarantaine_decisions IS
  'Arbitrages du catalogue des champs (Réglages › Champs des plateformes). '
  'Partagée : un refus posé depuis un compte arbitre est vu depuis l''autre. '
  'Lue pour EXCLURE une ligne de la file d''attente, jamais pour rendre un '
  'champ obligatoire — ça, c''est platform_category_aspects.';

ALTER TABLE public.catalogue_quarantaine_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cqd readable by authenticated" ON public.catalogue_quarantaine_decisions;
CREATE POLICY "cqd readable by authenticated" ON public.catalogue_quarantaine_decisions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cqd insert by authenticated" ON public.catalogue_quarantaine_decisions;
CREATE POLICY "cqd insert by authenticated" ON public.catalogue_quarantaine_decisions
  FOR INSERT TO authenticated WITH CHECK (par = auth.uid());

DROP POLICY IF EXISTS "cqd update by authenticated" ON public.catalogue_quarantaine_decisions;
CREATE POLICY "cqd update by authenticated" ON public.catalogue_quarantaine_decisions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (par = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.catalogue_quarantaine_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogue_quarantaine_decisions TO service_role;

-- ── REPRISE DES DÉCISIONS DÉJÀ PRISES ──────────────────────────────────────
-- Elles existent dans `usage_logs` depuis ce matin. Les laisser derrière
-- ferait réapparaître des lignes déjà tranchées — exactement le défaut qu'on
-- corrige. Reprise IDEMPOTENTE, la plus ancienne décision gagne.
INSERT INTO public.catalogue_quarantaine_decisions
       (platform, category_key, field_key, decision, par, field_label, temoins, decided_at)
SELECT DISTINCT ON (u.metadata->>'platform', u.metadata->>'category_key', u.metadata->>'field_key')
       u.metadata->>'platform', u.metadata->>'category_key', u.metadata->>'field_key',
       CASE WHEN u.metadata->>'decision' = 'valide' THEN 'valide' ELSE 'refuse' END,
       u.user_id, u.metadata->>'field_label', (u.metadata->>'temoins')::int, u.created_at
  FROM public.usage_logs u
 WHERE u.feature = 'catalogue_quarantaine'
   AND u.metadata->>'platform' IS NOT NULL
   AND u.metadata->>'category_key' IS NOT NULL
   AND u.metadata->>'field_key' IS NOT NULL
 ORDER BY u.metadata->>'platform', u.metadata->>'category_key', u.metadata->>'field_key', u.created_at
ON CONFLICT (platform, category_key, field_key) DO NOTHING;
