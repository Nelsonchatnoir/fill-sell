-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE N'EST JAMAIS PORTÉE PAR DEUX ARTICLES (27/09)
-- APPLIQUÉE le 27/09 à 11:38 (GO Nico, CLI db query -f), après rejeu en
-- transaction annulée : id certain accepté, lien du lot refusé au job du doudou,
-- lien Beebs d'un autre article refusé, id neuf accepté, croisement défait
-- (doudou recâblé sur 3275108417, jobs du lot intacts), décision de la personne
-- appliquée ; droits : fonctions réservées à postgres/service_role.
-- ═══════════════════════════════════════════════════════════════════════════
-- nicolas.menar : la republication Leboncoin du « Doudou Mickey gris » (job
-- 73b9a63d) a reçu le lien de l'annonce du LOT (3266998688) alors que
-- Leboncoin avait rendu SON identifiant au dépôt (3275108417) : la récupération
-- du lien par l'extension s'est rabattue sur le TITRE (« doudou » ⊂
-- « doudous »). Deux articles pour une annonce ; la garde de get-pending-jobs a
-- retenu en silence, depuis le 23/09, la republication du lot (d74689a8).
-- Balayage du 27/09 : 9 annonces portées par 2 articles, 3 comptes.
--
-- Trois gestes, idempotents :
--   1. cross_post_jobs_lien_jamais_croise (trigger BEFORE UPDATE OF listing_url,
--      platform_listing_id) : un job de publication/republication ne reçoit
--      JAMAIS un identifiant d'annonce qui n'est pas le sien —
--        · Leboncoin : si le dépôt a rendu un identifiant CERTAIN (lbc_depot
--          .adsubmit.id / sans_adsubmit.id), lui seul est accepté ;
--        · sinon : refusé si l'annonce est rattachée (annonces_plateforme
--          vivante) à un AUTRE article, ou désignée par un job publié d'un
--          AUTRE article.
--      Refus = l'ancien lien est gardé (jamais les deux vidés : le cron de nuit
--      clôturerait la publication), trace platform_fields.lien_refuse, WARNING.
--      Vaut pour TOUTES les versions d'extension (le correctif de l'extension
--      part avec la 0.6.70). Passe-droit : la décision de la personne
--      (rapprochement_decider, GUC fillsell.lien_decide_par_utilisateur).
--   2. defaire_croisement_annonce(user, plateforme, annonce, article_garde) :
--      l'annonce appartient à l'article choisi ; les jobs des AUTRES articles
--      qui la désignent sont recâblés sur leur identifiant certain, sinon
--      déliés (un geste destructeur délié est annulé : rien n'est retiré).
--      Appelée par la décision de la personne (ci-dessous) et par la question
--      de get-pending-jobs (« quel article vend cette annonce ? »).
--   3. rapprochement_decider (recopiée de la version EN PROD, pg_get_functiondef
--      du 27/09) : pose le passe-droit, et « attache » défait le croisement
--      avant de recâbler. Rien d'autre ne change.
-- Aucune annonce retirée, aucune fiche fusionnée ni supprimée.

CREATE OR REPLACE FUNCTION public.cross_post_jobs_lien_jamais_croise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new   text;
  v_old   text;
  v_cert  text;
  v_motif text;
BEGIN
  IF NEW.inventaire_id IS NULL OR COALESCE(NEW.action, 'publish') NOT IN ('publish', 'republish') THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('fillsell.lien_decide_par_utilisateur', true), '') = 'on' THEN RETURN NEW; END IF;
  v_new := COALESCE(annonce_id_job(NEW.platform, NEW.listing_url), NULLIF(btrim(NEW.platform_listing_id), ''));
  v_old := COALESCE(annonce_id_job(OLD.platform, OLD.listing_url), NULLIF(btrim(OLD.platform_listing_id), ''));
  IF v_new IS NULL OR v_new IS NOT DISTINCT FROM v_old THEN RETURN NEW; END IF;

  IF NEW.platform = 'leboncoin' THEN
    v_cert := COALESCE(NULLIF(btrim(NEW.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
                       NULLIF(btrim(NEW.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), ''));
    IF v_cert IS NOT NULL AND v_cert !~ '^\d{6,}$' THEN v_cert := NULL; END IF;
  END IF;

  IF v_cert IS NOT NULL THEN
    IF v_new = v_cert THEN RETURN NEW; END IF;
    v_motif := 'identifiant_certain_different';
  ELSIF EXISTS (SELECT 1 FROM annonces_plateforme a
                 WHERE a.user_id = NEW.user_id AND a.platform = NEW.platform AND a.listing_id = v_new
                   AND a.inventaire_id IS NOT NULL AND a.inventaire_id <> NEW.inventaire_id
                   AND a.disparu_le IS NULL AND a.retiree_le IS NULL) THEN
    v_motif := 'annonce_rattachee_a_un_autre_article';
  ELSIF EXISTS (SELECT 1 FROM cross_post_jobs o
                 WHERE o.user_id = NEW.user_id AND o.platform = NEW.platform AND o.id <> NEW.id
                   AND o.inventaire_id IS NOT NULL AND o.inventaire_id <> NEW.inventaire_id
                   AND o.status = 'published' AND COALESCE(o.action, 'publish') IN ('publish', 'republish')
                   AND listing_designe(v_new, o.listing_url, o.platform_listing_id)) THEN
    v_motif := 'annonce_portee_par_un_autre_article';
  ELSE
    RETURN NEW;
  END IF;

  -- Refus. Une republication qui se CLÔT dans ce même geste ne reprend pas le
  -- lien de l'annonce qu'elle a retirée : elle garde son identifiant certain,
  -- ou rien (le trigger de rattachement créerait sinon une annonce « en ligne »
  -- déjà supprimée).
  IF NEW.action = 'republish' AND NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    NEW.listing_url := NULL;
    NEW.platform_listing_id := v_cert;
  ELSE
    NEW.listing_url := OLD.listing_url;
    NEW.platform_listing_id := COALESCE(v_cert, OLD.platform_listing_id);
  END IF;
  NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb)
    || jsonb_build_object('lien_refuse', jsonb_build_object('le', now(), 'id_propose', v_new, 'motif', v_motif));
  RAISE WARNING 'cross_post_jobs_lien_jamais_croise : job % — annonce % refusée (%)', NEW.id, v_new, v_motif;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.cross_post_jobs_lien_jamais_croise() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS cross_post_jobs_lien_jamais_croise ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_lien_jamais_croise
  BEFORE UPDATE OF listing_url, platform_listing_id ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cross_post_jobs_lien_jamais_croise();


CREATE OR REPLACE FUNCTION public.defaire_croisement_annonce(p_user uuid, p_platform text, p_listing_id text, p_inventaire_garde bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  o          record;
  v_cert     text;
  v_url      text;
  n_recables integer := 0;
  n_delies   integer := 0;
  n_annules  integer := 0;
  v_job_garde uuid;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR NULLIF(btrim(p_listing_id), '') IS NULL OR p_inventaire_garde IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  PERFORM set_config('fillsell.lien_decide_par_utilisateur', 'on', true);

  FOR o IN
    SELECT j.id, j.action, j.status, j.platform_fields
      FROM cross_post_jobs j
     WHERE j.user_id = p_user AND j.platform = p_platform
       AND j.inventaire_id IS NOT NULL AND j.inventaire_id <> p_inventaire_garde
       AND j.status IN ('published', 'pending', 'needs_user')
       AND listing_designe(p_listing_id, j.listing_url, j.platform_listing_id)
     FOR UPDATE
  LOOP
    v_cert := NULL;
    IF p_platform = 'leboncoin' THEN
      v_cert := COALESCE(NULLIF(btrim(o.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
                         NULLIF(btrim(o.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), ''));
      IF v_cert IS NOT NULL AND v_cert !~ '^\d{6,}$' THEN v_cert := NULL; END IF;
    END IF;
    IF v_cert IS NOT NULL AND v_cert <> btrim(p_listing_id) THEN
      SELECT a.url INTO v_url FROM annonces_plateforme a
       WHERE a.user_id = p_user AND a.platform = p_platform AND a.listing_id = v_cert AND a.disparu_le IS NULL
       LIMIT 1;
      UPDATE cross_post_jobs SET
        listing_url = v_url, platform_listing_id = v_cert,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('lien_recable',
          jsonb_build_object('le', now(), 'de', p_listing_id, 'vers', v_cert, 'par', 'article choisi par la personne'))
       WHERE id = o.id;
      n_recables := n_recables + 1;
    ELSIF o.status IN ('pending', 'needs_user') AND o.action IN ('delete', 'republish') THEN
      -- Un geste destructeur qui visait l'annonce d'un autre article : annulé,
      -- rien n'est retiré.
      UPDATE cross_post_jobs SET
        status = 'cancelled', listing_url = NULL, platform_listing_id = NULL,
        error = 'L''annonce visée est celle d''un autre article (choix fait dans l''app) : rien n''a été retiré.',
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('lien_delie',
          jsonb_build_object('le', now(), 'annonce', p_listing_id, 'motif', 'annonce_d_un_autre_article'))
       WHERE id = o.id;
      n_annules := n_annules + 1;
    ELSE
      UPDATE cross_post_jobs SET
        listing_url = NULL, platform_listing_id = NULL,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('lien_delie',
          jsonb_build_object('le', now(), 'annonce', p_listing_id, 'motif', 'annonce_d_un_autre_article'))
       WHERE id = o.id;
      n_delies := n_delies + 1;
    END IF;
  END LOOP;

  SELECT j.id INTO v_job_garde FROM cross_post_jobs j
   WHERE j.user_id = p_user AND j.platform = p_platform AND j.inventaire_id = p_inventaire_garde
     AND j.status = 'published' AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
     AND listing_designe(p_listing_id, j.listing_url, j.platform_listing_id)
   ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
  UPDATE annonces_plateforme SET
    inventaire_id = p_inventaire_garde,
    job_id = COALESCE(v_job_garde, CASE WHEN inventaire_id = p_inventaire_garde THEN job_id END),
    source_rapprochement = 'manuel', proposition = NULL, updated_at = now()
   WHERE user_id = p_user AND platform = p_platform AND listing_id = btrim(p_listing_id)
     AND inventaire_id IS DISTINCT FROM p_inventaire_garde;

  RETURN jsonb_build_object('ok', true, 'recables', n_recables, 'delies', n_delies, 'annules', n_annules);
END
$function$;

REVOKE ALL ON FUNCTION public.defaire_croisement_annonce(uuid, text, text, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defaire_croisement_annonce(uuid, text, text, bigint) TO service_role;


CREATE OR REPLACE FUNCTION public.rapprochement_decider(p_annonce_id uuid, p_decision text, p_inventaire_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  a annonces_plateforme%ROWTYPE;
  v_inv bigint; v_job uuid; v_job_pf jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  -- (2026-09-27) La décision de la personne fait foi : le trigger
  -- cross_post_jobs_lien_jamais_croise la laisse passer (transaction seule).
  PERFORM set_config('fillsell.lien_decide_par_utilisateur', 'on', true);
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = v_user;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : ni rattachée à une fiche, ni
  --    importée. « ignore », « detache » et « refus_proposition » restent permis.
  IF p_decision IN ('attache', 'import') AND releve_run_hors_liste(a.run_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste');
  END IF;

  -- ⛔ 2026-09-26 (labouquinerie85) : UNE ANNONCE QUI N'EST PLUS EN LIGNE NE SE
  --    RATTACHE PAS. Plus en ligne (disparu_le), ou retrait demandé / en cours
  --    / abouti depuis la dernière fois qu'un relevé l'a vue. Le 25/09, quatre
  --    annonces retirées par FillSell ont été proposées « à rattacher » comme
  --    vivantes ; deux ont été rattachées à d'autres livres.
  IF p_decision IN ('attache', 'import') THEN
    IF a.disparu_le IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_plus_en_ligne',
        'message', 'Cette annonce n''est plus en ligne : il n''y a plus rien à rattacher.');
    END IF;
    IF EXISTS (SELECT 1 FROM cross_post_jobs d
                WHERE d.user_id = v_user AND d.platform = a.platform AND d.action = 'delete'
                  AND d.status IN ('pending', 'processing', 'needs_user', 'deleted')
                  AND d.created_at >= COALESCE(a.vu_le, a.created_at)
                  AND listing_designe(a.listing_id, d.listing_url, d.platform_listing_id)) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'annonce_retiree',
        'message', 'FillSell a retiré cette annonce (ou est en train de le faire) : il n''y a plus rien à rattacher.');
    END IF;
  END IF;

  IF p_decision = 'attache' THEN
    v_inv := COALESCE(p_inventaire_id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint);
    IF v_inv IS NULL OR NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = v_inv AND i.user_id = v_user) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable');
    END IF;
    v_job := NULLIF(a.proposition ->> 'job_id', '')::uuid;
    IF v_job IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.id = v_job AND j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform AND j.status = 'published') THEN
      v_job := NULL;
    END IF;
    IF v_job IS NULL THEN
      SELECT j.id INTO v_job FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.inventaire_id = v_inv AND j.platform = a.platform
        AND j.action IN ('publish', 'republish') AND j.status = 'published'
      ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    END IF;
    -- ⛔ 2026-09-26 (labouquinerie85) : ON NE DÉCROCHE JAMAIS UNE ANNONCE VIVANTE.
    --    Le job de la fiche ne se recâble que si l'annonce qu'il suit n'est
    --    plus en ligne (le cas « annonce remplacée »). Sinon la fiche porte deux
    --    annonces sur la plateforme : l'annonce rattachée reçoit SON job de
    --    suivi, l'autre garde le sien. Le 25/09, deux jobs Opla ont quitté leur
    --    annonce vivante pour une annonce retirée ; parc : 26 sur 30.
    IF v_job IS NOT NULL AND EXISTS (
         SELECT 1 FROM annonces_plateforme x, cross_post_jobs jx
          WHERE jx.id = v_job AND x.user_id = v_user AND x.platform = a.platform
            AND x.id <> a.id AND x.disparu_le IS NULL
            AND (x.job_id = v_job OR listing_designe(x.listing_id, jx.listing_url, jx.platform_listing_id))) THEN
      v_job := NULL;
    END IF;
    -- (2026-09-27) L'annonce appartient à l'article choisi : les jobs des
    -- AUTRES articles qui la désignaient sont recâblés sur leur identifiant
    -- certain, sinon déliés (defaire_croisement_annonce).
    PERFORM defaire_croisement_annonce(v_user, a.platform, a.listing_id, v_inv);
    IF v_job IS NOT NULL THEN
      PERFORM rapprocher_recabler_job(v_job, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    ELSE
      v_job := rapprocher_job_de_suivi(v_user, a.platform, v_inv, a.titre, a.prix, a.url, a.listing_id, 'utilisateur', jsonb_build_object('annonce_id', a.id));
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'manuel', proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'utilisateur', 1, jsonb_build_object('job_id', v_job));
    RETURN jsonb_build_object('ok', true, 'decision', 'attache', 'inventaire_id', v_inv, 'job_id', v_job);

  ELSIF p_decision = 'refus_proposition' THEN
    UPDATE annonces_plateforme SET proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, NULLIF(a.proposition ->> 'inventaire_id', '')::bigint, 'refus_proposition', 'utilisateur', COALESCE(a.proposition, '{}'::jsonb));
    RETURN jsonb_build_object('ok', true, 'decision', 'refus_proposition');

  ELSIF p_decision = 'ignore' THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, decision, par) VALUES (v_user, a.id, 'ignore', 'utilisateur');
    RETURN jsonb_build_object('ok', true, 'decision', 'ignore');

  ELSIF p_decision = 'import' THEN
    RETURN rapprocher_importer(v_user, a.id, 'utilisateur');

  ELSIF p_decision = 'detache' THEN
    IF a.job_id IS NOT NULL THEN
      SELECT platform_fields INTO v_job_pf FROM cross_post_jobs WHERE id = a.job_id AND user_id = v_user;
      IF v_job_pf ->> 'source' = 'releve' THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
               platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now()),
               error = 'Rattachement défait par l''utilisateur — pas une vente'
         WHERE id = a.job_id AND user_id = v_user;
      ELSIF v_job_pf ? 'listing_url_precedente' THEN
        UPDATE cross_post_jobs SET listing_url = v_job_pf ->> 'listing_url_precedente',
               platform_listing_id = v_job_pf -> 'rattachement' ->> 'ancien_listing_id',
               platform_fields = (platform_fields - ARRAY['rattachement', 'listing_url_precedente']) || jsonb_build_object('detache_le', now()),
               last_checked_at = NULL
         WHERE id = a.job_id AND user_id = v_user;
      END IF;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, detail)
    VALUES (v_user, a.id, a.inventaire_id, 'detache', 'utilisateur', jsonb_build_object('job_id', a.job_id));
    RETURN jsonb_build_object('ok', true, 'decision', 'detache');
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'decision_inconnue');
END;
$function$
;
