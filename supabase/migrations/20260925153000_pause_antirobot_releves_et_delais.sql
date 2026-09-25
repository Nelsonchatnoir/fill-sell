-- ═══════════════════════════════════════════════════════════════════════════
-- PAUSE ANTI-ROBOT D'UN COMPTE VINTED : NI RELEVÉ, NI DÉLAI QUI COURT
-- (2026-09-25 après-midi, points 4 et 5)
-- ═══════════════════════════════════════════════════════════════════════════
-- La pause (get-pending-jobs, 9b5027f) retient les JOBS Vinted d'un compte que
-- Vinted soumet à sa vérification anti-robot (marqueur
-- `platform_fields.attente_antirobot_compte`). Deux trous :
--   · point 5 — les RELEVÉS du dressing continuaient de frapper Vinted pendant
--     la vérification (alarme quotidienne de l'extension, bouton, reprises) ;
--   · point 4 — les délais continuaient de courir : un job en pause pouvait
--     être clos comme « dépôt muet » (10 j, handler-watch) ou par le filet des
--     30 jours (expire_publish_reservations).
-- CE QUE POSE CETTE MIGRATION :
--   1. compte_en_pause_antirobot(user) : un job Vinted en file porte le
--      marqueur. UNE définition, lue par le trigger ci-dessous et le filet.
--   2. garde_pause_antirobot_sync_runs (BEFORE INSERT OR UPDATE sur
--      vinted_sync_runs) : pendant la pause, un relevé du dressing ne peut ni
--      DÉMARRER (insertion directe en 'running' par l'extension — alarme,
--      bouton) ni être RÉCLAMÉ/ROUVERT (passage à 'running' : commande
--      servie, reprise après 403, reprise automatique). Toutes les versions
--      d'extension l'ont : l'extension reçoit un refus AVANT d'ouvrir le
--      moindre onglet (« run non créé »). Une DEMANDE ('queued', depuis l'app)
--      reste acceptée : elle attend en file et part à la levée.
--      ⛔ Un relevé déjà en cours n'est pas arrêté ici (ses écritures de
--      progression gardent 'running') ; ni les autres plateformes, ni la sonde.
--   3. expire_publish_reservations (corps PROD, md5
--      f00beb9c7ecbdf1e0883a4c65879cde6, patché en place) : le filet des 30
--      jours ne clôt jamais un job Vinted d'un compte en pause, et le temps
--      passé en pause (`antirobot_pause_cumul_ms`, posé à la levée par
--      get-pending-jobs) ne compte pas.
-- (Côté fonctions : handler-watch — dépôts muets —, get-pending-jobs — relevé
--  retenu, retrait sans lien, cumul posé à la levée, relevé remis en file —,
--  email-tunnel — ni relance ni « cas 3 » pendant la pause.)
-- ⛔ NE S'APPLIQUE PAS PAR `db push` (CLAUDE.md). Une par une.

DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.expire_publish_reservations()'::regprocedure)) <> 'f00beb9c7ecbdf1e0883a4c65879cde6' THEN
    RAISE EXCEPTION 'expire_publish_reservations a changé en prod depuis la lecture — ON S ARRETE';
  END IF;
END
$verif$;

-- ── 1. LA PAUSE, UNE DÉFINITION ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compte_en_pause_antirobot(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM cross_post_jobs j
     WHERE j.user_id = p_user AND j.platform = 'vinted' AND j.status = 'pending'
       AND j.platform_fields ? 'attente_antirobot_compte');
$function$;
REVOKE ALL ON FUNCTION public.compte_en_pause_antirobot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compte_en_pause_antirobot(uuid) TO service_role;

-- ── 2. AUCUN RELEVÉ VINTED NE DÉMARRE PENDANT LA PAUSE ──────────────────────
CREATE OR REPLACE FUNCTION public.garde_pause_antirobot_sync_runs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kind IS DISTINCT FROM 'dressing' OR NEW.status IS DISTINCT FROM 'running' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'running' THEN RETURN NEW; END IF;  -- progression d'un relevé en cours
  IF compte_en_pause_antirobot(NEW.user_id) THEN
    RAISE EXCEPTION 'pause_antirobot_vinted : Vinted demande une vérification anti-robot sur ce compte — aucun relevé Vinted tant qu''elle n''est pas passée (il repartira seul à la levée).'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.garde_pause_antirobot_sync_runs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS garde_pause_antirobot_sync_runs ON public.vinted_sync_runs;
CREATE TRIGGER garde_pause_antirobot_sync_runs
  BEFORE INSERT OR UPDATE OF status ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_pause_antirobot_sync_runs();

-- ── 3. LE FILET DES 30 JOURS NE CLÔT JAMAIS UN JOB EN PAUSE ─────────────────
DO $patch$
DECLARE
  v_src text; v_new text; c int;
  a1 text := $a1$        WHEN j.created_at < now() - interval '30 days' THEN 'filet_30j'$a1$;
  b1 text := $b1$        -- MODIF 2026-09-25 : jamais pendant une pause anti-robot du compte Vinted, et le temps passé en pause ne compte pas.
        WHEN j.created_at + make_interval(secs => COALESCE(NULLIF(j.platform_fields ->> 'antirobot_pause_cumul_ms', '')::double precision, 0) / 1000)
               < now() - interval '30 days'
             AND NOT (j.platform = 'vinted' AND compte_en_pause_antirobot(j.user_id)) THEN 'filet_30j'$b1$;
BEGIN
  SELECT pg_get_functiondef('public.expire_publish_reservations()'::regprocedure) INTO v_src;
  IF md5(v_src) <> 'f00beb9c7ecbdf1e0883a4c65879cde6' THEN RAISE EXCEPTION 'expire_publish_reservations : md5 inattendu — ON S ARRETE'; END IF;
  c := (length(v_src) - length(replace(v_src, a1, ''))) / length(a1);
  IF c <> 1 THEN RAISE EXCEPTION 'expire_publish_reservations : ancre trouvée % fois (attendu 1) — ON S ARRETE', c; END IF;
  v_new := replace(v_src, a1, b1);
  EXECUTE v_new;
END
$patch$;
