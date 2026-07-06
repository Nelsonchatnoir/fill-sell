-- ════════════════════════════════════════════════════════════════════════════
-- DASHBOARD — Coût réel du système de pièces vs factures API (mois donné)
-- ════════════════════════════════════════════════════════════════════════════
-- Usage : exécuter dans le SQL editor Supabase en ajustant :mois si besoin
-- (par défaut le mois courant). Comparer les colonnes "cout_estime_*" aux
-- factures réelles : dashboard OpenAI (GPT Image) et console Anthropic (Haiku).
--
-- Hypothèses embarquées (fourchettes de la grille validée 2026-07-06) :
--   * retouche ia_light  : 0,015 $/photo typique · 0,02 $/photo max (quality low)
--   * retouche ia_advanced : 0,055 $/photo typique · 0,07 $/photo max (quality medium)
--   * photos retouchées par annonce : 4 typique · 5 max (cap serveur = 5) —
--     le nombre exact n'est pas journalisé (amélioration possible : l'ajouter
--     au metadata de spend_publish)
--   * analyse Lens (web_search unifiée) : 0,03 $ typique · 0,05 $ max
--   * texte generate-listing (Haiku × plateformes) : 0,004 $/plateforme
--   * 1 pièce = 0,05 € facial ; 1 $ ≈ 1 € par prudence
-- Si le medium GPT Image 2 réel sort de [0,04-0,07 $], corriger la grille.

WITH borne AS (
  SELECT date_trunc('month', now()) AS debut  -- ← remplacer par '2026-07-01' pour un mois passé
),

-- ── Publications payées en pièces (spend_publish) ───────────────────────────
publish AS (
  SELECT
    l.metadata->>'photo_option'                        AS option,
    count(*)                                           AS annonces,
    sum((l.metadata->>'platforms')::int)               AS plateformes,
    sum(-l.delta)                                      AS pieces
  FROM coin_ledger l, borne b
  WHERE l.kind = 'spend_publish' AND l.created_at >= b.debut
  GROUP BY 1
),

-- ── Analyses Lens (incluses + hors quota) ───────────────────────────────────
lens AS (
  SELECT
    count(*) FILTER (WHERE u.metadata->>'overflow' IS NULL)     AS analyses_incluses,
    count(*) FILTER (WHERE (u.metadata->>'overflow')::boolean)  AS analyses_pieces,
    COALESCE(sum((u.metadata->>'coins')::int), 0)               AS pieces_lens
  FROM usage_logs u, borne b
  WHERE u.feature = 'lens' AND u.created_at >= b.debut
)

-- ── Synthèse ─────────────────────────────────────────────────────────────────
SELECT * FROM (

  -- Ligne par option de publication : coût GPT Image estimé (facture OPENAI)
  SELECT
    'publish_' || p.option                                        AS poste,
    p.annonces                                                    AS volume,
    p.pieces                                                      AS pieces_debitees,
    round(p.pieces * 0.05, 2)                                     AS valeur_faciale_eur,
    CASE p.option
      WHEN 'ia_light'    THEN round(p.annonces * 4 * 0.015 + COALESCE(p.plateformes,0) * 0.004, 2)
      WHEN 'ia_advanced' THEN round(p.annonces * 4 * 0.055 + COALESCE(p.plateformes,0) * 0.004, 2)
      ELSE round(COALESCE(p.plateformes,0) * 0.004, 2)  -- original : texte Haiku seul
    END                                                           AS cout_estime_typique_usd,
    CASE p.option
      WHEN 'ia_light'    THEN round(p.annonces * 5 * 0.02  + COALESCE(p.plateformes,0) * 0.005, 2)
      WHEN 'ia_advanced' THEN round(p.annonces * 5 * 0.07  + COALESCE(p.plateformes,0) * 0.005, 2)
      ELSE round(COALESCE(p.plateformes,0) * 0.005, 2)
    END                                                           AS cout_estime_max_usd,
    CASE WHEN p.option = 'original' THEN 'Anthropic' ELSE 'OpenAI (GPT Image) + Anthropic (texte)' END AS facture
  FROM publish p

  UNION ALL

  -- Analyses Lens : coût Haiku + web_search (facture ANTHROPIC)
  SELECT
    'lens_incluses', l.analyses_incluses, 0, 0,
    round(l.analyses_incluses * 0.03, 2),
    round(l.analyses_incluses * 0.05, 2),
    'Anthropic (web_search)'
  FROM lens l
  UNION ALL
  SELECT
    'lens_hors_quota', l.analyses_pieces, l.pieces_lens,
    round(l.pieces_lens * 0.05, 2),
    round(l.analyses_pieces * 0.03, 2),
    round(l.analyses_pieces * 0.05, 2),
    'Anthropic (web_search)'
  FROM lens l

) synthese
ORDER BY poste;

-- ── Contrôles de cohérence du ledger (à lancer à part si besoin) ─────────────
-- Solde global du mois : grants + achats + refunds − dépenses
-- SELECT kind, count(*), sum(delta) FROM coin_ledger
-- WHERE created_at >= date_trunc('month', now()) GROUP BY kind ORDER BY kind;
--
-- Wallet vs ledger (doivent correspondre pour chaque user actif) :
-- SELECT w.user_id, w.included_balance + w.purchased_balance AS wallet,
--        (SELECT included_after + purchased_after FROM coin_ledger l
--         WHERE l.user_id = w.user_id ORDER BY id DESC LIMIT 1) AS ledger_dernier
-- FROM coin_wallets w
-- WHERE w.included_balance + w.purchased_balance <>
--       COALESCE((SELECT included_after + purchased_after FROM coin_ledger l
--                 WHERE l.user_id = w.user_id ORDER BY id DESC LIMIT 1), 0);
