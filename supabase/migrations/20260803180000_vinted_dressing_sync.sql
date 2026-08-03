-- Synchronisation du dressing Vinted — socle (2026-08-03).
--
-- Les articles importés vont dans `inventaire` (décision Nico) : le moteur de
-- détection de vente (check-listing-status + cross_post_jobs) tourne sur cette
-- table, un dressing garé ailleurs lui serait invisible.
--
-- RÈGLE DE COMPTABILISATION, portée par ce schéma :
--   prix_achat NULL  = INCONNU  → l'article n'entre dans AUCUN calcul de marge.
--   prix_achat 0     = GRATUIT assumé (don, cadeau) → il compte normalement.
-- Le code ne doit JAMAIS écrire 0 pour dire « je ne sais pas ».
-- ⚠️ Constat au 03/08 sur l'existant : 346 lignes portent déjà prix_achat = 0
-- et 26 NULL. Ces 346 sont AMBIGUËS (le front écrivait 0 par défaut) et ne sont
-- PAS converties ici : rien ne permet de distinguer un vrai 0 d'un « non
-- renseigné », et réécrire 346 lignes d'utilisateurs sur une supposition serait
-- pire que le mal. La règle vaut pour tout ce qui est écrit À PARTIR DE
-- MAINTENANT.
--
-- `prix_achat_inconnu` distingue « pas encore répondu » de « je ne sais plus »
-- (bouton explicite à la vente détectée). Les DEUX sont exclus des calculs —
-- le drapeau sert à ne plus poser la question et à ne pas gonfler le compteur
-- « à compléter ».

-- ── 1. inventaire : identité Vinted, origine, suivi ──────────────────────────
ALTER TABLE public.inventaire
  ADD COLUMN IF NOT EXISTS vinted_item_id          text,
  ADD COLUMN IF NOT EXISTS origine                 text,
  ADD COLUMN IF NOT EXISTS prix_achat_inconnu      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS listed_at_guess         timestamptz,
  ADD COLUMN IF NOT EXISTS first_seen_at           timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at          timestamptz,
  ADD COLUMN IF NOT EXISTS disparu_le              timestamptz,
  ADD COLUMN IF NOT EXISTS vinted_view_count       integer,
  ADD COLUMN IF NOT EXISTS vinted_favourite_count  integer,
  ADD COLUMN IF NOT EXISTS vinted_status           text;

COMMENT ON COLUMN public.inventaire.origine IS
  'NULL/''fillsell'' = saisi dans l''app ; ''vinted_sync'' = importé du dressing Vinted.';
COMMENT ON COLUMN public.inventaire.listed_at_guess IS
  'ESTIMATION de mise en ligne = timestamp de la 1re photo Vinted. C''est la date du dernier ENVOI DE PHOTO, pas de la mise en ligne (Vinted n''expose pas cette date). Ne jamais l''afficher avec une précision à l''heure.';
COMMENT ON COLUMN public.inventaire.first_seen_at IS
  'Date à laquelle FillSell a vu cet article pour la première fois. Fiable, contrairement à listed_at_guess.';
COMMENT ON COLUMN public.inventaire.disparu_le IS
  'Vu à une sync puis absent à la suivante. On ne SUPPRIME jamais une ligne : un incident réseau ne doit pas effacer d''historique.';
COMMENT ON COLUMN public.inventaire.prix_achat_inconnu IS
  'true = l''utilisateur a répondu « je ne sais plus ». Exclu des marges comme un NULL, mais on ne lui repose plus la question.';

-- ZÉRO DOUBLON GARANTI PAR LA BASE, pas par la logique de sync : même un bug
-- de l'extension ne peut pas créer deux fois le même article. C'est aussi la
-- cible du ON CONFLICT de l'upsert. Partiel : les articles FillSell n'ont pas
-- d'id Vinted et doivent rester libres de coexister.
CREATE UNIQUE INDEX IF NOT EXISTS inventaire_user_vinted_item_unique
  ON public.inventaire (user_id, vinted_item_id)
  WHERE vinted_item_id IS NOT NULL;

-- Compteur « articles sans prix d'achat » et filtres d'exclusion.
CREATE INDEX IF NOT EXISTS inventaire_user_prix_achat_absent
  ON public.inventaire (user_id)
  WHERE prix_achat IS NULL;

-- ── 2. Historique des relevés (objectif « observabilité ») ───────────────────
-- Sans cette table on saura « 101 vues » et jamais « +3 vues en 15 jours »,
-- donc jamais « cet article stagne ». Non rattrapable rétroactivement : c'est
-- pour ça qu'elle est en V1.
--
-- captured_on (date de PARIS, fournie par l'appelant) + UNIQUE : au plus UN
-- relevé par article et par jour. Le cadrage prévoit une sync quotidienne ;
-- si quelqu'un martèle le bouton manuel, l'upsert écrase le relevé du jour
-- au lieu d'empiler 50 lignes. Une colonne générée ne conviendrait pas :
-- `AT TIME ZONE` n'est pas IMMUTABLE.
CREATE TABLE IF NOT EXISTS public.vinted_listing_snapshots (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vinted_item_id   text NOT NULL,
  inventaire_id    bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  captured_on      date NOT NULL,
  price            numeric,
  view_count       integer,
  favourite_count  integer,
  status           text
);

CREATE UNIQUE INDEX IF NOT EXISTS vinted_snapshots_jour_unique
  ON public.vinted_listing_snapshots (user_id, vinted_item_id, captured_on);
CREATE INDEX IF NOT EXISTS vinted_snapshots_item_date
  ON public.vinted_listing_snapshots (user_id, vinted_item_id, captured_at DESC);

ALTER TABLE public.vinted_listing_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshots lisibles par leur proprietaire" ON public.vinted_listing_snapshots;
CREATE POLICY "snapshots lisibles par leur proprietaire"
  ON public.vinted_listing_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "snapshots ecrits par leur proprietaire" ON public.vinted_listing_snapshots;
CREATE POLICY "snapshots ecrits par leur proprietaire"
  ON public.vinted_listing_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "snapshots modifiables par leur proprietaire" ON public.vinted_listing_snapshots;
CREATE POLICY "snapshots modifiables par leur proprietaire"
  ON public.vinted_listing_snapshots FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vinted_listing_snapshots TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.vinted_listing_snapshots_id_seq TO authenticated;

-- ── 3. Runs de sync : reprise + télémétrie ───────────────────────────────────
-- REPRENABLE : `page_suivante` est le curseur. Onglet fermé, PC éteint → le
-- run reste 'running' et la sync suivante repart de cette page au lieu de tout
-- relire.
-- `kind` existe dès maintenant pour que la sync des MESSAGES (cadence 5 min,
-- chantier ultérieur) s'ajoute sans toucher au schéma ni à l'ordonnancement.
CREATE TABLE IF NOT EXISTS public.vinted_sync_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'dressing',
  status           text NOT NULL DEFAULT 'running',  -- running|done|failed|interrupted
  declencheur      text,                             -- 'bouton'|'cron'
  page_suivante    integer NOT NULL DEFAULT 1,
  total_pages      integer,
  total_entries    integer,
  items_vus        integer NOT NULL DEFAULT 0,
  items_crees      integer NOT NULL DEFAULT 0,
  items_maj        integer NOT NULL DEFAULT 0,
  erreur           text,
  extension_build  text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);

-- UN SEUL run actif par utilisateur et par type, garanti par la base : deux
-- onglets ouverts ne peuvent pas lancer deux syncs concurrentes sur le même
-- dressing (et donc pas de course sur le curseur de reprise).
CREATE UNIQUE INDEX IF NOT EXISTS vinted_sync_runs_un_seul_actif
  ON public.vinted_sync_runs (user_id, kind)
  WHERE status = 'running';
CREATE INDEX IF NOT EXISTS vinted_sync_runs_user_date
  ON public.vinted_sync_runs (user_id, started_at DESC);

ALTER TABLE public.vinted_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "runs lisibles par leur proprietaire" ON public.vinted_sync_runs;
CREATE POLICY "runs lisibles par leur proprietaire"
  ON public.vinted_sync_runs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "runs ecrits par leur proprietaire" ON public.vinted_sync_runs;
CREATE POLICY "runs ecrits par leur proprietaire"
  ON public.vinted_sync_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "runs modifiables par leur proprietaire" ON public.vinted_sync_runs;
CREATE POLICY "runs modifiables par leur proprietaire"
  ON public.vinted_sync_runs FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vinted_sync_runs TO authenticated;
