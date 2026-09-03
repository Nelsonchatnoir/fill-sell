-- ── RATTRAPAGE inventaire.vinted_account_id — RÈGLE 1 SEULE (2026-09-03) ─────
-- GO Nico du 03/09 : règle 1 validée telle quelle ; la règle 2 (attribution
-- par fenêtre de run, comptes multi-identités) vit dans la migration séparée
-- 20260903170000_backfill_vinted_account_id_fenetres.sql, NON APPLIQUÉE.
--
-- Contexte : la 0.6.17 estampille la boutique d'origine À L'OBSERVATION
-- (chaque sync marque ce qu'elle voit) — les comptes actifs convergent tout
-- seuls. Cette migration accélère, et couvre ce que l'observation ne reverra
-- jamais (articles vendus/disparus, comptes qui ne synchronisent plus).
--
-- RÈGLE 1 — comptes MONO-IDENTITÉ : tous leurs runs de dressing identifiés
-- (vinted_user_id non NULL, items_vus > 0) portent LA MÊME boutique ⇒
-- l'intégralité de leurs articles synchronisés vient de cette boutique.
-- ~9 544 articles au relevé du 03/09.
--
-- Garde-fous : aucune suppression, aucun autre champ touché ; ne touche que
-- les lignes à vinted_account_id NULL (idempotente, rejouable sans effet) ;
-- les articles non rattrapables restent NULL et HORS cloisonnement
-- (fail-open) — jamais de boutique « probable ».
WITH mono AS (
  SELECT user_id, min(vinted_user_id) AS ident
  FROM public.vinted_sync_runs
  WHERE kind = 'dressing' AND vinted_user_id IS NOT NULL AND items_vus > 0
  GROUP BY user_id
  HAVING count(DISTINCT vinted_user_id) = 1
)
UPDATE public.inventaire i
SET vinted_account_id = m.ident
FROM mono m
WHERE i.user_id = m.user_id
  AND i.origine = 'vinted_sync'
  AND i.vinted_account_id IS NULL;
