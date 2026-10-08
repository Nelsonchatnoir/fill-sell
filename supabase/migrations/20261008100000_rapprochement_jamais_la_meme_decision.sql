-- ════════════════════════════════════════════════════════════════════════════
-- UNE MÊME DÉCISION NE S'ÉCRIT JAMAIS EN BOUCLE (08/10/2026, matin)
-- ════════════════════════════════════════════════════════════════════════════
-- LE CAS : nadegemarcelin78 (8a2eba68), 8 954 lignes `rapprochements`
-- identiques pour UNE annonce Opla (« Lot de 5 magasines Picsou », 7f1bb50d),
-- du 07/10 21:26:18 au 22:32:17 UTC, ~190 par minute, par rafales de 3 min 20
-- séparées d'une minute.
-- LE CHEMIN (prouvé) : le moteur du 07/10 (fonction edge rapprochement v2 →
-- rapprochement_avancer → rapprocher_traiter_annonce). L'identifiant de
-- l'annonce désignait un job Opla publié SANS article (839e4bf2, rattaché par
-- titre au rattrapage du 23/09, inventaire_id NULL). La bande « job » posait
-- alors inventaire_id = NULL (inchangé), écrivait « attache / job » et rendait
-- 'job' : l'annonce restait sans article, le compte restait « decision »
-- (restantes = 1), la fonction edge rebouclait (`while (true)`, aucun contrôle
-- de progrès) pendant 110 s, se relançait une fois, puis le filet
-- rapprochement-1min la reprenait une minute plus tard. Départ : la demande de
-- rapprochement de 21:26 (fin d'un relevé du compte, heure de la vente) ; fin :
-- le moteur v3 de la nuit, qui n'appelle plus rapprochement_avancer.
--
-- CE QUI CHANGE (trois verrous, chacun suffit pour ce cas) :
--  1. rapprocher_traiter_annonce : un job SANS article n'est plus un
--     rattachement — l'annonce part au moteur du compte (« differe »), comme
--     une annonce sans identifiant connu. Définition EN PROD du 08/10 (lue par
--     pg_get_functiondef), seule la bande « job » change.
--  2. rapprochement_avancer (moteur v2, plus appelé par personne depuis la v3)
--     ne fait plus rien : il rend « obsolete », que la boucle de la v2 lit
--     comme une fin. Une ancienne version de la fonction edge redéployée par
--     erreur ne peut plus reboucler.
--  3. LA BASE ELLE-MÊME refuse d'écrire une décision identique à la
--     précédente de la même annonce (même décision, même auteur, même article,
--     même job, même motif) dans les 24 h : la ligne est sautée et comptée dans
--     rapprochements_repetes (ops-digest, en rouge). Quel que soit le chemin —
--     existant ou futur, SQL ou fonction edge — une boucle ne peut plus écrire
--     qu'une ligne par jour et par annonce, et elle se voit.
--     Sans effet sur les lectures : rapprochement_v3_lire ne lit que la
--     DERNIÈRE ligne d'une annonce (identique) et l'existence d'un « ignore ».
--     Aucune fonction ne lit le retour (RETURNING) d'un INSERT dans
--     rapprochements (vérifié le 08/10).
-- Mesure : 2 466 insertions par jour en moyenne (7 derniers jours) ; une
-- lecture indexée (rapprochements_annonce_idx : annonce_id, created_at DESC)
-- par insertion.
-- Inverse : supabase/rollbacks/20261008100000_rapprochement_jamais_la_meme_decision_INVERSE.sql
BEGIN;

-- ── 1. La bande « job » exige un article ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  IF a.proposition ->> 'motif' IN ('depot_beebs_photo_proche', 'depot_beebs_a_confirmer') THEN RETURN 'question_depot'; END IF;
  v_user := a.user_id; v_pf := a.platform; v_run := a.run_id;
  v_trace := jsonb_build_object('run_id', v_run)
             || CASE WHEN p_rattrapage THEN jsonb_build_object('rattrapage', true) ELSE '{}'::jsonb END;

  -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) — mot pour mot ──
  IF annonce_lien_notification(a.url) THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
            v_trace || jsonb_build_object('motif', 'notification_plateforme', 'platform', v_pf, 'titre', a.titre,
                                          'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
    RETURN 'notification';
  END IF;

  v_cl := rapprocher_classer_identifiant(v_user, v_pf, a.listing_id);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  -- (08/10) … qui porte un ARTICLE. Un job sans article (fiche supprimée,
  -- rattachement d'un relevé jamais suivi d'un import) ne rattache rien :
  -- l'annonce resterait sans article et se représenterait à chaque passage
  -- (Nadège, 07/10 : 8 954 fois « attache / job / NULL »). Elle part au moteur
  -- du compte, ci-dessous, comme une annonce sans identifiant connu.
  IF v_bande = 'job' AND v_inv IS NOT NULL THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  IF v_bande = 'job_clos' THEN
    v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
               v_trace || jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos',
                                             'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    IF (v_cl ->> 'statut_fiche') = 'vendu' THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = platform_fields || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1,
            v_trace || jsonb_build_object('job_id', v_job, 'motif', 'identifiant_depot_clos',
                                          'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    RETURN 'job';
  END IF;

  -- (07/10, règle de Nico) Rien de sûr par l'identifiant : l'annonce attend
  -- le moteur du compte, qui la compare à TOUT le stock avant toute création.
  IF COALESCE(current_setting('fillsell.rapprochement_moteur', true), '') <> 'on' THEN
    PERFORM rapprochement_demander(v_user, 'annonce:' || v_pf);
  END IF;
  RETURN 'differe';
END;
$function$;

-- ── 2. Le moteur v2 ne tourne plus ──────────────────────────────────────────
-- Plus aucun appelant depuis la v3 (pg_proc, cron.job, fonctions edge : 0 le
-- 08/10). Signature et droits inchangés (service_role seulement).
CREATE OR REPLACE FUNCTION public.rapprochement_avancer(p_user uuid, p_budget_ms integer DEFAULT 6000)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object('etat', 'obsolete', 'remplace_par', 'rapprochement v3 (rapprochement_v3_*), 08/10/2026');
$function$;
REVOKE ALL ON FUNCTION public.rapprochement_avancer(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_avancer(uuid, integer) TO service_role;

-- ── 3. La base refuse la même décision deux fois de suite ───────────────────
CREATE TABLE IF NOT EXISTS public.rapprochements_repetes (
  annonce_id    uuid PRIMARY KEY,
  user_id       uuid NOT NULL,
  decision      text NOT NULL,
  par           text NOT NULL,
  inventaire_id bigint,
  detail        jsonb,
  n             integer NOT NULL DEFAULT 0,
  premier_le    timestamptz NOT NULL DEFAULT now(),
  dernier_le    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rapprochements_repetes IS
  'Décisions de rapprochement identiques à la précédente (24 h), sautées par rapprochements_jamais_repete — une ligne par annonce, n = répétitions refusées. Lue par l''ops-digest (08/10, Nadège).';
ALTER TABLE public.rapprochements_repetes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rapprochements_repetes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rapprochements_repetes TO service_role;

CREATE OR REPLACE FUNCTION public.rapprochements_jamais_repete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d record;
BEGIN
  IF NEW.annonce_id IS NULL THEN RETURN NEW; END IF;
  SELECT r.decision, r.par, r.inventaire_id, r.detail, r.created_at INTO d
    FROM rapprochements r
   WHERE r.annonce_id = NEW.annonce_id
   ORDER BY r.created_at DESC
   LIMIT 1;
  IF FOUND AND d.created_at > now() - interval '24 hours'
     AND d.decision = NEW.decision AND d.par = NEW.par
     AND d.inventaire_id IS NOT DISTINCT FROM NEW.inventaire_id
     AND (d.detail ->> 'job_id') IS NOT DISTINCT FROM (NEW.detail ->> 'job_id')
     AND (d.detail ->> 'motif') IS NOT DISTINCT FROM (NEW.detail ->> 'motif') THEN
    INSERT INTO rapprochements_repetes AS x (annonce_id, user_id, decision, par, inventaire_id, detail, n)
    VALUES (NEW.annonce_id, NEW.user_id, NEW.decision, NEW.par, NEW.inventaire_id, NEW.detail, 1)
    ON CONFLICT (annonce_id) DO UPDATE
       SET n = x.n + 1, dernier_le = now(), decision = EXCLUDED.decision, par = EXCLUDED.par,
           inventaire_id = EXCLUDED.inventaire_id, detail = EXCLUDED.detail;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.rapprochements_jamais_repete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rapprochements_jamais_repete ON public.rapprochements;
CREATE TRIGGER rapprochements_jamais_repete
  BEFORE INSERT ON public.rapprochements
  FOR EACH ROW EXECUTE FUNCTION public.rapprochements_jamais_repete();

COMMIT;
