-- ═══════════════════════════════════════════════════════════════════════════
-- SOCLE DE LA FUSION D'ARTICLES (2026-09-18, point B — schéma seul)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le geste « ces deux articles sont le même » n'existait pas : on détachait,
-- on rattachait ailleurs, et l'article importé restait en doublon à supprimer
-- à la main — donc avec son historique perdu. C'est le préalable à l'import
-- automatique (point F) : sans fusion, une erreur d'import ne se répare pas.
--
-- Ce fichier ne pose QUE le schéma (il est lu par rapprocher_classer dès la
-- migration suivante). Les gestes vivent dans 20260918102000.
--
-- ⛔ UNE FUSION EST UN POINTEUR, JAMAIS UNE COPIE DESTRUCTIVE.
--    L'article absorbé n'est ni supprimé ni marqué vendu — marquer vendu
--    fabriquerait une vente qui n'a pas eu lieu, et supprimer perdrait la
--    réversibilité. Il reçoit `fusionne_dans` et sort des vues ; tout ce qui
--    pendait à lui (ventes, jobs, annonces, snapshots, captures, fiches) est
--    RE-POINTÉ vers l'article conservé, et la liste de ce qui a bougé est
--    journalisée ligne par ligne pour pouvoir être rendue.
ALTER TABLE public.inventaire
  ADD COLUMN IF NOT EXISTS fusionne_dans bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fusionne_le   timestamptz;

-- Les lectures qui doivent ignorer un article absorbé filtrent dessus ; l'index
-- partiel ne couvre que les lignes fusionnées (une poignée), il ne coûte rien.
CREATE INDEX IF NOT EXISTS inventaire_fusionne_dans_idx
  ON public.inventaire (fusionne_dans) WHERE fusionne_dans IS NOT NULL;

-- ── LE JOURNAL — c'est LUI qui rend la fusion réversible ────────────────────
-- `deplacements` = { "<table>": [<ids>] } : exactement les lignes qui ont
-- changé de propriétaire. Défaire, c'est les rendre, et rien d'autre.
-- `champs_repris` = { "<colonne>": {"avant": …, "apres": …} } : les champs de
-- l'article conservé qui étaient VIDES et qu'on a remplis depuis l'absorbé.
-- On garde l'AVANT pour pouvoir le remettre — même sur un champ vide, parce
-- que NULL et 0 ne sont pas la même chose sur un prix d'achat (règle du 03/08).
CREATE TABLE IF NOT EXISTS public.inventaire_fusions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garde         bigint NOT NULL,
  absorbe       bigint NOT NULL,
  deplacements  jsonb NOT NULL DEFAULT '{}'::jsonb,
  champs_repris jsonb NOT NULL DEFAULT '{}'::jsonb,
  par           text NOT NULL DEFAULT 'utilisateur',
  defait_le     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventaire_fusions_user_idx ON public.inventaire_fusions (user_id, created_at DESC);
-- Un article ne peut être absorbé qu'UNE fois tant que la fusion n'est pas
-- défaite : la garde qui empêche deux fusions concurrentes de se marcher
-- dessus, et de journaliser deux fois le même déplacement.
CREATE UNIQUE INDEX IF NOT EXISTS inventaire_fusions_absorbe_vivante_idx
  ON public.inventaire_fusions (absorbe) WHERE defait_le IS NULL;

ALTER TABLE public.inventaire_fusions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventaire_fusions_proprietaire ON public.inventaire_fusions;
CREATE POLICY inventaire_fusions_proprietaire ON public.inventaire_fusions
  FOR SELECT USING (user_id = auth.uid());

-- Convention du projet (CLAUDE.md) : toute nouvelle table du schéma public
-- ouvre ses droits à `authenticated`. L'écriture passe malgré tout par les
-- deux RPC SECURITY DEFINER — la RLS ci-dessus n'expose que la lecture.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventaire_fusions TO authenticated;
