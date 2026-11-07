-- Définitions de PROD lues le 07/11/2026 (pg_get_functiondef, sans retour chariot), mot pour mot : les dépendances que
-- la preuve scripts/preuve-remise-apres-annulation-question.mjs charge sur son Postgres JETABLE (elle vérifie le md5 de
-- chacune contre celui lu en prod). Jamais appliqué en prod : ce n'est pas une migration.

CREATE OR REPLACE FUNCTION public.vinted_remise_en_ligne(p_retiree bigint, p_vivante bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire m, inventaire n
     WHERE m.id = p_retiree AND n.id = p_vivante AND m.id <> n.id AND m.user_id = n.user_id
       AND m.vinted_item_id IS NOT NULL AND n.vinted_item_id IS NOT NULL AND m.vinted_item_id <> n.vinted_item_id
       AND n.vinted_status = 'active' AND n.disparu_le IS NULL
       AND COALESCE(m.vinted_account_id, '') = COALESCE(n.vinted_account_id, '')
       AND (
         -- (25/09) l'ancienne fermée par Vinted (closed), datée disparue
         (m.vinted_status = 'closed' AND m.disparu_le IS NOT NULL AND n.created_at >= m.disparu_le - interval '1 day')
         -- (08/10 soir, Bebertdeals) l'ancienne SUPPRIMÉE par la personne pour la republier :
         -- jamais vue vendue, jamais en ligne en même temps que la nouvelle (dernière vue de
         -- l'ancienne AVANT la première de la nouvelle), absente d'un relevé complet de sa boutique
         OR (COALESCE(m.vinted_status, '') <> 'sold'
             AND m.last_synced_at IS NOT NULL AND n.first_seen_at IS NOT NULL AND m.last_synced_at < n.first_seen_at
             AND (m.disparu_le IS NOT NULL OR vinted_absente_dun_releve_complet(m.id)))));
$function$;

CREATE OR REPLACE FUNCTION public.vinted_retraits_successifs(p_premier bigint, p_second bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire m, inventaire n
     WHERE m.id = p_premier AND n.id = p_second AND m.id <> n.id AND m.user_id = n.user_id
       AND m.vinted_item_id IS NOT NULL AND n.vinted_item_id IS NOT NULL AND m.vinted_item_id <> n.vinted_item_id
       AND m.vinted_status = 'closed' AND m.disparu_le IS NOT NULL
       AND n.vinted_status = 'closed' AND n.disparu_le IS NOT NULL
       AND COALESCE(m.vinted_account_id, '') = COALESCE(n.vinted_account_id, '')
       AND n.created_at >= m.disparu_le - interval '1 day');
$function$;

CREATE OR REPLACE FUNCTION public.vinted_absente_dun_releve_complet(p_fiche bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM inventaire m JOIN vinted_sync_runs r ON r.user_id = m.user_id
     WHERE m.id = p_fiche AND m.last_synced_at IS NOT NULL
       AND r.kind = 'dressing' AND r.status = 'done' AND r.items_vus > 0
       AND r.items_vus >= COALESCE(r.total_entries, r.items_vus)
       AND r.started_at > m.last_synced_at + interval '5 minutes'
       AND (m.vinted_account_id IS NULL OR r.vinted_user_id IS NOT DISTINCT FROM m.vinted_account_id));
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_republication_prouvee(p_a uuid, p_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT a.user_id = b.user_id AND a.platform = b.platform AND a.id <> b.id
       AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla', 'depop')
       AND a.disparu_le IS NULL AND b.disparu_le IS NULL AND a.ignoree_le IS NULL AND b.ignoree_le IS NULL
       AND COALESCE(a.prix, 0) > 0 AND a.prix = b.prix
       AND public.rapprochement_texte_norm(a.titre) <> '' AND public.rapprochement_texte_norm(a.titre) = public.rapprochement_texte_norm(b.titre)
       AND public.rapprochement_description_cle(a.capture ->> 'description') IS NOT NULL
       AND public.rapprochement_description_cle(a.capture ->> 'description') = public.rapprochement_description_cle(b.capture ->> 'description')
       AND NOT public.rapprochement_description_lot(a.capture ->> 'description', a.titre)
       AND NOT public.rapprochement_description_lot(b.capture ->> 'description', b.titre)
       AND COALESCE(a.quantite, 1) <= 1 AND COALESCE(b.quantite, 1) <= 1
       AND NOT EXISTS (SELECT 1 FROM inventaire_doublons d
                        WHERE d.user_id = a.user_id AND d.motif = 'annonce_en_double' AND d.statut = 'refusee' AND d.decide_par = 'utilisateur')
      FROM annonces_plateforme a, annonces_plateforme b WHERE a.id = p_a AND b.id = p_b), false);
$function$;

CREATE OR REPLACE FUNCTION public.boutique_vinted_autre_compte(p_user uuid, p_boutique text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nullif(btrim(coalesce(p_boutique, '')), '') is not null and exists (
    select 1 from public.boutiques_plateforme r
     where r.platform = 'vinted' and r.compte_ref = btrim(p_boutique) and r.user_id is distinct from p_user)
$function$;

CREATE OR REPLACE FUNCTION public.titre_en_serie(p_user uuid, p_titre text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (05/11, Nico) Un titre EN SÉRIE chez le compte : au moins 3 annonces vivantes d'UNE même plateforme (ou 3 fiches
  -- Vinted vivantes) portent ce titre normalisé (rapprochement_texte_norm, comme le moteur). Par plateforme : un objet
  -- publié sur 4 plateformes porte 4 fois son titre sans être une série. Un titre vide n'est jamais une série.
  -- Coût mesuré le 05/11 sur le plus gros compte (3 014 annonces, 3 434 fiches) : ~0,2 s ; appelée seulement pour une
  -- question « photo proche » (releve_poser_question).
  WITH t AS (SELECT public.rapprochement_texte_norm(p_titre) AS n)
  SELECT COALESCE((SELECT t.n <> '' FROM t), false) AND (
    EXISTS (SELECT 1 FROM annonces_plateforme ap, t
             WHERE ap.user_id = p_user AND ap.disparu_le IS NULL AND ap.ignoree_le IS NULL
               AND public.rapprochement_texte_norm(ap.titre) = t.n
             GROUP BY ap.platform HAVING count(*) >= 3)
    OR (SELECT count(*) FROM inventaire i, t
         WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
           AND NULLIF(btrim(COALESCE(i.vinted_item_id, '')), '') IS NOT NULL AND i.disparu_le IS NULL
           AND public.rapprochement_texte_norm(i.titre) = t.n) >= 3);
$function$;

CREATE OR REPLACE FUNCTION public.releve_poser_question(p_user uuid, p_existante bigint, p_nouvelle bigint, p_motif text, p_preuves jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- (2026-09-27, audit synchro) La question « Est-ce le même article ? » entre
-- une fiche existante (gardée si « oui ») et la fiche que le relevé vient de
-- créer. Jamais un rattachement : l'écran Doublons la pose, la personne
-- tranche (inventaire_doublon_decider). Une paire déjà tranchée (refusée,
-- défaite, fusionnée) n'est jamais reposée : l'index unique de la paire le
-- garantit (ON CONFLICT DO NOTHING).
DECLARE
  v_t1 text; v_t2 text;
BEGIN
  IF p_user IS NULL OR p_existante IS NULL OR p_nouvelle IS NULL OR p_existante = p_nouvelle THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_existante AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_nouvelle AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  -- ⛔ (05/11, Nico — assopmfrance, écussons ronds sur fond blanc : Albator ≠ UJ2 à 9, un écusson sans rapport à 8)
  -- « Même article ? » n'est JAMAIS posée sur une photo seulement PROCHE quand un des deux titres est en série chez le
  -- compte (titre_en_serie : ≥ 3 annonces d'une plateforme, ou 3 fiches Vinted, au même titre normalisé) : la photo
  -- proche n'en départage pas les pièces, le titre non plus — aucune autre preuve. L'article reste un article à part
  -- (deux exemplaires). Les photos quasi identiques, multiples, identiques : inchangées. Trace : usage_logs (1 par paire et par jour).
  IF p_motif = 'photo_proche' THEN
    SELECT titre INTO v_t1 FROM inventaire WHERE id = p_existante;
    SELECT titre INTO v_t2 FROM inventaire WHERE id = p_nouvelle;
    IF titre_en_serie(p_user, v_t1) OR titre_en_serie(p_user, v_t2) THEN
      IF NOT EXISTS (SELECT 1 FROM usage_logs l WHERE l.user_id = p_user AND l.feature = 'question_photo_proche_ecartee'
                        AND l.created_at > now() - interval '1 day'
                        AND l.metadata ->> 'paire' = least(p_existante, p_nouvelle)::text || '-' || greatest(p_existante, p_nouvelle)::text) THEN
        INSERT INTO usage_logs (user_id, feature, metadata)
        VALUES (p_user, 'question_photo_proche_ecartee', jsonb_build_object(
          'paire', least(p_existante, p_nouvelle)::text || '-' || greatest(p_existante, p_nouvelle)::text,
          'existante', p_existante::text, 'nouvelle', p_nouvelle::text, 'motif', p_motif, 'raison', 'titre_en_serie',
          'photo', p_preuves -> 'photo', 'titres', jsonb_build_array(v_t1, v_t2)));
      END IF;
      RETURN false;
    END IF;
  END IF;
  INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  VALUES (p_user, p_existante, p_nouvelle, 'probable', 'proposee', COALESCE(p_motif, 'releve'), COALESCE(p_preuves, '{}'::jsonb), 'releve')
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_remise_maillon(p_user uuid, p_garde bigint, p_maillon bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g inventaire%ROWTYPE; m inventaire%ROWTYPE;
BEGIN
  SELECT * INTO g FROM inventaire WHERE id = p_garde AND user_id = p_user;
  SELECT * INTO m FROM inventaire WHERE id = p_maillon AND user_id = p_user;
  IF g.id IS NULL OR m.id IS NULL OR g.id = m.id OR g.fusionne_dans IS NOT NULL OR m.fusionne_dans IS NOT NULL THEN RETURN 'introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.decide_par = 'utilisateur'
               AND least(q.garde, q.absorbe) = least(g.id, m.id) AND greatest(q.garde, q.absorbe) = greatest(g.id, m.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f WHERE f.user_id = p_user AND f.defait_le IS NOT NULL
                  AND least(f.garde, f.absorbe) = least(g.id, m.id) AND greatest(f.garde, f.absorbe) = greatest(g.id, m.id)) THEN
    RETURN 'paire_tranchee';
  END IF;
  IF NULLIF(btrim(COALESCE(m.vinted_item_id, '')), '') IS NULL OR btrim(m.vinted_item_id) = btrim(COALESCE(g.vinted_item_id, '')) THEN RETURN 'pas_vinted'; END IF;
  IF COALESCE(m.vinted_account_id, '') <> COALESCE(g.vinted_account_id, '') THEN RETURN 'boutiques_differentes'; END IF;
  IF m.statut IS DISTINCT FROM 'stock' OR COALESCE(m.vinted_status, '') = 'sold' THEN RETURN 'vendu'; END IF;
  -- (24/10, feu vert de Nico) AUCUNE VENTE EN COURS TOUCHÉE : une commande, une preuve de vente qui attend son
  -- enregistrement, un achat en cours Leboncoin, sur le maillon ou la gardée — rien n'est fait (ni fusion, ni question).
  IF EXISTS (SELECT 1 FROM plateforme_commandes pc WHERE pc.inventaire_id IN (g.id, m.id))
     OR EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id IN (g.id, m.id)
                  AND j.status = 'published' AND j.platform_fields ->> 'sale_signal' = 'sold')
     OR EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.inventaire_id IN (g.id, m.id) AND a.platform = 'leboncoin'
                  AND public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture) IN ('pending', 'sold')) THEN
    RETURN 'vente_en_cours';
  END IF;
  -- une annonce morte : datée disparue, ou absente d'un relevé complet de sa boutique
  IF m.disparu_le IS NULL AND NOT vinted_absente_dun_releve_complet(m.id) THEN RETURN 'encore_en_ligne'; END IF;
  IF COALESCE(m.quantite, 1) > 1 THEN RETURN 'quantite'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id = m.id
               AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    RETURN 'job_en_vol';
  END IF;
  IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
              WHERE x.inventaire_id = g.id AND y.inventaire_id = m.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL)
     OR EXISTS (SELECT 1 FROM cross_post_jobs x JOIN cross_post_jobs y ON y.platform = x.platform
                 WHERE x.inventaire_id = g.id AND y.inventaire_id = m.id AND x.platform <> 'vinted'
                   AND x.status = 'published' AND y.status = 'published'
                   AND x.action IN ('publish', 'republish') AND y.action IN ('publish', 'republish')) THEN
    RETURN 'deux_exemplaires';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprochement_v3_appliquer(p_user uuid, p_decisions jsonb, p_mode text DEFAULT 'normal'::text, p_geste boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  d jsonb; v_type text; a annonces_plateforme%ROWTYPE; f inventaire%ROWTYPE; g inventaire%ROWTYPE;
  v_fiche bigint; v_cand bigint; v_fa bigint; v_fb bigint; v_job uuid; v_r jsonb; v_posee boolean; v_motif text;
  v_ids uuid[]; v_id uuid; v_premiere uuid; v_n integer; v_ok boolean;
  v_vivante text; v_morts text[]; v_absorbes bigint[]; v_maillon bigint; v_mort text; v_motif_maillon text; v_r2 jsonb; v_jobs_clos integer;
  n_faits jsonb := '{}'::jsonb; n_sautes jsonb := '{}'::jsonb; v_erreurs jsonb := '[]'::jsonb; v_journal jsonb := '[]'::jsonb;
  t0 timestamptz := clock_timestamp();
  -- (05/11, Nico) un chemin AUTOMATIQUE ne signe jamais « utilisateur » : « auto:… (photo_identique) » — la fusion
  -- automatique par photo identique que retrait_job_prouve reconnaît déjà (même effet sur les ventes qu'avant), jamais
  -- un geste (ni « manuel », ni un retrait de copie sans confirmation : rattachement_confirme).
  v_par text := 'auto:photo_rapprochement_v3 (photo_identique)';
BEGIN
  IF p_user IS NULL OR jsonb_typeof(p_decisions) <> 'array' THEN RETURN jsonb_build_object('ok', false, 'reason', 'parametres'); END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('rapprochement:' || p_user::text)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'occupe');
  END IF;
  PERFORM set_config('fillsell.rapprochement_moteur', 'on', true);

  FOR d IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    v_type := d ->> 'type';
    BEGIN
      -- ── ATTACHER : une annonce sans article rejoint l'article du groupe ──
      IF v_type = 'attacher' THEN
        SELECT * INTO a FROM annonces_plateforme WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user FOR UPDATE;
        v_fiche := (d ->> 'fiche')::bigint;
        SELECT * INTO f FROM inventaire WHERE id = v_fiche AND user_id = p_user AND fusionne_dans IS NULL;
        IF a.id IS NULL OR f.id IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_introuvable', COALESCE((n_sautes ->> 'attacher_introuvable')::int, 0) + 1); CONTINUE; END IF;
        IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deja_decidee', COALESCE((n_sautes ->> 'attacher_deja_decidee')::int, 0) + 1); CONTINUE;
        END IF;
        IF EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL AND x.id <> a.id)
           -- (15/10, P16) sauf la republication PROUVÉE : la même annonce publiée deux fois
           AND NOT (COALESCE(d ->> 'motif', '') = 'republication' AND rapprochement_v3_soeur_republication(a.id, v_fiche) IS NOT NULL) THEN
          n_sautes := n_sautes || jsonb_build_object('attacher_deux_exemplaires', COALESCE((n_sautes ->> 'attacher_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'mode', p_mode)
                   || CASE WHEN d ->> 'motif' = 'republication' THEN jsonb_build_object('republication', true) ELSE '{}'::jsonb END);
        IF v_job IS NULL THEN n_sautes := n_sautes || jsonb_build_object('attacher_refuse', COALESCE((n_sautes ->> 'attacher_refuse')::int, 0) + 1); CONTINUE; END IF;
        -- (07/10) Article VENDU : le suivi part « vendu, encore en ligne ».
        IF f.statut = 'vendu' THEN
          UPDATE cross_post_jobs
             SET status = 'cancelled',
                 platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('pending_removal', true,
                                   'vendu_encore_en_ligne', jsonb_build_object('annonce_id', a.id, 'par', 'rapprochement_v3', 'at', now()))
           WHERE id = v_job AND user_id = p_user AND platform_fields ->> 'source' = 'releve';
        END IF;
        n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1);

      -- ── FUSIONNER (réparation) : l'article importé, intact, rejoint la base ──
      ELSIF v_type = 'fusionner' THEN
        -- (08/10, complément) hors réparation : seulement vers une fiche du dressing
        -- Vinted pas encore jugée (née depuis la dernière passe) ; les gardes
        -- ci-dessous valent pareil (article importé intact, sinon la question).
        IF p_mode <> 'reparation' AND NOT (
             d ->> 'portee' = 'vinted_nouvelle'
             AND EXISTS (SELECT 1 FROM inventaire v WHERE v.id = NULLIF(d ->> 'garde', '')::bigint AND v.user_id = p_user
                           AND v.origine = 'vinted_sync' AND v.created_at > rapprochement_v3_vinted_depuis(p_user))) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_hors_reparation', COALESCE((n_sautes ->> 'fusionner_hors_reparation')::int, 0) + 1); CONTINUE;
        END IF;
        SELECT * INTO f FROM inventaire WHERE id = (d ->> 'absorbe')::bigint AND user_id = p_user FOR UPDATE;
        SELECT * INTO g FROM inventaire WHERE id = (d ->> 'garde')::bigint AND user_id = p_user FOR UPDATE;
        IF f.id IS NULL OR g.id IS NULL OR f.fusionne_dans IS NOT NULL OR g.fusionne_dans IS NOT NULL OR f.id = g.id THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_introuvable', COALESCE((n_sautes ->> 'fusionner_introuvable')::int, 0) + 1); CONTINUE;
        END IF;
        IF NOT (f.origine LIKE 'releve\_%') OR NOT rapprochement_v3_fiche_intacte(f.id) OR g.statut = 'vendu' THEN
          -- Un article que la personne a touché : la question, pas la fusion.
          v_posee := releve_poser_question(p_user, g.id, f.id, 'photo_identique',
                       COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('avant_stock', false, 'regle', 'rapprochement_v3', 'article_modifie', true));
          n_sautes := n_sautes || jsonb_build_object('fusionner_article_modifie', COALESCE((n_sautes ->> 'fusionner_article_modifie')::int, 0) + 1,
                                                       'fusionner_question_posee', COALESCE((n_sautes ->> 'fusionner_question_posee')::int, 0) + CASE WHEN v_posee THEN 1 ELSE 0 END);
          CONTINUE;
        END IF;
        -- jamais deux annonces vivantes de la même plateforme sur un article
        IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                    WHERE x.inventaire_id = f.id AND y.inventaire_id = g.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL
                      -- (15/10, P16) sauf la republication PROUVÉE : l'article importé d'une
                      -- annonce publiée deux fois rejoint la base qui porte sa sœur
                      AND NOT (COALESCE(d ->> 'republication', '') = 'true' AND COALESCE(rapprochement_republication_prouvee(x.id, y.id), false))) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_deux_exemplaires', COALESCE((n_sautes ->> 'fusionner_deux_exemplaires')::int, 0) + 1); CONTINUE;
        END IF;
        v_r := inventaire_fusionner_pour(p_user, g.id, f.id, v_par);
        IF NOT COALESCE((v_r ->> 'ok')::boolean, false) THEN
          n_sautes := n_sautes || jsonb_build_object('fusionner_refuse', COALESCE((n_sautes ->> 'fusionner_refuse')::int, 0) + 1); CONTINUE;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
         WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(g.id, f.id) AND greatest(garde, absorbe) = greatest(g.id, f.id);
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, NULLIF(d ->> 'annonce', '')::uuid, g.id, 'attache', 'auto', 1,
                COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('motif', 'photo_identique', 'regle', 'rapprochement_v3', 'fusion', v_r ->> 'fusion_id', 'absorbe', f.id, 'mode', p_mode)
                || CASE WHEN d ? 'portee' THEN jsonb_build_object('portee', d ->> 'portee') ELSE '{}'::jsonb END);
        n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);

      -- ── GROUPE sans base : un article pour la première, les autres s'y rattachent ──
      ELSIF v_type = 'groupe' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL;
        -- un article déjà là (import d'avant) sert de pivot
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            EXIT WHEN v_fiche IS NOT NULL;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('groupe_sans_article', COALESCE((n_sautes ->> 'groupe_sans_article')::int, 0) + 1); CONTINUE; END IF;
        n_faits := n_faits || jsonb_build_object('groupe', COALESCE((n_faits ->> 'groupe')::int, 0) + 1);
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id = v_fiche THEN CONTINUE; END IF;
          IF a.inventaire_id IS NULL THEN
            IF a.ignoree_le IS NULL AND a.disparu_le IS NULL
               AND (NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL)
                    -- (15/10, P16) la republication prouvée d'une annonce du groupe
                    OR (COALESCE(d -> 'republications', '[]'::jsonb) ? a.id::text AND rapprochement_v3_soeur_republication(a.id, v_fiche) IS NOT NULL)) THEN
              v_job := rapprochement_attacher(a.id, v_fiche, 'photo_identique', COALESCE(d -> 'preuve', '{}'::jsonb) || jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
              IF v_job IS NOT NULL THEN n_faits := n_faits || jsonb_build_object('attacher', COALESCE((n_faits ->> 'attacher')::int, 0) + 1); END IF;
            END IF;
          ELSIF p_mode = 'reparation' THEN
            SELECT * INTO f FROM inventaire WHERE id = a.inventaire_id AND user_id = p_user AND fusionne_dans IS NULL;
            IF f.id IS NOT NULL AND f.origine LIKE 'releve\_%' AND rapprochement_v3_fiche_intacte(f.id)
               AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
                                WHERE x.inventaire_id = f.id AND y.inventaire_id = v_fiche AND x.disparu_le IS NULL AND y.disparu_le IS NULL) THEN
              v_r := inventaire_fusionner_pour(p_user, v_fiche, f.id, v_par);
              IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
                UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
                 WHERE user_id = p_user AND statut = 'proposee' AND (garde = f.id OR absorbe = f.id) AND motif IS DISTINCT FROM 'copie_non_prouvee';
                n_faits := n_faits || jsonb_build_object('fusionner', COALESCE((n_faits ->> 'fusionner')::int, 0) + 1);
              END IF;
            END IF;
          END IF;
        END LOOP;

      -- ── À VÉRIFIER : un VRAI article, hors du stock, avec sa question ──────
      ELSIF v_type = 'a_verifier' THEN
        SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_ids FROM jsonb_array_elements_text(d -> 'annonces') x;
        v_fiche := NULL; v_premiere := NULL;
        SELECT a2.inventaire_id INTO v_fiche FROM annonces_plateforme a2 JOIN inventaire i2 ON i2.id = a2.inventaire_id
         WHERE a2.id = ANY (v_ids) AND a2.user_id = p_user AND i2.fusionne_dans IS NULL ORDER BY i2.created_at LIMIT 1;
        IF v_fiche IS NULL THEN
          FOREACH v_id IN ARRAY v_ids LOOP
            v_fiche := rapprochement_v3_fiche_de(p_user, v_id, p_geste);
            IF v_fiche IS NOT NULL THEN v_premiere := v_id; EXIT; END IF;
          END LOOP;
        END IF;
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('a_verifier_sans_article', COALESCE((n_sautes ->> 'a_verifier_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- les autres annonces du groupe rejoignent l'article
        FOREACH v_id IN ARRAY v_ids LOOP
          SELECT * INTO a FROM annonces_plateforme WHERE id = v_id AND user_id = p_user;
          IF a.id IS NULL OR a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL OR a.disparu_le IS NOT NULL THEN CONTINUE; END IF;
          IF NOT EXISTS (SELECT 1 FROM annonces_plateforme x WHERE x.inventaire_id = v_fiche AND x.platform = a.platform AND x.disparu_le IS NULL)
             -- (15/10, P16) la republication prouvée d'une annonce du groupe
             OR (COALESCE(d -> 'republications', '[]'::jsonb) ? a.id::text AND rapprochement_v3_soeur_republication(a.id, v_fiche) IS NOT NULL) THEN
            PERFORM rapprochement_attacher(a.id, v_fiche, 'photo_identique', jsonb_build_object('regle', 'rapprochement_v3', 'groupe_creation', true, 'mode', p_mode));
          END IF;
        END LOOP;
        -- le candidat : un article, ou l'article d'une annonce (créé au besoin)
        v_cand := NULLIF(d #>> '{candidat,fiche}', '')::bigint;
        IF v_cand IS NULL AND NULLIF(d #>> '{candidat,annonce}', '') IS NOT NULL THEN
          v_cand := rapprochement_v3_fiche_de(p_user, (d #>> '{candidat,annonce}')::uuid, p_geste);
        END IF;
        -- la chaîne des fusions : toujours l'article vivant
        WHILE v_cand IS NOT NULL AND (SELECT fusionne_dans FROM inventaire WHERE id = v_cand) IS NOT NULL LOOP
          v_cand := (SELECT fusionne_dans FROM inventaire WHERE id = v_cand);
        END LOOP;
        SELECT * INTO a FROM annonces_plateforme WHERE id = COALESCE(v_premiere, v_ids[1]) AND user_id = p_user;
        v_motif := COALESCE(NULLIF(d ->> 'motif', ''), 'rapprochement');
        v_posee := false;
        IF v_cand IS NOT NULL AND v_cand <> v_fiche THEN
          v_posee := releve_poser_question(p_user, v_cand, v_fiche, v_motif,
                       COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'annonce_id', a.id,
                                                                                   'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix, 'titre_annonce', a.titre));
          -- déjà posée (par le moteur du 07/10, le rattrapage) : elle vaut
          IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                       AND least(q.garde, q.absorbe) = least(v_cand, v_fiche) AND greatest(q.garde, q.absorbe) = greatest(v_cand, v_fiche)) THEN
            v_posee := true;
          END IF;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fiche, v_motif, v_cand, a.id, a.platform);
          n_faits := n_faits || jsonb_build_object('a_verifier', COALESCE((n_faits ->> 'a_verifier')::int, 0) + 1);
        ELSE
          -- paire déjà tranchée (« non ») ou candidat impossible : un autre article, au stock
          n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1);
          n_sautes := n_sautes || jsonb_build_object('a_verifier_paire_tranchee', COALESCE((n_sautes ->> 'a_verifier_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── ANNONCE EN DOUBLE ? (même plateforme, même photo, même titre) ─────
      ELSIF v_type = 'annonce_en_double' THEN
        v_fa := NULLIF(d #>> '{a,fiche}', '')::bigint;
        IF v_fa IS NULL AND NULLIF(d #>> '{a,annonce}', '') IS NOT NULL THEN v_fa := rapprochement_v3_fiche_de(p_user, (d #>> '{a,annonce}')::uuid, p_geste); END IF;
        v_fb := NULLIF(d #>> '{b,fiche}', '')::bigint;
        IF v_fb IS NULL AND NULLIF(d #>> '{b,annonce}', '') IS NOT NULL THEN v_fb := rapprochement_v3_fiche_de(p_user, (d #>> '{b,annonce}')::uuid, p_geste); END IF;
        IF v_fa IS NULL OR v_fb IS NULL OR v_fa = v_fb THEN n_sautes := n_sautes || jsonb_build_object('double_sans_article', COALESCE((n_sautes ->> 'double_sans_article')::int, 0) + 1); CONTINUE; END IF;
        -- garde = le plus ancien ; jamais un article vendu
        SELECT * INTO f FROM inventaire WHERE id = v_fa; SELECT * INTO g FROM inventaire WHERE id = v_fb;
        IF f.statut = 'vendu' OR g.statut = 'vendu' THEN n_sautes := n_sautes || jsonb_build_object('double_vendu', COALESCE((n_sautes ->> 'double_vendu')::int, 0) + 1); CONTINUE; END IF;
        IF g.created_at < f.created_at THEN v_fa := g.id; v_fb := f.id; END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, 'annonce_en_double',
                     COALESCE(d -> 'preuves', '{}'::jsonb) || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'platform', d ->> 'platform'));
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fa, 'annonce_en_double', v_fb, NULLIF(d #>> '{a,annonce}', '')::uuid, d ->> 'platform');
          PERFORM rapprochement_v3_marquer(p_user, v_fb, 'annonce_en_double', v_fa, NULLIF(d #>> '{b,annonce}', '')::uuid, d ->> 'platform');
          n_faits := n_faits || jsonb_build_object('annonce_en_double', COALESCE((n_faits ->> 'annonce_en_double')::int, 0) + 1);
        ELSE
          n_sautes := n_sautes || jsonb_build_object('double_paire_tranchee', COALESCE((n_sautes ->> 'double_paire_tranchee')::int, 0) + 1);
        END IF;

      -- ── CRÉER : aucun candidat, l'article entre au stock ─────────────────
      ELSIF v_type = 'creer' THEN
        v_fiche := rapprochement_v3_fiche_de(p_user, (d ->> 'annonce')::uuid, p_geste);
        IF v_fiche IS NULL THEN n_sautes := n_sautes || jsonb_build_object('creer_refuse', COALESCE((n_sautes ->> 'creer_refuse')::int, 0) + 1);
        ELSE n_faits := n_faits || jsonb_build_object('creer', COALESCE((n_faits ->> 'creer')::int, 0) + 1); END IF;

      -- ── ENTRER AU STOCK (réparation) : un marqueur automatique sans raison ─
      ELSIF v_type = 'entrer_stock' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire SET a_verifier = NULL
         WHERE id = (d ->> 'fiche')::bigint AND user_id = p_user AND a_verifier IS NOT NULL
           AND COALESCE(a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3');
        IF FOUND THEN
          UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
           WHERE user_id = p_user AND statut = 'proposee' AND decide_par IS NULL AND COALESCE(source, '') = 'releve'
             AND (garde = (d ->> 'fiche')::bigint OR absorbe = (d ->> 'fiche')::bigint) AND motif IS DISTINCT FROM 'copie_non_prouvee';
          n_faits := n_faits || jsonb_build_object('entrer_stock', COALESCE((n_faits ->> 'entrer_stock')::int, 0) + 1);
        END IF;

      -- ── QUESTION CADUQUE (réparation) : une question automatique que v3 ne confirme pas ─
      ELSIF v_type = 'question_caduque' THEN
        IF p_mode <> 'reparation' THEN CONTINUE; END IF;
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
         WHERE id = (d ->> 'id')::uuid AND user_id = p_user AND statut = 'proposee' AND decide_par IS NULL
           AND COALESCE(source, '') = 'releve' AND motif IS DISTINCT FROM 'copie_non_prouvee';
        IF FOUND THEN n_faits := n_faits || jsonb_build_object('question_caduque', COALESCE((n_faits ->> 'question_caduque')::int, 0) + 1); END IF;

      -- ── IGNORER : un relevé non probant (hors liste, eBay hors compte) ──
      ELSIF v_type = 'ignorer' THEN
        UPDATE annonces_plateforme SET ignoree_le = now(), updated_at = now()
         WHERE id = (d ->> 'annonce')::uuid AND user_id = p_user AND inventaire_id IS NULL AND ignoree_le IS NULL;
        IF FOUND THEN
          INSERT INTO rapprochements (user_id, annonce_id, decision, par, score, detail)
          VALUES (p_user, (d ->> 'annonce')::uuid, 'ignore', 'auto', 0, jsonb_build_object('motif', COALESCE(d ->> 'motif', 'releve_non_probant'), 'regle', 'rapprochement_v3'));
          n_faits := n_faits || jsonb_build_object('ignorer', COALESCE((n_faits ->> 'ignorer')::int, 0) + 1);
        END IF;
      -- ── (08/10 soir) FICHE CRÉÉE À LA MAIN FACE À UNE FICHE VINTED ────────
      -- garde = la fiche de la personne, absorbe = la fiche Vinted. « fusionner_fiche » :
      -- photo ET titre, aucun concurrent (le moteur) ; la base fond la fiche
      -- Vinted dans celle de la personne si rien ne s'y oppose
      -- (rapprochement_v3_fiches_fusionnables), sinon la question. « fiche_a_verifier » :
      -- un doute, toujours la question. La fiche Vinted sort du stock le temps
      -- de la réponse (rapprochement_v3_marquer : seulement si personne ne l'a
      -- touchée) ; la fiche de la personne, jamais.
      ELSIF v_type IN ('fusionner_fiche', 'fiche_a_verifier') THEN
        v_fa := NULLIF(d ->> 'garde', '')::bigint;
        v_fb := NULLIF(d ->> 'absorbe', '')::bigint;
        v_motif := rapprochement_v3_fiches_fusionnables(p_user, v_fa, v_fb);
        -- rien : la paire n'existe plus, la personne l'a tranchée, ou ce n'est pas
        -- une fiche à la main face à une fiche Vinted ; un article vendu ou retiré
        IF v_motif IN ('introuvable', 'paire_tranchee', 'main_pas_a_la_main', 'vinted_sans_annonce',
                       'main_pas_en_stock', 'vinted_pas_en_stock', 'vinted_disparue') THEN
          n_sautes := n_sautes || jsonb_build_object(v_type || '_' || v_motif, COALESCE((n_sautes ->> (v_type || '_' || v_motif))::int, 0) + 1);
          CONTINUE;
        END IF;
        IF v_type = 'fusionner_fiche' AND v_motif IS NULL THEN
          v_r := inventaire_fusionner_pour(p_user, v_fa, v_fb, 'auto:photo_rapprochement_v3_main (photo_identique)');
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'rapprochement_v3', fusion_id = (v_r ->> 'fusion_id')::uuid
             WHERE user_id = p_user AND statut = 'proposee' AND least(garde, absorbe) = least(v_fa, v_fb) AND greatest(garde, absorbe) = greatest(v_fa, v_fb);
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = v_fb OR absorbe = v_fb) AND motif IS DISTINCT FROM 'copie_non_prouvee';
            -- (le journal : inventaire_fusions, par = 'auto:photo_rapprochement_v3_main (photo_identique)',
            -- propre à cette règle — rapprochements exige une annonce, il n'y en a pas)
            n_faits := n_faits || jsonb_build_object('fusionner_fiche', COALESCE((n_faits ->> 'fusionner_fiche')::int, 0) + 1);
            CONTINUE;
          END IF;
          v_motif := 'fusion_refusee:' || COALESCE(v_r ->> 'reason', '?');
        END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'),
                     COALESCE(d -> 'preuves', d -> 'preuve', '{}'::jsonb)
                     || jsonb_build_object('avant_stock', true, 'regle', 'rapprochement_v3', 'portee', 'fiche_main')
                     || CASE WHEN v_motif IS NOT NULL THEN jsonb_build_object('refus_fusion', v_motif) ELSE '{}'::jsonb END);
        IF NOT v_posee AND EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.statut = 'proposee'
                                     AND least(q.garde, q.absorbe) = least(v_fa, v_fb) AND greatest(q.garde, q.absorbe) = greatest(v_fa, v_fb)) THEN
          v_posee := true;
        END IF;
        IF v_posee THEN
          PERFORM rapprochement_v3_marquer(p_user, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'photo_identique'), v_fa, NULL::uuid, 'vinted');
          n_faits := n_faits || jsonb_build_object('fiche_a_verifier', COALESCE((n_faits ->> 'fiche_a_verifier')::int, 0) + 1);
          IF v_motif IS NOT NULL AND v_type = 'fusionner_fiche' THEN
            n_sautes := n_sautes || jsonb_build_object('fusionner_fiche_question:' || v_motif, COALESCE((n_sautes ->> ('fusionner_fiche_question:' || v_motif))::int, 0) + 1);
          END IF;
        ELSE
          n_sautes := n_sautes || jsonb_build_object(v_type || '_paire_tranchee', COALESCE((n_sautes ->> (v_type || '_paire_tranchee'))::int, 0) + 1);
        END IF;

      -- ── (08/10 soir, Bebertdeals) LA REMISE EN LIGNE VINTED ─────────────────
      -- garde = la fiche la plus ancienne (annonce Vinted morte : dépôts, copies,
      -- prix d'achat), absorbe = la fiche née de la nouvelle annonce, chaine = les
      -- fiches intermédiaires (annonces mortes). « remise_en_ligne » : la base
      -- vérifie (rapprochement_v3_remise_possible), fond la nouvelle dans la
      -- gardée (l'identité Vinted vivante passe à la gardée : échange journalisé,
      -- réversible), puis les maillons ; les jobs Vinted des annonces mortes sont
      -- clos « remplacée, pas une vente ». Ce qui demande la personne devient la
      -- question. « remise_en_ligne_a_verifier » : toujours la question, rien caché.
      ELSIF v_type IN ('remise_en_ligne', 'remise_en_ligne_a_verifier') THEN
        v_fa := NULLIF(d ->> 'garde', '')::bigint;
        v_fb := NULLIF(d ->> 'absorbe', '')::bigint;
        v_motif := rapprochement_v3_remise_possible(p_user, v_fa, v_fb);
        IF v_motif IN ('introuvable', 'paire_tranchee', 'pas_vinted', 'boutiques_differentes', 'ancienne_vendue', 'vente_en_cours')
           OR (v_type = 'remise_en_ligne' AND v_motif IN ('nouvelle_pas_en_ligne', 'pas_une_remise_en_ligne')) THEN
          n_sautes := n_sautes || jsonb_build_object(v_type || '_' || v_motif, COALESCE((n_sautes ->> (v_type || '_' || v_motif))::int, 0) + 1);
          CONTINUE;
        END IF;
        IF v_type = 'remise_en_ligne' AND v_motif IS NULL THEN
          SELECT btrim(vinted_item_id) INTO v_mort FROM inventaire WHERE id = v_fa;
          SELECT btrim(vinted_item_id) INTO v_vivante FROM inventaire WHERE id = v_fb;
          v_r := inventaire_fusionner_pour(p_user, v_fa, v_fb, 'auto:photo_rapprochement_v3_remise (photo_identique)');
          IF COALESCE((v_r ->> 'ok')::boolean, false) THEN
            v_morts := ARRAY[v_mort]; v_absorbes := ARRAY[v_fb];
            FOR v_maillon IN SELECT (x #>> '{}')::bigint FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d -> 'chaine') = 'array' THEN d -> 'chaine' ELSE '[]'::jsonb END) x LOOP
              v_motif_maillon := rapprochement_v3_remise_maillon(p_user, v_fa, v_maillon);
              IF v_motif_maillon IS NULL THEN
                SELECT btrim(vinted_item_id) INTO v_mort FROM inventaire WHERE id = v_maillon;
                v_r2 := inventaire_fusionner_pour(p_user, v_fa, v_maillon, 'auto:photo_rapprochement_v3_remise (photo_identique)');
                IF COALESCE((v_r2 ->> 'ok')::boolean, false) THEN
                  v_morts := v_morts || v_mort; v_absorbes := v_absorbes || v_maillon;
                  n_faits := n_faits || jsonb_build_object('remise_en_ligne_maillon', COALESCE((n_faits ->> 'remise_en_ligne_maillon')::int, 0) + 1);
                ELSE
                  v_motif_maillon := 'fusion_refusee:' || COALESCE(v_r2 ->> 'reason', '?');
                END IF;
              END IF;
              IF v_motif_maillon IS NOT NULL THEN
                n_sautes := n_sautes || jsonb_build_object('remise_en_ligne_maillon_' || v_motif_maillon, COALESCE((n_sautes ->> ('remise_en_ligne_maillon_' || v_motif_maillon))::int, 0) + 1);
              END IF;
            END LOOP;
            -- les jobs Vinted des annonces mortes, sur la gardée : clos, ce n'est pas une vente
            UPDATE cross_post_jobs
               SET status = 'cancelled',
                   error = 'Annonce Vinted remplacée par une remise en ligne (annonce ' || v_vivante || ') — pas une vente',
                   platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('remplacee_par', jsonb_build_object(
                     'vinted_item_id', v_vivante, 'le', now(), 'par', 'rapprochement_v3', 'statut_avant', status))
             WHERE user_id = p_user AND inventaire_id = v_fa AND platform = 'vinted' AND action IN ('publish', 'republish')
               AND status = 'published' AND btrim(platform_listing_id) = ANY (v_morts)
               AND (reservation_id IS NULL OR reservation_settled_at IS NOT NULL);
            GET DIAGNOSTICS v_jobs_clos = ROW_COUNT;
            UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
             WHERE user_id = p_user AND statut = 'proposee' AND (garde = ANY (v_absorbes) OR absorbe = ANY (v_absorbes))
               AND motif IS DISTINCT FROM 'copie_non_prouvee';
            n_faits := n_faits || jsonb_build_object('remise_en_ligne', COALESCE((n_faits ->> 'remise_en_ligne')::int, 0) + 1,
                                                     'remise_en_ligne_jobs_clos', COALESCE((n_faits ->> 'remise_en_ligne_jobs_clos')::int, 0) + v_jobs_clos);
            CONTINUE;
          END IF;
          v_motif := 'fusion_refusee:' || COALESCE(v_r ->> 'reason', '?');
        END IF;
        v_posee := releve_poser_question(p_user, v_fa, v_fb, COALESCE(NULLIF(d ->> 'motif', ''), 'remise_en_ligne'),
                     COALESCE(d -> 'preuves', d -> 'preuve', '{}'::jsonb)
                     || jsonb_build_object('regle', 'rapprochement_v3', 'portee', 'remise_en_ligne')
                     || CASE WHEN v_motif IS NOT NULL THEN jsonb_build_object('refus_fusion', v_motif) ELSE '{}'::jsonb END);
        IF v_posee THEN
          n_faits := n_faits || jsonb_build_object('remise_en_ligne_a_verifier', COALESCE((n_faits ->> 'remise_en_ligne_a_verifier')::int, 0) + 1);
          IF v_motif IS NOT NULL AND v_type = 'remise_en_ligne' THEN
            n_sautes := n_sautes || jsonb_build_object('remise_en_ligne_question:' || v_motif, COALESCE((n_sautes ->> ('remise_en_ligne_question:' || v_motif))::int, 0) + 1);
          END IF;
        ELSE
          n_sautes := n_sautes || jsonb_build_object(v_type || '_paire_tranchee', COALESCE((n_sautes ->> (v_type || '_paire_tranchee'))::int, 0) + 1);
        END IF;

      ELSE
        n_sautes := n_sautes || jsonb_build_object('type_inconnu', COALESCE((n_sautes ->> 'type_inconnu')::int, 0) + 1);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erreurs := v_erreurs || jsonb_build_array(jsonb_build_object('type', v_type, 'decision', d - 'preuves' - 'preuve', 'erreur', left(SQLERRM, 300)));
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'faits', n_faits, 'sautes', n_sautes, 'erreurs', v_erreurs,
                            'ms', round(extract(epoch FROM clock_timestamp() - t0) * 1000));
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider_corps(p_user uuid, p_id uuid, p_decision text, p_annonce_montree uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user;   -- (06/11) le compte de la QUESTION, passé par l'entrée ; jamais lu sur la session ici
  d inventaire_doublons%ROWTYPE;
  r jsonb;
  v_job uuid; v_del uuid; v_retraits jsonb; v_sans int; v_geste boolean; v_pf_sans jsonb; v_detail text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO d FROM inventaire_doublons WHERE id = p_id AND user_id = v_user FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF d.statut <> 'proposee' THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); END IF;
  -- (06/10, Nico) « Déjà vendu ? » sur une COPIE de la fiche vendue, liée par
  -- le seul titre : « Oui, la retirer » = le geste de la personne prouve que
  -- c'est le même article (rattachement 'utilisateur') ET vaut preuve de vente
  -- pour CE retrait (p_preuve_geste, règle Louis du 30/09) ; le retrait passe
  -- par armer_retrait_job_pour, toutes ses gardes comprises (deux annonces
  -- vivantes sur la plateforme = deux exemplaires = rien). Sans retrait armé,
  -- rien n'est écrit. « Non, c'est un autre exemplaire » : on n'y touche plus,
  -- la question n'est jamais reposée (index unique par dépôt).
  IF d.motif = 'copie_non_prouvee' THEN
    v_job := NULLIF(d.preuves ->> 'job', '')::uuid;
    IF p_decision = 'non' THEN
      UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'non');
    ELSIF p_decision IS DISTINCT FROM 'oui' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
    END IF;
    -- jamais un retrait sur une annonce que l'écran n'a pas montrée
    IF p_annonce_montree IS NULL OR p_annonce_montree::text IS DISTINCT FROM (d.preuves ->> 'annonce_id') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_non_montree');
    END IF;
    -- ⛔ (05/11 soir, Nico — VENDU QUELQUE PART = RETIRÉ PARTOUT) Le « Oui » retire L'ANNONCE MONTRÉE, par SON numéro et
    -- son lien : une question portée par l'annonce (aucun dépôt publié ne la porte sous son numéro), ou un dépôt dont le
    -- numéro désigne une AUTRE annonce que celle montrée (le Doudou de nicolas.menar : le dépôt 13627ae2 porte 3267000921,
    -- « Lot 2 doudous » ; l'annonce montrée est 3274924341) → armer_retrait_annonce_pour, jamais le numéro du dépôt.
    IF v_job IS NULL OR EXISTS (
         SELECT 1 FROM cross_post_jobs j, annonces_plateforme a
          WHERE j.id = v_job AND a.id = p_annonce_montree
            AND (NULLIF(btrim(COALESCE(j.platform_listing_id, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(j.listing_url, '')), '') IS NOT NULL)
            AND NOT listing_designe(a.listing_id, j.listing_url, j.platform_listing_id)) THEN
      IF NOT EXISTS (SELECT 1 FROM annonces_plateforme a JOIN inventaire i ON i.id = a.inventaire_id AND i.user_id = a.user_id
                      WHERE a.id = p_annonce_montree AND a.user_id = v_user AND a.inventaire_id = d.garde
                        AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu') THEN
        UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
        RETURN jsonb_build_object('ok', false, 'reason', 'sans_objet');
      END IF;
      v_del := armer_retrait_annonce_pour(p_annonce_montree, 'copie_confirmee_vendue', interval '0', true);
      IF v_del IS NULL THEN   -- déjà en file pour CETTE annonce : jamais deux retraits
        SELECT dj.id INTO v_del
          FROM cross_post_jobs dj, annonces_plateforme a
         WHERE a.id = p_annonce_montree AND dj.user_id = v_user AND dj.platform = a.platform AND dj.action = 'delete'
           AND dj.status IN ('pending', 'processing', 'needs_user') AND listing_designe(a.listing_id, dj.listing_url, dj.platform_listing_id)
         ORDER BY dj.created_at LIMIT 1;
      END IF;
      IF v_del IS NULL THEN   -- rien n'est écrit, la question reste ouverte
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                  'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
      END IF;
      UPDATE inventaire_doublons SET statut = 'confirmee', decide_le = now(), decide_par = 'utilisateur',
                                     preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retrait', v_del, 'retrait_par', 'annonce')
       WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'oui', 'retraits', 1, 'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
    END IF;
    IF v_job IS NULL
       OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = d.garde AND i.user_id = v_user AND i.fusionne_dans IS NULL AND i.statut = 'vendu')
       OR NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = v_job AND j.user_id = v_user AND j.inventaire_id = d.garde
                       AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'sans_objet');
    END IF;
    BEGIN
      UPDATE cross_post_jobs
         SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('rattachement',
               COALESCE(platform_fields -> 'rattachement', '{}'::jsonb) || jsonb_build_object(
                 'par', 'utilisateur', 'motif', 'meme_article_confirme',
                 'confirme', jsonb_build_object('question', d.id, 'le', now(),
                   'avant', jsonb_build_object('par', platform_fields #> '{rattachement,par}',
                                               'motif', platform_fields #> '{rattachement,motif}'))))
       WHERE id = v_job;
      v_del := armer_retrait_job_pour(v_job, 'copie_confirmee_vendue', interval '0', true);
      IF v_del IS NULL THEN   -- déjà armé par un autre chemin : armer_retrait_job ne double jamais
        SELECT dj.id INTO v_del
          FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
         WHERE j.id = v_job AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user');
      END IF;
      IF v_del IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible', DETAIL = jsonb_build_array(d.preuves ->> 'platform')::text;
      END IF;
      UPDATE inventaire_doublons SET statut = 'confirmee', decide_le = now(), decide_par = 'utilisateur',
                                     preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retrait', v_del)
       WHERE id = d.id;
      RETURN jsonb_build_object('ok', true, 'decision', 'oui', 'retraits', 1, 'plateformes', jsonb_build_array(d.preuves ->> 'platform'));
    EXCEPTION WHEN SQLSTATE 'P0R01' THEN
      -- rattachement et retrait annulés ; la question reste ouverte
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                'plateformes', COALESCE(NULLIF(v_detail, '')::jsonb, '[]'::jsonb));
    END;
  END IF;
  IF p_decision = 'non' THEN
    UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
    RETURN jsonb_build_object('ok', true, 'decision', 'non');
  ELSIF p_decision = 'oui' THEN
    IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND user_id = v_user AND fusionne_dans IS NULL)
       OR NOT EXISTS (SELECT 1 FROM inventaire WHERE id = d.absorbe AND user_id = v_user AND fusionne_dans IS NULL) THEN
      UPDATE inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'utilisateur' WHERE id = d.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'fiche_introuvable');
    END IF;
    -- (2026-09-30, règle Louis partie 2) La fiche gardée est VENDUE : on
    -- regroupe, puis SEULS les dépôts venus de la fiche en ligne reçoivent un
    -- retrait. Si une annonce vivante venue de la fiche en ligne reste sans
    -- retrait, tout est annulé (jamais une annonce vivante cachée sous une
    -- fiche vendue).
    -- ⛔ (03/11 soir, Nico — JEAN-LUC LASSARAT 16:19, Dylan Fontaine 16:28) UNE ANNONCE EN LIGNE QUI RESSEMBLE À UN ARTICLE
    -- DÉJÀ VENDU N'EST JAMAIS RETIRÉE, ni réunie à la fiche vendue : elle entre dans le stock comme un article à part
    -- (des exemplaires de plus d'un vendeur de neuf ; une carte mise en ligne trois mois après la vente de l'autre).
    -- Le « oui » d'avant (30/09, règle Louis partie 2) réunissait les fiches et retirait l'annonce : 8 retraits à tort le
    -- 03/11. Une fiche sans annonce en ligne se réunit comme avant (rien à retirer). La copie interrogée à la vente du
    -- jour (copie_non_prouvee, plus haut) garde son « Oui, la retirer ».
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu')
       AND (EXISTS (SELECT 1 FROM annonces_plateforme ap
                     WHERE ap.user_id = v_user AND ap.inventaire_id = d.absorbe
                       AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL)
            OR EXISTS (SELECT 1 FROM cross_post_jobs j
                        WHERE j.user_id = v_user AND j.inventaire_id = d.absorbe AND j.status = 'published'
                          AND COALESCE(j.action, 'publish') IN ('publish', 'republish'))) THEN
      UPDATE inventaire_doublons SET statut = 'refusee', decide_le = now(), decide_par = 'utilisateur',
             preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object(
               'reponse', p_decision, 'issue', 'article_a_part_annonce_en_ligne', 'le', now())
       WHERE id = d.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (v_user, 'doublon_vendu_article_a_part', jsonb_build_object(
        'doublon', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'motif', d.motif, 'reponse', p_decision));
      RETURN jsonb_build_object('ok', true, 'decision', p_decision, 'retraits', 0, 'article_a_part', true);
    END IF;
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu') THEN
      BEGIN
        r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
        IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN
          -- (05/11, Nico) deux annonces d'une même plateforme : rien n'est regroupé, la question reste ouverte, sa raison est écrite.
          IF r ->> 'reason' = 'deux_annonces_meme_plateforme' THEN
            UPDATE inventaire_doublons
               SET preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('fusion_refusee', jsonb_build_object(
                     'motif', 'deux_annonces_meme_plateforme', 'plateformes', r -> 'plateformes', 'message', r ->> 'message', 'le', now()))
             WHERE id = d.id AND statut = 'proposee';
          END IF;
          RETURN r || jsonb_build_object('decision', 'oui');
        END IF;
        FOR v_job IN
          SELECT j.id FROM cross_post_jobs j
           WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
             AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
        LOOP
          -- (2026-09-30, décision Nico) le « oui » vaut preuve de vente pour le
          -- seul retrait de l'annonce que l'app a montrée (p_annonce_montree),
          -- et seulement si elle vient bien de la fiche en ligne.
          v_geste := p_annonce_montree IS NOT NULL AND EXISTS (
            SELECT 1 FROM annonces_plateforme ap
             WHERE ap.id = p_annonce_montree AND ap.user_id = v_user AND ap.job_id = v_job AND ap.disparu_le IS NULL
               AND ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x));
          v_del := armer_retrait_job_pour(v_job, 'doublon_vendu_confirme', interval '0', v_geste);
        END LOOP;
        -- Les retraits en cours des dépôts venus de la fiche en ligne (armés
        -- ici, ou déjà par un autre chemin : armer_retrait_job ne double jamais).
        SELECT COALESCE(jsonb_agg(DISTINCT dj.id::text), '[]'::jsonb) INTO v_retraits
          FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
         WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
           AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user');
        -- Une annonce vivante venue de la fiche en ligne sans retrait en cours ?
        SELECT count(*) INTO v_sans
          FROM annonces_plateforme ap
         WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
           AND ap.disparu_le IS NULL
           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                            WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
        IF v_sans > 0 THEN
          -- les plateformes où la personne devra retirer elle-même
          SELECT COALESCE(jsonb_agg(DISTINCT ap.platform), '[]'::jsonb) INTO v_pf_sans
            FROM annonces_plateforme ap
           WHERE ap.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'annonces_plateforme', '[]'::jsonb)) x)
             AND ap.disparu_le IS NULL
             AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j JOIN cross_post_jobs dj ON dj.id = NULLIF(j.platform_fields -> 'retrait_arme' ->> 'job', '')::uuid
                              WHERE j.id = ap.job_id AND dj.action = 'delete' AND dj.status IN ('pending', 'processing', 'needs_user'));
          RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible', DETAIL = v_pf_sans::text;
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                       fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid,
                                       preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retraits_oui', v_retraits)
         WHERE id = d.id;
        RETURN r || jsonb_build_object('decision', 'oui', 'retraits', jsonb_array_length(v_retraits));
      EXCEPTION WHEN SQLSTATE 'P0R01' THEN
        -- regroupement et retraits annulés ; la question reste ouverte
        GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;   -- (texte jsonb des plateformes)
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui',
                                  'plateformes', COALESCE(NULLIF(v_detail, '')::jsonb, '[]'::jsonb));
      END;
    END IF;
    r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
    -- (05/11, Nico) deux annonces d'une même plateforme : rien n'est regroupé, la question reste ouverte, sa raison est écrite.
    -- (05/11 soir, décision c) « Annonce en double ? » → « Oui » passe ici : refusé sur une fiche unitaire, sauf
    -- republication prouvée ; l'écran Doublons montre r.message (sinon preuves.fusion_refusee.message).
    IF r ->> 'reason' = 'deux_annonces_meme_plateforme' THEN
      UPDATE inventaire_doublons
         SET preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('fusion_refusee', jsonb_build_object(
               'motif', 'deux_annonces_meme_plateforme', 'plateformes', r -> 'plateformes', 'message', r ->> 'message', 'le', now()))
       WHERE id = d.id AND statut = 'proposee';
    END IF;
    IF COALESCE((r ->> 'ok')::boolean, false) THEN
      UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                     fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid
       WHERE id = d.id;
    END IF;
    RETURN r || jsonb_build_object('decision', 'oui');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider_ia(p_id uuid, p_decision text, p_raison text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d record;
  r jsonb;
begin
  select * into d from inventaire_doublons where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'reason', 'introuvable'); end if;
  if d.statut <> 'proposee' then return jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); end if;
  if d.motif in ('annonce_en_double', 'deux_annonces_meme_plateforme', 'photo_meme_plateforme',
                 'meme_photo_deux_annonces_meme_plateforme', 'photo_deux_annonces', 'plusieurs_exemplaires_vivants',
                 'annonce_remplacee', 'remise_en_ligne_titre_court', 'copie_non_prouvee', 'homonyme_vendu') then
    return jsonb_build_object('ok', false, 'reason', 'hors_ia', 'motif', d.motif);
  end if;
  if p_decision = 'non' then
    update inventaire_doublons
       set statut = 'refusee', decide_le = now(), decide_par = 'ia',
           preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('ia', jsonb_build_object('decision', 'non', 'raison', p_raison, 'le', now()))
     where id = d.id;
    return jsonb_build_object('ok', true, 'decision', 'non');
  elsif p_decision = 'oui' then
    if exists (select 1 from inventaire_doublons x where x.user_id = d.user_id and x.statut = 'refusee' and x.decide_par = 'utilisateur') then
      return jsonb_build_object('ok', false, 'reason', 'compte_deux_exemplaires');
    end if;
    if not exists (select 1 from inventaire where id = d.garde and user_id = d.user_id and fusionne_dans is null and statut is distinct from 'vendu')
       or not exists (select 1 from inventaire where id = d.absorbe and user_id = d.user_id and fusionne_dans is null and statut is distinct from 'vendu') then
      return jsonb_build_object('ok', false, 'reason', 'fiche_vendue_ou_absente');
    end if;
    -- (15/10 soir) Jamais deux annonces d'une MÊME plateforme sur une fiche par
    -- l'IA : ferreirasab, « Bottes Zippy 21 » — deux annonces Leboncoin jugées
    -- « même pièce » que la même fiche Vinted (deux exemplaires possibles).
    if exists (select 1 from inventaire g join inventaire a on true
                where g.id = d.garde and a.id = d.absorbe and g.vinted_item_id is not null and a.vinted_item_id is not null)
       or exists (select 1 from annonces_plateforme ag join annonces_plateforme aa on aa.platform = ag.platform
                   where ag.user_id = d.user_id and ag.inventaire_id = d.garde and ag.disparu_le is null and ag.retiree_le is null
                     and aa.user_id = d.user_id and aa.inventaire_id = d.absorbe and aa.disparu_le is null and aa.retiree_le is null)
       or exists (select 1 from cross_post_jobs jg join cross_post_jobs ja on ja.platform = jg.platform
                   where jg.user_id = d.user_id and jg.inventaire_id = d.garde and jg.status = 'published' and coalesce(jg.action, 'publish') in ('publish', 'republish')
                     and ja.user_id = d.user_id and ja.inventaire_id = d.absorbe and ja.status = 'published' and coalesce(ja.action, 'publish') in ('publish', 'republish')) then
      return jsonb_build_object('ok', false, 'reason', 'deux_annonces_meme_plateforme');
    end if;
    r := inventaire_fusionner_pour(d.user_id, d.garde, d.absorbe, 'ia (doublon proposé)');
    if coalesce((r ->> 'ok')::boolean, false) then
      update inventaire_doublons
         set statut = 'fusionnee', decide_le = now(), decide_par = 'ia', fusion_id = nullif(r ->> 'fusion_id', '')::uuid,
             preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('ia', jsonb_build_object('decision', 'oui', 'raison', p_raison, 'le', now()))
       where id = d.id;
    end if;
    return r || jsonb_build_object('decision', 'oui');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
end;
$function$;

