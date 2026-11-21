-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (21/11/2026, décision et feu vert de Nico) LA RETOUCHE EST RÉSERVÉE AVANT D'ÊTRE LANCÉE — LE QUOTA NE SE DÉPASSE PLUS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Constat (lu en base, compte 0c97dc8b, quota Pro de 20) : 22 retouches le 20/11 de 23:28 à 23:32. generate-listing
-- COMPTAIT les retouches livrées puis lançait l'appel image, et n'écrivait la ligne photo_retouche qu'à la fin (10 à 30 s
-- plus tard) : avec 3 préparations à la fois, les retouches 20, 21 et 22 sont parties quand 19 étaient comptées.
-- La règle : la retouche est RÉSERVÉE (comptée) avant l'appel image, une à la fois par compte (verrou consultatif) ; la
-- ligne réservée est complétée à la fin (livrée ou non). Les vraies retouches demandées comptent comme avant (livrées,
-- règle du 01/10) ; une retouche rendue au client (metadata.hors_quota) ne compte plus ; une réservation sans suite
-- (appel coupé) est libérée au bout de 10 min. Le plafond, la grille, le coût : inchangés.
-- Preuve sur un Postgres jetable : PREUVE_PG=embarque node scripts/quotas/preuve-retouche-reservee.mjs.
-- Inverse : supabase/rollbacks/20261121120000_retouche_reservee_INVERSE.sql.

BEGIN;

-- 1. Le décompte unique des retouches d'un compte depuis une date (lu par quotas_etat et reserver_retouche).
CREATE OR REPLACE FUNCTION public.retouches_consommees(p_user uuid, p_depuis timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM usage_logs u
   WHERE u.user_id = p_user AND u.feature = 'photo_retouche'
     AND u.created_at >= p_depuis
     -- Livrée, ou d'avant le 08/08 (sans la clé), ou réservée et en cours : compte (règle du 01/10 inchangée).
     AND (u.metadata->>'delivered') IS DISTINCT FROM 'false'
     -- (21/11/2026) Une retouche RENDUE au client (faite sans qu'il la demande) : ne compte plus.
     AND NOT (u.metadata ? 'hors_quota')
     -- (21/11/2026) Une réservation restée sans suite (appel coupé) plus de 10 min : libérée.
     AND NOT (COALESCE(u.metadata->>'reservee', '') = 'true' AND NOT (u.metadata ? 'delivered')
              AND u.created_at < now() - interval '10 minutes');
$function$;
REVOKE ALL ON FUNCTION public.retouches_consommees(uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retouches_consommees(uuid, timestamp with time zone) TO service_role;

-- 2. La réservation : UNE retouche à la fois par compte (verrou consultatif de la transaction), comptée AVANT l'appel image.
--    Quota atteint → refus, rien d'écrit. Sinon une ligne photo_retouche « réservée » (sans la clé delivered : elle compte
--    tout de suite) ; generate-listing la complète à la fin (delivered, coût, modèle) — la même ligne, jamais deux.
CREATE OR REPLACE FUNCTION public.reserver_retouche(p_user uuid, p_quota integer, p_depuis timestamp with time zone, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_faites integer;
  v_id     uuid;
BEGIN
  -- Les fonctions edge seulement (service_role) : jamais une session de l'app.
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'réservé au serveur' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'utilisateur_absent');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reserver_retouche:' || p_user::text, 0));
  v_faites := retouches_consommees(p_user, COALESCE(p_depuis, '-infinity'::timestamptz));
  IF p_quota IS NOT NULL AND v_faites >= p_quota THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_retouche_atteint', 'plafond', p_quota, 'consommes', v_faites);
  END IF;
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user, 'photo_retouche',
          (COALESCE(p_meta, '{}'::jsonb) - 'delivered' - 'hors_quota') || jsonb_build_object('reservee', true, 'reservee_le', now()))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('allowed', true, 'id', v_id, 'plafond', p_quota, 'consommes', v_faites + 1);
END;
$function$;
REVOKE ALL ON FUNCTION public.reserver_retouche(uuid, integer, timestamp with time zone, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserver_retouche(uuid, integer, timestamp with time zone, jsonb) TO service_role;

-- 3. quotas_etat (en-tête, Réglages, jauges) lit le même décompte. Réécrite depuis pg_get_functiondef de PROD
--    (md5 91ce0ea8…, relue le 21/11) : seul le bloc « Retouches » change ; signature, propriétaire et droits inchangés.
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
  -- (11/11/2026, décision 1 de Nico) Le palier des quotas = palier_de (règle unique : un essai du Cloud seul en cours
  -- sur un compte gratuit = Pro jusqu'à la fin de l'essai).
  v_tier := palier_de(v_user);
  v_tier  := COALESCE(v_tier, 'free');
  v_cycle := debut_cycle_quotas(v_user);

  -- (11/10) Le quota d'annonces du COMPTE : son réglage s'il en a un, sinon
  -- celui du palier (quota_annonces_compte, table quotas_par_compte).
  -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : jauge_annonces_plafond (à 0 : quota_annonces_compte, à l'identique).
  v_qa := jauge_annonces_plafond(v_user, v_tier);
  SELECT value INTO v_qs   FROM coin_config WHERE key = 'quota_scan_'      || v_tier;
  SELECT value INTO v_qr   FROM coin_config WHERE key = 'quota_retouche_'  || v_tier;
  -- Fusion 02/09 soir : clés scans à 0 (retour arrière) — 0 = pas de compteur.
  v_qs := NULLIF(COALESCE(v_qs, 0), 0);

  v_ca := quota_annonces_consommees(v_user, v_cycle);
  SELECT count(*)::int INTO v_cs FROM usage_logs
   WHERE user_id = v_user AND feature = 'lens' AND created_at >= v_cycle;
  -- Retouches : même remise à zéro que les annonces (quotas_retouche_depuis).
  -- (21/11/2026, décision de Nico) Le décompte unique retouches_consommees : les retouches livrées, celles RÉSERVÉES
  -- en cours (reserver_retouche, avant l'appel image), jamais une retouche rendue (metadata.hors_quota) ni une
  -- réservation restée sans suite plus de 10 min.
  v_cr := retouches_consommees(v_user, GREATEST(v_cycle,
    to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_retouche_depuis'), 0))));

  IF v_tier = 'free' THEN
    -- (05/10, décision Nico) 50 PAR MOIS, plus « à vie » : le compteur et sa
    -- remise à zéro vivent dans quota_republication_free_etat (même cycle
    -- que quota_annonces_free).
    v_repub := quota_republication_free_etat(v_user);
  ELSIF v_tier = 'business' THEN
    v_repub := jsonb_build_object('mode', 'illimite');
  ELSIF jauges_actives() AND quota_remontees_plafond(v_tier) IS NULL THEN
    -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : remontées illimitées (Pro).
    v_repub := jsonb_build_object('mode', 'illimite');
  ELSE
    v_qrep := quota_remontees_plafond(v_tier);
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
  ) || CASE WHEN jauges_actives() THEN jsonb_build_object(
    -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : les publications, le mode des annonces et le Lens du Business.
    'grille', 'trois_jauges',
    -- (04/11/2026, demande de Nico : la remise à zéro, aussi pour les payants ; seulement avec la grille)
    'remise_le', (SELECT w.next_grant_at FROM coin_wallets w WHERE w.user_id = v_user),
    'annonces_mode', CASE WHEN v_qa IS NULL THEN 'illimite' ELSE 'mensuel' END,
    'publications', (SELECT jsonb_build_object('mode', CASE WHEN x.pl IS NULL THEN 'illimite' ELSE 'mensuel' END,
                              'plafond', x.pl, 'consommes', x.c,
                              'restantes', CASE WHEN x.pl IS NOT NULL THEN GREATEST(0, x.pl - x.c) END)
                     FROM (SELECT jauge_publications_plafond(v_tier) AS pl, publications_du_cycle(v_user, v_cycle) AS c) x),
    'lens', (SELECT CASE WHEN l.pl IS NULL THEN NULL
                    ELSE jsonb_build_object('plafond', l.pl, 'consommes', v_cs, 'restantes', GREATEST(0, l.pl - v_cs)) END
             FROM (SELECT jauge_lens_plafond(v_tier) AS pl) l)
  ) ELSE '{}'::jsonb END;
END;
$function$;

COMMIT;
