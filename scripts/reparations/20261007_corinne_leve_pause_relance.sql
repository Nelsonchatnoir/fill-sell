-- ════════════════════════════════════════════════════════════════════════════
-- Corinne Basalo (771ac4d9-727c-4f68-bd8c-f4c7e8056a03), 07/10/2026 — après
-- le rattrapage (20261007_rattrapage_releves) et le moteur « rattachement
-- avant stock » (migration 20261007140000) : la pause de ses relevés
-- Leboncoin et Beebs est LEVÉE (leve_le renseigné, la ligne reste), puis ses
-- deux relevés sont remis en file comme l'app le fait sur « Synchroniser »
-- (demander_sync_plateforme : status 'queued', declencheur 'app').
--   npx supabase db query --linked -f scripts/reparations/20261007_corinne_leve_pause_relance.sql
-- Inverse : UPDATE pause_releves SET leve_le = NULL WHERE user_id = '771ac4d9-…';
--           (les relevés en file partent ou s'éteignent seuls).
BEGIN;

UPDATE pause_releves SET leve_le = now()
 WHERE user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03' AND leve_le IS NULL;

INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
SELECT '771ac4d9-727c-4f68-bd8c-f4c7e8056a03', 'annonces', pf, 'queued', 'app', now()
  FROM unnest(ARRAY['leboncoin', 'beebs']) pf
 WHERE NOT EXISTS (SELECT 1 FROM vinted_sync_runs r
                    WHERE r.user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03' AND r.kind = 'annonces'
                      AND r.platform = pf AND r.status IN ('queued', 'running'));

SELECT p.leve_le, (SELECT json_agg(json_build_object('id', r.id, 'platform', r.platform, 'status', r.status))
                     FROM vinted_sync_runs r
                    WHERE r.user_id = p.user_id AND r.status IN ('queued', 'running')) en_file
  FROM pause_releves p WHERE p.user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03';

COMMIT;
