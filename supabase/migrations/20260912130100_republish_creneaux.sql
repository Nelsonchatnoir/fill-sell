-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE (créneaux) — 2/5 : la table d'historique
-- 2026-09-12.
-- ═══════════════════════════════════════════════════════════════════════════
-- UNE LIGNE PAR CRÉNEAU VÉCU (utilisateur × instant de début). Le sweep
-- serveur (5/5) la crée au premier passage DANS le créneau — que Chrome soit
-- ouvert ou non, c'est ce qui permet de dire « créneau manqué » — et la
-- clôture au premier passage APRÈS la fin. C'est la matière de l'écran
-- « Historique » de la maquette : remontées / sautées (avec motif) / manqués.
--
-- Ce qu'elle contient et ne contient pas :
--   · eligibles_debut / prevues : ce que le serveur ATTENDAIT au premier
--     passage — prevues = min(plafond restant, éligibles, capacité du
--     créneau). C'est le chiffre que l'app annonce ; l'écart avec `faites`
--     est l'information honnête de l'historique.
--   · faites : jobs de CE créneau (platform_fields.republish_creneau_id)
--     aboutis, comptés à la clôture.
--   · sautes : {vinted_item_id: {motif, titre, at}} — les articles que le
--     sweep a examinés et écartés, UNE fois chacun (dédoublonné par clé).
--     Les clés qui commencent par '_' sont des notes de niveau COMPTE
--     (plafond du jour atteint, plafond de boutique…), pas des articles.
--   · extension_vue : Chrome a été vu pendant le créneau. faites = 0 avec
--     extension_vue = false → « ton ordinateur n'était pas allumé » ; avec
--     extension_vue = true → « rien n'est parti », et `sautes` dit pourquoi.
--   · statut : en_cours → termine (faites ≥ prevues) | ecourte (0 < faites
--     < prevues) | manque (faites = 0, éligibles > 0) | vide (0 éligible).
--
-- ⚠️ ÉCART ASSUMÉ à la règle « GRANT SELECT, INSERT, UPDATE, DELETE » du
-- CLAUDE.md, même doctrine que categorie_journal (07/09) : l'app ne fait que
-- LIRE cette table ; seules les fonctions SECURITY DEFINER du sweep y
-- écrivent. Donner l'écriture à `authenticated` ouvrirait un historique à la
-- falsification sans aucun bénéfice. Lecture bornée par RLS aux lignes de
-- l'appelant.
-- Idempotente. Retour arrière : DROP TABLE public.republish_creneaux (aucune
-- FK entrante ; les jobs ne portent qu'une clé jsonb vers elle).

CREATE TABLE IF NOT EXISTS public.republish_creneaux (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Jour LOCAL (fuseau du réglage) du début du créneau, pour l'affichage.
  jour             date NOT NULL,
  de               time NOT NULL,
  a                time NOT NULL,
  fuseau           text NOT NULL DEFAULT 'Europe/Paris',
  -- Instants absolus : ce sur quoi tout se compte.
  debut            timestamptz NOT NULL,
  fin              timestamptz NOT NULL,
  statut           text NOT NULL DEFAULT 'en_cours',
  -- Boutique Vinted servie (vinted_user_id), quand l'identité connectée est
  -- connue au premier passage ou plus tard. NULL = mono-boutique ou inconnue.
  boutique         text,
  eligibles_debut  integer,
  prevues          integer,
  faites           integer NOT NULL DEFAULT 0,
  sautes           jsonb NOT NULL DEFAULT '{}'::jsonb,
  extension_vue    boolean NOT NULL DEFAULT false,
  espacement_sec   integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT republish_creneaux_statut_chk
    CHECK (statut IN ('en_cours', 'termine', 'ecourte', 'manque', 'vide')),
  CONSTRAINT republish_creneaux_fenetre_chk CHECK (fin > debut),
  CONSTRAINT republish_creneaux_unique UNIQUE (user_id, debut)
);

-- La lecture de l'historique : les derniers créneaux d'un compte.
CREATE INDEX IF NOT EXISTS republish_creneaux_user_debut_idx
  ON public.republish_creneaux (user_id, debut DESC);

ALTER TABLE public.republish_creneaux ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.republish_creneaux TO authenticated;

DROP POLICY IF EXISTS republish_creneaux_lecture_propre ON public.republish_creneaux;
CREATE POLICY republish_creneaux_lecture_propre ON public.republish_creneaux
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Contrôle :
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'republish_creneaux';   -- authenticated : SELECT seul
