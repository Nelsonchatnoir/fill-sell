-- INVERSE de 20261114013000_veille_annonces_recentes — les deux corps de PROD relus le 13/11, à l'octet
-- (md5 43a77328b052658dc5b4f646b767ef7d et 6d7c4f4801fd15fb2cebbdd2eae00b11), le déclencheur et les fonctions neuves
-- retirés, l'interrupteur effacé. Les relevés 'recentes' déjà écrits restent (journal) ; les fiches déjà importées
-- restent (elles sont passées par rapprocher_importer comme sur « Synchroniser »).
--   npx supabase db query --linked -f supabase/rollbacks/20261114013000_veille_annonces_recentes_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_rapprochement_fin_recentes ON public.vinted_sync_runs;
DROP FUNCTION IF EXISTS public.veille_recentes_clore(uuid, jsonb);
DROP FUNCTION IF EXISTS public.veille_recentes_ouvrir(text, text[], text, text);
DROP FUNCTION IF EXISTS public.veille_recentes_droits();
DROP FUNCTION IF EXISTS public.veille_recentes_trier(uuid, text, text[]);
DELETE FROM public.coin_config WHERE key = 'veille_recentes_ouverte';

CREATE OR REPLACE FUNCTION public.rapprochement_v3_releves_en_cours(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM vinted_sync_runs s
                  WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                    AND ((s.status = 'queued' AND COALESCE(s.queued_at, s.updated_at) > now() - interval '30 minutes')
                      OR (s.status = 'running' AND COALESCE(s.progres_le, s.updated_at, s.started_at) > now() - interval '10 minutes')));
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_fiche_de(p_user uuid, p_annonce uuid, p_geste boolean)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a annonces_plateforme%ROWTYPE; v_run vinted_sync_runs%ROWTYPE; v_imp jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce AND user_id = p_user;
  IF a.id IS NULL THEN RETURN NULL; END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN a.inventaire_id; END IF;
  IF a.platform = 'opla' AND opla_sortie_passee() THEN RETURN NULL; END IF;   -- (22/10) Opla quittée : jamais une fiche neuve
  IF a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL OR a.fiche_supprimee_le IS NOT NULL THEN RETURN NULL; END IF;
  IF a.statut_plateforme IS DISTINCT FROM 'en_ligne' THEN RETURN NULL; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN NULL; END IF;
  IF a.platform = 'ebay' AND a.run_id IS NOT NULL AND releve_ebay_run_bloque(a.run_id) THEN RETURN NULL; END IF;
  -- (26/10, B1) La dette Beebs ne retient plus QUE les annonces apparues après le dépôt sans numéro le plus ancien
  -- (elles seules peuvent être lui) : une annonce vue avant — un stock réinitialisé — se réimporte.
  IF a.platform = 'beebs' AND releve_dette_beebs_depuis(p_user, COALESCE(a.publiee_le, a.created_at)) THEN RETURN NULL; END IF;
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN RETURN NULL; END IF;
  IF NOT p_geste THEN
    SELECT * INTO v_run FROM vinted_sync_runs WHERE id = a.run_id;
    -- (26/10, Julian Boissel — Nico) Le relevé serveur d'un compte eBay relié importe comme « Synchroniser »
    -- (même exception que PROPOSITION_20261026171000, pour que l'ordre d'application ne la perde jamais).
    IF NOT (releve_est_geste(v_run.declencheur)
            OR (a.platform = 'ebay' AND v_run.declencheur IN ('serveur:quotidien_api', 'serveur:lecture_origine'))) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_imp := rapprocher_importer(p_user, a.id, 'rapprochement');
  IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN (v_imp ->> 'inventaire_id')::bigint; END IF;
  RETURN NULL;
END;
$function$;

COMMIT;
