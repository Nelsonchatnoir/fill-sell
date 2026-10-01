-- ═══════════════════════════════════════════════════════════════════════════
-- BEEBS — LES 93 « PHOTO PROCHE » PAR LA MÉTHODE DU MOMENT DU DÉPÔT (01/10, suite)
-- ═══════════════════════════════════════════════════════════════════════════
-- Lot du 01/10 suite, point 3 (GO Nico). La méthode du point 4 (rang + titre
-- exact + photo) confirme les 93 dépôts mis en question au point 5. On pose
-- leurs numéros et on lève leur question, avec ces gardes :
--   · p_questions_photo = true : SEULS les dépôts marqués
--     numero_photo_proche_en_question sont traités (ni les 92 sur photo
--     identique, déjà numérotés, ni les 2 questions depot_beebs_a_confirmer) ;
--   · un dépôt ne prend QUE l'annonce de sa propre question ; tout écart
--     (autre annonce, photo, ordre) → il garde sa question ;
--   · le numéro passe la garde « jamais croisé » (un numéro, une fiche).
-- Sans p_questions_photo : comportement inchangé (20261001123000).
-- Retour arrière : supabase/rollbacks/20261001130000_beebs_sequence_questions_photo.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.beebs_numeros_par_sequence(uuid, boolean);

CREATE OR REPLACE FUNCTION public.beebs_numeros_par_sequence(p_user uuid, p_simulation boolean DEFAULT true, p_questions_photo boolean DEFAULT false)
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
  DROP TABLE IF EXISTS _bns_depots;
  CREATE TEMP TABLE _bns_depots (id uuid, inventaire_id bigint, status text, title text,
    numero numeric, listing_url text, t timestamptz, q5 boolean, q5_annonce uuid) ON COMMIT DROP;
  INSERT INTO _bns_depots
  SELECT j.id, j.inventaire_id, j.status, j.title,
         CASE WHEN btrim(COALESCE(j.platform_listing_id, '')) ~ '^[0-9]{6,}$' THEN btrim(j.platform_listing_id)::numeric END,
         NULLIF(btrim(COALESCE(j.listing_url, '')), ''),
         COALESCE(j.published_at, j.created_at),
         COALESCE(j.platform_fields, '{}'::jsonb) ? 'numero_photo_proche_en_question',
         NULLIF(j.platform_fields #>> '{numero_photo_proche_en_question,annonce}', '')::uuid
    FROM cross_post_jobs j
   WHERE j.user_id = p_user AND j.platform = 'beebs' AND j.action IN ('publish', 'republish')
     AND COALESCE(j.handler_build, '') NOT LIKE '%releve-annonces%';

  FOR c IN
    SELECT d.* FROM _bns_depots d
     WHERE d.status = 'published' AND d.numero IS NULL AND d.listing_url IS NULL
       -- (01/10 suite) p_questions_photo : SEULEMENT les dépôts en question
       -- « photo proche » (point 5) ; sinon jamais eux.
       AND d.q5 = COALESCE(p_questions_photo, false)
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

    -- (01/10 suite) Un dépôt en question ne prend QUE l'annonce de sa question :
    -- sinon il garde sa question.
    IF c.q5 AND a.id IS DISTINCT FROM c.q5_annonce THEN
      n_sans := n_sans + 1;
      v_detail := v_detail || jsonb_build_object('job', c.id, 'verdict', 'autre_annonce_que_la_question', 'numero', a.listing_id);
      CONTINUE;
    END IF;
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
    ELSIF c.q5 THEN
      v_motif := 'garde_sa_question';   -- ne se confirme plus : la question reste
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
                      'regle', CASE WHEN c.q5 THEN 'rang + titre exact + photo, question photo proche levée (lot 01/10 suite point 3)'
                                    ELSE 'rang + titre exact + photo (lot 01/10 point 4)' END))
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
    ELSIF v_motif = 'garde_sa_question' THEN
      n_sans := n_sans + 1;
    ELSE
      n_intacts := n_intacts + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'simulation', p_simulation, 'poses', n_poses, 'questions', n_questions,
                            'intacts', n_intacts, 'sans_preuve', n_sans, 'detail', v_detail);
END;
$function$;

REVOKE ALL ON FUNCTION public.beebs_numeros_par_sequence(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beebs_numeros_par_sequence(uuid, boolean, boolean) TO service_role;
