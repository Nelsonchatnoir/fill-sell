-- INVERSE de supabase/migrations/20261111230000_essai_cloud_seul_droits_pro.sql (11/11/2026) : les quatre définitions
-- de PROD lues le 11/11/2026 vers 22:53 (pg_get_functiondef), à l'octet ; droits inchangés (CREATE OR REPLACE).
-- md5 de prod : palier_de 52173f13c0f202187d593c90ad645cb6 · quotas_etat 8c18278821e7884d00b0faaba5d65f2d ·
-- spend_coins_for_generate 00d31c6c22b7b028ead28bfb1f5ee03d · spend_coins_for_lens f20a612820a4c8a6f6230ddcd2d66653.

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
  v_garde     jsonb;
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
  -- (10/11/2026, règle de Nico) Seule une ligne qui COMPTE ouvre la régénération : une passe légère (titre ET
  -- description du vendeur) ne compte pas — la vraie rédaction qui la suit passe au quota (quota_annonces_consommees).
  IF p_inventaire_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM usage_logs u
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.metadata->>'inventaire_id' = p_inventaire_id::text
        AND u.created_at >= now() - interval '24 hours'
        AND NOT (COALESCE(u.metadata->>'texte_vendeur_titre', '') = 'true'
                 AND COALESCE(u.metadata->>'texte_vendeur_description', '') = 'true')
    ) INTO v_regen;
  END IF;

  IF NOT v_regen THEN
    -- (11/10) Le réglage du compte prime sur le quota du palier.
    -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant)
    v_quota := jauge_annonces_plafond(p_user_id, v_tier);
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      v_cycle := debut_cycle_quotas(p_user_id);
      v_consommes := quota_annonces_consommees(p_user_id, v_cycle);
      IF v_consommes >= v_quota THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                  'plafond', v_quota, 'consommes', v_consommes);
      END IF;
    END IF;
    -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : le garde-fou du jour, sous le code que generate-listing relaie déjà avec son message.
    v_garde := garde_fou_jour(p_user_id, 'annonces', 1);
    IF v_garde IS NOT NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'pro_daily_cap_reached', 'garde_fou', true, 'jauge', 'annonces',
                                'message', v_garde ->> 'message', 'cap', (v_garde ->> 'garde')::integer,
                                'used', (v_garde ->> 'faites')::integer, 'reprise_le', v_garde -> 'reprise_le');
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
  v_garde     jsonb;
  v_ql        integer;
  v_cl        integer;
  v_remise    timestamptz;
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
  -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant)
  v_quota := jauge_annonces_plafond(p_user_id, v_tier);
  IF v_quota IS NOT NULL AND v_quota > 0 THEN
    v_consommes := quota_annonces_consommees(p_user_id, debut_cycle_quotas(p_user_id));
    IF v_consommes >= v_quota THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'quota_annonces_atteint',
                                'plafond', v_quota, 'consommes', v_consommes);
    END IF;
  END IF;

  -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : Lens du Business, 600 par mois affichés ; refus sous le code que lens-analysis relaie déjà.
  v_ql := jauge_lens_plafond(v_tier);
  IF v_ql IS NOT NULL THEN
    SELECT count(*)::integer INTO v_cl FROM usage_logs
     WHERE user_id = p_user_id AND feature = 'lens' AND created_at >= debut_cycle_quotas(p_user_id);
    IF v_cl >= v_ql THEN
      SELECT w.next_grant_at INTO v_remise FROM coin_wallets w WHERE w.user_id = p_user_id;
      RETURN jsonb_build_object('allowed', false, 'reason', 'quota_scan_atteint', 'jauge', 'lens',
                                'plafond', v_ql, 'consommes', v_cl, 'remise_le', v_remise,
                                'message', format('Tes %s scans Lens du mois sont faits%s. Tout le reste continue, sans limite.', v_ql,
                                  CASE WHEN v_remise IS NOT NULL THEN ' : ils reviennent le ' || to_char(v_remise AT TIME ZONE 'Europe/Paris', 'DD/MM') ELSE '' END));
    END IF;
  END IF;
  v_garde := garde_fou_jour(p_user_id, 'annonces', CASE WHEN p_unifie THEN 0 ELSE 1 END);
  IF v_garde IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'quota_scan_atteint', 'garde_fou', true, 'jauge', 'annonces',
                              'plafond', (v_garde ->> 'garde')::integer, 'consommes', (v_garde ->> 'faites')::integer,
                              'message', v_garde ->> 'message', 'reprise_le', v_garde -> 'reprise_le');
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
