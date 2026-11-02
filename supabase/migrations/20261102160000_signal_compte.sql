-- ═══════════════════════════════════════════════════════════════════════════
-- LE SIGNAL « RIEN N'A CHANGÉ POUR CE COMPTE » (02/11/2026 — facture Supabase, feu vert de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- get-pending-jobs (~34 000 polls par jour) relisait à chaque poll des lignes qui ne pouvaient pas avoir changé :
-- coin_config (110 lignes, 7 lectures par poll), les beta_flags et le palier du compte, et des balayages de
-- cross_post_jobs qui rendent 0 ligne quand le compte n'a aucun job dans l'état cherché. Ce signal, tenu par la base
-- dans la MÊME transaction que chaque changement, dit exactement :
--   · compte_signal.jobs           : le nombre de jobs du compte par « action|statut » (exact, déclencheur) ;
--   · compte_signal.profil_version : +1 à chaque changement de beta_flags ou du palier (is_premium, is_pro,
--                                    is_business, is_comped) — colonnes que le poll n'écrit jamais ;
--   · signal_global('coin_config') : +1 à chaque écriture de coin_config.
-- Le poll lit le signal (une RPC) et ne saute une lecture que si le signal PROUVE qu'elle rendrait la même chose.
-- ⛔ Sans risque : un déclencheur qui échoue ne bloque jamais l'écriture du job ; il met jobs à NULL pour ce compte,
--    et le poll relit alors tout, comme avant. Aucune table ni colonne Cloud n'est touchée.
-- Inverse : supabase/rollbacks/20261102160000_signal_compte_INVERSE.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.compte_signal (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  jobs jsonb DEFAULT '{}'::jsonb,              -- NULL = compteurs inconnus : le poll relit tout
  profil_version bigint NOT NULL DEFAULT 0,
  maj_le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compte_signal ENABLE ROW LEVEL SECURITY;   -- aucune politique : lu seulement par signal_poll

CREATE TABLE IF NOT EXISTS public.signal_global (
  cle text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0,
  maj_le timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signal_global ENABLE ROW LEVEL SECURITY;
INSERT INTO public.signal_global (cle) VALUES ('coin_config') ON CONFLICT (cle) DO NOTHING;
-- Droits écrits (les droits par défaut sont révoqués dans ce projet) — posés en prod le 02/11 juste après la migration.
GRANT ALL ON TABLE public.compte_signal TO service_role;   -- droits : serveur seulement (compte_signal : signal_poll, déclencheurs)
GRANT ALL ON TABLE public.signal_global TO service_role;   -- droits : serveur seulement (signal_global : signal_poll, déclencheur)

-- Ajuste un compteur « action|statut » d'un compte ; une clé à 0 disparaît.
CREATE OR REPLACE FUNCTION public.compte_signal_ajuster(p_user uuid, p_cle text, p_delta int)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.compte_signal AS s (user_id, jobs, maj_le)
  VALUES (p_user, CASE WHEN p_delta > 0 THEN jsonb_build_object(p_cle, p_delta) ELSE '{}'::jsonb END, now())
  ON CONFLICT (user_id) DO UPDATE SET
    jobs = CASE
      WHEN s.jobs IS NULL THEN NULL
      WHEN COALESCE((s.jobs ->> p_cle)::int, 0) + p_delta <= 0 THEN s.jobs - p_cle
      ELSE jsonb_set(s.jobs, ARRAY[p_cle], to_jsonb(COALESCE((s.jobs ->> p_cle)::int, 0) + p_delta))
    END,
    maj_le = now();
$$;
REVOKE ALL ON FUNCTION public.compte_signal_ajuster(uuid, text, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cross_post_jobs_compte_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.user_id IS NOT NULL
       AND (TG_OP = 'DELETE' OR OLD.user_id IS DISTINCT FROM NEW.user_id
            OR OLD.status IS DISTINCT FROM NEW.status OR OLD.action IS DISTINCT FROM NEW.action) THEN
      PERFORM public.compte_signal_ajuster(OLD.user_id, COALESCE(OLD.action, '?') || '|' || COALESCE(OLD.status, '?'), -1);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.user_id IS DISTINCT FROM NEW.user_id
            OR OLD.status IS DISTINCT FROM NEW.status OR OLD.action IS DISTINCT FROM NEW.action) THEN
      PERFORM public.compte_signal_ajuster(NEW.user_id, COALESCE(NEW.action, '?') || '|' || COALESCE(NEW.status, '?'), 1);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Jamais l'écriture du job bloquée : les compteurs de ce compte deviennent inconnus (le poll relit tout).
    BEGIN
      UPDATE public.compte_signal SET jobs = NULL, maj_le = now()
       WHERE user_id IN (COALESCE(NEW.user_id, OLD.user_id), COALESCE(OLD.user_id, NEW.user_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE WARNING 'cross_post_jobs_compte_signal : % — compteurs du compte mis à inconnu', SQLERRM;
  END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.profiles_compte_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.beta_flags IS DISTINCT FROM OLD.beta_flags OR NEW.is_premium IS DISTINCT FROM OLD.is_premium
     OR NEW.is_pro IS DISTINCT FROM OLD.is_pro OR NEW.is_business IS DISTINCT FROM OLD.is_business
     OR NEW.is_comped IS DISTINCT FROM OLD.is_comped THEN
    INSERT INTO public.compte_signal AS s (user_id, profil_version, maj_le) VALUES (NEW.id, 1, now())
    ON CONFLICT (user_id) DO UPDATE SET profil_version = s.profil_version + 1, maj_le = now();
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'profiles_compte_signal : %', SQLERRM;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.coin_config_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.signal_global SET version = version + 1, maj_le = now() WHERE cle = 'coin_config';
  RETURN NULL;
END $$;

-- Le signal d'UN compte, pour le poll : ses compteurs de jobs, la version de son profil, celle de coin_config.
-- Un client ne lit que le sien ; le service lit n'importe lequel.
CREATE OR REPLACE FUNCTION public.signal_poll(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user THEN NULL ELSE
    jsonb_build_object(
      'jobs', CASE WHEN s.user_id IS NULL THEN '{}'::jsonb ELSE s.jobs END,
      'profil_version', COALESCE(s.profil_version, 0),
      'coin_config_version', (SELECT g.version FROM public.signal_global g WHERE g.cle = 'coin_config'))
  END
  FROM (SELECT p_user AS u) x LEFT JOIN public.compte_signal s ON s.user_id = x.u;
$$;
REVOKE ALL ON FUNCTION public.signal_poll(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signal_poll(uuid) TO authenticated, service_role;

-- Compteurs exacts : écritures de cross_post_jobs suspendues le temps de poser le déclencheur et de compter
-- (160 000 lignes, une fraction de seconde) — aucune écriture ne peut tomber entre les deux.
LOCK TABLE public.cross_post_jobs IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS cross_post_jobs_compte_signal ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_compte_signal
  AFTER INSERT OR DELETE OR UPDATE OF status, action, user_id ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cross_post_jobs_compte_signal();
INSERT INTO public.compte_signal (user_id, jobs, maj_le)
SELECT c.user_id, jsonb_object_agg(c.cle, c.n), now()
  FROM (SELECT j.user_id, COALESCE(j.action, '?') || '|' || COALESCE(j.status, '?') AS cle, count(*)::int AS n
          FROM public.cross_post_jobs j
         WHERE j.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = j.user_id)
         GROUP BY 1, 2) c
 GROUP BY c.user_id
ON CONFLICT (user_id) DO UPDATE SET jobs = EXCLUDED.jobs, maj_le = now();

DROP TRIGGER IF EXISTS profiles_compte_signal ON public.profiles;
CREATE TRIGGER profiles_compte_signal
  AFTER UPDATE OF beta_flags, is_premium, is_pro, is_business, is_comped ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_compte_signal();

DROP TRIGGER IF EXISTS coin_config_signal ON public.coin_config;
CREATE TRIGGER coin_config_signal
  AFTER INSERT OR UPDATE OR DELETE ON public.coin_config
  FOR EACH STATEMENT EXECUTE FUNCTION public.coin_config_signal();

COMMIT;
