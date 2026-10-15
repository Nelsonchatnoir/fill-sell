-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir — CLÔTURE DU ROUGE, points 5 et 6.
-- Inverse : supabase/rollbacks/20261015210000_remise_en_file_et_titre_recable.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. (point 5, geronimo) TOUTE REMISE EN FILE EST DATÉE PAR LA BASE.
--    Le balayage des dépôts muets (handler-watch) comptait l'âge d'un dépôt
--    depuis sa création : une relance à la main ou par le serveur ne le
--    faisait pas repartir (« Le Livre des Louveteaux », créé le 03/10, relancé
--    le 15/10, annulé à 20:03). handler-watch v110 compte désormais depuis la
--    dernière remise en file (_shared/depot-muet.js) ; la base la date pour
--    TOUS les chemins (app, serveur, réparations, SQL) : passage à « pending »
--    depuis « needs_user », « failed » ou « cancelled » → platform_fields
--    .remis_en_file_le = now(). Une reprise technique (processing → pending)
--    n'est pas une remise en file.
-- 2. (point 6, XEWER) LE RECÂBLAGE D'UN JOB SUR UNE AUTRE ANNONCE EMPORTE SON
--    TITRE. rapprocher_recabler_job changeait le lien et le numéro, jamais le
--    titre : le job d'import de la fiche « Need for Speed ProStreet » gardait
--    « Pure PS3 » (proposition fausse acceptée puis corrigée le 19/09), et la
--    garde Leboncoin de l'extension bloquait chaque republication. Le titre du
--    job devient celui de l'annonce visée quand le relevé le connaît ; l'ancien
--    reste tracé (rattachement.ancien_titre). Corps repris de
--    pg_get_functiondef en prod le 15/10 à 21:10, seules les lignes marquées
--    « (15/10 soir) » changent.

-- ── 1. remis_en_file_le ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cross_post_jobs_remis_en_file()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'pending' AND OLD.status IN ('needs_user', 'failed', 'cancelled') THEN
    NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb) || jsonb_build_object('remis_en_file_le', now());
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS cross_post_jobs_remis_en_file ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_remis_en_file
  BEFORE UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cross_post_jobs_remis_en_file();

-- ── 2. rapprocher_recabler_job : le titre suit l'annonce ───────────────────
CREATE OR REPLACE FUNCTION public.rapprocher_recabler_job(p_job uuid, p_url text, p_listing_id text, p_par text, p_detail jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pf jsonb; v_ancienne text; v_ancien_id text;
  v_user uuid; v_platform text; v_titre text; v_titre_annonce text; -- (15/10 soir)
BEGIN
  SELECT platform_fields, listing_url, platform_listing_id, user_id, platform, title
    INTO v_pf, v_ancienne, v_ancien_id, v_user, v_platform, v_titre FROM cross_post_jobs WHERE id = p_job; -- (15/10 soir)
  -- Point A : aucun changement d'identité sans geste utilisateur.
  IF p_par IS DISTINCT FROM 'utilisateur'
     AND NOT public.listing_designe(p_listing_id, v_ancienne, v_ancien_id) THEN
    RAISE EXCEPTION 'Identité non prouvée : confirme le rattachement dans tes annonces.';
  END IF;
  -- (15/10 soir) Le titre de l'annonce visée, quand le relevé le connaît.
  SELECT a.titre INTO v_titre_annonce
    FROM annonces_plateforme a
   WHERE a.user_id = v_user AND a.platform = v_platform AND a.listing_id = p_listing_id
     AND NULLIF(btrim(a.titre), '') IS NOT NULL
   ORDER BY a.vu_le DESC NULLS LAST
   LIMIT 1;
  v_pf := COALESCE(v_pf, '{}'::jsonb);
  v_pf := (v_pf - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
          || jsonb_build_object(
               'rattachement', jsonb_build_object('par', p_par, 'at', now(), 'ancienne_url', v_ancienne, 'ancien_listing_id', v_ancien_id)
                 || CASE WHEN v_titre_annonce IS NOT NULL AND v_titre_annonce IS DISTINCT FROM v_titre
                         THEN jsonb_build_object('ancien_titre', v_titre) ELSE '{}'::jsonb END -- (15/10 soir)
                 || COALESCE(p_detail, '{}'::jsonb),
               'listing_url_precedente', v_ancienne);
  UPDATE cross_post_jobs
     SET listing_url = p_url, platform_listing_id = p_listing_id, platform_fields = v_pf, last_checked_at = NULL,
         title = COALESCE(v_titre_annonce, title) -- (15/10 soir)
   WHERE id = p_job;
END;
$function$;
