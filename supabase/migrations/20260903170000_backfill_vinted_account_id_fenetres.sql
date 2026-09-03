-- ── RATTRAPAGE inventaire.vinted_account_id — RÈGLE 2 : FENÊTRES DE RUNS ─────
-- ⛔⛔ NON APPLIQUÉE — NE PAS JOUER SANS LE GO EXPLICITE DE NICO ⛔⛔
-- (découpage du 03/09 : la règle 1 — comptes mono-identité — vit dans
-- 20260903160000 et a son GO ; celle-ci attend la revue de l'échantillon.)
--
-- Périmètre : comptes MULTI-IDENTITÉS uniquement (au moins deux boutiques
-- distinctes dans leurs runs de dressing identifiés). Un article est attribué
-- à la boutique du run identifié dont la fenêtre (started_at − 5 min →
-- COALESCE(finished_at, started_at + 30 min) + 5 min) couvre son
-- last_synced_at — et SEULEMENT si UNE SEULE fenêtre le couvre : un
-- chevauchement de marges (nb > 1) N'EST PAS attribué, la ligne reste NULL
-- (fail-open, jamais de boutique « probable »). ~2 876 articles au relevé
-- du 03/09, avant retrait des chevauchements.
--
-- ══ ÉCHANTILLON À REVOIR AVANT GO (SELECT seul, aucun UPDATE) ══════════════
-- 30 lignes issues UNIQUEMENT de comptes multi-identités, chevauchements
-- (nb_fenetres_couvrantes > 1) EN TÊTE — ce sont eux qui ne seront pas
-- attribués. Heures de Paris, comptes de test exclus (convention projet).
--
--   WITH excluded AS (SELECT unnest(ARRAY['hoosslocal@gmail.com']) AS email),
--   multi AS (
--     SELECT user_id FROM public.vinted_sync_runs
--     WHERE kind = 'dressing' AND vinted_user_id IS NOT NULL AND items_vus > 0
--     GROUP BY user_id HAVING count(DISTINCT vinted_user_id) >= 2
--   ),
--   arts AS (
--     SELECT i.id, i.user_id, i.last_synced_at
--     FROM public.inventaire i
--     JOIN multi m ON m.user_id = i.user_id
--     JOIN public.profiles p ON p.id = i.user_id
--      AND p.email NOT IN (SELECT email FROM excluded)
--     WHERE i.origine = 'vinted_sync' AND i.vinted_account_id IS NULL
--   ),
--   couvertures AS (
--     SELECT a.id AS article_id, a.user_id, a.last_synced_at,
--            r.vinted_user_id, r.vinted_login, r.started_at,
--            COALESCE(r.finished_at, r.started_at + interval '30 minutes') AS fin
--     FROM arts a
--     JOIN public.vinted_sync_runs r
--       ON r.user_id = a.user_id AND r.kind = 'dressing'
--      AND r.vinted_user_id IS NOT NULL AND r.items_vus > 0
--      AND a.last_synced_at BETWEEN r.started_at - interval '5 minutes'
--        AND COALESCE(r.finished_at, r.started_at + interval '30 minutes') + interval '5 minutes'
--   )
--   SELECT article_id, user_id,
--          last_synced_at AT TIME ZONE 'Europe/Paris' AS synchronise_paris,
--          min(started_at) AT TIME ZONE 'Europe/Paris' AS fenetre_debut_paris,
--          min(fin)        AT TIME ZONE 'Europe/Paris' AS fenetre_fin_paris,
--          CASE WHEN count(*) = 1
--               THEN min(COALESCE('@' || vinted_login, vinted_user_id))
--               ELSE NULL END AS boutique_attribuee,   -- NULL = refusé (chevauchement)
--          count(*) AS nb_fenetres_couvrantes
--   FROM couvertures
--   GROUP BY article_id, user_id, last_synced_at
--   ORDER BY nb_fenetres_couvrantes DESC, article_id
--   LIMIT 30;
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Garde-fous : aucune suppression, aucun autre champ touché ; ne touche que
-- les lignes à vinted_account_id NULL (idempotente — rejouée, candidats
-- vides, zéro écriture) ; TRACE posée AVANT l'UPDATE dans
-- backfill_vinted_account_trace, et l'UPDATE est PILOTÉ PAR LA TRACE : ce
-- qui est écrit est exactement ce qui est tracé, aucune divergence possible.
-- (Rejouer APRÈS un retour arrière réattribuerait et re-tracerait — assumé.)
--
-- RETOUR ARRIÈRE (à jouer tel quel si besoin) :
--   UPDATE public.inventaire i
--   SET vinted_account_id = NULL
--   FROM public.backfill_vinted_account_trace t
--   WHERE t.regle = 'fenetre_run'
--     AND t.article_id = i.id
--     AND i.vinted_account_id = t.nouveau;

-- Table de trace du rattrapage — table d'OPS : AUCUN grant client, à dessein
-- (lisible en SQL/service_role seulement, rien à voir avec la RLS produit).
CREATE TABLE IF NOT EXISTS public.backfill_vinted_account_trace (
  id          bigserial PRIMARY KEY,
  article_id  bigint      NOT NULL,
  user_id     uuid        NOT NULL,
  ancien      text,                      -- toujours NULL (garde IS NULL)
  nouveau     text        NOT NULL,
  regle       text        NOT NULL,
  applique_le timestamptz NOT NULL DEFAULT now()
);

-- 1) TRACE d'abord : les candidats sont les articles NULL de comptes
-- multi-identités couverts par EXACTEMENT UNE fenêtre de run identifié.
WITH multi AS (
  SELECT user_id FROM public.vinted_sync_runs
  WHERE kind = 'dressing' AND vinted_user_id IS NOT NULL AND items_vus > 0
  GROUP BY user_id HAVING count(DISTINCT vinted_user_id) >= 2
),
candidats AS (
  SELECT i.id AS article_id, i.user_id, min(r.vinted_user_id) AS ident
  FROM public.inventaire i
  JOIN multi m ON m.user_id = i.user_id
  JOIN public.vinted_sync_runs r
    ON r.user_id = i.user_id AND r.kind = 'dressing'
   AND r.vinted_user_id IS NOT NULL AND r.items_vus > 0
   AND i.last_synced_at BETWEEN r.started_at - interval '5 minutes'
     AND COALESCE(r.finished_at, r.started_at + interval '30 minutes') + interval '5 minutes'
  WHERE i.origine = 'vinted_sync' AND i.vinted_account_id IS NULL
  GROUP BY i.id, i.user_id
  HAVING count(*) = 1                    -- chevauchement (⩾ 2) : NON attribué
)
INSERT INTO public.backfill_vinted_account_trace (article_id, user_id, ancien, nouveau, regle)
SELECT c.article_id, c.user_id, NULL, c.ident, 'fenetre_run'
FROM candidats c;

-- 2) UPDATE piloté par la trace : rien ne peut être écrit qui ne soit tracé.
UPDATE public.inventaire i
SET vinted_account_id = t.nouveau
FROM public.backfill_vinted_account_trace t
WHERE t.regle = 'fenetre_run'
  AND t.article_id = i.id
  AND t.user_id = i.user_id
  AND i.vinted_account_id IS NULL;
