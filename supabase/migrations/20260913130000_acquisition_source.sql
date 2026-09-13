-- ============================================================================
-- SOURCE D'ACQUISITION SUR profiles — 13/09/2026
--
-- Constat : aucune colonne utm / source / campaign / referrer n'existait. Une
-- campagne Meta partait donc aveugle — impossible de dire d'où vient un inscrit.
--
-- RÈGLE MÉTIER : on veut la source d'ORIGINE, jamais la dernière vue. Une fois
-- posées, ces colonnes sont IMMUABLES — garanti par trigger ci-dessous, et pas
-- seulement par la discipline du code applicatif : la policy RLS « update own
-- profile » autorise l'utilisateur à écrire n'importe quelle colonne de sa
-- propre ligne, donc un simple `.update()` depuis le navigateur pourrait
-- réécrire sa source. Le verrou doit vivre en base.
--
-- Aucune donnée personnelle ici : ce sont des paramètres de campagne, plus un
-- referrer réduit à son ORIGINE (schéma + domaine), jamais l'URL complète.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acquisition_source       text,
  ADD COLUMN IF NOT EXISTS acquisition_medium       text,
  ADD COLUMN IF NOT EXISTS acquisition_campaign     text,
  ADD COLUMN IF NOT EXISTS acquisition_content      text,
  ADD COLUMN IF NOT EXISTS acquisition_fbclid       text,
  ADD COLUMN IF NOT EXISTS acquisition_referrer     text,
  ADD COLUMN IF NOT EXISTS acquisition_captured_at  timestamptz;

COMMENT ON COLUMN public.profiles.acquisition_source IS
  'utm_source du PREMIER contact. À défaut de paramètres : le domaine du referrer, ou ''direct''. IMMUABLE une fois posée.';
COMMENT ON COLUMN public.profiles.acquisition_referrer IS
  'ORIGINE du referrer (https://domaine), jamais l''URL complète : le chemin peut porter des données personnelles.';
COMMENT ON COLUMN public.profiles.acquisition_captured_at IS
  'Date de pose. NON NULL = les colonnes acquisition_* sont verrouillées.';

-- Rapports « d'où viennent les inscrits du mois » : filtre sur la source, tri
-- par date de création.
CREATE INDEX IF NOT EXISTS profiles_acquisition_source_idx
  ON public.profiles (acquisition_source, created_at);

-- ── Verrou d'immuabilité ────────────────────────────────────────────────────
-- Dès que acquisition_captured_at est posé, toute tentative de modifier une
-- colonne acquisition_* est SILENCIEUSEMENT ignorée (les anciennes valeurs
-- sont réécrites dans NEW). Pas d'exception levée : un UPDATE légitime qui
-- touche d'autres colonnes au passage ne doit jamais échouer pour autant.
CREATE OR REPLACE FUNCTION public.profiles_acquisition_immuable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.acquisition_captured_at IS NOT NULL THEN
    NEW.acquisition_source      := OLD.acquisition_source;
    NEW.acquisition_medium      := OLD.acquisition_medium;
    NEW.acquisition_campaign    := OLD.acquisition_campaign;
    NEW.acquisition_content     := OLD.acquisition_content;
    NEW.acquisition_fbclid      := OLD.acquisition_fbclid;
    NEW.acquisition_referrer    := OLD.acquisition_referrer;
    NEW.acquisition_captured_at := OLD.acquisition_captured_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_acquisition_immuable_trg ON public.profiles;
CREATE TRIGGER profiles_acquisition_immuable_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_acquisition_immuable();
