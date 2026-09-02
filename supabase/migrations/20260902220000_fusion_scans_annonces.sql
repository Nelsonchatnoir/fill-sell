-- ═══════════════════════════════════════════════════════════════════════════
-- FUSION scans + annonces : UN SEUL compteur (02/09 soir, lot Lens unifié)
--
-- Décisions Nico :
-- · quota_scan_* et quota_annonces_* fusionnent — un article photographié
--   = 1 unité, une annonce sans photo = 1 unité, UN chiffre partout.
-- · Le compteur retenu est quota_annonces_* (5/40/120/300). Les clés
--   quota_scan_* passent à 0 et RESTENT en base pour le retour arrière
--   (valeurs d'avant : 3/40/120/300).
-- · REMISE À ZÉRO À LA FUSION (décision Nico, remplace l'addition envisagée
--   d'abord — elle saturait 68 comptes free d'un coup) : le compteur ne
--   compte QUE les gestes postérieurs à quotas_annonces_depuis (posée en fin
--   de fichier à l'instant de l'application). Tout le monde démarre la
--   fusion avec son plafond complet, tous paliers. Dès le cycle suivant,
--   l'origine est dépassée par le début de cycle et ne sert plus.
--
-- MÉCANIQUE DE COMPTAGE (dérivée, rien de stocké) :
--   consommés = lignes usage_logs 'generate_listing' du cycle (dédup
--               régénération 24 h par inventaire_id, inchangée)
--             + lignes 'lens' du cycle SANS le marqueur metadata.unifie.
--   Un scan UNIFIÉ pose sa ligne 'lens' avec unifie:true (télémétrie de
--   coût) ET une ligne 'generate_listing' (l'unité comptée) — le marqueur
--   évite le double comptage. Les scans d'avant la fusion et les scans en
--   mode plein (flag off, vieux clients) n'ont pas le marqueur : ils
--   comptent 1, c'est l'addition demandée.
--
-- spend_coins_for_lens :
-- · gagne p_unifie (défaut false). L'ancienne signature (uuid) est DROPPÉE
--   (surcharge = appel PostgREST ambigu, même leçon que generate).
-- · sa garde de quota passe de quota_scan_* au compteur FUSIONNÉ
--   (quota_annonces_*), refus 'quota_annonces_atteint' {plafond,
--   consommes} — le même code que generate, l'app n'a qu'une modale.
--   (quota_scan_* à 0 rendait la garde muette : sans ce changement, un
--   vieux client aurait scanné hors compteur.)
-- · lens_unifie : flag du mode unifié de lens-analysis, posé à 0 (OFF) —
--   Nico l'allume après le test du parcours Livres.
--
-- ⚠️ À appliquer explicitement. Idempotente. Retour arrière : remonter
-- quota_scan_* (3/40/120/300), re-créer l'ancienne spend_coins_for_lens
-- (migration 20260902202000), flag à 0.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le compteur FUSIONNÉ ────────────────────────────────────────────────────
-- REMISE À ZÉRO À LA FUSION (décision Nico 02/09 soir) : personne ne démarre
-- avec un compteur entamé — l'addition scan+annonce du cycle en cours aurait
-- saturé 68 comptes free d'un coup (50 au-delà du plafond). La borne basse
-- est GREATEST(début de cycle, quotas_annonces_depuis) : tout geste antérieur
-- à l'application de la migration est oublié, TOUS paliers. Au cycle suivant,
-- le début de cycle dépasse l'origine et le comptage redevient exactement
-- « depuis le début du cycle » — l'origine ne sert que pour le cycle où la
-- fusion arrive. Clé absente ou 0 → epoch 0, la borne retombe sur p_cycle
-- (fail-open, même convention que republication_avie_depuis).
CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(p_user_id uuid, p_cycle timestamptz)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
    -- + scans NON unifiés depuis la borne (mode plein — analyse de marché du
    -- stepper, ou clients d'avant l'OTA) : 1 unité chacun. Les scans unifiés
    -- (unifie:true) sont portés par leur ligne generate_listing — jamais
    -- comptés deux fois.
    + (SELECT count(*) FROM usage_logs l, borne
        WHERE l.user_id = p_user_id AND l.feature = 'lens'
          AND l.created_at >= borne.t
          AND NOT (l.metadata ? 'unifie'))
  )::int;
$$;

-- ── spend_coins_for_lens : garde sur le compteur fusionné + p_unifie ───────
DROP FUNCTION IF EXISTS public.spend_coins_for_lens(uuid);

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
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = p_user_id;
  v_tier := COALESCE(v_tier, 'free');

  -- ── COMPTEUR FUSIONNÉ (02/09 soir) — avant tout appel IA ─────────────────
  -- Même clé, même comptage, même code de refus que la génération : un seul
  -- chiffre pour l'utilisateur, une seule modale pour l'app.
  SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_annonces_' || v_tier;
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

  -- Prix nul : ni wallet ni ledger — la ligne usage_logs 'lens' reste posée
  -- (enrichie par lens-analysis : tokens, coût). unifie:true = ce scan sera
  -- porté par sa ligne generate_listing, sa ligne lens ne compte pas.
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

-- ── quotas_etat() : le bloc scans s'éteint proprement ──────────────────────
-- Les clients 2.6.0 (déjà servis) gatent le compteur scans sur
-- `plafond != null`. Sans ce NULLIF, quota_scan_* à 0 leur ferait afficher
-- « 0 scans restants ce mois-ci » sous le CTA d'analyse pendant toute la
-- fenêtre avant l'OTA suivante. Convention réaffirmée : 0 = pas de compteur
-- pour ce geste → plafond null. Le bloc `annonces` compte désormais le
-- FUSIONNÉ tout seul (il appelle quota_annonces_consommees, redéfinie
-- ci-dessus). Seule différence avec la version 20260902202000 : le NULLIF
-- du plafond scans.
CREATE OR REPLACE FUNCTION public.quotas_etat()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
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

  SELECT value INTO v_qa   FROM coin_config WHERE key = 'quota_annonces_'  || v_tier;
  SELECT value INTO v_qs   FROM coin_config WHERE key = 'quota_scan_'      || v_tier;
  SELECT value INTO v_qr   FROM coin_config WHERE key = 'quota_retouche_'  || v_tier;
  -- Fusion 02/09 soir : les clés scans sont à 0 (conservées pour le retour
  -- arrière) — 0 = pas de compteur, le client ne doit rien afficher.
  v_qs := NULLIF(COALESCE(v_qs, 0), 0);

  v_ca := quota_annonces_consommees(v_user, v_cycle);
  SELECT count(*)::int INTO v_cs FROM usage_logs
   WHERE user_id = v_user AND feature = 'lens' AND created_at >= v_cycle;
  -- Retouches : même remise à zéro que les annonces (quotas_retouche_depuis).
  -- Mesuré avant la pose : 3 comptes payants saturés À TORT (2 Premium à 21,
  -- 1 Pro à 41 retouches — TOUTES payées en Pépites avant la bascule de
  -- 15:35). La garde vit dans generate-listing (edge), qui applique la même
  -- borne — cette lecture-ci n'est que l'affichage.
  SELECT count(*)::int INTO v_cr FROM usage_logs
   WHERE user_id = v_user AND feature = 'photo_retouche'
     AND created_at >= GREATEST(v_cycle,
       to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_retouche_depuis'), 0)));

  IF v_tier = 'free' THEN
    SELECT value INTO v_avie   FROM coin_config WHERE key = 'republication_avie_free';
    SELECT value INTO v_depuis FROM coin_config WHERE key = 'republication_avie_depuis';
    IF v_avie IS NOT NULL AND v_depuis IS NOT NULL THEN
      SELECT count(*)::int INTO v_crep FROM cross_post_jobs
       WHERE user_id = v_user AND action = 'republish'
         AND created_at >= to_timestamp(v_depuis);
      v_repub := jsonb_build_object('mode', 'avie', 'plafond', v_avie,
                                    'faites', v_crep,
                                    'restantes', GREATEST(0, v_avie - v_crep));
    ELSE
      v_repub := jsonb_build_object('mode', 'avie', 'plafond', NULL);
    END IF;
  ELSIF v_tier = 'business' THEN
    v_repub := jsonb_build_object('mode', 'illimite');
  ELSE
    SELECT value INTO v_qrep FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    SELECT count(*)::int INTO v_crep FROM cross_post_jobs
     WHERE user_id = v_user AND action = 'republish' AND created_at >= v_cycle;
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

-- ── Clés : scans éteints (retour arrière : 3/40/120/300), flag unifié OFF ──
UPDATE coin_config SET value = 0, updated_at = now()
WHERE key IN ('quota_scan_free', 'quota_scan_premium', 'quota_scan_pro', 'quota_scan_business');

INSERT INTO coin_config (key, value) VALUES ('lens_unifie', 0)
ON CONFLICT (key) DO NOTHING;

-- ── REMISE À ZÉRO : les origines (modèle exact de republication_avie_depuis) ──
-- Posées à l'instant où LA MIGRATION S'APPLIQUE ; ON CONFLICT DO NOTHING —
-- un rejeu ne déplace JAMAIS l'origine. Tous paliers (décision Nico : plus
-- simple, plus juste, effet négligeable sur les payants — 1 seul Premium
-- saturé côté annonces).
--   quotas_annonces_depuis : borne du compteur fusionné (fonction ci-dessus).
--   quotas_retouche_depuis : borne du compteur de retouches — la garde de
--     generate-listing comptait depuis le DÉBUT DU CYCLE, donc les retouches
--     payées en Pépites avant la bascule de 15:35 : 3 comptes payants étaient
--     saturés à tort (2 Premium, 1 Pro). Lue par generate-listing (garde) et
--     quotas_etat (affichage).
INSERT INTO coin_config (key, value)
VALUES ('quotas_annonces_depuis', extract(epoch from now())::int)
ON CONFLICT (key) DO NOTHING;
INSERT INTO coin_config (key, value)
VALUES ('quotas_retouche_depuis', extract(epoch from now())::int)
ON CONFLICT (key) DO NOTHING;
