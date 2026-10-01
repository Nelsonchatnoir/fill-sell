-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS — LE NUMÉRO D'UN DÉPÔT RETROUVÉ PAR LE MOMENT DU DÉPÔT (01/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Lot du 01/10, point 4. recrutementgroupezk704 : 127 dépôts Beebs sans
-- numéro ni lien (surtout en 0.6.80 — l'extension ne relit pas le numéro
-- d'un dépôt passé). Au titre seul, impossible : des dizaines de « Jean
-- Levi's 511 W28 » quasi identiques.
--
-- LA MÉTHODE (décision de Nico) : les numéros Beebs sont croissants. Compte
-- par compte, la suite de NOS dépôts (heure exacte) et la suite des numéros
-- relevés sur « Mes annonces » se rapprochent. Un numéro n'est posé que si
-- TOUT concorde en même temps :
--   · RANG : entre les deux dépôts numérotés qui l'encadrent dans le temps
--     (les « ancres »), le numéro est entre leurs numéros ; l'ordre des
--     ancres voisines (5 de part et d'autre) est lui-même croissant ;
--   · TITRE EXACT (espaces près) : une seule annonce de ce titre dans la
--     fenêtre, et un seul dépôt de ce titre dans la fenêtre ;
--   · PHOTO : la photo du dépôt et celle de l'annonce sont la même
--     (dHash ≤ 5 et pHash ≤ 8, la règle de rapprochement_photo_decisions).
-- Ce qui ne colle pas exactement devient la question « Est-ce cette
-- annonce ? » (proposition depot_beebs_a_confirmer, que le relevé laisse en
-- place). Jamais d'accroche au titre seul. Une annonce déjà portée par une
-- autre fiche n'est jamais prise.
-- Le lien est ensuite écrit par la règle existante (trigger
-- cross_post_jobs_lien_numero_beebs) ; le numéro passe la garde « jamais
-- croisé ».
-- Hors champ : les dépôts mis en question le 01/10 (numero_photo_proche_en_
-- question, point 5) — décision de Nico.
--
-- p_simulation = true (défaut) : rien n'est écrit, le verdict est rendu.
-- Retour arrière : supabase/rollbacks/20261001123000_beebs_numeros_par_sequence.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.beebs_titre_norm(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT regexp_replace(btrim(COALESCE(p, '')), '\s+', ' ', 'g');
$f$;

CREATE OR REPLACE FUNCTION public.beebs_photo_depot(p_inventaire bigint)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v text;
BEGIN
  SELECT (fiche_photos_urls(i.photos, 1))[1] INTO v FROM inventaire i WHERE i.id = p_inventaire;
  IF v LIKE '{%' THEN
    BEGIN v := v::jsonb ->> 'url'; EXCEPTION WHEN OTHERS THEN v := NULL; END;
  END IF;
  RETURN NULLIF(btrim(COALESCE(v, '')), '');
END $f$;

CREATE OR REPLACE FUNCTION public.beebs_numeros_par_sequence(p_user uuid, p_simulation boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c record; a record;
  v_t timestamptz; v_lo numeric; v_hi numeric; v_tlo timestamptz; v_thi timestamptz;
  v_tit text; v_na integer; v_nd integer; v_ko boolean;
  v_pd text; v_dd integer; v_dp integer; v_motif text;
  n_poses integer := 0; n_questions integer := 0; n_intacts integer := 0; n_sans integer := 0;
  v_detail jsonb := '[]'::jsonb;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;

  -- Les dépôts du compte (jamais un import), et parmi eux les ancres.
  CREATE TEMP TABLE IF NOT EXISTS _bns_depots (id uuid, inventaire_id bigint, status text, title text,
    numero numeric, listing_url text, t timestamptz, q5 boolean) ON COMMIT DROP;
  DELETE FROM _bns_depots;
  INSERT INTO _bns_depots
  SELECT j.id, j.inventaire_id, j.status, j.title,
         CASE WHEN btrim(COALESCE(j.platform_listing_id, '')) ~ '^[0-9]{6,}$' THEN btrim(j.platform_listing_id)::numeric END,
         NULLIF(btrim(COALESCE(j.listing_url, '')), ''),
         COALESCE(j.published_at, j.created_at),
         COALESCE(j.platform_fields, '{}'::jsonb) ? 'numero_photo_proche_en_question'
    FROM cross_post_jobs j
   WHERE j.user_id = p_user AND j.platform = 'beebs' AND j.action IN ('publish', 'republish')
     AND COALESCE(j.handler_build, '') NOT LIKE '%releve-annonces%';

  FOR c IN
    SELECT d.* FROM _bns_depots d
     WHERE d.status = 'published' AND d.numero IS NULL AND d.listing_url IS NULL AND NOT d.q5
     ORDER BY d.t
  LOOP
    v_t := c.t;
    SELECT x.numero, x.t INTO v_lo, v_tlo FROM _bns_depots x WHERE x.numero IS NOT NULL AND x.t < v_t ORDER BY x.t DESC LIMIT 1;
    SELECT x.numero, x.t INTO v_hi, v_thi FROM _bns_depots x WHERE x.numero IS NOT NULL AND x.t > v_t ORDER BY x.t ASC LIMIT 1;
    -- Ordre LOCAL des ancres : 6 avant, 6 après, toujours croissant.
    SELECT (v_lo IS NOT NULL AND v_hi IS NOT NULL AND v_lo >= v_hi)
           OR EXISTS (SELECT 1 FROM (
                SELECT y.numero, lag(y.numero) OVER (ORDER BY y.t) AS avant FROM (
                  (SELECT x.numero, x.t FROM _bns_depots x WHERE x.numero IS NOT NULL AND x.t < v_t ORDER BY x.t DESC LIMIT 6)
                  UNION ALL
                  (SELECT x.numero, x.t FROM _bns_depots x WHERE x.numero IS NOT NULL AND x.t > v_t ORDER BY x.t ASC LIMIT 6)) y) z
              WHERE z.numero < z.avant)
      INTO v_ko;
    v_tit := beebs_titre_norm(c.title);

    SELECT count(*) INTO v_na FROM annonces_plateforme p
     WHERE p.user_id = p_user AND p.platform = 'beebs' AND p.disparu_le IS NULL
       AND p.listing_id ~ '^[0-9]{6,}$'
       AND (v_lo IS NULL OR p.listing_id::numeric > v_lo) AND (v_hi IS NULL OR p.listing_id::numeric < v_hi)
       AND NOT EXISTS (SELECT 1 FROM _bns_depots x WHERE x.numero = p.listing_id::numeric)
       AND beebs_titre_norm(p.titre) = v_tit;
    SELECT count(*) INTO v_nd FROM _bns_depots x
     WHERE x.numero IS NULL AND (v_tlo IS NULL OR x.t > v_tlo) AND (v_thi IS NULL OR x.t < v_thi)
       AND beebs_titre_norm(x.title) = v_tit;

    IF v_na = 0 THEN
      n_sans := n_sans + 1; CONTINUE;
    END IF;
    IF v_na > 1 OR v_nd > 1 THEN
      -- Plusieurs annonces ou plusieurs dépôts de ce titre dans la fenêtre :
      -- aucune annonce ne se désigne seule, rien n'est posé, rien n'est demandé.
      n_sans := n_sans + 1;
      v_detail := v_detail || jsonb_build_object('job', c.id, 'verdict', 'titre_en_double');
      CONTINUE;
    END IF;

    SELECT p.* INTO a FROM annonces_plateforme p
     WHERE p.user_id = p_user AND p.platform = 'beebs' AND p.disparu_le IS NULL
       AND p.listing_id ~ '^[0-9]{6,}$'
       AND (v_lo IS NULL OR p.listing_id::numeric > v_lo) AND (v_hi IS NULL OR p.listing_id::numeric < v_hi)
       AND NOT EXISTS (SELECT 1 FROM _bns_depots x WHERE x.numero = p.listing_id::numeric)
       AND beebs_titre_norm(p.titre) = v_tit
     LIMIT 1;

    -- Une annonce portée par une AUTRE fiche n'est jamais prise.
    IF a.inventaire_id IS NOT NULL AND NOT (a.job_id = c.id AND a.inventaire_id = c.inventaire_id) THEN
      n_sans := n_sans + 1;
      v_detail := v_detail || jsonb_build_object('job', c.id, 'verdict', 'annonce_portee_ailleurs', 'numero', a.listing_id);
      CONTINUE;
    END IF;

    v_pd := beebs_photo_depot(c.inventaire_id);
    SELECT bit_count(e1.dhash::bit(64) # e2.dhash::bit(64)), bit_count(e1.phash::bit(64) # e2.phash::bit(64))
      INTO v_dd, v_dp
      FROM photo_empreintes e1, photo_empreintes e2
     WHERE e1.url = v_pd AND e2.url = a.photo_url;

    IF v_dd IS NOT NULL AND v_dd <= 5 AND v_dp <= 8 AND NOT v_ko THEN
      v_motif := 'pose';
    ELSIF a.inventaire_id IS NOT NULL THEN
      v_motif := 'intact';   -- déjà rattachée à CE dépôt : on ne détache rien
    ELSE
      v_motif := 'question';
    END IF;

    v_detail := v_detail || jsonb_build_object('job', c.id, 'verdict', v_motif, 'numero', a.listing_id,
                  'annonce', a.id, 'dhash', v_dd, 'phash', v_dp, 'ordre_local_ko', v_ko,
                  'ancre_avant', v_lo, 'ancre_apres', v_hi);

    IF v_motif = 'pose' THEN
      n_poses := n_poses + 1;
      IF NOT p_simulation THEN
        UPDATE cross_post_jobs j
           SET platform_listing_id = a.listing_id,
               platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb) - 'lien_en_attente' - 'identifiant_beebs_non_prouve')
                 || jsonb_build_object('numero_par_sequence', jsonb_build_object(
                      'le', now(), 'numero', a.listing_id, 'annonce', a.id,
                      'ancre_avant', v_lo, 'ancre_apres', v_hi, 'dhash', v_dd, 'phash', v_dp,
                      'avant', jsonb_build_object('lien_en_attente', j.platform_fields -> 'lien_en_attente',
                                                  'identifiant_beebs_non_prouve', j.platform_fields -> 'identifiant_beebs_non_prouve'),
                      'regle', 'rang + titre exact + photo (lot 01/10 point 4)'))
         WHERE j.id = c.id AND j.status = 'published' AND j.platform_listing_id IS NULL AND j.listing_url IS NULL;
        UPDATE annonces_plateforme
           SET inventaire_id = c.inventaire_id, job_id = c.id, source_rapprochement = 'job',
               ignoree_le = NULL, proposition = NULL, updated_at = now()
         WHERE id = a.id AND (inventaire_id IS NULL OR (inventaire_id = c.inventaire_id AND job_id = c.id));
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, a.id, c.inventaire_id, 'attache', 'job', 1,
                jsonb_build_object('motif', 'sequence_depot_beebs', 'job_id', c.id, 'numero', a.listing_id,
                                   'avant', jsonb_build_object('ignoree_le', a.ignoree_le, 'proposition', a.proposition,
                                                               'inventaire_id', a.inventaire_id, 'job_id', a.job_id,
                                                               'source_rapprochement', a.source_rapprochement)));
      END IF;
    ELSIF v_motif = 'question' THEN
      n_questions := n_questions + 1;
      IF NOT p_simulation AND COALESCE(a.proposition ->> 'motif', '') NOT LIKE 'depot_beebs_%' THEN
        UPDATE annonces_plateforme
           SET ignoree_le = NULL,
               proposition = jsonb_build_object('inventaire_id', c.inventaire_id, 'job_id', c.id,
                               'motif', 'depot_beebs_a_confirmer',
                               'signaux', jsonb_build_object('dhash', v_dd, 'phash', v_dp, 'ordre_local_ko', v_ko),
                               'avant', jsonb_build_object('ignoree_le', a.ignoree_le, 'proposition', a.proposition),
                               'at', now()),
               updated_at = now()
         WHERE id = a.id AND inventaire_id IS NULL;
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, a.id, c.inventaire_id, 'propose', 'auto', NULL,
                jsonb_build_object('motif', 'depot_beebs_a_confirmer', 'job_id', c.id, 'numero', a.listing_id));
      END IF;
    ELSE
      n_intacts := n_intacts + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'simulation', p_simulation, 'poses', n_poses, 'questions', n_questions,
                            'intacts', n_intacts, 'sans_preuve', n_sans, 'detail', v_detail);
END;
$function$;

REVOKE ALL ON FUNCTION public.beebs_numeros_par_sequence(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beebs_numeros_par_sequence(uuid, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.beebs_photo_depot(bigint) FROM PUBLIC, anon, authenticated;

-- ── « Est-ce cette annonce ? » : le relevé laisse AUSSI cette question-là ──
-- (même garde que 20261001120000, étendue au motif depot_beebs_a_confirmer)
CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint; v_imp jsonb;
  v_att rapprochement_photo_attente%ROWTYPE;
BEGIN
  -- Verrou de ligne : le relevé de l'extension et un rattrapage ne peuvent
  -- pas traiter la même annonce en même temps ; le second la trouve traitée.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : lue par un relevé dont la
  --    page n'était pas la liste du compte — ni import, ni rattachement.
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  -- ⛔ « EST-CE CETTE ANNONCE ? » EN ATTENTE (2026-10-01, lot du 01/10 point 5) :
  --    l'annonce porte la question posée à la personne sur un dépôt Beebs
  --    dont elle n'est que PROCHE par la photo. Le relevé ne la retient pas
  --    en silence, ne l'importe pas, ne la rattache pas : seule la réponse
  --    (rapprochement_decider) la fait bouger.
  -- (01/10, point 4) même chose pour « depot_beebs_a_confirmer » (rang et titre concordent, la photo ne tranche pas).
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

  v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, p_vus);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
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
  -- On RATTACHE à la fiche d'origine, jamais d'import. Le dépôt clos garde son
  -- histoire ; un job de suivi porte l'annonce vivante. Le STATUT de la fiche
  -- n'est jamais basculé ici (une vente en main propre a la même trace qu'un
  -- faux « vendu » : c'est la personne qui tranche) :
  --   · fiche 'vendu' → le job de suivi part 'cancelled' + pending_removal :
  --     le bandeau EXISTANT « Vendu — encore en ligne sur X, retirer ? » ;
  --   · fiche en stock → job de suivi 'published', comme un rattachement normal.
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

  -- ── LA PHOTO AVANT L'IMPORT (2026-09-30) ─────────────────────────────────
  -- L'identifiant n'a rien trouvé (annonce publiée hors FillSell : les 62
  -- annonces Opla de leopaul.hug, copies de son Vinted). Avant de créer une
  -- fiche, on attend l'empreinte de la photo : si c'est la même photo qu'UNE
  -- seule fiche en stock, sur une AUTRE plateforme, l'annonce y est rattachée
  -- (fusion_photo_tick → rapprochement_photo_decisions). Sinon elle revient
  -- ici, relâchée, et suit le chemin d'avant (import, une question au plus).
  -- Au-delà de 30 min d'attente (passage arrêté), on ne retient plus rien.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL
     AND NULLIF(btrim(COALESCE(a.photo_url, '')), '') IS NOT NULL THEN
    SELECT * INTO v_att FROM rapprochement_photo_attente WHERE annonce_id = a.id;
    IF v_att.annonce_id IS NULL THEN
      INSERT INTO rapprochement_photo_attente (annonce_id, user_id, platform, run_id, photo_url)
      VALUES (a.id, v_user, v_pf, v_run, a.photo_url) ON CONFLICT (annonce_id) DO NOTHING;
      RETURN 'attente_photo';
    ELSIF v_att.etat = 'attente' AND v_att.cree_le > now() - interval '30 minutes' THEN
      RETURN 'attente_photo';
    END IF;
  END IF;

  IF v_bande = 'certain' THEN v_bande := 'propose'; END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    -- (2026-09-27, audit synchro) Une annonce EN LIGNE n'attend plus une
    -- réponse HORS du stock : elle est importée plus bas, et la proposition
    -- devient une QUESTION posée sur la fiche importée (« Est-ce le même
    -- article ? »). Le rattrapage ne s'arrête sur « inchangée » que si
    -- l'import est impossible (interrupteur fermé, annonce pas en ligne,
    -- fiche supprimée exprès par la personne).
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND NOT (p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL)
       AND (a.proposition ->> 'inventaire_id') IS NOT DISTINCT FROM v_inv::text
       AND (a.proposition ->> 'motif') IS NOT DISTINCT FROM (v_cl ->> 'motif') THEN
      RETURN 'propose_inchangee';
    END IF;
    UPDATE annonces_plateforme
       SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                            'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb),
                                            'candidats_total', v_cl -> 'candidats_total',
                                            'signaux', v_cl -> 'signaux',
                                            'choix_arbitraire', v_cl -> 'choix_arbitraire',
                                            'run_id', v_run, 'at', now()),
           updated_at = now()
     WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    -- (2026-09-27) TOUTE annonce en ligne entre dans le stock : la ressemblance
    -- (titre, prix) ne rattache pas, elle se DEMANDE. rapprocher_importer lit la
    -- proposition posée ci-dessus et en fait la question de la fiche importée.
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    END IF;
    RETURN 'propose';
  END IF;

  -- ── AUCUN CANDIDAT ──────────────────────────────────────────────────────
  IF NOT p_rattrapage THEN
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
            v_trace || jsonb_build_object('motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'), 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
  END IF;
  -- IMPORT AUTOMATIQUE (point F, 18/09) — les trois conditions, ici.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne'
     AND (NOT p_second_releve_requis
          OR EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> COALESCE(v_run::text, '')))
     -- ⛔ 2026-09-24 — QUATRIÈME CONDITION, PRÉCISE : jamais ressusciter une
     --    fiche que le vendeur a SUPPRIMÉE en gardant l'annonce en ligne
     --    (inventaire_supprimer_sans_retrait pose fiche_supprimee_le). C'est CE
     --    marqueur qui coupe la boucle de Louis — pas « déjà importée une fois »
     --    (23/09), qui bloquait aussi une annonce dont la fiche avait disparu
     --    par un autre chemin. Règle : tout ce qui est en ligne et absent du
     --    stock devient un article. Un rattachement ou un import MANUEL efface
     --    le marqueur (rapprochement_decider, rapprocher_importer).
     AND a.fiche_supprimee_le IS NULL
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN
      RETURN CASE WHEN v_imp ? 'question' THEN 'import_propose' ELSE 'import' END;
    END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;
