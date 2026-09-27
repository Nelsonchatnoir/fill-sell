-- ═══════════════════════════════════════════════════════════════════════════
-- LE BALAYAGE DES DOUBLONS NE DÉPASSE PLUS JAMAIS SON TEMPS LIMITE (27/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI SE PASSAIT (mesuré en prod le 27/09, rejeu en transaction annulée) :
-- la fonction edge doublons-balayage (cron */2) appelle, par PostgREST, sous
-- un statement_timeout de 8 s (rôle authenticator) :
--   rapprochement_photos_decider(20) — budgets internes de 20 s puis 40 s ;
--   un passage réel mesuré : 14,8 s (31 annonces + 20 fiches). Donc CHAQUE
--   appel était annulé, la transaction entière avec, RIEN n'était jamais
--   enregistré (dernière fiche vérifiée : 26/09 21:44) et tout repartait de
--   zéro deux minutes plus tard, sans fin — 30 annulations par heure depuis le
--   26/09 20:00. 1 810 fiches importées attendaient leur examen.
--   Suspect n° 1 (non prouvé) de la saturation de la base du 27/09 15:34.
--
-- CE QUI CHANGE :
-- 1. Les FICHES sortent de rapprochement_photos_decider. Elles passent par deux
--    RPC courtes, appelées par la fonction edge UNE FICHE PAR APPEL :
--      doublons_reserver_fiches(n)   — réserve n fiches (resultat.en_cours) et
--                                      les rend ; une réservation vieille de
--                                      30 min (examen annulé) est reprise, au
--                                      3e essai la fiche est abandonnée
--                                      (resultat.abandon = 'timeout') et on
--                                      passe à la suivante ;
--      doublons_examiner_fiche(id)   — le corps EXACT de l'ancienne boucle (b)
--                                      pour une seule fiche, enregistré dès
--                                      qu'il finit ;
--      doublons_liberer_fiches(ids)  — rend les réservations que le passage
--                                      n'a pas eu le temps d'examiner.
--    Plus jamais une tête de file qui bloque tout : un examen annulé ne coûte
--    que SA fiche, les autres avancent.
-- 2. rapprochement_photos_decider garde (a) les annonces proposées et (c) les
--    propositions caduques, avec un budget de 4 s compté depuis le début de
--    l'appel (statement_timestamp), vérifié AVANT chaque annonce.
-- 3. rapprochement_urls_a_empreinter reçoit un budget de 3 s (elle n'en avait
--    aucun).
-- 4. inventaire_doublons_pour : au plus 60 candidates, les plus proches par
--    nombre de mots communs du titre ; s'il y en avait PLUS, aucune n'est
--    « certaine » (fusion automatique interdite : motif trop_de_candidats) —
--    dans le doute, deux fiches valent mieux qu'une fusion fausse.
-- 5. doublons_fiches_a_examiner : une fiche réservée n'est pas reprise par la
--    branche « revue » (la reprise d'un examen annulé passe par la réservation).
--
-- CE QUI NE CHANGE PAS : les règles de décision (inventaire_doublon_evaluer,
-- meme_objet_*, rapprocher_confirmer_photo, inventaire_fusionner_pour) ne sont
-- pas touchées ; une fiche examinée est enregistrée exactement comme avant
-- (même resultat, même revue_le) ; aucune donnée existante n'est réécrite.
-- Seule appelante de ces fonctions : la fonction edge doublons-balayage.
--
-- Garde : chaque fonction réécrite doit avoir en prod le md5 relevé le 27/09
-- vers 18:40 ; sinon la migration s'arrête sans rien changer.
-- Idempotent (CREATE OR REPLACE). Droits : service_role seul.
-- ═══════════════════════════════════════════════════════════════════════════

DO $garde$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('rapprochement_photos_decider',    'd1121546c175d80ac45e6cc90c1a15a9'),
      ('rapprochement_urls_a_empreinter', 'fecc33e9cdb90e182e34317bafbea761'),
      ('doublons_fiches_a_examiner',      'a668c52985d89af67e21c07281183220'),
      ('inventaire_doublons_pour',        'c4df3af53e7f835b4ef30ab9ed3f3e4a')) AS t(nom, md5_attendu)
  LOOP
    IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = r.nom) IS DISTINCT FROM r.md5_attendu THEN
      RAISE EXCEPTION 'garde md5 : % a changé en prod depuis le relevé, migration arrêtée', r.nom;
    END IF;
  END LOOP;
END
$garde$;

-- ── 5. doublons_fiches_a_examiner : une fiche réservée n'est pas « revue » ──
CREATE OR REPLACE FUNCTION public.doublons_fiches_a_examiner(p_limite integer)
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT z.id FROM (
    SELECT i.id, i.created_at FROM inventaire i
     WHERE (i.origine LIKE 'releve\_%' OR i.origine = 'vinted_sync')
       AND i.created_at > now() - interval '14 days'
       AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       -- (2026-09-25 après-midi) une fiche du dressing attend 30 min : le même
       -- relevé date d'abord la disparition de l'annonce qu'elle remplace.
       AND (i.origine <> 'vinted_sync' OR i.created_at < now() - interval '30 minutes')
       AND NOT EXISTS (SELECT 1 FROM inventaire_doublons_verifies v WHERE v.inventaire_id = i.id)
    UNION
    -- (2026-09-25 après-midi) REVUE : une annonce Vinted vivante déjà examinée
    -- dont une homonyme de la même boutique a été RETIRÉE depuis l'examen
    -- (remise en ligne vue en retard). rapprochement_photos_decider réhorodate
    -- l'examen : une retraite ne déclenche qu'une revue.
    SELECT i.id, i.created_at FROM inventaire i
      JOIN inventaire_doublons_verifies v ON v.inventaire_id = i.id
     WHERE i.origine = 'vinted_sync' AND i.created_at > now() - interval '14 days'
       AND i.fusionne_dans IS NULL AND i.statut = 'stock'
       AND i.vinted_status = 'active' AND i.disparu_le IS NULL
       -- (2026-09-27) une fiche RÉSERVÉE (examen en cours ou annulé) n'est pas
       -- reprise ici : sa reprise passe par doublons_reserver_fiches.
       AND NOT (v.resultat ? 'en_cours')
       AND EXISTS (SELECT 1 FROM inventaire m
                    WHERE m.user_id = i.user_id AND m.id <> i.id AND m.fusionne_dans IS NULL AND m.statut = 'stock'
                      AND m.vinted_status = 'closed' AND m.disparu_le > v.verifie_le
                      AND m.disparu_le > now() - interval '14 days'
                      AND m.created_at < i.created_at
                      AND titre_jetons(m.titre) && titre_jetons(i.titre)
                      AND vinted_remise_en_ligne(m.id, i.id))
  ) z
   ORDER BY z.created_at
   LIMIT greatest(p_limite, 0);
$function$;

-- ── 4. inventaire_doublons_pour : 60 candidates au plus, jamais « certain » au-delà ──
CREATE OR REPLACE FUNCTION public.inventaire_doublons_pour(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  f inventaire%ROWTYPE; v_jb text[]; v_out jsonb := '[]'::jsonb; v_c record; v_e jsonb;
  n_certains integer; n_photo integer; n_inconnus integer;
  v_tronque boolean := false;
BEGIN
  SELECT * INTO f FROM inventaire WHERE id = p_fiche;
  IF f.id IS NULL OR f.fusionne_dans IS NOT NULL OR f.statut IS DISTINCT FROM 'stock' THEN RETURN '[]'::jsonb; END IF;
  v_jb := titre_jetons(f.titre);
  IF COALESCE(array_length(v_jb, 1), 0) = 0 THEN RETURN '[]'::jsonb; END IF;
  -- (2026-09-27) au plus 60 candidates, les plus proches d'abord (mots communs
  -- du titre) ; « OFFSET 0 » : les mots de chaque titre ne sont calculés qu'une fois.
  FOR v_c IN
    SELECT s.id, count(*) OVER () AS n_total FROM (
      SELECT i.id, i.created_at, titre_jetons(i.titre) AS jt FROM inventaire i
       WHERE i.user_id = f.user_id AND i.id <> f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
         AND (i.created_at < f.created_at OR (i.created_at = f.created_at AND i.id < f.id))
         AND (i.vinted_item_id IS NULL OR f.vinted_item_id IS NULL
              OR vinted_remise_en_ligne(i.id, f.id) OR vinted_remise_en_ligne(f.id, i.id)
              OR vinted_retraits_successifs(i.id, f.id) OR vinted_retraits_successifs(f.id, i.id))
      OFFSET 0) s
     WHERE s.jt && v_jb
     ORDER BY cardinality(ARRAY(SELECT unnest(s.jt) INTERSECT SELECT unnest(v_jb))) DESC, s.created_at DESC, s.id DESC
     LIMIT 60
  LOOP
    IF v_c.n_total > 60 THEN v_tronque := true; END IF;
    v_e := inventaire_doublon_evaluer(v_c.id, f.id);
    IF v_e ->> 'niveau' <> 'ecarte' THEN
      v_out := v_out || jsonb_build_array(v_e || jsonb_build_object('candidat', v_c.id));
    END IF;
  END LOOP;
  -- Des candidates ont été laissées de côté : aucune n'est « certaine » (pas de
  -- fusion automatique sur une liste incomplète), la personne tranche.
  IF v_tronque THEN
    SELECT COALESCE(jsonb_agg(CASE WHEN e ->> 'niveau' = 'certain'
                                   THEN e || jsonb_build_object('niveau', 'probable', 'motif', 'trop_de_candidats')
                                   ELSE e END), '[]'::jsonb)
      INTO v_out FROM jsonb_array_elements(v_out) e;
  END IF;
  SELECT count(*) FILTER (WHERE e ->> 'niveau' = 'certain'),
         count(*) FILTER (WHERE e -> 'signaux' -> 'photo' ->> 'verdict' = 'identique'),
         count(*) FILTER (WHERE e -> 'signaux' -> 'photo' ->> 'verdict' = 'inconnue' AND (e -> 'signaux' ->> 'ov')::numeric >= 0.75)
    INTO n_certains, n_photo, n_inconnus
    FROM jsonb_array_elements(v_out) e;
  IF n_certains > 1 OR (n_certains = 1 AND (n_photo > 1 OR (n_inconnus > 0 AND n_photo = 1))) THEN
    SELECT COALESCE(jsonb_agg(CASE WHEN e ->> 'niveau' = 'certain'
                                   THEN e || jsonb_build_object('niveau', 'probable', 'motif', 'plusieurs_candidats')
                                   ELSE e END), '[]'::jsonb)
      INTO v_out FROM jsonb_array_elements(v_out) e;
  END IF;
  RETURN v_out;
END;
$function$;

-- ── 3. rapprochement_urls_a_empreinter : budget de 3 s ──
CREATE OR REPLACE FUNCTION public.rapprochement_urls_a_empreinter(p_limite integer DEFAULT 12)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out text[] := '{}'::text[]; v_a record; v_f record; v_u text; v_jb text[];
BEGIN
  -- (2026-09-27) budget de 3 s depuis le début de l'appel, vérifié avant
  -- chaque annonce et chaque fiche : le statement_timeout de l'appelant est 8 s.
  -- (a) annonces proposées, les plus récentes d'abord
  FOR v_a IN
    SELECT ap.* FROM annonces_plateforme ap
     WHERE ap.inventaire_id IS NULL AND ap.ignoree_le IS NULL AND ap.disparu_le IS NULL AND ap.proposition IS NOT NULL
       AND NOT (ap.proposition ? 'photo_evaluee_le')
     ORDER BY ap.updated_at DESC
     LIMIT 60
  LOOP
    IF clock_timestamp() - statement_timestamp() > interval '3 seconds' THEN RETURN v_out; END IF;
    FOREACH v_u IN ARRAY (annonce_photos_urls(v_a.photo_url, v_a.capture, 3)
                          || COALESCE((SELECT array_agg(u) FROM (
                               SELECT unnest(fiche_photos_toutes(NULLIF(c ->> 'inventaire_id', '')::bigint)) u
                                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_a.proposition -> 'candidats') = 'array'
                                                                THEN v_a.proposition -> 'candidats' ELSE '[]'::jsonb END) c
                               UNION SELECT unnest(fiche_photos_toutes(NULLIF(v_a.proposition ->> 'inventaire_id', '')::bigint))) z), '{}'::text[]))
    LOOP
      IF NOT urls_resolues(ARRAY[v_u]) AND NOT (v_u = ANY (v_out)) THEN v_out := v_out || v_u; END IF;
      IF COALESCE(array_length(v_out, 1), 0) >= p_limite THEN RETURN v_out; END IF;
    END LOOP;
  END LOOP;
  -- (b) fiches importées à examiner, et leurs jumelles de titre (≤ 10 chacune)
  FOR v_f IN SELECT i.* FROM inventaire i WHERE i.id IN (SELECT doublons_fiches_a_examiner(20)) ORDER BY i.created_at LOOP
    IF clock_timestamp() - statement_timestamp() > interval '3 seconds' THEN RETURN v_out; END IF;
    v_jb := titre_jetons(v_f.titre);
    FOREACH v_u IN ARRAY (fiche_photos_toutes(v_f.id)
                          || COALESCE((SELECT array_agg(u) FROM (
                               SELECT unnest(fiche_photos_toutes(j.id)) u FROM (
                                 SELECT i.id FROM inventaire i
                                  WHERE i.user_id = v_f.user_id AND i.id <> v_f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                                    AND (i.created_at < v_f.created_at OR (i.created_at = v_f.created_at AND i.id < v_f.id))
                                    AND titre_jetons(i.titre) && v_jb
                                    AND NOT titres_variantes_incompatibles(i.titre, v_f.titre)
                                  LIMIT 10) j) z), '{}'::text[]))
    LOOP
      IF NOT urls_resolues(ARRAY[v_u]) AND NOT (v_u = ANY (v_out)) THEN v_out := v_out || v_u; END IF;
      IF COALESCE(array_length(v_out, 1), 0) >= p_limite THEN RETURN v_out; END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$function$;

-- ── 2. rapprochement_photos_decider : (a) et (c) seulement, budget de 4 s ──
CREATE OR REPLACE FUNCTION public.rapprochement_photos_decider(p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a record; v_r text;
  n_attache integer := 0; n_ambigu integer := 0; n_reste integer := 0; n_caduques integer := 0;
  v_debut timestamptz := clock_timestamp();
  v_budget_atteint boolean := false;
BEGIN
  -- (a) annonces proposées dont les photos sont résolues.
  -- (2026-09-27) budget de 4 s depuis le DÉBUT DE L'APPEL, vérifié AVANT
  -- chaque annonce (le statement_timeout de l'appelant est 8 s ; l'ancien
  -- budget de 20 s faisait annuler chaque appel). Les FICHES (ancienne boucle
  -- (b)) passent désormais par doublons_reserver_fiches / doublons_examiner_fiche.
  FOR v_a IN
    SELECT ap.* FROM annonces_plateforme ap
     WHERE ap.inventaire_id IS NULL AND ap.ignoree_le IS NULL AND ap.disparu_le IS NULL AND ap.proposition IS NOT NULL
       AND NOT (ap.proposition ? 'photo_evaluee_le')
     ORDER BY ap.updated_at DESC
     LIMIT greatest(p_limite, 0) * 3
  LOOP
    IF clock_timestamp() - statement_timestamp() > interval '4 seconds' THEN v_budget_atteint := true; EXIT; END IF;
    IF NOT urls_resolues(annonce_photos_urls(v_a.photo_url, v_a.capture, 3)
                         || COALESCE((SELECT array_agg(u) FROM (
                              SELECT unnest(fiche_photos_toutes(NULLIF(c ->> 'inventaire_id', '')::bigint)) u
                                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_a.proposition -> 'candidats') = 'array'
                                                               THEN v_a.proposition -> 'candidats' ELSE '[]'::jsonb END) c
                              UNION SELECT unnest(fiche_photos_toutes(NULLIF(v_a.proposition ->> 'inventaire_id', '')::bigint))) z), '{}'::text[])) THEN
      CONTINUE;
    END IF;
    v_r := rapprocher_confirmer_photo(v_a.id);
    IF v_r = 'attache' THEN n_attache := n_attache + 1;
    ELSE
      IF v_r = 'ambigu' THEN n_ambigu := n_ambigu + 1; ELSE n_reste := n_reste + 1; END IF;
      UPDATE annonces_plateforme
         SET proposition = proposition || jsonb_build_object('photo_evaluee_le', now(), 'photo_verdict', v_r)
       WHERE id = v_a.id AND inventaire_id IS NULL AND proposition IS NOT NULL;
    END IF;
  END LOOP;

  -- (c) propositions devenues sans objet (une des deux fiches fusionnée ailleurs, vendue ou supprimée)
  UPDATE inventaire_doublons d SET statut = 'caduque', decide_le = now(), decide_par = 'auto'
   WHERE d.statut = 'proposee'
     AND (NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.fusionne_dans IS NULL AND i.statut = 'stock')
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.absorbe AND i.fusionne_dans IS NULL AND i.statut = 'stock'));
  GET DIAGNOSTICS n_caduques = ROW_COUNT;

  RETURN jsonb_build_object('annonces_rattachees', n_attache, 'annonces_ambigues', n_ambigu, 'annonces_restees_proposees', n_reste,
                            'propositions_caduques', n_caduques, 'budget_atteint', v_budget_atteint,
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_debut) * 1000));
END;
$function$;

-- ── 1a. doublons_reserver_fiches : réserver, reprendre, abandonner ──
CREATE OR REPLACE FUNCTION public.doublons_reserver_fiches(p_limite integer DEFAULT 5)
 RETURNS bigint[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids bigint[] := '{}'::bigint[]; v_neuves bigint[]; v_n integer;
BEGIN
  -- Un examen annulé 3 fois : abandon, on passe à la suivante (plus jamais de
  -- tête de file qui bloque tout). La fiche reste telle quelle, sans fusion.
  UPDATE inventaire_doublons_verifies
     SET resultat = (resultat - 'en_cours' - 'essais') || jsonb_build_object('abandon', 'timeout', 'abandon_le', now()),
         verifie_le = now()
   WHERE resultat ? 'en_cours'
     AND (resultat ->> 'en_cours')::timestamptz < now() - interval '30 minutes'
     AND COALESCE((resultat ->> 'essais')::integer, 1) >= 3;

  -- Un examen annulé (réservation de plus de 30 min) : nouvel essai, d'abord.
  WITH r AS (
    SELECT inventaire_id FROM inventaire_doublons_verifies
     WHERE resultat ? 'en_cours' AND (resultat ->> 'en_cours')::timestamptz < now() - interval '30 minutes'
     ORDER BY verifie_le, inventaire_id
     LIMIT greatest(p_limite, 0)
     FOR UPDATE SKIP LOCKED
  ), u AS (
    UPDATE inventaire_doublons_verifies v
       SET resultat = v.resultat || jsonb_build_object('en_cours', now(), 'essais', COALESCE((v.resultat ->> 'essais')::integer, 1) + 1)
      FROM r WHERE v.inventaire_id = r.inventaire_id
    RETURNING v.inventaire_id
  )
  SELECT COALESCE(array_agg(inventaire_id), '{}'::bigint[]) INTO v_ids FROM u;

  -- Puis des fiches neuves (ou à revoir), dans l'ordre de toujours.
  v_n := greatest(p_limite, 0) - COALESCE(array_length(v_ids, 1), 0);
  IF v_n > 0 THEN
    WITH f AS (SELECT x.id FROM doublons_fiches_a_examiner(v_n) AS x(id)),
    ins AS (
      INSERT INTO inventaire_doublons_verifies AS v (inventaire_id, user_id, resultat)
      SELECT i.id, i.user_id, jsonb_build_object('en_cours', now(), 'essais', 1)
        FROM f JOIN inventaire i ON i.id = f.id
      ON CONFLICT (inventaire_id) DO UPDATE
         SET resultat = v.resultat || jsonb_build_object('en_cours', now(), 'essais', 1)
       WHERE NOT (v.resultat ? 'en_cours')
      RETURNING v.inventaire_id
    )
    SELECT COALESCE(array_agg(inventaire_id), '{}'::bigint[]) INTO v_neuves FROM ins;
    v_ids := v_ids || v_neuves;
  END IF;
  RETURN v_ids;
END;
$function$;

-- ── 1b. doublons_examiner_fiche : l'ancienne boucle (b), pour UNE fiche ──
CREATE OR REPLACE FUNCTION public.doublons_examiner_fiche(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f inventaire%ROWTYPE; v_res jsonb; v_prec jsonb; v_jb text[]; v_cands jsonb; v_e jsonb; v_fus jsonb;
  n_fusions integer := 0; n_propositions integer := 0;
  v_debut timestamptz := clock_timestamp();
BEGIN
  SELECT resultat INTO v_res FROM inventaire_doublons_verifies WHERE inventaire_id = p_fiche FOR UPDATE;
  IF v_res IS NULL OR NOT (v_res ? 'en_cours') THEN
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'non_reservee');
  END IF;
  -- Ce que la fiche portait AVANT la réservation (vide pour un premier examen).
  v_prec := v_res - 'en_cours' - 'essais';

  SELECT * INTO v_f FROM inventaire WHERE id = p_fiche;
  IF v_f.id IS NULL OR v_f.fusionne_dans IS NOT NULL OR v_f.statut IS DISTINCT FROM 'stock' THEN
    -- fusionnée, vendue ou retirée du stock depuis : plus rien à examiner
    UPDATE inventaire_doublons_verifies SET verifie_le = now(), resultat = v_prec || jsonb_build_object('sans_objet', now())
     WHERE inventaire_id = p_fiche;
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'sans_objet');
  END IF;

  v_jb := titre_jetons(v_f.titre);
  IF NOT urls_resolues(fiche_photos_toutes(v_f.id)
                       || COALESCE((SELECT array_agg(u) FROM (
                            SELECT unnest(fiche_photos_toutes(j.id)) u FROM (
                              SELECT i.id FROM inventaire i
                               WHERE i.user_id = v_f.user_id AND i.id <> v_f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                                 AND (i.created_at < v_f.created_at OR (i.created_at = v_f.created_at AND i.id < v_f.id))
                                 AND titre_jetons(i.titre) && v_jb
                                 AND NOT titres_variantes_incompatibles(i.titre, v_f.titre)
                               LIMIT 10) j) z), '{}'::text[]))
     AND v_f.created_at > now() - interval '2 hours' THEN
    -- on attend les empreintes (au plus 2 h : au-delà on décide sans elles) :
    -- la réservation est rendue, la fiche reviendra comme avant.
    IF v_prec = '{}'::jsonb THEN
      DELETE FROM inventaire_doublons_verifies WHERE inventaire_id = p_fiche;
    ELSE
      UPDATE inventaire_doublons_verifies SET resultat = v_prec WHERE inventaire_id = p_fiche;
    END IF;
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'attente_photos');
  END IF;

  v_cands := inventaire_doublons_pour(v_f.id);
  v_fus := NULL;
  FOR v_e IN SELECT e FROM jsonb_array_elements(v_cands) e ORDER BY (e ->> 'niveau' = 'certain') DESC LOOP
    IF v_e ->> 'niveau' = 'certain' AND v_fus IS NULL THEN
      v_fus := inventaire_fusionner_pour(v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint,
                                         'auto (doublon certain : ' || COALESCE(v_e ->> 'motif', '') || ')');
      IF COALESCE((v_fus ->> 'ok')::boolean, false) THEN
        n_fusions := n_fusions + 1;
        INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source, fusion_id, decide_le, decide_par)
        VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'certain', 'fusionnee', v_e ->> 'motif',
                v_e, 'balayage', NULLIF(v_fus ->> 'fusion_id', '')::uuid, now(), 'auto')
        ON CONFLICT DO NOTHING;
      END IF;
    ELSIF v_e ->> 'niveau' IN ('probable', 'certain') THEN
      INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
      VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'probable', 'proposee', v_e ->> 'motif', v_e, 'balayage')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN n_propositions := n_propositions + 1; END IF;
    END IF;
  END LOOP;

  -- Enregistré comme avant : premier examen = le résultat ; revue = l'ancien
  -- résultat complété, horodaté revue_le.
  UPDATE inventaire_doublons_verifies
     SET verifie_le = now(),
         resultat = CASE WHEN v_prec = '{}'::jsonb
                         THEN jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus)
                         ELSE v_prec || jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus)
                                     || jsonb_build_object('revue_le', now()) END
   WHERE inventaire_id = p_fiche;

  RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'examinee', 'candidats', jsonb_array_length(v_cands),
                            'fusions', n_fusions, 'propositions', n_propositions,
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_debut) * 1000));
END;
$function$;

-- ── 1c. doublons_liberer_fiches : rendre ce que le passage n'a pas examiné ──
CREATE OR REPLACE FUNCTION public.doublons_liberer_fiches(p_ids bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n1 integer := 0; n2 integer := 0; n3 integer := 0;
BEGIN
  -- premier essai jamais lancé : la réservation disparaît, sans compter d'essai
  DELETE FROM inventaire_doublons_verifies
   WHERE inventaire_id = ANY (COALESCE(p_ids, '{}'::bigint[])) AND resultat ? 'en_cours'
     AND COALESCE((resultat ->> 'essais')::integer, 1) <= 1 AND (resultat - 'en_cours' - 'essais') = '{}'::jsonb;
  GET DIAGNOSTICS n1 = ROW_COUNT;
  UPDATE inventaire_doublons_verifies SET resultat = resultat - 'en_cours' - 'essais'
   WHERE inventaire_id = ANY (COALESCE(p_ids, '{}'::bigint[])) AND resultat ? 'en_cours'
     AND COALESCE((resultat ->> 'essais')::integer, 1) <= 1;
  GET DIAGNOSTICS n2 = ROW_COUNT;
  -- reprise jamais lancée : l'essai est rendu, la fiche est reprise au passage suivant
  UPDATE inventaire_doublons_verifies
     SET resultat = resultat || jsonb_build_object('en_cours', now() - interval '31 minutes',
                                                   'essais', (resultat ->> 'essais')::integer - 1)
   WHERE inventaire_id = ANY (COALESCE(p_ids, '{}'::bigint[])) AND resultat ? 'en_cours'
     AND COALESCE((resultat ->> 'essais')::integer, 1) > 1;
  GET DIAGNOSTICS n3 = ROW_COUNT;
  RETURN n1 + n2 + n3;
END;
$function$;

-- Droits : service_role seul (la fonction edge), comme les fonctions voisines.
REVOKE ALL ON FUNCTION public.doublons_reserver_fiches(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.doublons_examiner_fiche(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.doublons_liberer_fiches(bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doublons_reserver_fiches(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.doublons_examiner_fiche(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.doublons_liberer_fiches(bigint[]) TO service_role;
