-- Définition de PROD de quotas_etat, lue le 21/11/2026 (md5(pg_get_functiondef) = 91ce0ea8ff31c2e3c9e1e929a3ddc66e, 5102 car.).
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
