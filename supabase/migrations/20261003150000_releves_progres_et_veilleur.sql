-- ═══════════════════════════════════════════════════════════════════════════
-- RELEVÉS : LA PROGRESSION SE MESURE, ET LE VEILLEUR NE BOUCLE PLUS SUR UN ÉCHEC
-- (03/10, points 28 et 31)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. progres_le — LE DERNIER MOMENT OÙ LE RELEVÉ A AVANCÉ.
--    doriane-henri, 03/10 : relevé Vinted réclamé à 10:43, « running » à
--    12:44, page 1, 0 article lu — et updated_at frais (12:44:43) : la reprise
--    automatique de l'extension ré-ouvre la ligne et la touche sans rien lire.
--    Le chien de garde (handler-watch) jugeait sur updated_at et sur 30 min :
--    un relevé mort occupait la place des heures. On mesure désormais la
--    PROGRESSION elle-même : posée à la prise (passage en 'running'), avancée
--    à chaque changement de page, d'articles lus, créés, mis à jour ou du
--    total annoncé — jamais par une simple écriture d'erreur ou d'heure.
--    Toutes versions d'extension : c'est la base qui le pose.
-- 2. LE VEILLEUR S'ESPACE APRÈS UN ÉCHEC.
--    44310spgl : 63 relevés Opla « veilleur » en 4 jours, tous « absente »
--    (session Opla fermée), un toutes les ~15 min. La garde existante
--    (garde_releve_vide_sync_runs) ne couvrait que les relevés VIDES. Même
--    principe ici pour les relevés en ÉCHEC (absente, failed, expired,
--    interrupted) : 1 h après le premier, 3 h après le deuxième, 6 h ensuite.
--    Un relevé demandé par la personne (app, bouton), le relevé quotidien et
--    ceux du serveur ne sont JAMAIS retenus ici — et un relevé réussi remet
--    tout à zéro.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS).

ALTER TABLE public.vinted_sync_runs ADD COLUMN IF NOT EXISTS progres_le timestamptz;

CREATE OR REPLACE FUNCTION public.vinted_sync_runs_progres()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'running' THEN NEW.progres_le := now(); END IF;
    RETURN NEW;
  END IF;
  -- Prise ou ré-ouverture : le compteur repart de la prise (ce n'est pas un
  -- progrès, c'est le point de départ de la mesure).
  IF NEW.status = 'running' AND OLD.status IS DISTINCT FROM 'running' THEN
    NEW.progres_le := now();
    RETURN NEW;
  END IF;
  IF NEW.items_vus IS DISTINCT FROM OLD.items_vus
     OR NEW.page_suivante IS DISTINCT FROM OLD.page_suivante
     OR NEW.items_crees IS DISTINCT FROM OLD.items_crees
     OR NEW.items_maj IS DISTINCT FROM OLD.items_maj
     OR NEW.total_entries IS DISTINCT FROM OLD.total_entries THEN
    NEW.progres_le := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vinted_sync_runs_progres ON public.vinted_sync_runs;
CREATE TRIGGER vinted_sync_runs_progres
  BEFORE INSERT OR UPDATE ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.vinted_sync_runs_progres();

-- Les relevés vivants à l'application : leur départ connu fait foi.
UPDATE public.vinted_sync_runs
   SET progres_le = COALESCE(claimed_at, started_at, updated_at)
 WHERE status = 'running' AND progres_le IS NULL;

-- ── L'état « échecs d'affilée » d'une plateforme, pour le veilleur ─────────
CREATE OR REPLACE FUNCTION public.releve_echec_etat(p_user uuid, p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_echecs integer := 0;
  v_dernier timestamptz := NULL;
  v_attente interval;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL THEN
    RETURN jsonb_build_object('echecs_consecutifs', 0);
  END IF;
  FOR r IN
    SELECT status, finished_at, items_vus
      FROM vinted_sync_runs
     WHERE user_id = p_user AND kind = 'annonces' AND platform = p_platform
       AND finished_at IS NOT NULL
       AND status IN ('done', 'absente', 'failed', 'expired', 'interrupted', 'incomplete')
     ORDER BY finished_at DESC
     LIMIT 20
  LOOP
    -- Le premier relevé RÉUSSI clôt la série (même vide : la garde des
    -- relevés vides s'en occupe).
    EXIT WHEN r.status = 'done';
    v_echecs := v_echecs + 1;
    IF v_echecs = 1 THEN v_dernier := r.finished_at; END IF;
  END LOOP;
  v_attente := CASE WHEN v_echecs = 0 THEN NULL
                    WHEN v_echecs = 1 THEN interval '1 hour'
                    WHEN v_echecs = 2 THEN interval '3 hours'
                    ELSE interval '6 hours' END;
  RETURN jsonb_build_object(
    'platform', p_platform,
    'echecs_consecutifs', v_echecs,
    'dernier_echec_le', v_dernier,
    'reprise_veilleur_le', CASE WHEN v_attente IS NOT NULL THEN v_dernier + v_attente END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.garde_releve_echec_veilleur()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_etat jsonb;
  v_reprise timestamptz;
BEGIN
  -- Seul le VEILLEUR est gardé (mêmes bornes que garde_releve_vide_sync_runs).
  IF NEW.kind IS DISTINCT FROM 'annonces'
     OR NEW.declencheur IS DISTINCT FROM 'veilleur'
     OR NEW.status NOT IN ('queued', 'running') THEN
    RETURN NEW;
  END IF;
  v_etat := releve_echec_etat(NEW.user_id, NEW.platform);
  v_reprise := (v_etat ->> 'reprise_veilleur_le')::timestamptz;
  IF v_reprise IS NOT NULL AND now() < v_reprise THEN
    RAISE EXCEPTION 'RELEVE_ECHEC_ESPACE: % relevé(s) % en échec d''affilée (dernier le %) — le veilleur attend jusqu''à % ; un relevé demandé depuis l''app part toujours',
      v_etat ->> 'echecs_consecutifs', NEW.platform, v_etat ->> 'dernier_echec_le', v_reprise;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS garde_releve_echec_veilleur ON public.vinted_sync_runs;
CREATE TRIGGER garde_releve_echec_veilleur
  BEFORE INSERT ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_releve_echec_veilleur();
