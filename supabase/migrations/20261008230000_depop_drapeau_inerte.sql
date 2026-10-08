-- ═══════════════════════════════════════════════════════════════════════════
-- DEPOP — LE DRAPEAU, À 0 (08/10/2026, préparation du rattachement, INERTE)
-- ⛔ NON APPLIQUÉE. À appliquer sur feu vert NOMMÉ de Nico seulement :
--    npx supabase db query --linked -f supabase/migrations/20261008230000_depop_drapeau_inerte.sql
--    npx supabase migration repair --linked --status applied 20261008230000
--    puis relire : select key, value from coin_config where key = 'depop_ouvert';
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : pose coin_config `depop_ouvert` = 0, et
-- journalise la pose (coin_config_journal, comme 20261008160000).
--   0 (ou ligne absente) = Depop n'existe pas pour FillSell : aucune case, aucun
--     logo, aucun job, aucune synchro. C'est l'état de la prod AVANT comme
--     APRÈS cette migration — elle rend seulement l'interrupteur visible et
--     daté, pour qu'il ne s'arme jamais en silence.
--   1 = réservé au jour de l'activation (décision de Nico), qui demandera bien
--     plus que ce drapeau : docs/plateformes/depop/RATTACHEMENT.md § 4.
-- Ligne déjà présente (quelle que soit sa valeur) : RIEN n'est réécrit
-- (ON CONFLICT DO NOTHING) — cette migration ne peut pas armer Depop.
--
-- CE QU'ELLE NE FAIT PAS (exprès) : aucune contrainte CHECK de plateforme
-- n'est ouverte à 'depop' (cross_post_jobs, platform_category_aspects,
-- vinted_sync_runs, annonces_plateforme, republish_creneaux) — tant qu'elles
-- refusent 'depop', AUCUNE ligne Depop ne peut exister, même par erreur.
-- Leur ouverture fait partie de l'activation (RATTACHEMENT.md § 4).
-- Aucune table, aucune fonction, aucun droit ne change. Idempotente.

WITH ins AS (
  INSERT INTO public.coin_config (key, value, updated_at)
  VALUES ('depop_ouvert', 0, now())
  ON CONFLICT (key) DO NOTHING RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, NULL, value, 'migration 20261008230000' FROM ins;
