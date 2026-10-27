-- ═══════════════════════════════════════════════════════════════════════════
-- 20261027100000_jamais_en_ligne_referme_par_le_releve   (feu vert NOMMÉ de Nico, 27/10 ~09:20 : « Feu vert […] applique 20261027100000,
--   lance la réparation »)
-- Corps relus en prod juste avant l'application (27/10 09:22) : md5 identiques à ceux ci-dessous.
-- (27/10, GTA de BONCOIN, rapport docs/enquetes/jamais-en-ligne-2710/RAPPORT.md)
-- UNE LIGNE « JAMAIS MISE EN LIGNE » DONT L'ARTICLE EST RETROUVÉ EN LIGNE SE REFERME SEULE ; LE MOTIF DIT CE QU'ON SAIT.
-- Cas : dépôt Leboncoin 3294665225 (24/10 23:11, adsubmit 201) jugé « refusé par sa modération » le 26/10 à 16:54:22,
-- à la fin du relevé 941f3088 ; ce MÊME relevé avait lu l'article en ligne sous 3295468043 (autre annonce, déposée hors
-- FillSell le 26/10 vers 01:49), que le rapprochement a rattachée à la fiche à 16:57:40 — trois minutes APRÈS le
-- jugement. Rien ne revenait jamais sur une ligne failed : la clôture « article en ligne ailleurs » (09/10) ne lisait
-- que les annonces DÉJÀ rattachées au moment du jugement, et les 38 Beebs + 6 Leboncoin repassés « publiés » du 10/10
-- au 21/10 étaient tous des relances (erreurs_archivees.par = relance_manuelle) — pas un rattrapage. Cas jamais
-- couvert, pas une régression.
--  · depot_jamais_en_ligne_refermer (neuve) : la règle — même numéro (le dépôt est en ligne : « publiée », ou close
--    si une autre publication la suit) ou autre annonce de la MÊME fiche, MÊME plateforme, MÊME compte (close sans
--    rouge). Jamais un titre. Rien redéposé, retiré, vendu ; aucun quota, aucun mail.
--  · annonces_plateforme_referme_depot_ins / _maj (neufs) : la règle dès qu'une annonce en ligne apparaît ou est
--    rattachée à une fiche (changements utiles seulement).
--  · trancher_publications_sans_lien : la règle à chaque relevé complet (rattrapage) ; motifs sans « refusée par sa
--    modération » ni « refusée par sa vérification » : absente de tes annonces aux relevés du … et du …, aucun motif
--    donné ; la clôture « en ligne ailleurs » sans « refusé à la vérification ou retiré ». Logique inchangée sinon.
--  · fail_publish_without_listing_url : le motif de la sonde Leboncoin 72 h, même principe. Logique inchangée.
-- Corps de base relus en prod (pg_get_functiondef) le 27/10 : trancher md5 edcedd1f54d11b01aee8b826b6ce0507 (= la
-- migration 20261025120000), fail_publish md5 d7cb366098abafab120c59791ad34fb0. Droits : trancher {postgres,
-- service_role}, fail_publish {postgres} — reposés tels quels.
-- Application : npx supabase db query --linked -f supabase/migrations/20261027100000_jamais_en_ligne_referme_par_le_releve.sql
--               npx supabase migration repair --linked --status applied 20261027100000
-- Puis la réparation des lignes déjà jugées : scripts/reparations/20261027_jamais_en_ligne_refermes.sql
-- Essai à blanc (ROLLBACK) : scripts/essais/20261027100000_essai.sql (bash scripts/essais/20261027100000_generer.sh)
-- Inverse : supabase/rollbacks/20261027100000_jamais_en_ligne_referme_par_le_releve_INVERSE.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. LA RÈGLE : depot_jamais_en_ligne_refermer ─────────────────────────────────────────────────────────────
-- Une publication en échec « jamais mise en ligne » (status failed + platform_fields.depot_jamais_en_ligne, posé
-- par trancher_publications_sans_lien ou fail_publish_without_listing_url) dont l'article est RETROUVÉ EN LIGNE
-- par un relevé de CE compte, sur CETTE plateforme, se referme seule :
--   a. MÊME NUMÉRO — une annonce en ligne porte un identifiant du dépôt (numéro du job, lien, adsubmit) : le dépôt
--      a bien été mis en ligne. Personne d'autre ne la suit → la ligne repasse « publiée » avec son lien (erreur
--      archivée). Déjà suivie par une autre publication de FillSell → close sans rouge (jamais deux lignes
--      publiées sur une annonce).
--   b. AUTRE NUMÉRO, MÊME FICHE — une autre annonce rattachée à la MÊME fiche (annonces_plateforme.inventaire_id,
--      posé par le rapprochement ou par la personne) est en ligne : close sans rouge, « ton article y est en ligne
--      sous l'annonce … ». C'est la clôture que le jugement écrit déjà quand l'annonce est rattachée AVANT lui.
-- Jamais sur un titre, une photo ou un prix seuls : un identifiant du dépôt, ou la fiche. Jamais une fiche jumelle
-- ici (autre fiche). Rien n'est redéposé, retiré ni vendu par cette règle ; aucun quota touché (la publication a
-- été rendue au jugement, elle le reste) ; aucun mail. Bornée : 25 lignes par appel, publications seules (une
-- republication a son propre circuit, « introuvable à confirmer »), Vinted exclu (sa preuve est le dressing).
-- Appelée par le déclencheur des annonces (dès qu'une annonce en ligne apparaît ou est rattachée à une fiche) et
-- par trancher_publications_sans_lien à chaque relevé complet (rattrapage). Sans filtre (p_inventaire et
-- p_listing_id nuls) : toutes les lignes en échec « jamais en ligne » du compte sur la plateforme.
CREATE OR REPLACE FUNCTION public.depot_jamais_en_ligne_refermer(p_user uuid, p_platform text, p_inventaire bigint DEFAULT NULL,
                                                                p_listing_id text DEFAULT NULL, p_run_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j record;
  a record;
  v_ids text[];
  v_suivi uuid;
  v_nom text;
  v_trace jsonb;
  v_arch jsonb;
  v_vue text;
  n_publiees integer := 0; n_closes integer := 0; n_vues integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_platform = 'vinted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
                           WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  FOR j IN
    SELECT c.id, c.inventaire_id, c.platform_listing_id, c.listing_url, c.error, c.platform_fields
      FROM cross_post_jobs c
     WHERE c.user_id = p_user AND c.status = 'failed' AND c.platform = p_platform
       AND COALESCE(c.action, 'publish') = 'publish'
       AND COALESCE(c.platform_fields, '{}'::jsonb) ? 'depot_jamais_en_ligne'
       AND ((p_inventaire IS NULL AND p_listing_id IS NULL)
            OR c.inventaire_id = p_inventaire
            OR btrim(c.platform_listing_id) = p_listing_id
            OR c.platform_fields #>> '{lbc_depot,adsubmit,id}' = p_listing_id
            OR COALESCE(c.platform_fields #> '{depot_jamais_en_ligne,identifiants}', '[]'::jsonb) ? p_listing_id)
     ORDER BY c.created_at
     LIMIT 25
     FOR UPDATE SKIP LOCKED
  LOOP
    n_vues := n_vues + 1;
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        annonce_id_job(p_platform, j.listing_url),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')]
        || ARRAY(SELECT btrim(e) FROM jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(j.platform_fields #> '{depot_jamais_en_ligne,identifiants}') = 'array'
                  THEN j.platform_fields #> '{depot_jamais_en_ligne,identifiants}' ELSE '[]'::jsonb END) e)
      ) AS x WHERE x IS NOT NULL AND x <> '');
    v_trace := CASE WHEN jsonb_typeof(j.platform_fields -> 'depot_jamais_en_ligne') = 'object'
                    THEN j.platform_fields -> 'depot_jamais_en_ligne' ELSE '{}'::jsonb END;
    -- L'erreur affichée part aux archives (20 dernières, comme _shared/erreurs-archivees.js).
    v_arch := CASE WHEN jsonb_typeof(j.platform_fields -> 'erreurs_archivees') = 'array'
                   THEN j.platform_fields -> 'erreurs_archivees' ELSE '[]'::jsonb END
              || CASE WHEN NULLIF(btrim(j.error), '') IS NULL THEN '[]'::jsonb
                      ELSE jsonb_build_array(jsonb_build_object('le', now(), 'statut', 'failed', 'erreur', left(j.error, 600),
                             'par', 'releve : article retrouvé en ligne')) END;
    IF jsonb_array_length(v_arch) > 20 THEN
      v_arch := (SELECT jsonb_agg(e ORDER BY o) FROM jsonb_array_elements(v_arch) WITH ORDINALITY t(e, o)
                  WHERE o > jsonb_array_length(v_arch) - 20);
    END IF;

    -- a. MÊME NUMÉRO : le dépôt lui-même est en ligne.
    SELECT ap.id, ap.listing_id, ap.url, ap.job_id, ap.run_id, ap.vu_le INTO a FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY (COALESCE(v_ids, ARRAY[]::text[]))
       AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL
     ORDER BY ap.vu_le DESC NULLS LAST LIMIT 1;
    IF a.id IS NOT NULL THEN
      v_vue := to_char(a.vu_le AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');
      v_suivi := NULL;
      IF a.job_id IS NOT NULL AND a.job_id <> j.id THEN
        SELECT o.id INTO v_suivi FROM cross_post_jobs o
         WHERE o.id = a.job_id AND o.user_id = p_user AND o.status IN ('published', 'sold');
      END IF;
      IF v_suivi IS NULL AND NULLIF(btrim(a.url), '') IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'published', error = NULL, listing_url = a.url,
          platform_listing_id = COALESCE(NULLIF(btrim(platform_listing_id), ''), a.listing_id),
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['depot_jamais_en_ligne', 'pas_encore_visible'])
            || jsonb_build_object(
              'erreurs_archivees', v_arch,
              'depot_jamais_en_ligne_leve', jsonb_build_object('le', now(), 'par', 'releve', 'run_id', COALESCE(p_run_id, a.run_id),
                'annonce', a.listing_id, 'annonce_id', a.id, 'vue_le', a.vu_le, 'constat', v_trace))
         WHERE id = j.id AND status = 'failed';
        IF FOUND THEN n_publiees := n_publiees + 1; END IF;
        CONTINUE;
      END IF;
      IF v_suivi IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = 'Ce dépôt est en ligne sur ' || v_nom || ' sous l''annonce ' || a.listing_id || ' (vue au relevé du ' || v_vue
            || '), déjà suivie par FillSell : rien à refaire, rien n''est vendu.',
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'pas_encore_visible'])
            || jsonb_build_object(
              'erreurs_archivees', v_arch,
              'depot_jamais_en_ligne', v_trace || jsonb_build_object('issue', 'en_ligne_meme_numero', 'issue_avant', v_trace -> 'issue',
                'annonce_en_ligne', a.listing_id,
                'refermee', jsonb_build_object('le', now(), 'par', 'releve', 'run_id', COALESCE(p_run_id, a.run_id),
                  'annonce_id', a.id, 'vue_le', a.vu_le, 'suivie_par', v_suivi)))
         WHERE id = j.id AND status = 'failed';
        IF FOUND THEN n_closes := n_closes + 1; END IF;
        CONTINUE;
      END IF;
    END IF;

    -- b. AUTRE NUMÉRO, MÊME FICHE, MÊME PLATEFORME, MÊME COMPTE.
    IF j.inventaire_id IS NULL THEN CONTINUE; END IF;
    SELECT ap.id, ap.listing_id, ap.url, ap.job_id, ap.run_id, ap.vu_le INTO a FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.inventaire_id = j.inventaire_id
       AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL
       AND ap.listing_id <> ALL (COALESCE(v_ids, ARRAY[]::text[]))
     ORDER BY ap.vu_le DESC NULLS LAST LIMIT 1;
    IF a.id IS NULL THEN CONTINUE; END IF;
    v_vue := to_char(a.vu_le AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');
    UPDATE cross_post_jobs SET status = 'cancelled',
      error = 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
        || a.listing_id || ' (vue au relevé du ' || v_vue || ') : rien à refaire, rien n''est vendu.',
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'pas_encore_visible'])
        || jsonb_build_object(
          'erreurs_archivees', v_arch,
          'depot_jamais_en_ligne', v_trace || jsonb_build_object('issue', 'article_en_ligne_ailleurs', 'issue_avant', v_trace -> 'issue',
            'annonce_en_ligne', a.listing_id,
            'refermee', jsonb_build_object('le', now(), 'par', 'releve', 'run_id', COALESCE(p_run_id, a.run_id),
              'annonce_id', a.id, 'vue_le', a.vu_le, 'suivie_par', a.job_id)))
     WHERE id = j.id AND status = 'failed';
    IF FOUND THEN n_closes := n_closes + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'vues', n_vues, 'publiees', n_publiees, 'closes', n_closes);
END;
$function$;
REVOKE ALL ON FUNCTION public.depot_jamais_en_ligne_refermer(uuid, text, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.depot_jamais_en_ligne_refermer(uuid, text, bigint, text, uuid) TO service_role;

-- ── 2. LE DÉCLENCHEUR : une annonce en ligne apparaît, ou est rattachée à une fiche ──────────────────────────────
-- Le 26/10, le jugement est tombé à 16:54:22 (fin du relevé), le rapprochement a rattaché 3295468043 à la fiche à
-- 16:57:40 (moteur du compte, après la clôture du run) : rien ne revenait sur la ligne. Désormais, l'arrivée d'une
-- annonce en ligne (INSERT) ou son changement utile (fiche, statut, disparition, retrait, numéro — jamais une ligne
-- relue à l'identique) referme les lignes du compte qu'elle prouve. Coût : une lecture par l'index (user_id, status)
-- des publications en échec du compte (13 au plus, mesuré le 27/10) ; rien d'autre quand il n'y en a pas.
CREATE OR REPLACE FUNCTION public.annonce_en_ligne_referme_depot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cross_post_jobs c
                  WHERE c.user_id = NEW.user_id AND c.status = 'failed' AND c.platform = NEW.platform
                    AND COALESCE(c.platform_fields, '{}'::jsonb) ? 'depot_jamais_en_ligne') THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM depot_jamais_en_ligne_refermer(NEW.user_id, NEW.platform, NEW.inventaire_id, NULLIF(btrim(NEW.listing_id), ''), NEW.run_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'annonce_en_ligne_referme_depot (annonce %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.annonce_en_ligne_referme_depot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS annonces_plateforme_referme_depot_ins ON public.annonces_plateforme;
CREATE TRIGGER annonces_plateforme_referme_depot_ins
  AFTER INSERT ON public.annonces_plateforme
  FOR EACH ROW
  WHEN (NEW.platform <> 'vinted' AND NEW.statut_plateforme = 'en_ligne' AND NEW.disparu_le IS NULL AND NEW.retiree_le IS NULL)
  EXECUTE FUNCTION public.annonce_en_ligne_referme_depot();

DROP TRIGGER IF EXISTS annonces_plateforme_referme_depot_maj ON public.annonces_plateforme;
CREATE TRIGGER annonces_plateforme_referme_depot_maj
  AFTER UPDATE OF inventaire_id, statut_plateforme, disparu_le, retiree_le, listing_id ON public.annonces_plateforme
  FOR EACH ROW
  WHEN (NEW.platform <> 'vinted' AND NEW.statut_plateforme = 'en_ligne' AND NEW.disparu_le IS NULL AND NEW.retiree_le IS NULL
        AND (OLD.inventaire_id IS DISTINCT FROM NEW.inventaire_id OR OLD.statut_plateforme IS DISTINCT FROM NEW.statut_plateforme
             OR OLD.disparu_le IS DISTINCT FROM NEW.disparu_le OR OLD.retiree_le IS DISTINCT FROM NEW.retiree_le
             OR OLD.listing_id IS DISTINCT FROM NEW.listing_id))
  EXECUTE FUNCTION public.annonce_en_ligne_referme_depot();

-- ── 3. trancher_publications_sans_lien : la règle à chaque relevé complet ; les motifs disent ce qu'on sait ─────────
CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
  v_jum_id text;
  v_grace interval;
  n_jumelle integer := 0; n_jamais_vues integer := 0; n_visibles integer := 0;
  v_refermees jsonb := NULL;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- (20/10) « PAS ENCORE VISIBLE » LEVÉ PAR LE RELEVÉ : une annonce que le relevé de CE compte voit en ligne (ou
  -- vendue) n'est plus « pas encore visible » — le marqueur posé par cross_post_jobs_vue_ou_pas_encore_visible
  -- s'efface. Bornée aux jobs qui le portent ; aucune autre ligne réécrite.
  UPDATE cross_post_jobs c SET platform_fields = c.platform_fields - 'pas_encore_visible'
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.platform_fields ? 'pas_encore_visible'
     AND EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.statut_plateforme IN ('en_ligne', 'vendue')
                    AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)));
  GET DIAGNOSTICS n_visibles = ROW_COUNT;
  -- (27/10, GTA de BONCOIN) UNE LIGNE « JAMAIS MISE EN LIGNE » DONT L'ARTICLE EST RETROUVÉ EN LIGNE SE REFERME :
  -- même numéro (le dépôt lui-même), ou une autre annonce de la MÊME fiche sur la MÊME plateforme, vue en ligne
  -- par un relevé de ce compte (depot_jamais_en_ligne_refermer). Le déclencheur des annonces la referme dès le
  -- rattachement ; cette passe, à chaque relevé, rattrape ce qu'il n'aurait pas vu. Jamais sur un titre.
  BEGIN
    v_refermees := depot_jamais_en_ligne_refermer(p_user, p_platform, NULL, NULL, p_run_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trancher_publications_sans_lien : refermeture (%, %) : %', p_user, p_platform, SQLERRM;
  END;

  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    -- (20/10, Louis) Comptes reliés sur une boutique PARTAGÉE : la fiche JUMELLE y est en ligne (vue par le relevé
    -- du compte relié) — ce dépôt était le doublon, refusé par la plateforme : clos sans rouge, rien à refaire.
    v_jum_id := NULL;
    IF j.inventaire_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
      SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
       WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
    END IF;
    IF v_jum_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
          || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', v_jum_id))
       WHERE id = j.id AND status = 'published';
      n_jumelle := n_jumelle + 1; n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    -- (27/10) Aucune plateforme ne donne de motif ici : le texte dit l'absence constatée, jamais « refusée par sa
    -- modération » (une déduction). Un vrai motif lu au dépôt (adsubmit 4xx) a son propre texte, ailleurs.
    v_msg := 'Cette annonce est absente de tes annonces ' || v_nom || ' aux relevés complets du '
      || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || ', et ' || v_nom || ' n''a donné aucun motif. '
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne sur ' || v_nom || '. '
           ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  -- ── (20/10, Sébastien) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE VENTE — AUSSI QUAND IL A UN LIEN ────────
  -- La boucle ci-dessus ne lit que les dépôts SANS lien. Un dépôt Beebs a toujours son lien (numéro → /fr/p/,
  -- déclencheur du 30/09) ; Leboncoin, eBay, Depop souvent. Jamais vu en ligne (aucun relevé de ce compte ne l'a
  -- vu, sous aucun statut ; la veille non plus), il ne pose plus la question « Plus en ligne — Vendue ? »
  -- (cross_post_jobs_vue_ou_pas_encore_visible) : il reste « pas encore visible ». Toujours absent de deux
  -- relevés complets après la grâce — 72 h pour Beebs (sa vérification est humaine), 4 h ailleurs — c'est un
  -- ÉCHEC DE PUBLICATION, traité comme celui d'au-dessus : 'failed' + motif + publication rendue, ou clos sans
  -- rouge quand l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié). Ni vente, ni
  -- stock touché, ni retrait, ni question. Vinted jamais (sa preuve est le dressing). Une question déjà ouverte
  -- reste telle quelle. Bornée : 14 derniers jours, 25 par relevé.
  IF p_platform <> 'vinted' THEN
    -- (25/10, proposition — mesure N11) Beebs : 7 jours, pas 72 h. 18 dépôts sortis de la vérification sans être en
    -- ligne le sont devenus 48 à 126 h plus tard (bd380fbf 34113827 : 67,6 h ; DeadRoz : 16 annonces à 86-126 h) ;
    -- à 7 jours, 0 faux refus sur 1 293 dépôts vus en ligne (31 jours).
    v_grace := CASE WHEN p_platform = 'beebs' THEN interval '7 days' ELSE interval '4 hours' END;
    FOR j IN
      SELECT c.id, c.platform_listing_id, c.listing_url, c.platform_fields, c.inventaire_id, c.vu_en_ligne_le,
             COALESCE(c.published_at, c.created_at) AS publie
        FROM cross_post_jobs c
       WHERE c.user_id = p_user AND c.platform = p_platform
         AND c.status = 'published' AND c.action = 'publish' AND c.listing_url IS NOT NULL
         AND c.vu_en_ligne_le IS NULL
         AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')
         AND COALESCE(c.published_at, c.created_at) > now() - interval '14 days'
         AND COALESCE(c.published_at, c.created_at) < now() - v_grace
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                          WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)))
       ORDER BY COALESCE(c.published_at, c.created_at)
       LIMIT 25 FOR UPDATE OF c SKIP LOCKED
    LOOP
      v_ids := ARRAY(
        SELECT DISTINCT x FROM unnest(ARRAY[
          NULLIF(btrim(j.platform_listing_id), ''),
          annonce_id_job(p_platform, j.listing_url),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
        ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
      IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;
      -- Vue par un relevé sous un de ses identifiants, ou rattachée au job (tout statut, « en vérification »
      -- compris) : ce n'est pas un refus — la plateforme l'examine encore, ou elle est en ligne.
      IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform
                    AND (ap.listing_id = ANY(v_ids) OR ap.job_id = j.id)) THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_precedent.id IS NULL OR v_precedent.started_at < j.publie + v_grace THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_vivante := NULL;
      SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
       WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
         AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
         AND ap.listing_id <> ALL(v_ids)
       ORDER BY ap.vu_le DESC LIMIT 1;
      v_jum_id := NULL;
      IF v_vivante.listing_id IS NULL AND j.inventaire_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
        SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
         WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
      END IF;
      -- (24/10, point 6 — jocabroc8) Une annonce eBay dont la veille a lu la FIN (fin_ebay.fin, aucune vente) a été
      -- EN LIGNE : eBay l'a acceptée, puis elle y a été arrêtée — pas par FillSell (ce job est encore « publié » :
      -- aucun retrait FillSell ne l'a close). Pages eBay relues le 23/10 : « Le vendeur a mis fin à cette annonce …
      -- car elle comportait une erreur », 2 et 17 min après la mise en ligne. Ce n'est PAS un refus : close sans
      -- rouge, avec sa date (et l'annonce sous laquelle l'article est en ligne, s'il l'est). Quotas comme avant :
      -- rendue seulement là où l'ancien jugement la rendait (aucun article en ligne ailleurs).
      IF p_platform = 'ebay' AND _ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') IS NOT NULL
         AND coalesce(j.platform_fields #>> '{fin_ebay,vendus}', '0') ~ '^0+$' THEN
        v_refund := CASE WHEN v_vivante.listing_id IS NULL AND v_jum_id IS NULL THEN refund_publish_unconfirmed(j.id) END;
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = 'Cette annonce a bien été en ligne sur eBay, puis elle y a été arrêtée le '
            || to_char(_ts_ou_null(j.platform_fields #>> '{fin_ebay,fin}') AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
            || ' — pas par FillSell, et sans vente. Ce n''est pas un refus d''eBay. '
            || CASE WHEN v_vivante.listing_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_vivante.listing_id || ' : rien à refaire.'
                 WHEN v_jum_id IS NOT NULL
                 THEN 'Ton article y est en ligne sous l''annonce ' || v_jum_id || ', publiée par ton compte FillSell relié : rien à refaire.'
                 ELSE 'Ton article reste dans ton stock ; si cet arrêt n''était pas voulu, relance la publication depuis la fiche.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', 'arretee_sur_ebay', 'fin', j.platform_fields #>> '{fin_ebay,fin}',
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'refund', v_refund, 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_vivante.listing_id IS NOT NULL OR v_jum_id IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = CASE WHEN v_vivante.listing_id IS NOT NULL
            THEN 'Ce dépôt n''a jamais été retrouvé dans tes annonces ' || v_nom || ', mais ton article y est en ligne sous l''annonce '
                 || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.'
            ELSE 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
                 || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', CASE WHEN v_vivante.listing_id IS NOT NULL THEN 'article_en_ligne_ailleurs' ELSE 'en_ligne_par_compte_relie' END,
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        IF v_jum_id IS NOT NULL THEN n_jumelle := n_jumelle + 1; END IF;
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_doublon := NULL;
      SELECT ap.listing_id INTO v_doublon
        FROM inventaire i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
        JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
        JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
          AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
        JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
       WHERE i.id = j.inventaire_id AND i.user_id = p_user
       LIMIT 1;
      v_refund := refund_publish_unconfirmed(j.id);
      v_msg := CASE WHEN p_platform = 'beebs'
             THEN 'Sept jours après le dépôt, cette annonce n''est ni en ligne ni « en vérification » dans tes annonces Beebs'
             ELSE 'Cette annonce est absente de tes annonces ' || v_nom END
        || ' aux relevés complets du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
        || ' et du ' || v_releve_txt || ', et ' || v_nom || ' n''a donné aucun motif. '
        || CASE WHEN v_doublon.listing_id IS NOT NULL
             THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne sur ' || v_nom || '. '
             ELSE '' END
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.';
      UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund, 'avec_lien', true))
       WHERE id = j.id AND status = 'published';
      n_jamais_vues := n_jamais_vues + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees + n_jamais_vues, 'en_ligne', n_en_ligne, 'en_attente', n_attente,
                            'jamais_vues_avec_lien', n_jamais_vues, 'compte_relie', n_jumelle, 'redevenues_visibles', n_visibles,
                            'refermees', v_refermees);
END;
$function$;
REVOKE ALL ON FUNCTION public.trancher_publications_sans_lien(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trancher_publications_sans_lien(uuid, text, uuid) TO service_role;

-- ── 4. fail_publish_without_listing_url : le motif de la sonde Leboncoin 72 h dit ce qu'on sait ───────────────────
CREATE OR REPLACE FUNCTION public.fail_publish_without_listing_url(p_publie_apres timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j        record;
  v_ref    jsonb;
  v_url    text;
  n_jobs   integer := 0;
  n_rendu  integer := 0;
  n_liens  integer := 0;
  n_ailleurs integer := 0;
  v_ailleurs jsonb;
BEGIN
  FOR j IN
    SELECT id, user_id, platform, platform_listing_id, inventaire_id,
           COALESCE(published_at, created_at) AS repere
    FROM cross_post_jobs
    WHERE status = 'published'
      AND action = 'publish'
      AND listing_url IS NULL
      -- (1) L'IDENTIFIANT SUFFIT A NOMMER L'ANNONCE : un job qui l'a n'est
      --     jamais « sans lien ». Il peut suivre sa vente et la retirer.
      AND platform_listing_id IS NULL
      AND (p_publie_apres IS NULL OR COALESCE(published_at, created_at) >= p_publie_apres)
      AND COALESCE(published_at, created_at) < now() - (
        CASE
          WHEN platform = 'vinted' THEN interval '2 hours'
          WHEN platform = 'beebs'  THEN interval '7 days'
          ELSE interval '48 hours'
        END
      )
    ORDER BY COALESCE(published_at, created_at)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- (2) LE LIEN DORT PEUT-ETRE DANS LE RELEVE DU COMPTE. On ne conclut pas
    --     a l'absence avant d'avoir regarde la ou il est le plus souvent.
    SELECT ap.url INTO v_url
    FROM annonces_plateforme ap
    WHERE ap.user_id = j.user_id
      AND ap.platform = j.platform
      AND ap.job_id = j.id
      AND ap.statut_plateforme = 'en_ligne'
      AND ap.url IS NOT NULL
    LIMIT 1;

    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_au_balayage', jsonb_build_object(
            'at', now(), 'url', v_url,
            'source', 'annonces_plateforme (releve du compte)'
          )
        )
      WHERE id = j.id;
      n_liens := n_liens + 1;
      CONTINUE;
    END IF;

    -- (2 bis) BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico).
    --     « Une annonce Beebs sans lien, c'est normal : la modération se fait,
    --     le lien arrive ensuite. » Le lien est posé ci-dessus s'il est connu ;
    --     sinon le dépôt reste tel quel — jamais « non confirmé », jamais clos.
    IF j.platform = 'beebs' THEN
      CONTINUE;
    END IF;

    -- (24/10, point 6 — Short Okaïdi de louis-seller) L'article est EN LIGNE sur cette plateforme : sous une autre
    -- annonce de la MÊME fiche, ou par la fiche jumelle d'un compte FillSell relié (boutique partagée : la plateforme
    -- refuse le doublon). Même clôture que trancher_publications_sans_lien : sans rouge, sans inviter à republier.
    -- La publication est rendue comme avant (refund_publish_unconfirmed, inchangé).
    v_ailleurs := article_en_ligne_ailleurs(j.user_id, j.platform, j.inventaire_id, ARRAY[]::text[]);
    IF v_ailleurs IS NOT NULL THEN
      v_ref := refund_publish_unconfirmed(j.id);
      IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
      UPDATE cross_post_jobs SET status = 'cancelled',
        error = CASE WHEN v_ailleurs->>'issue' = 'article_en_ligne_ailleurs'
          THEN 'Ce dépôt n''a jamais été retrouvé en ligne sur ' || initcap(j.platform) || ', mais ton article y est en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ' : rien à refaire, rien n''est vendu.'
          ELSE 'Ce dépôt n''a pas été mis en ligne par ' || initcap(j.platform) || ' : ton article y est DÉJÀ en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ', publiée par ton compte FillSell relié — ' || initcap(j.platform)
               || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'repere', j.repere, 'source', 'sans_lien_48h', 'issue', v_ailleurs->>'issue',
            'annonce_en_ligne', v_ailleurs->>'listing_id', 'refund', v_ref))
       WHERE id = j.id AND status = 'published';
      n_ailleurs := n_ailleurs + 1;
      CONTINUE;
    END IF;
    -- (3) La seulement : ni lien, ni identifiant, ni trace dans le releve.
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;

    UPDATE cross_post_jobs SET
      status = 'failed',
      error  =
        'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur '
        || initcap(platform)
        || ' — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. '
        || 'Cette publication ne compte pas dans tes limites. '
        || '⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur ' || initcap(platform)
        || ' : si elle y est déjà, republier en créerait une deuxième.',
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'listing_url_abandon', jsonb_build_object(
          'at', now(),
          'repere', j.repere,
          'refund', v_ref
        )
      )
    WHERE id = j.id;
    n_jobs := n_jobs + 1;
  END LOOP;

  -- (09/10, chantier E) LEBONCOIN : UN DÉPÔT ACCEPTÉ (identifiant rendu au
  -- dépôt) MAIS JAMAIS VU EN LIGNE CONCLUT AU BOUT DE 72 H. La boucle ci-dessus
  -- écarte tout job qui porte son identifiant (« il peut suivre sa vente ») :
  -- un refus de modération Leboncoin ne concluait donc JAMAIS (sonde de
  -- l'extension : 1 417 passages bredouilles en 48 h sur la G-Shock de Nico,
  -- puis plus rien ; relevés d'import sur geste seulement depuis le 05/10).
  -- Preuve exigée, toutes réunies : aucun lien, jamais revue par la veille
  -- (vu_en_ligne_le), absente de TOUT relevé du compte, et la sonde de
  -- modération a lu « Mes annonces » COMPLÈTE au moins 3 fois sans elle, la
  -- dernière ≥ 2 h après le dépôt. Sinon : rien n'est écrit. Borné : 200 jobs.
  FOR j IN
    SELECT c.id, c.user_id, c.platform, c.platform_listing_id, c.inventaire_id, COALESCE(c.published_at, c.created_at) AS repere,
           c.platform_fields
      FROM cross_post_jobs c
     WHERE c.status = 'published' AND c.action IN ('publish', 'republish')
       AND c.platform = 'leboncoin'
       AND c.listing_url IS NULL AND c.vu_en_ligne_le IS NULL
       AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')   -- question déjà ouverte : réparation sur GO
       AND NULLIF(btrim(c.platform_listing_id), '') IS NOT NULL
       AND COALESCE(c.published_at, c.created_at) < now() - interval '72 hours'
       AND COALESCE((c.platform_fields #>> '{moderation_probe,misses}')::int, 0) >= 3
       AND _ts_ou_null(c.platform_fields #>> '{moderation_probe,last_miss_at}') >= COALESCE(c.published_at, c.created_at) + interval '2 hours'
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                        WHERE ap.user_id = c.user_id AND ap.platform = c.platform
                          AND ap.listing_id = ANY (ARRAY[NULLIF(btrim(c.platform_listing_id), ''),
                                                        c.platform_fields #>> '{lbc_depot,adsubmit,id}',
                                                        c.platform_fields #>> '{lbc_depot,sans_adsubmit,id}']))
     ORDER BY COALESCE(c.published_at, c.created_at)
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    -- (24/10, point 6 — Short Okaïdi de louis-seller) L'article est EN LIGNE sur cette plateforme : sous une autre
    -- annonce de la MÊME fiche, ou par la fiche jumelle d'un compte FillSell relié (boutique partagée : la plateforme
    -- refuse le doublon). Même clôture que trancher_publications_sans_lien : sans rouge, sans inviter à republier.
    -- La publication est rendue comme avant (refund_publish_unconfirmed, inchangé).
    v_ailleurs := article_en_ligne_ailleurs(j.user_id, j.platform, j.inventaire_id, ARRAY[NULLIF(btrim(j.platform_listing_id), ''), j.platform_fields #>> '{lbc_depot,adsubmit,id}', j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}']);
    IF v_ailleurs IS NOT NULL THEN
      v_ref := refund_publish_unconfirmed(j.id);
      IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
      UPDATE cross_post_jobs SET status = 'cancelled',
        error = CASE WHEN v_ailleurs->>'issue' = 'article_en_ligne_ailleurs'
          THEN 'Ce dépôt n''a jamais été retrouvé en ligne sur ' || initcap(j.platform) || ', mais ton article y est en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ' : rien à refaire, rien n''est vendu.'
          ELSE 'Ce dépôt n''a pas été mis en ligne par ' || initcap(j.platform) || ' : ton article y est DÉJÀ en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ', publiée par ton compte FillSell relié — ' || initcap(j.platform)
               || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'repere', j.repere, 'source', 'sonde_moderation_72h', 'issue', v_ailleurs->>'issue',
            'annonce_en_ligne', v_ailleurs->>'listing_id', 'refund', v_ref))
       WHERE id = j.id AND status = 'published';
      n_ailleurs := n_ailleurs + 1;
      CONTINUE;
    END IF;
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
    UPDATE cross_post_jobs SET
      status = 'failed',
      -- (27/10) Le motif dit l'absence constatée par la sonde, jamais « refusée par sa modération » (une déduction).
      error = 'Cette annonce est absente de tes annonces Leboncoin (« Mes annonces » relu en entier '
        || (j.platform_fields #>> '{moderation_probe,misses}') || ' fois depuis le dépôt), et Leboncoin n''a donné aucun motif. '
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.',
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'repere', j.repere, 'issue', 'refus_moderation_probable', 'source', 'sonde_moderation_72h',
          'sonde', j.platform_fields -> 'moderation_probe', 'refund', v_ref))
    WHERE id = j.id AND status = 'published';
    n_jobs := n_jobs + 1;
  END LOOP;

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'quotas_rendus', n_rendu, 'liens_retrouves', n_liens, 'en_ligne_ailleurs', n_ailleurs);
END;
$function$;
REVOKE ALL ON FUNCTION public.fail_publish_without_listing_url(timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
