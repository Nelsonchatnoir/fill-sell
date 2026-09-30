-- ═══════════════════════════════════════════════════════════════════════════
-- « DÉJÀ VENDU ? » → « OUI » : ON NE RETIRE QUE CE QUI VIENT DE LA FICHE EN LIGNE
-- (règle Louis, partie 2 — GO Nico 30/09, rejeu annulé montré avant application)
-- ═══════════════════════════════════════════════════════════════════════════
-- Avant : « oui » regroupait la fiche en ligne dans la fiche vendue, puis
-- armait le retrait de TOUTES les copies de la fiche vendue
-- (armer_retraits_copies sur la fiche vendue).
-- Maintenant :
--   1. le regroupement se fait comme avant (le retrait exige une vente
--      enregistrée : c'est la fiche vendue qui la porte) ;
--   2. seuls les dépôts VENUS de la fiche en ligne reçoivent un retrait
--      (armer_retrait_job, un par dépôt déplacé) — rien d'autre de la fiche
--      vendue n'est touché ;
--   3. JAMAIS une annonce vivante cachée sous une fiche vendue :
--      a) si une annonce vivante venue de la fiche en ligne n'a pas pu
--         recevoir de retrait, le regroupement est annulé sur-le-champ (la
--         question reste ouverte, réponse « retrait_impossible ») ;
--      b) si un de ces retraits échoue ensuite (failed ou cancelled), le
--         regroupement est défait : la fiche en ligne redevient visible avec
--         son annonce (question « defaite », decide_par 'retrait_echoue').
--         Les autres retraits de ce même « oui » encore en attente sont
--         annulés.
-- Les retraits armés sont notés dans la question : preuves.retraits_oui.
--
-- inventaire_defusionner(p_fusion_id) devient une enveloppe de
-- inventaire_defusionner_pour(p_user, p_fusion_id, p_par) — corps repris
-- de la définition EN PROD du 30/09 (pg_get_functiondef), seules changent
-- la source de l'utilisateur et la valeur decide_par ; même comportement
-- pour l'app (auth.uid(), 'utilisateur').
--
-- INVERSE : réappliquer les définitions d'avant (sauvegardées dans
-- 20260930180000_..._AVANT.sql) et
--   DROP TRIGGER IF EXISTS deja_vendu_retrait_echoue_defait ON public.cross_post_jobs;
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.inventaire_defusionner_pour(p_user uuid, p_fusion_id uuid, p_par text DEFAULT 'utilisateur')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := p_user; -- MODIF 2026-09-30 : l'appelant dit pour qui (inventaire_defusionner passe auth.uid())
  f inventaire_fusions%ROWTYPE;
  v_ids bigint[];
  v_uids uuid[];
  v_cle text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO f FROM inventaire_fusions WHERE id = p_fusion_id AND user_id = v_user FOR UPDATE;
  IF f.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'fusion_introuvable'); END IF;
  IF f.defait_le IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_defaite'); END IF;

  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'ventes', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE ventes SET inventaire_id = f.absorbe WHERE id = ANY (v_ids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_listing_snapshots', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_listing_snapshots SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  SELECT array_agg((x)::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'vinted_republish_captures', '[]'::jsonb)) x;
  IF v_ids IS NOT NULL THEN UPDATE vinted_republish_captures SET inventaire_id = f.absorbe WHERE id = ANY (v_ids); END IF;
  IF f.deplacements ? 'fiches_annonce' THEN
    UPDATE fiches_annonce SET inventaire_id = f.absorbe WHERE inventaire_id = f.garde AND user_id = v_user;
  END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'cross_post_jobs', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE cross_post_jobs SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'annonces_plateforme', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE annonces_plateforme SET inventaire_id = f.absorbe, updated_at = now() WHERE id = ANY (v_uids) AND user_id = v_user; END IF;
  SELECT array_agg((x)::uuid) INTO v_uids FROM jsonb_array_elements_text(COALESCE(f.deplacements -> 'rapprochements', '[]'::jsonb)) x;
  IF v_uids IS NOT NULL THEN UPDATE rapprochements SET inventaire_id = f.absorbe WHERE id = ANY (v_uids) AND user_id = v_user; END IF;

  FOR v_cle IN SELECT k FROM jsonb_object_keys(COALESCE(f.champs_repris, '{}'::jsonb)) k LOOP
    IF v_cle = 'prix_achat' THEN
      UPDATE inventaire SET prix_achat = NULLIF(f.champs_repris -> 'prix_achat' ->> 'avant', '')::numeric WHERE id = f.garde;
    ELSIF v_cle = 'prix_achat_inconnu' THEN
      UPDATE inventaire SET prix_achat_inconnu = NULLIF(f.champs_repris -> 'prix_achat_inconnu' ->> 'avant', '')::boolean WHERE id = f.garde;
    ELSIF v_cle = 'description' THEN
      UPDATE inventaire SET description = f.champs_repris -> 'description' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'marque' THEN
      UPDATE inventaire SET marque = f.champs_repris -> 'marque' ->> 'avant' WHERE id = f.garde;
    ELSIF v_cle = 'photos' THEN
      UPDATE inventaire SET photos = CASE WHEN jsonb_typeof(f.champs_repris -> 'photos' -> 'avant') = 'null'
                                          THEN NULL ELSE f.champs_repris -> 'photos' -> 'avant' END WHERE id = f.garde;
    ELSIF v_cle = 'vinted_identite' AND COALESCE((f.champs_repris -> 'vinted_identite' ->> 'echange')::boolean, false) THEN
      -- AJOUT 2026-09-25 après-midi : ÉCHANGE (remise en ligne). L'absorbé
      -- porte l'annonce RETIRÉE du gardé : on la libère d'abord (index unique),
      -- puis chacun reprend la sienne, disparition et dernière synchro comprises.
      UPDATE inventaire SET vinted_item_id = NULL, vinted_status = NULL, vinted_account_id = NULL WHERE id = f.absorbe;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz,
             disparu_le = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'disparu_le', '')::timestamptz,
             last_synced_at = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'last_synced_at', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'vinted_identite' THEN
      -- AJOUT 2026-09-25 : l'identité Vinted rendue à l'absorbé (le gardé la
      -- lâche d'abord : index unique (user_id, vinted_item_id)).
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'avant' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.garde;
      UPDATE inventaire
         SET vinted_item_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_item_id',
             vinted_status = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_status',
             vinted_account_id = f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_account_id',
             vinted_catalog_id = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_catalog_id', '')::integer,
             vinted_view_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_view_count', '')::integer,
             vinted_favourite_count = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'vinted_favourite_count', '')::integer,
             listed_at_guess = NULLIF(f.champs_repris -> 'vinted_identite' -> 'apres' ->> 'listed_at_guess', '')::timestamptz
       WHERE id = f.absorbe;
    ELSIF v_cle = 'attributs' THEN
      UPDATE inventaire SET attributs = CASE WHEN jsonb_typeof(f.champs_repris -> 'attributs' -> 'avant') = 'null'
                                             THEN NULL ELSE f.champs_repris -> 'attributs' -> 'avant' END WHERE id = f.garde;
    END IF;
  END LOOP;

  UPDATE inventaire SET fusionne_dans = NULL, fusionne_le = NULL WHERE id = f.absorbe AND user_id = v_user;
  UPDATE inventaire_fusions SET defait_le = now() WHERE id = f.id;
  -- AJOUT 2026-09-25 : une fusion défaite n'est JAMAIS refaite ni reproposée.
  UPDATE inventaire_doublons SET statut = 'defaite', decide_le = now(), decide_par = COALESCE(NULLIF(p_par, ''), 'utilisateur') -- MODIF 2026-09-30
   WHERE user_id = v_user AND least(garde, absorbe) = least(f.garde, f.absorbe) AND greatest(garde, absorbe) = greatest(f.garde, f.absorbe);
  RETURN jsonb_build_object('ok', true, 'fusion_id', f.id, 'garde', f.garde, 'absorbe', f.absorbe);
END;
$function$;

-- L'app garde exactement le même appel.
CREATE OR REPLACE FUNCTION public.inventaire_defusionner(p_fusion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN inventaire_defusionner_pour(auth.uid(), p_fusion_id, 'utilisateur');
END;
$function$;

REVOKE ALL ON FUNCTION public.inventaire_defusionner_pour(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inventaire_doublon_decider(p_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  d inventaire_doublons%ROWTYPE;
  r jsonb;
  v_job uuid; v_del uuid; v_retraits jsonb; v_sans int;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO d FROM inventaire_doublons WHERE id = p_id AND user_id = v_user FOR UPDATE;
  IF d.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF d.statut <> 'proposee' THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_tranchee', 'statut', d.statut); END IF;
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
    IF EXISTS (SELECT 1 FROM inventaire WHERE id = d.garde AND statut = 'vendu') THEN
      BEGIN
        r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
        IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN
          RETURN r || jsonb_build_object('decision', 'oui');
        END IF;
        FOR v_job IN
          SELECT j.id FROM cross_post_jobs j
           WHERE j.id IN (SELECT (x)::uuid FROM jsonb_array_elements_text(COALESCE(r -> 'deplacements' -> 'cross_post_jobs', '[]'::jsonb)) x)
             AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
        LOOP
          v_del := armer_retrait_job(v_job, 'doublon_vendu_confirme', interval '0');
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
          RAISE EXCEPTION USING ERRCODE = 'P0R01', MESSAGE = 'retrait_impossible';
        END IF;
        UPDATE inventaire_doublons SET statut = 'fusionnee', decide_le = now(), decide_par = 'utilisateur',
                                       fusion_id = NULLIF(r ->> 'fusion_id', '')::uuid,
                                       preuves = COALESCE(preuves, '{}'::jsonb) || jsonb_build_object('retraits_oui', v_retraits)
         WHERE id = d.id;
        RETURN r || jsonb_build_object('decision', 'oui', 'retraits', jsonb_array_length(v_retraits));
      EXCEPTION WHEN SQLSTATE 'P0R01' THEN
        -- regroupement et retraits annulés ; la question reste ouverte
        RETURN jsonb_build_object('ok', false, 'reason', 'retrait_impossible', 'decision', 'oui');
      END;
    END IF;
    r := inventaire_fusionner_pour(v_user, d.garde, d.absorbe, 'utilisateur (doublon proposé)');
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

-- Un retrait venu d'un « oui » échoue → le regroupement est défait.
CREATE OR REPLACE FUNCTION public.deja_vendu_retrait_echoue_defait()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE d inventaire_doublons%ROWTYPE; r jsonb;
BEGIN
  BEGIN
    SELECT * INTO d FROM inventaire_doublons q
     WHERE q.user_id = NEW.user_id AND q.statut = 'fusionnee' AND q.fusion_id IS NOT NULL
       AND q.preuves ? 'retraits_oui' AND (q.preuves -> 'retraits_oui') ? NEW.id::text
     LIMIT 1;
    IF d.id IS NULL THEN RETURN NULL; END IF;
    r := inventaire_defusionner_pour(d.user_id, d.fusion_id, 'retrait_echoue');
    IF NOT COALESCE((r ->> 'ok')::boolean, false) THEN
      RAISE WARNING 'deja_vendu_retrait_echoue_defait (job %): %', NEW.id, r;
    ELSE
      -- les autres retraits de ce même « oui » encore en attente sont annulés
      -- (après la défusion : la question est déjà « defaite », ce déclencheur
      --  ne se relance pas pour eux)
      UPDATE cross_post_jobs SET status = 'cancelled'
       WHERE user_id = NEW.user_id AND id <> NEW.id AND status IN ('pending', 'processing')
         AND id::text IN (SELECT jsonb_array_elements_text(d.preuves -> 'retraits_oui'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'deja_vendu_retrait_echoue_defait (job %): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $f$;

REVOKE ALL ON FUNCTION public.deja_vendu_retrait_echoue_defait() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS deja_vendu_retrait_echoue_defait ON public.cross_post_jobs;
CREATE TRIGGER deja_vendu_retrait_echoue_defait
  AFTER UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.action = 'delete' AND NEW.status IN ('failed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.deja_vendu_retrait_echoue_defait();
