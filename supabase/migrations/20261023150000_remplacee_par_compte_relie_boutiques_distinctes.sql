-- ═══════════════════════════════════════════════════════════════════════════
-- « REMPLACÉE PAR LE COMPTE RELIÉ » AUSSI ENTRE DEUX BOUTIQUES DISTINCTES (23/10 soir, décision de Nico — Louis, Beebs)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ : louis@ et louis-seller@ sont deux comptes reliés (comptes_lies, 18/10) avec chacun SA boutique
-- Beebs. Le 18/10 au soir, 16 annonces ont quitté la boutique de louis@ ; les mêmes articles (fiches jumelles du
-- transfert du 18/10) ont été publiés le lendemain sur celle de louis-seller. 16 questions « vendue ? » sont restées
-- posées chez louis@ (closes à la main, sur décision de Nico, le 23/10 à 18:28). La règle « copie remplacée par le
-- compte relié » (cross_post_jobs_alerte_tenue, branche 3, 22/10) ne jouait pas : elle ne vaut que pour une boutique
-- PARTAGÉE (boutique_partagee_compte_relie) et seulement au moment où l'alerte naît — ici deux boutiques, et l'article
-- est revenu en vente APRÈS la question.
-- LA RÈGLE (décision de Nico, 23/10 soir) : entre deux comptes reliés qui ont chacun leur boutique, une question
-- « vendue ? » (hors Vinted) se ferme — l'annonce est remplacée, ce n'est pas une vente — quand TOUT est prouvé :
--   1. le rattachement passe par la fiche liée (fiches_liees_comptes, comptes reliés), JAMAIS par un titre ;
--   2. l'article est EN LIGNE sur la même plateforme chez le compte relié : son annonce y a été déposée par FillSell
--      (dépôt publié, sans alerte) et un relevé récent (moins de 48 h) l'a vue en ligne ;
--   3. cette annonce est apparue APRÈS la dernière fois que l'ancienne a été vue en ligne : jamais deux annonces du
--      même article en ligne en même temps (sinon la disparition peut être une vente sur l'ancienne boutique) ;
--   4. l'absence de l'ancienne annonce est prouvée : un relevé COMPLET de son compte, commencé après la question, ne
--      l'a pas vue, et aucun relevé ne l'a revue depuis ;
--   5. aucune trace de vente : ni preuve (sale_signal 'sold', sale_evidence), ni vente relevée ou à confirmer
--      (push_ventes, ventes_operations, annonce « vendue »), fiches au stock, une seule unité de chaque côté ;
--   6. aucune republication engagée sur l'article.
-- Dans TOUS les autres cas, la vraie question « vendue ? » reste posée : aucun retrait à tort, aucune double vente.
-- Le geste est celui de la branche 3 : le dépôt mort est clos (cancelled), sa question levée, l'annonce qui le
-- remplace nommée (copie_remplacee_par_compte_relie). Aucune vente écrite, aucune fiche touchée, aucun retrait,
-- aucun mail, aucune notification. Une boutique PARTAGÉE garde sa règle (branche 3, inchangée).
-- QUAND : à la fin de chaque relevé d'annonces (vinted_sync_runs → done, hors Vinted : déclencheur
-- vinted_sync_runs_leve_alertes_disparues), pour le compte relevé et ses comptes reliés — un seul couple aujourd'hui.
-- Coût : un compte sans compte relié sort à la première ligne (une lecture de comptes_lies) ; sinon, au plus 200
-- questions lues, une écriture par question tranchée, aucune ligne inchangée réécrite.
-- Fonction RÉÉCRITE depuis pg_get_functiondef relu en prod le 23/10 à 19:32 : releve_clos_leve_alertes_disparues
-- (md5 153b0383be14997895e3a80f837294a0). Nouvelles : remplacee_par_compte_relie, questions_remplacees_par_compte_relie.
-- Inverse : supabase/rollbacks/20261023150000_remplacee_par_compte_relie_boutiques_distinctes_INVERSE.sql
BEGIN;

-- ── La preuve, pour UNE question : NULL = la question reste posée ─────────────
CREATE OR REPLACE FUNCTION public.remplacee_par_compte_relie(p_job uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j          public.cross_post_jobs%ROWTYPE;
  v_depuis   timestamptz;
  v_ancienne text;
  v_vue      timestamptz;
  v_absence  uuid;
  r          record;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = p_job;
  -- Une vraie question « vendue ? » ouverte, sans preuve de vente, hors Vinted.
  IF j.id IS NULL OR j.status <> 'published' OR coalesce(j.action, 'publish') NOT IN ('publish', 'republish')
     OR coalesce(j.platform, 'vinted') = 'vinted' OR j.inventaire_id IS NULL
     OR NOT (coalesce(j.platform_fields, '{}'::jsonb) ? 'unavailable_since')
     OR coalesce(j.platform_fields ->> 'sale_signal', 'unavailable') <> 'unavailable'
     OR j.platform_fields ? 'sale_evidence' THEN
    RETURN NULL;
  END IF;
  v_depuis := public._ts_ou_null(j.platform_fields ->> 'unavailable_since');
  -- L'identifiant EXACT de l'ancienne annonce (segment d'annonce de l'URL en repli, jamais un nombre du titre).
  v_ancienne := coalesce(public.annonce_id_de_job(j.platform_listing_id, j.listing_url),
    substring(split_part(split_part(coalesce(j.listing_url, ''), '?', 1), '#', 1) FROM '/p/([0-9]+)(?:-|/|$)'),
    substring(split_part(split_part(coalesce(j.listing_url, ''), '?', 1), '#', 1) FROM '/ad/[^/]+/([0-9]+)(?:-|/|$)'));
  IF v_depuis IS NULL OR v_ancienne IS NULL THEN RETURN NULL; END IF;

  -- 5. La fiche : au stock, une seule unité.
  IF NOT EXISTS (SELECT 1 FROM public.inventaire i
                  WHERE i.id = j.inventaire_id AND i.user_id = j.user_id AND i.statut = 'stock'
                    AND i.fusionne_dans IS NULL AND coalesce(i.quantite, 1) = 1) THEN
    RETURN NULL;
  END IF;
  -- 4 et 5. L'ancienne annonce : jamais revue par un relevé depuis la question, jamais relevée « vendue », aucune vente
  -- relevée, à confirmer ou enregistrée sous son numéro ; 6. aucune republication engagée.
  IF EXISTS (SELECT 1 FROM public.annonces_plateforme a
              WHERE a.user_id = j.user_id AND a.platform = j.platform AND a.listing_id = v_ancienne
                AND (a.statut_plateforme = 'vendue' OR a.vu_le >= v_depuis))
     OR EXISTS (SELECT 1 FROM public.push_ventes p
                 WHERE p.user_id = j.user_id AND p.plateforme = j.platform AND btrim(coalesce(p.annonce_id, '')) = v_ancienne
                   AND coalesce(p.origine, '') <> 'essai')
     OR EXISTS (SELECT 1 FROM public.ventes_operations o
                 WHERE o.user_id = j.user_id AND o.cle = 'annonce:' || j.platform || ':' || v_ancienne)
     OR public.republication_engagee(j.user_id, j.inventaire_id, j.platform) IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- 3. La dernière fois que l'ancienne annonce a été vue en ligne : son dépôt, la veille, les relevés.
  v_vue := greatest(coalesce(j.published_at, j.created_at), coalesce(j.vu_en_ligne_le, '-infinity'::timestamptz),
    coalesce((SELECT max(a.vu_le) FROM public.annonces_plateforme a
               WHERE a.user_id = j.user_id AND a.platform = j.platform AND a.listing_id = v_ancienne), '-infinity'::timestamptz));

  -- 4. Son absence prouvée : un relevé COMPLET de son compte, commencé après la question (mêmes critères que
  -- releve_preuve_absence, sans sa garde de session : ce relevé-ci peut être celui du compte relié).
  SELECT s.id INTO v_absence FROM public.vinted_sync_runs s
   WHERE s.user_id = j.user_id AND s.platform = j.platform AND s.kind = 'annonces' AND s.status = 'done'
     AND s.started_at > v_depuis AND s.finished_at IS NOT NULL AND coalesce(s.items_vus, 0) > 0
     AND coalesce(s.erreur, '') NOT LIKE '[incomplet]%' AND NOT coalesce(public.releve_hors_liste(s.erreur), false)
     AND (s.total_entries IS NULL OR s.items_vus >= s.total_entries)
     AND (s.platform <> 'ebay' OR NOT (public.releve_ebay_run_bloque(s.id) OR public.releve_ebay_run_incomplet(s.id)))
   ORDER BY s.started_at DESC LIMIT 1;
  IF v_absence IS NULL THEN RETURN NULL; END IF;

  -- 1, 2, 3. La fiche jumelle d'un compte RELIÉ (lien structurel, jamais un titre), boutique distincte, au stock, une
  -- seule unité ; son annonce sur la même plateforme : déposée par FillSell (publiée, sans alerte), vue EN LIGNE par un
  -- relevé de moins de 48 h, sans trace de vente, et apparue APRÈS la dernière fois que l'ancienne a été vue.
  SELECT t.fiche, t.compte, c.id AS depot, a.listing_id, a.vu_le,
         least(coalesce(c.published_at, c.created_at), a.created_at) AS apparue
    INTO r
    FROM (SELECT l.fiche_b AS fiche, l.user_b AS compte FROM public.fiches_liees_comptes l
           WHERE l.fiche_a = j.inventaire_id AND l.user_a = j.user_id
          UNION
          SELECT l.fiche_a, l.user_a FROM public.fiches_liees_comptes l
           WHERE l.fiche_b = j.inventaire_id AND l.user_b = j.user_id) t
    JOIN public.inventaire i ON i.id = t.fiche AND i.user_id = t.compte AND i.statut = 'stock'
     AND i.fusionne_dans IS NULL AND coalesce(i.quantite, 1) = 1
    JOIN public.cross_post_jobs c ON c.user_id = t.compte AND c.inventaire_id = t.fiche AND c.platform = j.platform
     AND coalesce(c.action, 'publish') IN ('publish', 'republish') AND c.status = 'published'
     AND NOT (coalesce(c.platform_fields, '{}'::jsonb) ?| ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'sale_evidence'])
    JOIN public.annonces_plateforme a ON a.user_id = t.compte AND a.platform = j.platform AND a.inventaire_id = t.fiche
     AND a.listing_id = public.annonce_id_de_job(c.platform_listing_id, c.listing_url)
     AND a.listing_id <> v_ancienne
     AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL
     AND a.vu_le >= now() - interval '48 hours'
   WHERE t.compte <> j.user_id
     AND public.comptes_sont_lies(j.user_id, t.compte)
     AND NOT public.boutique_partagee_compte_relie(j.user_id, t.compte, j.platform)
     AND least(coalesce(c.published_at, c.created_at), a.created_at) > v_vue
     AND NOT EXISTS (SELECT 1 FROM public.push_ventes p
                      WHERE p.user_id = t.compte AND p.plateforme = j.platform AND btrim(coalesce(p.annonce_id, '')) = a.listing_id
                        AND coalesce(p.origine, '') <> 'essai')
   ORDER BY a.vu_le DESC, a.listing_id
   LIMIT 1;
  IF NOT FOUND OR r.listing_id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object('annonce', r.listing_id, 'compte', r.compte, 'fiche', r.fiche, 'depot', r.depot,
    'vue_en_ligne_le', r.vu_le, 'apparue_le', r.apparue, 'ancienne', v_ancienne, 'ancienne_vue_le', v_vue,
    'releve_absence', v_absence);
END
$function$;
REVOKE ALL ON FUNCTION public.remplacee_par_compte_relie(uuid) FROM PUBLIC, anon, authenticated;

-- ── Le geste : les questions du compte relevé et de ses comptes reliés, sur cette plateforme ───────────────
CREATE OR REPLACE FUNCTION public.questions_remplacees_par_compte_relie(p_user uuid, p_platform text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  q     record;
  v     jsonb;
  n     integer := 0;
  v_nom text;
BEGIN
  IF p_user IS NULL OR coalesce(p_platform, 'vinted') = 'vinted' THEN RETURN 0; END IF;
  -- Un compte sans compte relié : rien à lire.
  IF NOT EXISTS (SELECT 1 FROM public.comptes_lies cl WHERE cl.user_a = p_user OR cl.user_b = p_user) THEN RETURN 0; END IF;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
                           WHEN 'depop' THEN 'Depop' WHEN 'opla' THEN 'Opla' ELSE p_platform END;
  FOR q IN
    SELECT j.id FROM public.cross_post_jobs j
     WHERE j.platform = p_platform AND j.status = 'published' AND j.inventaire_id IS NOT NULL
       AND j.platform_fields ? 'unavailable_since'
       AND j.user_id IN (SELECT p_user
                         UNION
                         SELECT CASE WHEN cl.user_a = p_user THEN cl.user_b ELSE cl.user_a END
                           FROM public.comptes_lies cl WHERE cl.user_a = p_user OR cl.user_b = p_user)
     ORDER BY j.created_at, j.id
     LIMIT 200
  LOOP
    v := public.remplacee_par_compte_relie(q.id);
    CONTINUE WHEN v IS NULL;
    UPDATE public.cross_post_jobs c SET
      status = 'cancelled',
      platform_fields = (coalesce(c.platform_fields, '{}'::jsonb)
                          - ARRAY['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'])
        || jsonb_build_object('copie_remplacee_par_compte_relie', v || jsonb_build_object('le', now(),
             'question_depuis', c.platform_fields ->> 'unavailable_since', 'regle', 'boutiques_distinctes_2310')),
      error = 'Cette annonce ' || v_nom || ' n''est plus en ligne ; ton article est en vente sur ' || v_nom
              || ' sous l''annonce ' || (v ->> 'annonce') || ' de ton compte FillSell relié. Ce n''est pas une vente — rien à refaire.'
     WHERE c.id = q.id AND c.status = 'published' AND c.platform_fields ? 'unavailable_since';
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END
$function$;
REVOKE ALL ON FUNCTION public.questions_remplacees_par_compte_relie(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Branché à la fin de chaque relevé d'annonces (hors Vinted) ─────────────
CREATE OR REPLACE FUNCTION public.releve_clos_leve_alertes_disparues()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; v_autre uuid; n integer;
BEGIN
  BEGIN
    v := alerte_lever_revues_plateformes(NEW.user_id, NEW.platform);
    IF COALESCE((v ->> 'levees')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → % alerte(s) « plus en ligne » levée(s), annonces revues en ligne', NEW.id, NEW.platform, v ->> 'levees';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues : run % : %', NEW.id, SQLERRM;
  END;
  -- (22/10 soir, point 3) Boutique partagée entre comptes reliés : ce relevé a aussi revu les annonces du compte relié.
  BEGIN
    FOR v_autre IN
      SELECT CASE WHEN cl.user_a = NEW.user_id THEN cl.user_b ELSE cl.user_a END
        FROM comptes_lies cl WHERE cl.user_a = NEW.user_id OR cl.user_b = NEW.user_id
    LOOP
      IF boutique_partagee_compte_relie(NEW.user_id, v_autre, NEW.platform) THEN
        v := alerte_lever_revues_plateformes(v_autre, NEW.platform);
        IF COALESCE((v ->> 'levees')::int, 0) + COALESCE((v ->> 'a_confirmer_levees')::int, 0) > 0 THEN
          RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → compte relié % : %', NEW.id, NEW.platform, v_autre, v;
        END IF;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues (compte relié) : run % : %', NEW.id, SQLERRM;
  END;
  -- (23/10 soir, décision de Nico) Comptes reliés à boutiques DISTINCTES : une question « vendue ? » dont l'article est
  -- en vente chez le compte relié — fiche liée, vu en ligne par un relevé récent, apparu après l'ancienne annonce,
  -- absence de celle-ci prouvée, aucune trace de vente — se ferme : remplacée, pas une vente. Sinon elle reste posée.
  BEGIN
    n := questions_remplacees_par_compte_relie(NEW.user_id, NEW.platform);
    IF n > 0 THEN
      RAISE LOG 'releve_clos_leve_alertes_disparues : run % (%) → % question(s) « vendue ? » close(s), article en vente chez le compte relié', NEW.id, NEW.platform, n;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_leve_alertes_disparues (remplacée par le compte relié) : run % : %', NEW.id, SQLERRM;
  END;
  -- (22/10 soir, point 1e) Beebs : un retrait clos sans preuve dont l'annonce est revue en ligne repart.
  IF NEW.platform = 'beebs' THEN
    BEGIN
      n := retraits_beebs_rearmer_revus(NEW.user_id);
      IF n > 0 THEN
        RAISE LOG 'releve_clos_leve_alertes_disparues : run % (beebs) → % retrait(s) réarmé(s), annonces revues en ligne', NEW.id, n;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_leve_alertes_disparues (retraits Beebs) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$;

COMMIT;
