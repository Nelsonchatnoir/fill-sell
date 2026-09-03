-- ── RATTRAPAGE inventaire.vinted_account_id (multi-boutiques, 2026-09-03) ────
-- ⛔ NE PAS APPLIQUER SANS LE GO EXPLICITE DE NICO (règle du projet : les
-- migrations s'appliquent une par une, après validation).
--
-- Contexte : la 0.6.17 estampille la boutique d'origine À L'OBSERVATION
-- (chaque sync marque ce qu'elle voit) — les comptes ACTIFS convergent donc
-- tout seuls, sans cette migration. Elle ne sert qu'à accélérer, et à couvrir
-- ce que l'observation ne reverra jamais (articles vendus/disparus, comptes
-- qui ne synchronisent plus).
--
-- Chiffres relevés le 03/09 (lecture seule, comptes de test exclus du
-- raisonnement) : 41 228 articles origine='vinted_sync', 0 estampillé.
--   · règle 1 (comptes MONO-IDENTITÉ)        : ~9 544 articles rattrapables ;
--   · règle 2 (fenêtre de run identifié)     : ~2 876 articles de plus ;
--   · SANS ORIGINE rattrapable               : ~28 808 (imports antérieurs à
--     la trace d'identité du 31/08 chez des comptes sans run identifié — on
--     n'invente rien, ils restent NULL et sortent du cloisonnement).
-- Idempotente : chaque UPDATE est gardé par vinted_account_id IS NULL.
-- Les inventaires de l'incident (claire972elegante, remialbertholl) ne sont
-- PAS un cas particulier ici : leurs articles seront estampillés avec la
-- boutique RÉELLEMENT observée par leurs runs (le dressing de Nadège pour les
-- imports concernés) — c'est la donnée vraie, et c'est elle qui permettra le
-- tri ultérieur. Aucune suppression, aucun autre champ touché.

-- Règle 1 — comptes dont TOUS les runs identifiés portent LA MÊME boutique :
-- l'intégralité de leurs articles synchronisés vient de cette boutique.
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

-- Règle 2 — comptes multi-identités : un article est attribué au run
-- identifié dans la FENÊTRE duquel tombe son last_synced_at (marges 5 min ;
-- ambiguïté impossible : deux runs du même compte ne se chevauchent pas,
-- verrou d'extension). Ne touche que ce que la règle 1 n'a pas couvert.
UPDATE public.inventaire i
SET vinted_account_id = r.vinted_user_id
FROM public.vinted_sync_runs r
WHERE r.user_id = i.user_id
  AND r.kind = 'dressing'
  AND r.vinted_user_id IS NOT NULL
  AND r.items_vus > 0
  AND i.origine = 'vinted_sync'
  AND i.vinted_account_id IS NULL
  AND i.last_synced_at BETWEEN r.started_at - interval '5 minutes'
                           AND COALESCE(r.finished_at, r.started_at + interval '30 minutes') + interval '5 minutes';
