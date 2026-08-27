-- ─────────────────────────────────────────────────────────────────────────────
-- sync_gardes_declenchees — rendre VISIBLES les refus des garde-fous de la sync
-- (chantier inventaire multi-plateformes, lot 0b — GO Nico 27/08/2026).
--
-- POURQUOI. Le 27/08 au soir, le garde-fou anti-effondrement de la sync
-- dressing a refusé de marquer 862 disparitions sur 1000 chez fripe2base et
-- 99 sur 147 chez un second compte (récidive QUOTIDIENNE constatée les 26 et
-- 27/08) — et personne ne l'a su : le refus ne laisse qu'une « [note] » dans
-- vinted_sync_runs.erreur d'un run 'done', qu'aucune alerte ne lit
-- (background.js:7094-7096 le documente lui-même). Mesuré en prod le 27/08 :
-- 164 notes de refus depuis le 05/08, dont 14 « effondrement suspect »,
-- 2 « relevé incomplet », 148 « run repris » (routinières). Cette table est le
-- journal structuré de ces refus ; l'ops-digest de 8h50 la remplit (balayage
-- des notes) et remonte les cas graves.
--
-- QUI ÉCRIT. Aujourd'hui : ops-digest (service_role), source='digest_scan',
-- en parsant les notes existantes — AUCUN changement d'extension requis, le
-- parc 0.6.9 est couvert dès le prochain digest. Demain (post-réconciliation
-- des branches extension) : l'extension écrira directement au moment du refus
-- (source='extension') — la policy INSERT est déjà posée pour ça. L'unicité
-- (run_id, garde) rend les deux chemins idempotents entre eux.
--
-- GRAVITÉS (contrat partagé avec ops-digest) :
--   'grave'    → effondrement, sans_recoupement — signature d'un marquage de
--                masse évité ou d'un mauvais compte : à regarder le jour même.
--   'anomalie' → releve_incomplet, total_entries_absent,
--                republications_illisibles — rare, vaut une ligne de digest.
--   'info'     → run_repris — routinier (148 occurrences), journalisé ici mais
--                JAMAIS remonté dans le digest (le silence doit rester sain).
--
-- Idempotente : rejouable sans effet.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_gardes_declenchees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid NOT NULL REFERENCES public.vinted_sync_runs(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       text NOT NULL DEFAULT 'vinted',
  garde          text NOT NULL,
  gravite        text NOT NULL CHECK (gravite IN ('grave','anomalie','info')),
  motif          text,
  disparus       integer,
  connus         integer,
  plafond        integer,
  run_started_at timestamptz,
  source         text NOT NULL DEFAULT 'digest_scan',
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sync_gardes_declenchees IS
  'Refus des garde-fous de la sync (disparitions non marquées). Rempli par '
  'ops-digest (digest_scan) en parsant les [note] de vinted_sync_runs.erreur ; '
  'plus tard par l''extension au moment du refus. Un refus = le garde-fou a '
  'EMPÊCHÉ un marquage — aucune écriture inventaire n''a eu lieu.';
COMMENT ON COLUMN public.sync_gardes_declenchees.garde IS
  'effondrement | sans_recoupement | releve_incomplet | total_entries_absent | '
  'republications_illisibles | run_repris | autre (note tronquée/illisible)';
COMMENT ON COLUMN public.sync_gardes_declenchees.motif IS
  'Motif brut extrait de la note (après « disparitions non marquées — »).';

-- Un refus par (run, garde) : le balayage quotidien du digest et une future
-- écriture directe extension peuvent se recouvrir sans doublonner.
CREATE UNIQUE INDEX IF NOT EXISTS sync_gardes_declenchees_run_garde
  ON public.sync_gardes_declenchees (run_id, garde);

CREATE INDEX IF NOT EXISTS sync_gardes_declenchees_user_recent
  ON public.sync_gardes_declenchees (user_id, created_at DESC);

ALTER TABLE public.sync_gardes_declenchees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gardes lisibles par leur proprietaire" ON public.sync_gardes_declenchees;
CREATE POLICY "gardes lisibles par leur proprietaire"
  ON public.sync_gardes_declenchees FOR SELECT
  USING (auth.uid() = user_id);

-- Posée dès maintenant pour l'écriture directe extension (post-réconciliation).
DROP POLICY IF EXISTS "gardes ecrites par leur proprietaire" ON public.sync_gardes_declenchees;
CREATE POLICY "gardes ecrites par leur proprietaire"
  ON public.sync_gardes_declenchees FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Règle CLAUDE.md : toute nouvelle table public reçoit les grants authenticated.
-- Pas de policy UPDATE/DELETE : le journal est append-only pour les clients.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_gardes_declenchees TO authenticated;
GRANT ALL ON public.sync_gardes_declenchees TO service_role;
