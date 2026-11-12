-- PREUVE (LECTURE SEULE) de la migration 20261112100000_essai_formule_aucun_credit_hors_paiement (12/11/2026, question 9
-- des offres Cloud) — à jouer AVANT puis APRÈS, en postgres :
--   npx supabase db query --linked -f scripts/reparations/20261112_essai_formule_aucun_credit_hors_paiement_PREUVE.sql
-- (ou MCP execute_sql). UNE seule requête (SELECT), lignes « section | quoi | valeur » : rien n'est écrit, aucun e-mail
-- affiché (comptes désignés par leur id8). Heure de Paris. Jouée telle quelle par le banc (scripts/essais/20261112100000_banc.mjs),
-- qui vérifie que la simulation du balayage annonce exactement ce que le vrai balayage fait.
-- Ce qu'elle montre :
--   · fonction : md5, droits, SECURITY DEFINER, search_path des deux fonctions réécrites (grant_monthly_coins,
--     coins_awaiting_payment) et de deux témoins jamais touchés (grant_monthly_coins_sweep, upgrade_monthly_grant) ;
--   · balayage maintenant : ce que grant_monthly_coins_sweep ferait s'il passait MAINTENANT (même sélection, même palier
--     des drapeaux, mêmes refus que grant_monthly_coins : non configuré, attente de paiement > 3 jours, déjà crédité ce
--     jour-là), SANS et AVEC l'exclusion « formule avec Cloud en essai », et l'id8 des comptes exclus ;
--   · essais de formule : les comptes en essai d'une formule maintenant, et ceux dont l'échéance tombe avant la fin de
--     l'essai (ceux qu'un balayage aurait crédités pendant l'essai sans la migration) ;
--   · ops-digest : les lignes de coins_awaiting_payment (condition brute) sans / avec l'exclusion, et ce que rend la RPC ;
--   · prix : le crédit paresseux des spend_coins_* n'est atteignable que si un prix est > 0.
-- Attendu AVANT (relevé le 12/11/2026 vers 09:50, MCP) : grant_monthly_coins 185d1427c213ccb8d2a179adbfebc6ed et
--   coins_awaiting_payment f559b9978471d31e78b1b25794c8f8fe, migrée = false ; droits {postgres=X/postgres,service_role=X/postgres} ;
--   témoins a0da488f8fe11ef872409caee220ad70 (balayage) et 2080915eaed8f9d8aae81345702dc672 (upgrade_monthly_grant) ;
--   balayage maintenant : 0 visité, 0 crédité sans et avec l'exclusion, 0 exclu ; 0 compte en essai d'une formule
--   (aucune formule vendue, les interrupteurs cloud_formules_* absents) ; tous les prix à 0.
-- Attendu APRÈS : les deux md5 changent (migrée = true), droits / SECURITY DEFINER / search_path identiques ; les
--   témoins identiques ; tous les chiffres du balayage, des essais et de l'ops-digest identiques à AVANT (aucun compte
--   en essai d'une formule aujourd'hui : rien d'autre ne change). Après l'INVERSE : de nouveau les md5 d'AVANT.
WITH fn AS (
  SELECT p.proname AS nom, md5(pg_get_functiondef(p.oid)) AS md5, coalesce(p.proacl::text, '') AS droits,
         p.prosecdef AS sd, coalesce(p.proconfig::text, '') AS cfg,
         pg_get_functiondef(p.oid) LIKE '%question 9 des offres Cloud%' AS migree
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('grant_monthly_coins', 'coins_awaiting_payment', 'grant_monthly_coins_sweep', 'upgrade_monthly_grant')
), profils AS (
  SELECT p.id, p.is_business, p.is_pro, p.is_premium, p.is_comped, p.cloud_formule, p.cloud_canal, p.cloud_essai_fin,
         (p.stripe_customer_id IS NOT NULL OR p.apple_original_transaction_id IS NOT NULL OR p.google_purchase_token IS NOT NULL) AS a_paiement,
         -- La condition de la migration, mot pour mot (jamais NULL : chaque terme est un booléen ou gardé par IS NOT NULL).
         (p.cloud_formule IS NOT NULL
          AND p.is_cloud IS NOT TRUE
          AND p.cloud_essai_arrete IS NOT TRUE
          AND p.cloud_canal IS DISTINCT FROM 'offert'
          AND p.cloud_essai_debut IS NOT NULL AND p.cloud_essai_fin IS NOT NULL
          AND p.cloud_essai_debut <= now() AND now() < p.cloud_essai_fin) AS essai_formule,
         w.user_id IS NOT NULL AS a_portefeuille, w.next_grant_at AS echeance
    FROM public.profiles p
    LEFT JOIN public.coin_wallets w ON w.user_id = p.id
), candidats AS (
  -- La sélection de grant_monthly_coins_sweep, et son palier (les drapeaux).
  SELECT c.*,
         CASE WHEN c.is_business = true THEN 'business' WHEN c.is_pro = true THEN 'pro'
              WHEN c.is_premium = true OR c.is_comped = true THEN 'premium' ELSE 'free' END AS tier
    FROM profils c
   WHERE c.echeance IS NULL OR c.echeance <= now()
), verdicts AS (
  -- Les refus de grant_monthly_coins pour un appel 'sweep' dont l'échéance est atteinte, dans leur ordre.
  SELECT c.*,
         CASE
           WHEN NOT EXISTS (SELECT 1 FROM public.coin_config k WHERE k.key = 'monthly_grant_' || c.tier) THEN 'grant_not_configured'
           WHEN c.a_paiement AND NOT coalesce(c.is_comped, false) AND c.tier <> 'free'
                AND c.echeance IS NOT NULL AND c.echeance < now() - interval '3 days' THEN 'awaiting_payment_event'
           WHEN EXISTS (SELECT 1 FROM public.coin_ledger l
                         WHERE l.ref = 'grant_monthly:' || c.id || ':' || to_char(coalesce(c.echeance, now()), 'YYYY-MM-DD')) THEN 'already_granted'
           ELSE 'granted' END AS sans_exclusion
    FROM candidats c
), attente AS (
  -- La condition de coins_awaiting_payment (ops-digest), brute.
  SELECT c.essai_formule
    FROM profils c
   WHERE (c.is_pro OR c.is_premium) AND NOT coalesce(c.is_comped, false) AND c.a_paiement AND c.a_portefeuille
     AND c.echeance IS NOT NULL AND c.echeance < now() - interval '3 days'
), essais AS (
  SELECT c.* FROM profils c WHERE c.essai_formule
)
SELECT section, quoi, valeur FROM (
  SELECT 0 AS o, 'lu le' AS section, 'heure de Paris' AS quoi, to_char(now() AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI:SS') AS valeur
  UNION ALL SELECT 1, 'fonction', nom || ' : md5', md5 FROM fn
  UNION ALL SELECT 1, 'fonction', nom || ' : droits', droits || ' · security_definer=' || sd::text || ' · ' || cfg FROM fn
  UNION ALL SELECT 1, 'fonction', nom || ' : migrée', migree::text FROM fn
  UNION ALL SELECT 2, 'balayage maintenant', 'comptes visités', count(*)::text FROM verdicts
  UNION ALL SELECT 2, 'balayage maintenant', 'crédités SANS l''exclusion', count(*) FILTER (WHERE sans_exclusion = 'granted')::text FROM verdicts
  UNION ALL SELECT 2, 'balayage maintenant', 'crédités AVEC l''exclusion', count(*) FILTER (WHERE sans_exclusion = 'granted' AND NOT essai_formule)::text FROM verdicts
  UNION ALL SELECT 2, 'balayage maintenant', 'attente de paiement SANS l''exclusion', count(*) FILTER (WHERE sans_exclusion = 'awaiting_payment_event')::text FROM verdicts
  UNION ALL SELECT 2, 'balayage maintenant', 'attente de paiement AVEC l''exclusion', count(*) FILTER (WHERE sans_exclusion = 'awaiting_payment_event' AND NOT essai_formule)::text FROM verdicts
  UNION ALL SELECT 2, 'balayage maintenant', 'exclus (essai d''une formule)', count(*) FILTER (WHERE essai_formule)::text FROM verdicts
  UNION ALL SELECT 2, 'balayage maintenant', 'exclus : id8', coalesce(string_agg(left(id::text, 8), ' ' ORDER BY id) FILTER (WHERE essai_formule), '') FROM verdicts
  UNION ALL SELECT 2, 'balayage maintenant', 'exclus qu''il aurait crédités : id8', coalesce(string_agg(left(id::text, 8) || ' ' || tier, ' ' ORDER BY id) FILTER (WHERE essai_formule AND sans_exclusion = 'granted'), '') FROM verdicts
  UNION ALL SELECT 3, 'essais de formule', 'en cours maintenant', count(*)::text FROM essais
  UNION ALL SELECT 3, 'essais de formule', 'échéance avant la fin de l''essai', count(*) FILTER (WHERE echeance IS NULL OR echeance < cloud_essai_fin)::text FROM essais
  UNION ALL SELECT 3, 'essais de formule', 'détail : id8 formule canal fin échéance',
    coalesce(string_agg(left(id::text, 8) || ' ' || cloud_formule || ' ' || coalesce(cloud_canal, '?')
      || ' fin ' || to_char(cloud_essai_fin AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI')
      || ' échéance ' || coalesce(to_char(echeance AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI'), 'aucune'), ' · ' ORDER BY id), '') FROM essais
  UNION ALL SELECT 4, 'ops-digest', 'coins_awaiting_payment : lignes SANS l''exclusion', count(*)::text FROM attente
  UNION ALL SELECT 4, 'ops-digest', 'coins_awaiting_payment : lignes AVEC l''exclusion', count(*) FILTER (WHERE NOT essai_formule)::text FROM attente
  UNION ALL SELECT 4, 'ops-digest', 'coins_awaiting_payment() : ce que rend la RPC', (SELECT count(*) FROM public.coins_awaiting_payment())::text
  UNION ALL SELECT 5, 'prix', 'price_*', coalesce(string_agg(key || '=' || value, ' ' ORDER BY key), '') FROM public.coin_config WHERE key ~ '^price_'
  UNION ALL SELECT 5, 'prix', 'crédit paresseux atteignable (un prix > 0)', coalesce(bool_or(value > 0), false)::text FROM public.coin_config WHERE key ~ '^price_'
) x
ORDER BY o, section, quoi;
