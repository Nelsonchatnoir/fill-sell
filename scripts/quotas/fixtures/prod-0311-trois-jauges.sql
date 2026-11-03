-- Définitions de PROD (pg_get_functiondef), lues le 03/11/2026 vers 23:55 (heure de Paris) avec
-- npx supabase db query --linked --read-only. Empreintes md5 :
--   bordereaux_ouverts_pour 88a47e18f12c34f1baa6df46ab6310fb
--   debut_cycle_quotas 98716246a4ed59ea21d829d2ac8953bb
--   palier_de 52173f13c0f202187d593c90ad645cb6
--   quota_annonces_compte d635326989ffb27ebf041baa5c09d28c
--   quota_annonces_consommees 3f743f91dd14752353387d69010612b9
--   quota_republication_free_etat 4575f94e8d0eab8924cfb63582294666
--   quotas_etat 13206b8cd2eb9cbaf5baf524dad26fce
--   remise_en_vente_place 8a4e7de9dd575399e5a9c89a37ae7065
--   remontees_du_cycle 51d9edbecaac0bf36bab7950f93a64f5
--   republish_palier 5c6f9dfda0d6a8a04c80452adb786733
--   republish_planifiee_etat 04b0869a5780218735701aa219b6edee
--   spend_coins_and_publish 1ebe94d1237aaa6041b365097346bedf
--   spend_coins_and_republish e2cf4f787e7bfb398ccbd920968d969f
--   spend_coins_for_generate 817ffd0627dfc8a33b34cc31290a2e2d
--   spend_coins_for_lens 97b06bed8976097a35cd0d547d078bb7

CREATE OR REPLACE FUNCTION public.bordereaux_ouverts_pour(p_user uuid DEFAULT NULL::uuid, p_platform text DEFAULT 'vinted'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN false
    WHEN coalesce(p_user, auth.uid()) IS NULL THEN false
    -- Leboncoin, Beebs, Depop, eBay : fermés pour tous (« Bientôt disponible »).
    WHEN lower(coalesce(p_platform, '')) <> 'vinted' THEN false
    -- (24/10 nuit, décision de Nico) Paliers Pro et Business SEULEMENT — jamais Free ni Premium, bêta comprise.
    WHEN public.palier_de(coalesce(p_user, auth.uid())) NOT IN ('pro', 'business') THEN false
    -- Vinted : tous les comptes Pro / Business (interrupteur coin_config.bordereaux_vinted_tous), sinon la bêta.
    WHEN coalesce((SELECT k.value FROM coin_config k WHERE k.key = 'bordereaux_vinted_tous'), 0) = 1 THEN true
    ELSE public.messagerie_beta(coalesce(p_user, auth.uid()))
  END;
$function$;

CREATE OR REPLACE FUNCTION public.debut_cycle_quotas(p_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT max(created_at) FROM coin_ledger
      WHERE user_id = p_user_id AND kind IN ('grant_monthly','grant_upgrade')),
    date_trunc('month', now())
  );
$function$;

CREATE OR REPLACE FUNCTION public.palier_de(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT CASE
    WHEN p.is_business IS TRUE THEN 'business'
    WHEN p.is_pro IS TRUE THEN 'pro'
    WHEN p.is_premium IS TRUE OR p.is_comped IS TRUE THEN 'premium'
    ELSE 'free' END
  FROM public.profiles p WHERE p.id = p_user), 'free');
$function$;

CREATE OR REPLACE FUNCTION public.quota_annonces_compte(p_user uuid, p_tier text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select q.quota_annonces from public.quotas_par_compte q where q.user_id = p_user),
    (select c.value from public.coin_config c where c.key = 'quota_annonces_' || coalesce(p_tier, 'free'))
  );
$function$;

CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(p_user_id uuid, p_cycle timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH borne AS (
    SELECT GREATEST(
      p_cycle,
      to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_annonces_depuis'), 0))
    ) AS t
  )
  SELECT (
    -- Annonces générées (portes A et B) — dédup régénération 24 h inchangée.
    (SELECT count(*) FROM usage_logs u, borne
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.created_at >= borne.t
        AND NOT (
          u.metadata ? 'inventaire_id' AND EXISTS (
            SELECT 1 FROM usage_logs prev
            WHERE prev.user_id = u.user_id AND prev.feature = 'generate_listing'
              AND prev.metadata->>'inventaire_id' = u.metadata->>'inventaire_id'
              AND prev.created_at <  u.created_at
              AND prev.created_at >= u.created_at - interval '24 hours'
          )
        ))
    -- + scans NON unifiés depuis la borne : 1 unité chacun. Les scans unifiés
    -- (unifie:true) sont portés par leur ligne generate_listing.
    + (SELECT count(*) FROM usage_logs l, borne
        WHERE l.user_id = p_user_id AND l.feature = 'lens'
          AND l.created_at >= borne.t
          AND NOT (l.metadata ? 'unifie'))
  )::int;
$function$;

CREATE OR REPLACE FUNCTION public.quota_republication_free_etat(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plafond integer;
  v_borne   timestamptz;
  v_exec    integer;
  v_vol     integer;
  v_remise  timestamptz;
BEGIN
  SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_free';
  IF v_plafond IS NULL OR v_plafond <= 0 THEN
    -- Clé absente ou à 0 : pas de compteur (jamais un faux zéro, doctrine du 02/09).
    RETURN jsonb_build_object('mode', 'mensuel', 'plafond', NULL);
  END IF;
  v_borne := GREATEST(
    debut_cycle_quotas(p_user),
    to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_republication_free_depuis'), 0)));
  SELECT count(*) FILTER (WHERE j.published_at >= v_borne),
         count(*) FILTER (WHERE j.published_at IS NULL AND j.created_at >= v_borne
                            AND j.status IN ('pending', 'processing', 'needs_user'))
    INTO v_exec, v_vol
    FROM cross_post_jobs j
   WHERE j.user_id = p_user
     AND j.action = 'republish'
     AND (j.published_at >= v_borne OR j.created_at >= v_borne)
     AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota'])
     AND COALESCE(j.handler_build, '') !~ '(sync-dressing|releve-annonces)';
  SELECT w.next_grant_at INTO v_remise FROM coin_wallets w WHERE w.user_id = p_user;
  RETURN jsonb_build_object(
    'mode', 'mensuel',
    'plafond', v_plafond,
    'faites', v_exec + v_vol,          -- utilisées : exécutées + en cours
    'executees', v_exec,
    'en_cours', v_vol,
    'restantes', GREATEST(0, v_plafond - v_exec - v_vol),
    'depuis', v_borne,
    'remise_le', v_remise);            -- coin_wallets.next_grant_at, comme les annonces
END;
$function$;

CREATE OR REPLACE FUNCTION public.quotas_etat()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_tier  text;
  v_cycle timestamptz;
  v_qa integer; v_qs integer; v_qr integer; v_qrep integer;
  v_avie integer; v_depuis integer;
  v_ca integer; v_cs integer; v_cr integer; v_crep integer;
  v_repub jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = v_user;
  v_tier  := COALESCE(v_tier, 'free');
  v_cycle := debut_cycle_quotas(v_user);

  -- (11/10) Le quota d'annonces du COMPTE : son réglage s'il en a un, sinon
  -- celui du palier (quota_annonces_compte, table quotas_par_compte).
  v_qa := quota_annonces_compte(v_user, v_tier);
  SELECT value INTO v_qs   FROM coin_config WHERE key = 'quota_scan_'      || v_tier;
  SELECT value INTO v_qr   FROM coin_config WHERE key = 'quota_retouche_'  || v_tier;
  -- Fusion 02/09 soir : clés scans à 0 (retour arrière) — 0 = pas de compteur.
  v_qs := NULLIF(COALESCE(v_qs, 0), 0);

  v_ca := quota_annonces_consommees(v_user, v_cycle);
  SELECT count(*)::int INTO v_cs FROM usage_logs
   WHERE user_id = v_user AND feature = 'lens' AND created_at >= v_cycle;
  -- Retouches : même remise à zéro que les annonces (quotas_retouche_depuis).
  SELECT count(*)::int INTO v_cr FROM usage_logs
   WHERE user_id = v_user AND feature = 'photo_retouche'
     AND (metadata->>'delivered') IS DISTINCT FROM 'false'
     AND created_at >= GREATEST(v_cycle,
       to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_retouche_depuis'), 0)));

  IF v_tier = 'free' THEN
    -- (05/10, décision Nico) 50 PAR MOIS, plus « à vie » : le compteur et sa
    -- remise à zéro vivent dans quota_republication_free_etat (même cycle
    -- que quota_annonces_free).
    v_repub := quota_republication_free_etat(v_user);
  ELSIF v_tier = 'business' THEN
    v_repub := jsonb_build_object('mode', 'illimite');
  ELSE
    SELECT value INTO v_qrep FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    -- (03/11, décision de Nico) faites + en cours, jamais les annulées jamais publiées (remontees_du_cycle).
    v_crep := remontees_du_cycle(v_user, v_cycle);
    v_repub := jsonb_build_object('mode', 'mensuel',
                                  'plafond', NULLIF(COALESCE(v_qrep, 0), 0),
                                  'faites', v_crep,
                                  'restantes', CASE WHEN COALESCE(v_qrep,0) > 0
                                    THEN GREATEST(0, v_qrep - v_crep) ELSE NULL END);
  END IF;

  RETURN jsonb_build_object(
    'palier', v_tier,
    'cycle_debut', v_cycle,
    'annonces',  jsonb_build_object('plafond', v_qa, 'consommes', v_ca,
                   'restantes', CASE WHEN v_qa IS NOT NULL THEN GREATEST(0, v_qa - v_ca) END),
    'scans',     jsonb_build_object('plafond', v_qs, 'consommes', v_cs,
                   'restantes', CASE WHEN v_qs IS NOT NULL THEN GREATEST(0, v_qs - v_cs) END),
    'retouches', jsonb_build_object('plafond', v_qr, 'consommes', v_cr,
                   'restantes', CASE WHEN v_qr IS NOT NULL THEN GREATEST(0, v_qr - v_cr) END),
    'republication', v_repub
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.remise_en_vente_place(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_palier text := COALESCE(republish_palier(p_user), 'free');
  v_quota integer; v_depuis timestamptz; v_faits integer;
  v_qfree jsonb;
BEGIN
  -- (24/10, décision de Nico) PLUS DE PLAFOND PAR JOUR, pour aucun palier : seule la limite du mois ferme la place.
  IF v_palier = 'free' THEN
    -- (05/10) 50 PAR MOIS : le compteur partagé ; épuisé, on reprend à la
    -- remise à zéro (jamais un abandon : le mois suivant rouvre la place).
    v_qfree := quota_republication_free_etat(p_user);
    IF (v_qfree ->> 'plafond') IS NOT NULL AND (v_qfree ->> 'restantes')::integer <= 0 THEN
      RETURN jsonb_build_object('place', false, 'motif', 'quota_du_mois',
        'palier', v_palier, 'plafond', (v_qfree ->> 'plafond')::integer,
        'faits', (v_qfree ->> 'faites')::integer,
        'reprise', GREATEST(COALESCE((v_qfree ->> 'remise_le')::timestamptz, now() + interval '1 day'),
                            now() + interval '1 hour'));
    END IF;
  ELSIF v_palier IN ('premium', 'pro') THEN
    SELECT NULLIF(value, 0) INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    v_depuis := debut_cycle_quotas(p_user);
  END IF;
  IF v_quota IS NOT NULL AND v_depuis IS NOT NULL THEN
    -- (03/11, décision de Nico) faites + en cours, jamais les annulées jamais publiées (remontees_du_cycle).
    SELECT remontees_du_cycle(p_user, v_depuis)
         + (SELECT count(*) FROM remises_en_vente r
             WHERE r.user_id = p_user AND r.statut = 'faite' AND r.traite_le >= v_depuis
               -- (24/10 soir) une remise après une vente ANNULÉE est hors quota
               AND NOT EXISTS (SELECT 1 FROM cross_post_jobs jv WHERE jv.id = r.job_vendu
                                AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'))
      INTO v_faits;
    IF v_faits >= v_quota THEN
      RETURN jsonb_build_object('place', false,
        'motif', 'quota_du_mois',
        'palier', v_palier, 'plafond', v_quota, 'faits', v_faits,
        'reprise', now() + interval '1 day');
    END IF;
  END IF;
  RETURN jsonb_build_object('place', true, 'palier', v_palier);
END;
$function$;

CREATE OR REPLACE FUNCTION public.remontees_du_cycle(p_user uuid, p_depuis timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
    FROM cross_post_jobs j
   WHERE j.user_id = p_user
     AND j.action = 'republish'
     AND j.created_at >= p_depuis
     AND (j.published_at IS NOT NULL OR j.status IN ('published', 'sold', 'pending', 'processing', 'needs_user'))
     AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota'])
     AND COALESCE(j.handler_build, '') !~ '(sync-dressing|releve-annonces)';
$function$;

CREATE OR REPLACE FUNCTION public.republish_palier(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.palier_de(p_user);
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_etat(p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_regl jsonb; v_fen jsonb; v_esp jsonb; v_legacy jsonb;
  v_palier text;
  v_quota integer; v_cycle timestamptz; v_faits_mois integer;
  v_fuseau text; v_minuit timestamptz;
  v_crees_pf integer; v_abouties_pf integer; v_crees_compte integer; v_crees_total integer;
  v_ident jsonb; v_boutique text; v_boutiques jsonb; v_multi boolean;
  v_elig_total integer; v_elig_boutique integer; v_exclus jsonb; v_par_boutique jsonb;
  v_duree integer; v_capacite integer; v_restants integer; v_attendu integer; v_borne text;
  v_plafond_b integer; v_faits_b integer; v_restants_b integer;
  v_jour_prochain boolean;
  v_courant jsonb; v_dernier jsonb;
  v_faites_live integer; v_blocage jsonb; v_disjoncteur jsonb;
  v_ouverte boolean; v_en_ligne integer;
  v_cr republish_creneaux%ROWTYPE; v_faits_cr integer; v_debut_ryt timestamptz; v_prev_ryt integer;
  v_intervalle numeric; v_source_capacite text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN
    RETURN jsonb_build_object('error', 'invalid_platform', 'platform', v_pf);
  END IF;

  v_palier := republish_palier(v_user);
  v_regl := republish_planifiee_reglage(v_user, v_pf);
  v_ouverte := republish_planifiee_pf_ouverte(v_pf);
  v_en_ligne := republish_planifiee_annonces_en_ligne(v_user, v_pf);
  SELECT p.platform_settings #> '{vinted,republish_auto}' INTO v_legacy FROM profiles p WHERE p.id = v_user;

  -- Quota mensuel : même définition que le RPC (cycle = dernier grant), COMMUN
  -- à toutes les plateformes — une republication est une republication.
  IF v_palier IN ('premium', 'pro') THEN
    SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      SELECT COALESCE(max(l.created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger l WHERE l.user_id = v_user AND l.kind IN ('grant_monthly', 'grant_upgrade');
      -- (03/11, décision de Nico) le même compteur que quotas_etat et spend_coins_and_republish (remontees_du_cycle).
      v_faits_mois := remontees_du_cycle(v_user, v_cycle);
    ELSE
      v_quota := NULL;
    END IF;
  END IF;

  v_fuseau := COALESCE(v_regl ->> 'fuseau', 'Europe/Paris');
  v_minuit := republish_minuit_local(v_fuseau);
  -- Trois compteurs du jour : CETTE plateforme, le COMPTE (l'enveloppe), et le
  -- total manuel + auto (affichage).
  SELECT count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto'),
         count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto' AND j.status = 'published'),
         count(*) FILTER (WHERE j.platform_fields ->> 'republish_source' = 'auto'),
         count(*)
  INTO v_crees_pf, v_abouties_pf, v_crees_compte, v_crees_total
  FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_minuit;

  IF v_pf = 'vinted' THEN
    v_ident := republish_boutique_connectee(v_user);
    v_boutique := v_ident ->> 'user_id';
    v_boutiques := republish_boutiques(v_user);
    v_multi := jsonb_array_length(v_boutiques) >= 2;
  ELSE
    v_ident := NULL; v_boutique := NULL; v_boutiques := '[]'::jsonb; v_multi := false;
  END IF;

  -- Pas de réglage (ou réglage sans droit) : l'app propose l'activation.
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object(
      'platform', v_pf,
      'actif', false,
      'configure', v_regl IS NOT NULL,
      'ouverte', v_ouverte,
      'annonces_en_ligne', v_en_ligne,
      'reglage', v_regl,
      'palier', v_palier,
      'autorise', v_palier IN ('pro', 'business'),
      'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
      'aujourdhui', jsonb_build_object(
        'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
        'crees_compte', v_crees_compte, 'crees_total', v_crees_total),
      'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
      'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
      'moteur', CASE WHEN v_pf = 'vinted' AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN 'legacy' ELSE 'aucun' END
    );
  END IF;

  v_fen := republish_planifiee_fenetre(v_regl, now());
  v_esp := republish_planifiee_espacement(v_user, v_pf);

  WITH cand AS MATERIALIZED (
    SELECT c.boutique, c.motif FROM republish_planifiee_candidats(v_user, v_regl, v_pf) c
  )
  SELECT (SELECT count(*) FROM cand WHERE motif IS NULL),
         (SELECT count(*) FROM cand WHERE motif IS NULL AND (boutique IS NULL OR boutique = v_boutique)),
         (SELECT COALESCE(jsonb_object_agg(x.m, x.n), '{}'::jsonb)
            FROM (SELECT motif AS m, count(*) AS n FROM cand WHERE motif IS NOT NULL GROUP BY motif) x),
         (SELECT COALESCE(jsonb_object_agg(COALESCE(x.b, ''), x.n), '{}'::jsonb)
            FROM (SELECT boutique AS b, count(*) AS n FROM cand WHERE motif IS NULL GROUP BY boutique) x)
  INTO v_elig_total, v_elig_boutique, v_exclus, v_par_boutique;

  -- « Ce dressing n'a pas été servi depuis X jours » : avec une ligne par
  -- boutique, la dernière fois qu'une boutique a été servie est lisible —
  -- max(debut) de SES créneaux. Avant la clé par boutique, ce chiffre
  -- n'existait pas : toutes les lignes portaient la première boutique vue.
  IF jsonb_array_length(v_boutiques) > 0 THEN
    SELECT COALESCE(jsonb_agg(b || jsonb_build_object(
             'vu_le', (SELECT max(r.debut) FROM republish_creneaux r
                        WHERE r.user_id = v_user AND r.platform = v_pf
                          AND r.boutique = b ->> 'user_id'),
             'eligibles', COALESCE((v_par_boutique ->> (b ->> 'user_id'))::integer, 0),
             'connectee', (b ->> 'user_id') IS NOT DISTINCT FROM v_boutique)
           ORDER BY o), '[]'::jsonb)
    INTO v_boutiques
    FROM jsonb_array_elements(v_boutiques) WITH ORDINALITY AS t(b, o);
  END IF;

  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer;
    v_jour_prochain := false;
  ELSIF (v_fen ->> 'prochain_debut') IS NOT NULL THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'prochain_fin')::timestamptz - (v_fen ->> 'prochain_debut')::timestamptz))::integer;
    v_jour_prochain := ((v_fen ->> 'prochain_debut')::timestamptz AT TIME ZONE v_fuseau)::date <> (now() AT TIME ZONE v_fuseau)::date;
  ELSE
    v_duree := 0; v_jour_prochain := true;
  END IF;
  -- (11/10, Louis — « D'ici 17h, ce créneau permet jusqu'à 0 republication »
  -- alors que le balayage en prévoyait d'autres) La capacité annoncée est CE
  -- QUE LE BALAYAGE FERA : créneau en cours dont la ligne suit le réglage →
  -- ses prévues restantes, bornées par le temps qui reste à son rythme ;
  -- sinon le calcul que le balayage fait à la création de la ligne (part
  -- égale entre les plateformes actives, espacement réel). L'ancienne
  -- « capacité partagée » retirait le temps réservé par les autres
  -- plateformes : un autre calcul que celui du balayage, donc un autre chiffre.
  v_source_capacite := 'creation';
  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    SELECT r.* INTO v_cr FROM republish_creneaux r
    WHERE r.user_id = v_user AND r.platform = v_pf
      AND r.debut = (v_fen ->> 'courant_debut')::timestamptz
      AND COALESCE(r.boutique, '') = COALESCE(v_boutique, '')
    LIMIT 1;
    IF v_cr.id IS NOT NULL AND v_cr.statut = 'en_cours'
       AND v_cr.fin = (v_fen ->> 'courant_fin')::timestamptz THEN
      -- (25/10) comme le balayage (6bis) : un essai SAUTÉ rend sa place tant que les sautés du
      -- créneau restent ≤ prévues — l'app annonce ce que le balayage fera.
      SELECT count(*) FILTER (WHERE NOT republish_essai_saute(j.status, j.platform_fields, j.error))
             + CASE WHEN count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error))
                         <= COALESCE(v_cr.prevues, 0)
                    THEN 0
                    ELSE count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error)) END
        INTO v_faits_cr FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_cr.id::text;
      v_debut_ryt := COALESCE(NULLIF(v_cr.sautes -> '_reglage_change' ->> 'depuis', '')::timestamptz, v_cr.debut);
      v_prev_ryt := COALESCE(v_cr.prevues, 1)
                    - CASE WHEN v_cr.sautes ? '_reglage_change'
                           THEN COALESCE((v_cr.sautes -> '_reglage_change' ->> 'faites_avant')::integer, 0) ELSE 0 END;
      v_intervalle := GREATEST(60, extract(epoch FROM (v_cr.fin - v_debut_ryt)) / GREATEST(1, v_prev_ryt));
      v_capacite := LEAST(GREATEST(0, COALESCE(v_cr.prevues, 0) - v_faits_cr),
                          GREATEST(0, ceil(GREATEST(0, v_duree) / v_intervalle))::integer);
      v_source_capacite := 'creneau_en_cours';
    END IF;
  END IF;
  IF v_source_capacite = 'creation' THEN
    v_capacite := republish_planifiee_capacite(
      GREATEST(60, GREATEST(0, v_duree) / GREATEST(1, republish_planifiee_actives_eligibles(v_user)))::integer,
      (v_esp ->> 'sec')::integer);
    IF COALESCE(v_duree, 0) <= 0 THEN v_capacite := 0; END IF;
  END IF;

  -- (24/10, décision de Nico) Plus de plafond du palier ni d'enveloppe de compte :
  -- seul le nombre par jour CHOISI pour cette plateforme borne, s'il y en a un
  -- (NULL = aucun : LEAST l'ignore plus bas).
  v_restants := CASE WHEN (v_regl ->> 'plafond_jour') IS NULL THEN NULL
                     WHEN v_jour_prochain THEN (v_regl ->> 'plafond_jour')::integer
                     ELSE GREATEST(0, (v_regl ->> 'plafond_jour')::integer - v_crees_pf) END;

  IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
    v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
    v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN (v_regl ->> 'plafond_jour')::integer
                        ELSE LEAST(GREATEST(1, v_plafond_b), (v_regl ->> 'plafond_jour')::integer) END;
    SELECT count(*) INTO v_faits_b
    FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_minuit
      AND i.vinted_account_id = v_boutique;
    v_restants_b := CASE WHEN v_plafond_b IS NULL THEN NULL
                         WHEN v_jour_prochain THEN v_plafond_b ELSE GREATEST(0, v_plafond_b - v_faits_b) END;
    v_restants := LEAST(v_restants, v_restants_b);
  END IF;

  v_attendu := LEAST(v_restants,
                     CASE WHEN v_multi AND v_boutique IS NOT NULL THEN v_elig_boutique ELSE v_elig_total END,
                     v_capacite);
  -- L'interrupteur de la plateforme : à 0, rien ne part.
  IF NOT v_ouverte THEN v_attendu := 0; END IF;
  v_borne := CASE
    WHEN NOT v_ouverte THEN 'plateforme_fermee'
    WHEN v_attendu = v_restants THEN 'plafond'
    WHEN v_attendu = v_capacite THEN 'creneau'
    ELSE 'eligibles' END;

  -- Une ligne par boutique : l'écran montre CELLE de la boutique connectée.
  -- Boutique inconnue → la plus récente, comme avant.
  SELECT to_jsonb(r) INTO v_courant FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut = 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  SELECT to_jsonb(r) INTO v_dernier FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut <> 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  IF v_courant IS NOT NULL THEN
    SELECT count(*) INTO v_faites_live FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.status = 'published'
      AND j.platform_fields ->> 'republish_creneau_id' = (v_courant ->> 'id');
    v_blocage := v_courant -> 'sautes' -> '_bloque_en_vol';
    IF v_blocage IS NOT NULL AND (v_blocage ? 'leve_le') THEN v_blocage := NULL; END IF;
    v_disjoncteur := v_courant -> 'sautes' -> '_disjoncteur';
  END IF;

  RETURN jsonb_build_object(
    'platform', v_pf,
    'actif', true,
    'configure', true,
    'ouverte', v_ouverte,
    'annonces_en_ligne', v_en_ligne,
    'reglage', v_regl,
    'palier', v_palier,
    'autorise', true,
    'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
    'fenetre', v_fen,
    'aujourdhui', jsonb_build_object(
      'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
      'crees_compte', v_crees_compte, 'crees_total', v_crees_total,
      'plafond_jour', (v_regl ->> 'plafond_jour')::integer, 'restants', v_restants,
      'plafond_boutique', v_plafond_b, 'crees_boutique', v_faits_b, 'restants_boutique', v_restants_b),
    'eligibles', jsonb_build_object('total', v_elig_total, 'boutique_connectee', v_elig_boutique,
                                    'par_boutique', v_par_boutique, 'exclus', v_exclus),
    'espacement', v_esp,
    'capacite', v_capacite, 'capacite_source', v_source_capacite, 'duree_sec', v_duree,
    'attendu', v_attendu, 'borne', v_borne,
    'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
    'creneau_courant', v_courant, 'dernier_creneau', v_dernier,
    'faites_live', COALESCE(v_faites_live, 0), 'blocage', v_blocage, 'disjoncteur', v_disjoncteur,
    'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
    'moteur', 'planifie'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user          uuid := auth.uid();
  v_price         integer;
  v_price_photo   integer;
  v_price_unit    integer;
  v_price_pub     integer;
  v_photos_billed boolean := true;
  v_wallet        coin_wallets%ROWTYPE;
  v_total         integer;
  v_from_inc      integer := 0;
  v_from_pur      integer := 0;
  v_photo_inc     integer;
  v_pub_inc       integer;
  v_pub_pur       integer;
  v_job_count     integer;
  v_tier          text;
  v_conflicts     jsonb;
  v_ext_seen      timestamptz;
  v_lang          text;
  v_res_id        uuid := NULL;
  v_ebay_api_seul boolean := false;
  v_en_pause      jsonb := NULL;
  v_conflits_relie jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF p_photo_option NOT IN ('original','ia_light','ia_advanced') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_photo_option');
  END IF;
  v_job_count := COALESCE(jsonb_array_length(p_jobs), 0);
  IF v_job_count < 1 OR v_job_count > 5 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_jobs');
  END IF;

  BEGIN
    SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_en_pause
    FROM jsonb_array_elements(p_jobs) AS j
    WHERE EXISTS (SELECT 1 FROM public.platform_health h WHERE h.platform = j->>'platform' AND h.paused = true);
  EXCEPTION WHEN OTHERS THEN
    v_en_pause := NULL;
  END;
  -- (25/10, décision de Nico : « Aucun job ne doit être créé. ») LEBONCOIN N'ACCEPTE QUE LES ADRESSES EN FRANCE :
  -- une publication Leboncoin d'un compte dont l'adresse de remise est hors de France n'entre JAMAIS en file, quelle
  -- que soit la version de l'app (Marta, 25/10 : 52 jobs créés après l'OTA 2.9.115 par une app restée sur l'ancien
  -- paquet). Même verdict que _shared/lbc-adresse-france.js (lbc_adresse_hors_france) ; même réponse qu'une plateforme
  -- en pause, que toutes les versions de l'app savent dire — rien n'est créé, rien n'est décompté.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_jobs) AS j WHERE j->>'platform' = 'leboncoin')
     AND public.lbc_adresse_hors_france(v_user) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'platform_paused', 'motif', 'lbc_hors_france', 'platforms', '["leboncoin"]'::jsonb,
      'messages', jsonb_build_object('leboncoin', jsonb_build_object('fr', 'Leboncoin n''accepte que les adresses en France. Ton adresse de remise est hors de France : FillSell ne publie donc pas sur Leboncoin pour ton compte. Rien n''a été publié, et tes autres plateformes continuent normalement.', 'en', 'Leboncoin only accepts addresses in France. Your pickup address is outside France, so FillSell doesn''t publish on Leboncoin for your account. Nothing was published, and your other platforms carry on as usual.'))
    );
  END IF;

  IF v_en_pause IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'platform_paused', 'platforms', v_en_pause,
      'messages', (SELECT COALESCE(jsonb_object_agg(h.platform, jsonb_build_object('fr', h.message_fr, 'en', h.message_en)), '{}'::jsonb)
                   FROM public.platform_health h WHERE h.paused = true AND v_en_pause ? h.platform)
    );
  END IF;

  SELECT NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_jobs) AS j WHERE j->>'platform' IS DISTINCT FROM 'ebay'
         )
         AND COALESCE(p.ebay_voie_api, false)
         AND a.user_id IS NOT NULL
         AND a.revoked_at IS NULL
         AND a.fulfillment_policy_id IS NOT NULL
         AND a.payment_policy_id IS NOT NULL
         AND a.return_policy_id IS NOT NULL
         AND (a.seller_state->>'bloque_par_etat_ebay') = 'false'
    INTO v_ebay_api_seul
  FROM profiles p
  LEFT JOIN ebay_accounts a ON a.user_id = p.id
  WHERE p.id = v_user;
  v_ebay_api_seul := COALESCE(v_ebay_api_seul, false);

  SELECT extension_last_seen_at, lang
    INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_jobs) AS j
    WHERE NULLIF(j->>'inventaire_id','') IS NULL
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_inventaire_id');
  END IF;

  SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_conflicts
  FROM jsonb_array_elements(p_jobs) AS j
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM cross_post_jobs c
      WHERE c.user_id = v_user
        AND c.inventaire_id = NULLIF(j->>'inventaire_id','')::bigint
        AND c.platform = j->>'platform'
        AND COALESCE(c.action, 'publish') <> 'delete'
        AND (
          c.status IN ('pending', 'processing', 'needs_user')
          OR (
            c.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = v_user
                AND d.inventaire_id = c.inventaire_id
                AND d.platform = c.platform
                AND d.action = 'delete'
                AND d.status = 'deleted'
                AND (
                  CASE
                    WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                     AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                    THEN annonce_id_de_job(d.platform_listing_id, d.listing_url) = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                    ELSE d.created_at > COALESCE(c.published_at, c.created_at)
                  END
                )
            )
          )
        )
    );
  IF v_conflicts IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', v_conflicts
    );
  END IF;

  -- (20/10, Louis) COMPTES RELIÉS SUR UNE BOUTIQUE PARTAGÉE : la fiche jumelle (fiches_liees_comptes)
  -- est déjà en ligne — ou en file — sur cette plateforme, dans la MÊME boutique (un relevé l'a prouvé :
  -- jumelle_occupe_plateformes). Republier ici ferait le doublon (Leboncoin le refuse, ou le laisse passer) :
  -- refus already_published, plateforme par plateforme, AVANT tout débit. 'compte_relie' nomme celles-là.
  -- Sans fiche jumelle (tous les autres comptes) : rien de lu au-delà de l'index fiches_liees_comptes.
  SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_conflits_relie
  FROM jsonb_array_elements(p_jobs) AS j
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL
    AND EXISTS (SELECT 1 FROM fiches_liees_comptes f
                 WHERE f.fiche_a = NULLIF(j->>'inventaire_id','')::bigint OR f.fiche_b = NULLIF(j->>'inventaire_id','')::bigint)
    AND EXISTS (SELECT 1 FROM jumelle_occupe_plateformes(v_user, NULLIF(j->>'inventaire_id','')::bigint) o
                 WHERE o.platform = j->>'platform');
  IF v_conflits_relie IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', v_conflits_relie, 'compte_relie', v_conflits_relie
    );
  END IF;

  -- (09/10 soir, Louis) La garde « fiche jumelle en ligne » (27/09, motif
  -- jumeau_en_ligne) est RETIRÉE : une annonce rattachée à une AUTRE fiche
  -- n'est jamais un « déjà en ligne » pour celle-ci. Seule reste la règle
  -- « une fiche, une annonce en ligne par plateforme » (already_published
  -- ci-dessus, inchangée). Migration 20261009233000.

  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;
  SELECT value INTO v_price_unit  FROM coin_config WHERE key = 'price_per_platform';
  IF v_price_photo IS NULL OR v_price_unit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF p_photo_option <> 'original' AND v_price_photo > 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_jobs) AS j
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(j->'photos') = 'array' THEN j->'photos' ELSE '[]'::jsonb END
      ) AS ph
      WHERE (jsonb_typeof(ph) = 'object' AND (
               COALESCE(ph->>'enhanced', '')   <> ''
               OR COALESCE(ph->>'bg_removed', '') <> ''
               OR COALESCE(ph->>'type', '') LIKE 'enhanced%'
               OR COALESCE(ph->>'url', '')  LIKE '%/enhanced/%'))
         OR (jsonb_typeof(ph) = 'string' AND (ph #>> '{}') LIKE '%/enhanced/%')
    ) THEN
      v_price_photo   := 0;
      v_photos_billed := false;
    END IF;
  END IF;

  v_price_pub := v_price_unit * v_job_count;
  v_price     := v_price_photo + v_price_pub;

  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;

    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      SELECT CASE
               WHEN p.is_business = true THEN 'business'
        WHEN p.is_pro = true THEN 'pro'
               WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
               ELSE 'free'
             END INTO v_tier
      FROM profiles p WHERE p.id = v_user;
      PERFORM upgrade_monthly_grant(v_user, COALESCE(v_tier, 'free'), null, 'lazy');
      SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    END IF;

    v_total := v_wallet.included_balance + v_wallet.purchased_balance;
    IF v_total < v_price THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'insufficient_coins',
        'price', v_price, 'balance', v_total,
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed
      );
    END IF;

    v_photo_inc := LEAST(v_wallet.included_balance, v_price_photo);
    v_pub_inc   := LEAST(v_wallet.included_balance - v_photo_inc, v_price_pub);
    v_pub_pur   := v_price_pub - v_pub_inc;
    v_from_inc  := v_photo_inc + v_pub_inc;
    v_from_pur  := v_price - v_from_inc;

    UPDATE coin_wallets SET
      included_balance  = included_balance  - v_from_inc,
      purchased_balance = purchased_balance - v_from_pur,
      reserved_balance  = reserved_balance  + v_price_pub,
      updated_at        = now()
    WHERE user_id = v_user;

    INSERT INTO coin_reservations (user_id, amount, unit_price, from_included, from_purchased, job_count, photo_option)
    VALUES (v_user, v_price_pub, v_price_unit, v_pub_inc, v_pub_pur, v_job_count, p_photo_option)
    RETURNING id INTO v_res_id;
  END IF;

  BEGIN
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, photo_option,
                                 title, description, price, photos, platform_fields, reservation_id)
    SELECT
      v_user,
      NULLIF(j->>'inventaire_id','')::bigint,
      j->>'platform',
      'pending',
      p_photo_option,
      j->>'title',
      j->>'description',
      NULLIF(j->>'price','')::numeric,
      j->'photos',
      j->'platform_fields',
      v_res_id
    FROM jsonb_array_elements(p_jobs) AS j;
  EXCEPTION WHEN unique_violation THEN
    IF v_price > 0 THEN
      UPDATE coin_wallets SET
        included_balance  = included_balance  + v_from_inc,
        purchased_balance = purchased_balance + v_from_pur,
        reserved_balance  = reserved_balance  - v_price_pub,
        updated_at        = now()
      WHERE user_id = v_user;
      DELETE FROM coin_reservations WHERE id = v_res_id;
    END IF;
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', (SELECT jsonb_agg(DISTINCT j->>'platform') FROM jsonb_array_elements(p_jobs) AS j)
    );
  END;

  UPDATE inventaire i
  SET photos = sub.photos
  FROM (
    SELECT DISTINCT ON (inv_id) inv_id, photos
    FROM (
      SELECT NULLIF(j->>'inventaire_id','')::bigint AS inv_id, j->'photos' AS photos,
             -- Un job PLAFONNÉ par sa plateforme (Leboncoin « Divers > Autres » :
             -- 3 photos gratuites, regles.js) ne porte qu'un extrait : il ne
             -- réécrit JAMAIS la fiche (2026-09-27).
             COALESCE(j->'platform_fields'->'lbcPhotosCapped' = 'true'::jsonb, false) AS plafonne
      FROM jsonb_array_elements(p_jobs) AS j
    ) x
    WHERE inv_id IS NOT NULL
      AND jsonb_typeof(photos) = 'array'
      AND jsonb_array_length(photos) > 0
      AND NOT plafonne
    -- Sans ORDER BY, DISTINCT ON gardait le PREMIER job venu : quand c'était
    -- celui de Leboncoin plafonné, la fiche perdait ses photos. La liste la
    -- plus longue est la liste entière.
    ORDER BY inv_id, jsonb_array_length(photos) DESC
  ) sub
  WHERE i.id = sub.inv_id AND i.user_id = v_user;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (
      v_user, -v_price,
      v_wallet.included_balance - v_from_inc,
      v_wallet.purchased_balance - v_from_pur,
      'spend_publish',
      jsonb_build_object(
        'photo_option', p_photo_option, 'platforms', v_job_count,
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed,
        'reservation_id', v_res_id
      )
    );
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object(
    'coins', v_price, 'photo_option', p_photo_option, 'platforms', v_job_count
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'price_photos', v_price_photo, 'price_publication', v_price_pub,
    'photos_billed', v_photos_billed,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END,
    'reserved_after',  CASE WHEN v_price > 0 THEN v_wallet.reserved_balance + v_price_pub ELSE NULL END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(p_inventaire_id bigint, p_vinted_item_id text, p_source text DEFAULT 'manuel'::text, p_prix_republication numeric DEFAULT NULL::numeric, p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_platform text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer := 0;
  v_from_pur integer := 0;
  v_tier     text;
  v_prof     record;
  v_plafond  integer;
  v_faits    integer;
  v_qfree    jsonb;
  v_cycle    timestamptz;
  v_titre    text;
  v_prix     numeric;
  v_job_id   uuid;
  -- Voie planifiée (12/09)
  v_regl       jsonb;
  v_minuit     timestamptz;
  v_boutique   text;
  v_plafond_b  integer;
  v_faits_b    integer;
  -- Multiplateforme (17/09)
  v_multi      integer;
  v_min        integer;
  v_code       integer;
  v_statut     text;
  v_src        cross_post_jobs%ROWTYPE;
  v_pf_src     jsonb;
  v_photos_n   integer;
  -- 19/09 : les photos RÉELLEMENT redéposées (fiche article en repli du job
  -- source — cf. le bloc commenté plus bas).
  v_photos     jsonb;
  -- Multiplateforme automatique (18/09) : l'enveloppe de compte
  -- (17/10, Amiral 317adae1) le lien EXACT de l'annonce et son identifiant
  v_lid      text;
  v_url      text;
  v_url_ins  text;
  v_fiches_n integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  -- (02/10, sortie d'Opla) À partir de la bascule (interrupteur coin_config
  -- `opla_sortie_le`, secondes epoch ; 0 = sortie désactivée ; absente = le
  -- 10/10/2026 à 00:00 Paris, la même règle que _shared/opla-sortie.js), plus
  -- aucune republication Opla, pour personne : refusée ICI, avant toute
  -- écriture — aucun job, rien de compté. Avant la bascule : comme avant.
  IF v_platform = 'opla' AND COALESCE((SELECT value FROM coin_config WHERE key = 'opla_sortie_le'), 1791583200) > 0
     AND now() >= to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'opla_sortie_le'), 1791583200)) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'opla_arrete', 'platform', v_platform,
      'message', 'Opla n''est plus disponible dans FillSell.');
  END IF;
  IF v_platform NOT IN ('vinted', 'leboncoin', 'beebs', 'opla', 'depop') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_platform', 'platform', v_platform);
  END IF;
  IF v_platform = 'vinted' AND (v_item IS NULL OR v_item !~ '^\d+$') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item');
  END IF;
  IF p_source NOT IN ('manuel', 'auto') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_source');
  END IF;
  -- ── L'AUTO S'OUVRE AUX QUATRE PLATEFORMES (18/09) ─────────────────────────
  -- Ce qui la gardait Vinted-only n'était pas une limite technique : c'était
  -- « conçu, pas livré » (docs § 7 du 17/09). Le module planifié sait désormais
  -- nommer sa plateforme ; la porte devient donc l'interrupteur de CETTE
  -- plateforme, fail-closed (clé absente = fermée), et non plus le nom 'vinted'.
  IF p_source = 'auto' AND NOT republish_planifiee_pf_ouverte(v_platform) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plateforme_fermee', 'platform', v_platform);
  END IF;
  -- ── PAS D'AUTO PENDANT LA PAUSE ANTI-ROBOT VINTED (2026-09-27, ltouze) ────
  -- Vinted a mis le compte en vérification anti-robot (marqueur
  -- attente_antirobot_compte posé par get-pending-jobs) : une republication
  -- AUTOMATIQUE ou planifiée ne s'ajoute plus à la file tant que la pause
  -- tient — le créneau suivant la recréera. Une republication demandée par la
  -- personne ('manuel') n'est jamais refusée ici : elle attend son tour, et
  -- repart au rythme habituel à la levée. Rien n'est décompté sur ce refus.
  IF p_source = 'auto' AND v_platform = 'vinted' AND compte_en_pause_antirobot(v_user) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'pause_antirobot', 'platform', v_platform);
  END IF;
  IF p_prix_republication IS NOT NULL AND p_prix_republication < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_price');
  END IF;

  SELECT is_premium, is_pro, is_business, is_comped, extension_last_seen_at, extension_version,
         lang, platform_settings
  INTO v_prof FROM profiles WHERE id = v_user;

  IF v_prof.extension_last_seen_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. Nothing was used from your plan.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Rien n''a été décompté.'
      END);
  END IF;
  IF v_prof.extension_last_seen_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_stale',
      'derniere_activite', v_prof.extension_last_seen_at,
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Your FillSell extension hasn''t been seen for over a week. Open Chrome on your computer to wake it up, then try again. Nothing was used from your plan.'
        ELSE 'Ton extension FillSell ne s''est pas manifestée depuis plus d''une semaine. Ouvre Chrome sur ton ordinateur pour la réveiller, puis relance. Rien n''a été décompté.'
      END
    );
  END IF;

  IF version_cle(v_prof.extension_version) IS NULL
     OR version_cle(v_prof.extension_version) < version_cle('0.5.0') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  END IF;

  -- ── MULTIPLATEFORME (17/09) : porte, borne de build, source ────────────────
  IF v_platform <> 'vinted' THEN
    SELECT value INTO v_multi FROM coin_config WHERE key = 'republication_multi_ouverte';
    IF COALESCE(v_multi, 0) <> 1 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republication_multi_fermee', 'platform', v_platform);
    END IF;
    SELECT value INTO v_min FROM coin_config WHERE key = 'republication_multi_extension_min';
    v_min := COALESCE(v_min, 642);
    -- Même encodage que lbc_pro_extension_min / opla_extension_min :
    -- major×10000 + minor×100 + patch ; version illisible = 0.
    v_code := CASE
      WHEN v_prof.extension_version ~ '^\d+\.\d+\.\d+' THEN
        (split_part(v_prof.extension_version, '.', 1))::integer * 10000
        + (split_part(v_prof.extension_version, '.', 2))::integer * 100
        + (regexp_replace(split_part(v_prof.extension_version, '.', 3), '\D.*$', ''))::integer
      ELSE 0 END;
    IF v_min > 0 AND v_code < v_min THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                                'version', v_prof.extension_version, 'minimum', v_min, 'platform', v_platform);
    END IF;

    SELECT i.statut INTO v_statut FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
    IF v_statut IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item', 'platform', v_platform);
    END IF;
    IF v_statut = 'vendu' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_vendu', 'platform', v_platform);
    END IF;

    -- La source : le dernier dépôt FillSell EN LIGNE sur cette plateforme.
    SELECT j.* INTO v_src FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.inventaire_id = p_inventaire_id
      AND j.platform = v_platform AND j.action IN ('publish', 'republish')
      AND j.status = 'published' AND NULLIF(trim(j.listing_url), '') IS NOT NULL
    ORDER BY COALESCE(j.published_at, j.created_at) DESC
    LIMIT 1;
    IF v_src.id IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'annonce_introuvable', 'platform', v_platform);
    END IF;

    -- ── (17/10, Amiral 317adae1) UN JOB DE REPUBLICATION NAÎT AVEC LE LIEN EXACT DE
    --    SON ANNONCE ET UNE COPIE QUI DÉSIGNE LA MÊME — sinon refus, rien de décompté.
    -- Cas fondateur : la republication Leboncoin du 15/10 est née d'un dépôt dont le
    -- lien désignait une AUTRE annonce (retrouvé par le titre le 24/09 : celle de la
    -- fiche « Bleu et Blanc ») et le numéro la sienne ; elle a copié ce couple dans
    -- son lien ET dans sa copie, a été retenue « annonce partagée », puis a perdu sa
    -- copie. Le lien et le numéro sont ceux que la base tient pour exacts — la
    -- doctrine du déclencheur cross_post_jobs_lien_suit_identifiant (quand le lien et
    -- le numéro se contredisent, le lien suit le numéro), calculée ICI pour que la
    -- copie dise la même annonce que le job : le déclencheur ne réécrit que la
    -- colonne, jamais la copie.
    v_lid := COALESCE(NULLIF(btrim(v_src.platform_listing_id), ''), annonce_id_job(v_platform, v_src.listing_url));
    v_url := NULLIF(btrim(v_src.listing_url), '');
    IF NULLIF(btrim(v_src.platform_listing_id), '') IS NOT NULL AND annonce_id_job(v_platform, v_url) IS NOT NULL
       AND annonce_id_job(v_platform, v_url) <> v_lid THEN
      v_url := NULL;
      SELECT a.url INTO v_url
        FROM annonces_plateforme a
       WHERE a.user_id = v_user AND a.platform = v_platform AND a.listing_id = v_lid
         AND NULLIF(btrim(a.url), '') IS NOT NULL
       ORDER BY a.vu_le DESC NULLS LAST
       LIMIT 1;
    END IF;
    IF v_url IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'lien_annonce_incertain', 'cause', 'lien_inconnu',
        'platform', v_platform, 'annonce', v_lid,
        'message', 'Republication pas lancée : FillSell ne connaît pas le lien exact de ton annonce ' || initcap(v_platform)
          || '. Rien n''a été décompté, ton annonce est intacte. « Synchroniser » relit tes annonces.');
    END IF;
    -- Une annonce n'appartient jamais à deux fiches (15/10 soir) : désignée par un
    -- job d'une AUTRE fiche (fusions comprises), la cascade « annonce partagée »
    -- (rapprochement-ia) tranche d'abord ; la republication part ensuite.
    IF v_lid IS NOT NULL THEN
      SELECT count(DISTINCT COALESCE(i.fusionne_dans, i.id)) INTO v_fiches_n
        FROM cross_post_jobs o
        JOIN inventaire i ON i.id = o.inventaire_id
       WHERE o.user_id = v_user AND o.platform = v_platform AND o.inventaire_id IS NOT NULL
         AND o.status IN ('pending', 'processing', 'published', 'needs_user')
         AND (listing_designe(v_lid, o.listing_url, o.platform_listing_id)
              OR annonce_id_job(o.platform, o.listing_url) = v_lid);
      IF COALESCE(v_fiches_n, 0) > 1 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'lien_annonce_incertain', 'cause', 'annonce_partagee',
          'platform', v_platform, 'annonce', v_lid,
          'message', 'Republication pas lancée : cette annonce ' || initcap(v_platform) || ' est rattachée à deux articles. '
            || 'FillSell vérifie lequel la porte, puis la republication pourra partir. Rien n''a été décompté, ton annonce est intacte.');
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status IN ('pending', 'processing', 'needs_user')
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours', 'platform', v_platform);
    END IF;
    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status = 'published'
        AND j.published_at > now() - interval '24 hours'
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h', 'platform', v_platform);
    END IF;

    -- ── LES PHOTOS VIENNENT DE LA FICHE QUAND LE JOB SOURCE N'EN A PAS ──────
    -- (19/09/2026 — bug report louis@ttfamily.fr : « quelle que soit la
    -- plateforme : Sans photo, la republication ne peut pas aboutir ».)
    -- Cette branche comptait les photos du JOB SOURCE. Or un article IMPORTÉ
    -- par un relevé a bien son annonce en ligne et son listing_url — donc un
    -- job source trouvable — mais ce job est écrit par le relevé avec
    -- photos = NULL : le relevé recense des annonces, il ne rapatrie pas de
    -- photos dans le job. La fiche article, elle, EN A. Résultat : refus
    -- « Sans photo » sur un article qui en affiche cinq, et rien de
    -- republiable pour qui est arrivé par un relevé.
    -- La branche Vinted de cette même fonction lisait déjà inventaire.photos ;
    -- c'est la branche multiplateforme du 17/09 qui a divergé. On les aligne.
    -- Mesuré avant correctif : 210 annonces sur 13 comptes ont un job source
    -- sans photo, dont 209 avec des photos sur la fiche.
    --
    -- ⚠️ Le repli sert AUSSI à l'insert plus bas : garder v_src.photos là-bas
    -- aurait produit un job de republication à zéro photo, refusé par le
    -- handler au lieu de l'être ici — un échec déplacé, pas réparé.
    -- inventaire.photos coexiste en deux formes (chaînes nues du relevé et de
    -- la sync, objets {type,url} de nos pipelines) : on normalise en objets,
    -- ordre PRÉSERVÉ (la 1re photo reste la principale), entrées sans URL
    -- écartées.
    v_photos := CASE WHEN jsonb_typeof(v_src.photos) = 'array' AND jsonb_array_length(v_src.photos) > 0
                     THEN v_src.photos ELSE NULL END;
    IF v_photos IS NULL THEN
      SELECT COALESCE(jsonb_agg(
               CASE WHEN jsonb_typeof(a.val) = 'string'
                    THEN jsonb_build_object('url', a.val #>> '{}',
                           'type', CASE WHEN a.ord = 1 THEN 'original' ELSE 'photo_' || (a.ord - 1) END)
                    ELSE a.val END
               ORDER BY a.ord), '[]'::jsonb) INTO v_photos
      FROM inventaire i,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END)
              WITH ORDINALITY AS a(val, ord)
      WHERE i.id = p_inventaire_id AND i.user_id = v_user
        AND COALESCE(NULLIF(trim(CASE WHEN jsonb_typeof(a.val) = 'string'
                                      THEN a.val #>> '{}' ELSE a.val->>'url' END), ''), '') <> '';
    END IF;
    v_photos_n := CASE WHEN jsonb_typeof(v_photos) = 'array' THEN jsonb_array_length(v_photos) ELSE 0 END;
    IF v_photos_n = 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo', 'platform', v_platform);
    END IF;
  END IF;

  v_tier := palier_de(v_user);

  IF p_source = 'auto' THEN
    -- (1) L'auto RESTE RÉSERVÉE AU PRO (correction Nico 12/09 15h30 : l'ouverture
    -- aux abonnés de la 4/5 était une erreur d'orientation). Gate IDENTIQUE à
    -- celui d'avant la 4/5 ; code de refus inchangé.
    -- (05/10) « au moins Pro » par le palier unique (palier_au_moins) : un
    -- Business offert sans is_pro (ornellaracano) était refusé à chaque passage.
    IF NOT palier_au_moins(v_user, 'pro') THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'auto_reserve_pro');
    END IF;

    v_regl := republish_planifiee_reglage(v_user, v_platform);
    IF v_regl IS NOT NULL AND COALESCE((v_regl ->> 'actif')::boolean, false) THEN
      -- (2) VOIE PLANIFIÉE, PAR PLATEFORME. (24/10, décision de Nico) PLUS DE
      -- PLAFOND PAR JOUR NI D'ENVELOPPE DE COMPTE, pour aucun palier. Restent
      -- les nombres CHOISIS par la personne, s'il y en a (NULL = aucun) :
      --   a. le nombre par jour de CETTE plateforme, compté sur le jour LOCAL
      --      de SON fuseau ;
      --   b. le nombre par jour d'une boutique, sur Vinted.
      v_plafond := (v_regl ->> 'plafond_jour')::integer;
      v_minuit  := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));
      SELECT count(*) INTO v_faits
      FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish' AND platform = v_platform
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= v_minuit;
      IF v_plafond IS NOT NULL AND v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint',
                                  'plafond', v_plafond, 'platform', v_platform);
      END IF;

      IF v_platform = 'vinted' THEN
        SELECT NULLIF(trim(i.vinted_account_id), '') INTO v_boutique
        FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
        IF v_boutique IS NOT NULL THEN
          -- Le nombre de la boutique, sinon celui de la plateforme ; NULL = aucun.
          v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
          v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN v_plafond ELSE LEAST(GREATEST(1, v_plafond_b), v_plafond) END;
          SELECT count(*) INTO v_faits_b
          FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
          WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
            AND j.platform_fields->>'republish_source' = 'auto'
            AND j.created_at >= v_minuit
            AND i.vinted_account_id = v_boutique;
          IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_boutique_atteint',
                                      'plafond', v_plafond_b, 'boutique', v_boutique);
          END IF;
        END IF;
      END IF;
    ELSIF v_platform = 'vinted' THEN
      -- (3) VOIE HISTORIQUE, VINTED SEUL : l'ancien moteur republish_auto n'a
      -- jamais existé ailleurs. Le nombre par jour de son réglage
      -- (republish_auto.plafond_jour, 10 par défaut) ; (24/10, décision de Nico)
      -- plus de borne de 50 par jour.
      v_plafond := GREATEST(1, COALESCE(
        NULLIF(v_prof.platform_settings->'vinted'->'republish_auto'->>'plafond_jour', '')::integer, 10));
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= date_trunc('day', now());
      IF v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
      END IF;
    ELSE
      -- Auto demandée sur une plateforme dont le module n'est pas actif. Il n'y
      -- a pas de voie historique hors Vinted, et on n'en invente pas une : rien
      -- ne part, rien n'est débité.
      RETURN jsonb_build_object('allowed', false, 'reason', 'module_inactif', 'platform', v_platform);
    END IF;
  END IF;

  -- ── Bascule 02/09 : plafonds de republication par palier ─────────────────
  -- (toutes plateformes confondues : une republication est une republication)
  IF v_tier = 'free' THEN
    -- (05/10, décision Nico) 50 PAR MOIS (quota_republication_free), même
    -- cycle que quota_annonces_free. Le code de refus ne change pas : l'app
    -- ouvre la même modale ; il dit en plus la date de remise à zéro.
    v_qfree := quota_republication_free_etat(v_user);
    IF (v_qfree ->> 'plafond') IS NOT NULL AND (v_qfree ->> 'restantes')::integer <= 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_free',
                                'mode', 'mensuel',
                                'plafond', (v_qfree ->> 'plafond')::integer,
                                'faites', (v_qfree ->> 'faites')::integer, 'restantes', 0,
                                'remise_le', v_qfree -> 'remise_le');
    END IF;
  ELSIF v_tier IN ('premium', 'pro') THEN
    SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    IF v_plafond IS NOT NULL AND v_plafond > 0 THEN
      SELECT COALESCE(max(created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger WHERE user_id = v_user AND kind IN ('grant_monthly','grant_upgrade');
      -- (03/11, décision de Nico) faites + en cours, jamais les annulées jamais publiées (remontees_du_cycle).
      v_faits := remontees_du_cycle(v_user, v_cycle);
      IF v_faits >= v_plafond THEN
        IF p_source = 'auto' THEN
          RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
        END IF;
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',
                                  'plafond', v_plafond, 'faites', v_faits);
      END IF;
    END IF;
  END IF;

  IF v_platform = 'vinted' THEN
    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform_fields->>'vinted_item_id' = v_item
        AND j.status IN ('pending', 'processing', 'needs_user')
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours');
    END IF;

    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform_fields->>'vinted_item_id' = v_item
        AND j.status = 'published'
        AND j.published_at > now() - interval '24 hours'
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM inventaire i
      WHERE i.id = p_inventaire_id AND i.user_id = v_user
        AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo');
    END IF;
  END IF;

  SELECT titre INTO v_titre FROM inventaire
  WHERE id = p_inventaire_id AND user_id = v_user;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      PERFORM upgrade_monthly_grant(v_user, v_tier, null, 'lazy');
      SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    END IF;
    IF v_wallet.included_balance + v_wallet.purchased_balance < v_price THEN
      -- `derniere_erreur` vit dans {vinted,republish_auto} : c'est le reglage de
      -- l'ANCIEN moteur Vinted, lu par les extensions 0.6.x. Une auto refusee
      -- sur Leboncoin n'a rien a y ecrire (18/09).
      IF p_source = 'auto' AND v_platform = 'vinted' THEN
        UPDATE profiles SET platform_settings = jsonb_set(
          COALESCE(platform_settings, '{}'::jsonb),
          '{vinted,republish_auto}',
          COALESCE(platform_settings #> '{vinted,republish_auto}', '{}'::jsonb)
            || jsonb_build_object(
                 'derniere_erreur', 'pepites_insuffisantes',
                 'derniere_erreur_le', now()::text),
          true)
        WHERE id = v_user;
      END IF;
      RETURN jsonb_build_object('allowed', false, 'reason', 'insufficient_coins',
        'price', v_price, 'balance', v_wallet.included_balance + v_wallet.purchased_balance);
    END IF;
    v_from_inc := LEAST(v_wallet.included_balance, v_price);
    v_from_pur := v_price - v_from_inc;
    UPDATE coin_wallets SET
      included_balance  = included_balance  - v_from_inc,
      purchased_balance = purchased_balance - v_from_pur,
      updated_at        = now()
    WHERE user_id = v_user;
  END IF;

  IF p_source = 'auto' AND v_platform = 'vinted'
     AND v_prof.platform_settings #> '{vinted,republish_auto}' ? 'derniere_erreur' THEN
    UPDATE profiles SET platform_settings = jsonb_set(
      platform_settings,
      '{vinted,republish_auto}',
      (platform_settings #> '{vinted,republish_auto}') - 'derniere_erreur' - 'derniere_erreur_le')
    WHERE id = v_user;
  END IF;

  v_prix := p_prix_republication;

  IF v_platform = 'vinted' THEN
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                 title, price, listing_url, platform_fields)
    VALUES (
      v_user, p_inventaire_id, 'vinted', 'republish', 'pending', 'original',
      v_titre, v_prix,
      'https://www.vinted.fr/items/' || v_item,
      jsonb_build_object(
        'republish_step', 'a_capturer',
        'vinted_item_id', v_item,
        'pepites_debitees', v_price,
        'republish_source', p_source
      )
      || CASE WHEN v_prix IS NOT NULL
              THEN jsonb_build_object('prix_republication', v_prix)
              ELSE '{}'::jsonb END
    ) RETURNING id INTO v_job_id;
  ELSE
    -- Copie du job source, clés transitoires retirées : tout ce qu'il faut pour
    -- redéposer, rien de ce qui racontait la vie du dépôt d'origine.
    v_pf_src := COALESCE(v_src.platform_fields, '{}'::jsonb)
      - ARRAY['needsUserField', 'needsUserFields', 'needsUserResolved', 'needsUserAttempts', 'needsUserBoucle',
              'boucle_needs_user', 'needs_user_tick_le', 'needs_user_source', 'processing_since', 'next_action_after',
              'stale_recoveries', 'attente_session', 'blocage_antirobot', 'porte_pro_lbc', 'erreurs_archivees',
              'work_window_state', 'last_diagnostic', 'lbc_depot', 'lbc_depot_non_finalise', 'depot_non_confirme_requalifie',
              'verifier_doublon_avant_publication', 'unavailable_since', 'unavailable_pending_since', 'sale_signal',
              'detected_price', 'removed_by_user', 'republished_pending', 'delete_trace', 'delete_confirmed_by',
              'delete_dry_run_trace', 'listing_url_abandon', 'retrait_attend_lien', 'removal_url_missing',
              'republish_step', 'republish_source', 'republish_snapshot', 'republish_platform', 'republish_source_job_id',
              'republish_recreation', 'recreated_at', 'deleted_at', 'deleted_at_client', 'deleted_at_serveur',
              'horloge_client_ecart_s', 'suppression_verdict', 'old_listing_url', 'old_platform_listing_id',
              'recreation_retries', 'pepites_debitees', 'pepite_remboursee', 'prix_republication', 'orphan_alerted_at',
              'deleted_hang_count', 'introuvable_indetermine', 'attente_boutique', 'republish_creneau_id',
              'republish_sweep_at', 'republish_moteur', 'republish_planifie', 'republish_prevol', 'republish_etat_reel'];
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                 title, description, price, photos, listing_url, platform_listing_id, platform_fields)
    VALUES (
      v_user, p_inventaire_id, v_platform, 'republish', 'pending', COALESCE(v_src.photo_option, 'original'),
      COALESCE(v_src.title, v_titre), v_src.description, COALESCE(v_prix, v_src.price), v_photos,
      v_url, v_src.platform_listing_id,
      v_pf_src || jsonb_build_object(
        'republish_step', 'a_capturer',
        'republish_source', p_source,
        'republish_platform', v_platform,
        'republish_source_job_id', v_src.id,
        'pepites_debitees', v_price,
        'republish_snapshot', jsonb_build_object(
          'version', 2,
          'plateforme', v_platform,
          'source_job_id', v_src.id,
          'titre', COALESCE(v_src.title, v_titre),
          'prix', COALESCE(v_prix, v_src.price),
          'listing_url', v_url,
          'platform_listing_id', v_src.platform_listing_id,
          'photos', v_photos_n,
          'captured_at', now())
      )
      || CASE WHEN v_prix IS NOT NULL
              THEN jsonb_build_object('prix_republication', v_prix)
              ELSE '{}'::jsonb END
    ) RETURNING id, listing_url INTO v_job_id, v_url_ins;
    -- Filet (17/10) : la ligne née porte le lien de sa copie — aucun déclencheur ne
    -- l'a changé : jamais un job dont le lien et la copie désignent deux annonces.
    IF v_url_ins IS DISTINCT FROM v_url THEN
      RAISE EXCEPTION 'lien_annonce_incertain : republication % née avec le lien % au lieu de %', v_job_id, v_url_ins, v_url;
    END IF;
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (v_user, -v_price,
            v_wallet.included_balance - v_from_inc,
            v_wallet.purchased_balance - v_from_pur,
            'spend_republish',
            jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id, 'platform', v_platform));
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object(
    'coins', v_price, 'vinted_item_id', v_item, 'source', p_source,
    'plan', v_tier, 'platform', v_platform
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id, 'platform', v_platform,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spend_coins_for_generate(p_user_id uuid, p_inventaire_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_tier      text;
  v_quota     integer;
  v_cycle     timestamptz;
  v_consommes integer;
  v_regen     boolean := false;
BEGIN

  -- (20/10, sécurité) Appelée sous une session (authenticated, ou tout rôle porté
  -- par un jeton autre que service_role) : l'utilisateur et la fiche doivent être
  -- ceux de auth.uid(). service_role (fonctions edge) et les appels sans jeton
  -- (cron, SQL d'administration) : inchangés.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'utilisateur non autorisé' USING ERRCODE = '42501';
    END IF;
    IF p_inventaire_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'fiche non autorisée' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- QUOTA D'ANNONCES (bascule 02/09) — AVANT tout le reste. Régénération du
  -- même article sous 24 h : passe sans compter.
  IF p_inventaire_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM usage_logs u
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.metadata->>'inventaire_id' = p_inventaire_id::text
        AND u.created_at >= now() - interval '24 hours'
    ) INTO v_regen;
  END IF;

  IF NOT v_regen THEN
    -- (11/10) Le réglage du compte prime sur le quota du palier.
    v_quota := quota_annonces_compte(p_user_id, v_tier);
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      v_cycle := debut_cycle_quotas(p_user_id);
      v_consommes := quota_annonces_consommees(p_user_id, v_cycle);
      IF v_consommes >= v_quota THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                  'plafond', v_quota, 'consommes', v_consommes);
      END IF;
    END IF;
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_generate';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF v_price = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'price', 0, 'regen', v_regen);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    PERFORM upgrade_monthly_grant(p_user_id, v_tier, null, 'lazy');
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_total := v_wallet.included_balance + v_wallet.purchased_balance;
  IF v_total < v_price THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_total
    );
  END IF;

  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;

  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_generate',
    NULL
  );

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spend_coins_for_lens(p_user_id uuid, p_unifie boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_tier      text;
  v_quota     integer;
  v_consommes integer;
BEGIN

  -- (20/10, sécurité) Appelée sous une session (authenticated, ou tout rôle porté
  -- par un jeton autre que service_role) : l'utilisateur doivent être
  -- ceux de auth.uid(). service_role (fonctions edge) et les appels sans jeton
  -- (cron, SQL d'administration) : inchangés.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'utilisateur non autorisé' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- ── COMPTEUR FUSIONNÉ (02/09 soir) — avant tout appel IA ─────────────────
  -- (11/10) Le réglage du compte prime sur le quota du palier.
  v_quota := quota_annonces_compte(p_user_id, v_tier);
  IF v_quota IS NOT NULL AND v_quota > 0 THEN
    v_consommes := quota_annonces_consommees(p_user_id, debut_cycle_quotas(p_user_id));
    IF v_consommes >= v_quota THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                'plafond', v_quota, 'consommes', v_consommes);
    END IF;
  END IF;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  -- Prix nul : ni wallet ni ledger — la ligne usage_logs 'lens' reste posée.
  -- unifie:true = ce scan sera porté par sa ligne generate_listing.
  IF v_price = 0 THEN
    INSERT INTO usage_logs (user_id, feature, metadata)
    VALUES (p_user_id, 'lens',
      jsonb_build_object('coins', 0, 'model', 'per_scan')
      || CASE WHEN p_unifie THEN jsonb_build_object('unifie', true) ELSE '{}'::jsonb END);
    RETURN jsonb_build_object('allowed', true, 'price', 0);
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    PERFORM upgrade_monthly_grant(p_user_id, v_tier, null, 'lazy');
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_total := v_wallet.included_balance + v_wallet.purchased_balance;
  IF v_total < v_price THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'insufficient_coins',
      'price', v_price, 'balance', v_total
    );
  END IF;

  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;

  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_lens',
    jsonb_build_object('model', 'per_scan')
  );

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user_id, 'lens', jsonb_build_object('coins', v_price, 'model', 'per_scan'));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$function$;

