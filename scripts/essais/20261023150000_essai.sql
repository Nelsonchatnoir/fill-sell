-- Essai à blanc de 20261023150000_remplacee_par_compte_relie_boutiques_distinctes : ROLLBACK. Généré par 20261023150000_generer.sh.
begin;
set local statement_timeout = '170s';
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

-- Tests de 20261023150000_remplacee_par_compte_relie_boutiques_distinctes (assemblés par 20261023150000_generer.sh, ROLLBACK).
-- Les 16 questions Beebs de louis@ (closes le 23/10 à 18:28) sont recréées ici à l'identique, en copies, dans la
-- transaction annulée : la situation telle qu'elle était, avec la règle.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
create temp table _syn (id uuid, attendue text, fiche bigint);
do $$
declare
  louis  uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  seller uuid := '447d920c-976a-4d8f-aff4-a2998050358c';
  b record; v jsonb; v_id uuid; s0 record; n integer; n2 integer; n3 integer; t0 timestamptz; ms numeric;
  v_txt text; v_ok boolean; n_ret_avant integer; n_ret_apres integer; n_pv_avant integer; n_pv_apres integer;
  n_mail_avant integer; n_mail_apres integer;
begin
  -- 0. Les 16 questions, recopiées telles qu'avant leur clôture (dépôts publiés, question ouverte).
  for b in select k.job, k.annonce_remplacante, k.inventaire_id, k.pf_avant from public._backup_2310_soir_louis_questions k order by k.annonce loop
    insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, price, platform_listing_id,
                                 published_at, created_at, listing_url, last_checked_at, platform_fields, action, voie, vu_en_ligne_le)
    select j.user_id, j.inventaire_id, j.platform, 'published', j.photo_option, j.title, j.price, j.platform_listing_id,
           j.published_at, j.created_at, j.listing_url, j.last_checked_at, b.pf_avant, 'publish', j.voie, j.vu_en_ligne_le
      from cross_post_jobs j where j.id = b.job
    returning id into v_id;
    insert into _syn values (v_id, b.annonce_remplacante, b.inventaire_id);
  end loop;
  select count(*) into n from _syn;
  insert into _r values ('A0 16 questions recréées (copies)', n = 16, n::text);

  -- 1. La preuve tient pour chacune, et nomme l'annonce de louis-seller qui la remplace.
  select count(*) filter (where public.remplacee_par_compte_relie(s.id) ->> 'annonce' = s.attendue) into n from _syn s;
  insert into _r values ('P1 16/16 : remplacée par l''annonce de louis-seller attendue', n = 16, n || ' / 16');
  select * into s0 from _syn order by attendue limit 1;
  v := public.remplacee_par_compte_relie(s0.id);
  insert into _r values ('P1b preuve lisible (ancienne, relevé d''absence, apparue après)',
    v ? 'releve_absence' and (v ->> 'apparue_le')::timestamptz > (v ->> 'ancienne_vue_le')::timestamptz, left(v::text, 150));

  -- 2. Tous les autres cas : la question reste posée.
  -- N2 deux annonces en ligne en même temps (l'ancienne vue en ligne après l'apparition de la nouvelle)
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields, 'publish', voie, now() - interval '2 hours' from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N2 coexistence (vente possible sur l''ancienne boutique) : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');
  -- N4 question plus récente que tout relevé complet de louis@ : absence non prouvée
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || jsonb_build_object('unavailable_since', now()), 'publish', voie, vu_en_ligne_le
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N4 absence pas encore prouvée par un relevé complet : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');
  -- N7 preuve de vente (sale_signal sold) / N7b sale_evidence
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || '{"sale_signal": "sold"}'::jsonb, 'publish', voie, vu_en_ligne_le
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N7 preuve de vente : jamais tranchée par la règle', public.remplacee_par_compte_relie(v_id) is null, '');
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || '{"sale_evidence": {"source": "essai"}}'::jsonb, 'publish', voie, vu_en_ligne_le
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N7b trace de vente sur le dépôt : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');
  -- N13 l'ancienne annonce revue par un relevé APRÈS la question
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, photo_option, title, platform_listing_id, published_at, created_at,
                               listing_url, platform_fields, action, voie, vu_en_ligne_le)
  select user_id, inventaire_id, platform, 'published', photo_option, title, platform_listing_id, published_at, created_at,
         listing_url, platform_fields || jsonb_build_object('unavailable_since', '2026-10-18T06:00:00+00:00'), 'publish', voie, null
    from cross_post_jobs where id = s0.id returning id into v_id;
  insert into _r values ('N13 ancienne annonce revue en ligne après la question : question gardée', public.remplacee_par_compte_relie(v_id) is null, '');

  -- Les cas qui touchent des données partagées : chacun dans un sous-bloc annulé (exception), résultat porté par variable.
  -- N1 l'annonce de louis-seller vue en ligne il y a plus de 48 h
  begin
    update annonces_plateforme set vu_le = now() - interval '49 hours' where user_id = seller and platform = 'beebs' and listing_id = s0.attendue;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N1 pas vue en ligne par un relevé récent (49 h) : question gardée', v_ok, coalesce(v_txt, ''));
  -- N6 l'annonce de louis-seller elle-même sous alerte
  v_txt := null;
  begin
    update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_pending_since', now())
     where user_id = seller and platform = 'beebs' and status = 'published' and platform_listing_id = s0.attendue;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N6 annonce du compte relié elle-même sous alerte : question gardée', v_ok, coalesce(v_txt, ''));
  -- N6b l'article chez louis-seller vu par le relevé mais SANS dépôt FillSell publié (rattachement non structurel)
  v_txt := null;
  begin
    update cross_post_jobs set status = 'cancelled'
     where user_id = seller and platform = 'beebs' and status = 'published' and platform_listing_id = s0.attendue;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N6b annonce relevée sans dépôt FillSell : question gardée', v_ok, coalesce(v_txt, ''));
  -- N5 même article sans lien de fiche (titre identique, jamais suffisant)
  v_txt := null;
  begin
    delete from fiches_liees_comptes where fiche_a = s0.fiche or fiche_b = s0.fiche;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N5 sans fiche liée (le titre ne suffit jamais) : question gardée', v_ok, coalesce(v_txt, ''));
  -- N9 comptes non reliés
  v_txt := null;
  begin
    delete from comptes_lies where user_a = least(louis, seller) and user_b = greatest(louis, seller);
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N9 comptes non reliés : question gardée', v_ok, coalesce(v_txt, ''));
  -- N11 boutique PARTAGÉE : la règle d'avant (branche 3) reste seule, celle-ci ne s'en mêle pas
  v_txt := null;
  begin
    insert into sync_import_ecartes (user_id, vinted_item_id, motif) values (louis, 'essai', 'compte_relie:beebs');
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N11 boutique partagée : règle inchangée (pas celle-ci)', v_ok, coalesce(v_txt, ''));
  -- N8 plusieurs unités sur la fiche : deux annonces peuvent être deux exemplaires
  v_txt := null;
  begin
    update inventaire set quantite = 2 where id = s0.fiche;
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N8 fiche à 2 unités : question gardée', v_ok, coalesce(v_txt, ''));
  -- N3 l'ancienne annonce relevée « vendue »
  v_txt := null;
  begin
    update annonces_plateforme set statut_plateforme = 'vendue'
     where user_id = louis and platform = 'beebs'
       and listing_id = (public.remplacee_par_compte_relie(s0.id) ->> 'ancienne');
    v_ok := public.remplacee_par_compte_relie(s0.id) is null;
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_ok := null; v_txt := sqlerrm; end if;
  end;
  insert into _r values ('N3 ancienne annonce relevée « vendue » : question gardée', v_ok, coalesce(v_txt, ''));

  -- N10 Vinted : jamais (sa propre règle) ; L1 Leboncoin de Louis (boutique partagée) : rien ne bouge
  select count(*) into n from cross_post_jobs j where j.user_id = louis and j.platform = 'vinted' and j.status = 'published'
     and j.platform_fields ? 'unavailable_since' and public.remplacee_par_compte_relie(j.id) is not null;
  insert into _r values ('N10 Vinted : aucune question tranchée par la règle', n = 0 and public.questions_remplacees_par_compte_relie(louis, 'vinted') = 0, n::text);
  select count(*), count(*) filter (where public.remplacee_par_compte_relie(j.id) is not null) into n, n2 from cross_post_jobs j
   where j.user_id in (louis, seller) and j.platform = 'leboncoin' and j.status = 'published' and j.platform_fields ? 'unavailable_since';
  insert into _r values ('L1 Leboncoin de Louis (boutique partagée) : questions intactes', n2 = 0, n || ' questions, ' || n2 || ' tranchées');

  -- N12 un compte sans compte relié : sortie immédiate
  t0 := clock_timestamp();
  select count(*) into n from (select public.questions_remplacees_par_compte_relie(p.id, 'leboncoin') x from profiles p
                                where p.id not in (louis, seller) order by p.id limit 50) z where z.x > 0;
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  insert into _r values ('N12 50 comptes sans compte relié : 0 question, coût négligeable', n = 0, ms || ' ms pour 50 comptes');

  -- P4 le chemin réel : la fin d'un relevé Beebs de louis-seller ferme les 16 (sous-bloc annulé)
  v_txt := null; n3 := null;
  begin
    -- (done → running est refusé par garde_reprise_sans_geste : on passe par interrupted, puis done)
    update vinted_sync_runs set status = 'interrupted' where id = '320e1434-16d5-4ea5-aafb-46329252e376';
    update vinted_sync_runs set status = 'done' where id = '320e1434-16d5-4ea5-aafb-46329252e376';
    select count(*) into n3 from _syn s join cross_post_jobs j on j.id = s.id
     where j.status = 'cancelled' and j.platform_fields ? 'copie_remplacee_par_compte_relie';
    raise exception 'annuler';
  exception when others then if sqlerrm <> 'annuler' then v_txt := sqlerrm; end if;
  end;
  insert into _r values ('P4 fin d''un relevé de louis-seller (déclencheur) : les 16 closes', n3 = 16, coalesce(n3::text, '-') || coalesce(' — ' || v_txt, ''));

  -- P2 le geste direct : 16 closes, les cas douteux restent ouverts, aucun effet de bord
  select count(*) into n_ret_avant from cross_post_jobs where user_id in (louis, seller) and action = 'delete';
  select count(*) into n_pv_avant from push_ventes where user_id in (louis, seller);
  select count(*) into n_mail_avant from email_logs;
  t0 := clock_timestamp();
  n := public.questions_remplacees_par_compte_relie(seller, 'beebs');
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000, 1);
  select count(*) into n2 from _syn s join cross_post_jobs j on j.id = s.id
   where j.status = 'cancelled' and j.platform_fields #>> '{copie_remplacee_par_compte_relie,annonce}' = s.attendue
     and not (j.platform_fields ? 'unavailable_since') and j.error like '%ton compte FillSell relié. Ce n''est pas une vente%';
  insert into _r values ('P2 16 closes par le geste, annonce remplaçante nommée', n = 16 and n2 = 16, n || ' closes, ' || n2 || ' conformes, ' || ms || ' ms');
  select count(*) into n from cross_post_jobs where user_id = louis and platform = 'beebs' and status = 'published' and platform_fields ? 'unavailable_since';
  insert into _r values ('P2b les 5 copies douteuses (N2, N4, N7, N7b, N13) restent posées', n = 5, n::text);
  select count(*) into n_ret_apres from cross_post_jobs where user_id in (louis, seller) and action = 'delete';
  select count(*) into n_pv_apres from push_ventes where user_id in (louis, seller);
  select count(*) into n_mail_apres from email_logs;
  insert into _r values ('P2c aucun retrait, aucune vente, aucun mail', n_ret_apres = n_ret_avant and n_pv_apres = n_pv_avant and n_mail_apres = n_mail_avant,
    (n_ret_apres - n_ret_avant) || ' retrait, ' || (n_pv_apres - n_pv_avant) || ' vente, ' || (n_mail_apres - n_mail_avant) || ' mail');
  select count(*) into n from cross_post_jobs c where c.user_id = seller and c.platform = 'beebs' and c.status = 'published'
     and c.platform_listing_id in (select attendue from _syn) and not (c.platform_fields ?| array['unavailable_since', 'sale_signal']);
  insert into _r values ('P2d les 10 annonces de louis-seller intactes', n = 10, n::text);
  insert into _r values ('P3 rejouée : rien de plus (aucune ligne réécrite)', public.questions_remplacees_par_compte_relie(seller, 'beebs') = 0, '');
end $$;
select essai, ok, left(coalesce(detail, ''), 160) detail from _r
union all
select 'ZZ BILAN', bool_and(coalesce(ok, false)), count(*) filter (where ok) || ' / ' || count(*) from _r
order by 1;
rollback;
