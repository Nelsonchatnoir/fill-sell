-- ── Multi-comptes Vinted : trace, attribution, épinglage (F1 hybride, 14/08)
-- Dossier Manon (d1a26d04) : plusieurs comptes Vinted légitimes sur le même
-- Chrome, la sync supposait un dressing unique. Couche données de l'option
-- « multi-dressings », UX « un dressing actif épinglé, bascule explicite ».
--   · vinted_sync_runs.vinted_user_id / vinted_login : identité relevée par
--     la sonde, écrite sur CHAQUE run (trace — le forensic du 12/08 était
--     impossible sans elle).
--   · profiles.vinted_sync_pin (jsonb {user_id, login, pinned_at}) : compte
--     actif. Posé au premier run 'done', remis à NULL par le bouton de
--     bascule de l'app (StockTab), jamais bloquant s'il est illisible.
--   · inventaire.vinted_account_id : compte d'origine de l'article,
--     estampillé À L'OBSERVATION (chaque run marque ce qu'il voit). Les
--     lignes NULL (héritage) sont EXCLUES du marquage disparu_le jusqu'à
--     leur prochaine observation — c'est ce qui protège les 384 articles de
--     Manon après sa bascule.
-- L'extension sonde ces colonnes avant de s'en servir : appliquer cette
-- migration ACTIVE les comportements, ne rien appliquer les laisse inertes.
-- Idempotente : rejouable sans effet.

ALTER TABLE public.vinted_sync_runs
  ADD COLUMN IF NOT EXISTS vinted_user_id text,
  ADD COLUMN IF NOT EXISTS vinted_login text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vinted_sync_pin jsonb;

ALTER TABLE public.inventaire
  ADD COLUMN IF NOT EXISTS vinted_account_id text;

-- vinted_sync_runs et inventaire : grants de table déjà en place (l'extension
-- y écrit déjà) — re-posés pour couvrir explicitement les nouvelles colonnes.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vinted_sync_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventaire TO authenticated;

-- profiles : UPDATE colonne-scopé, même doctrine qu'extension_sessions — on
-- n'ouvre QUE la colonne du pin, jamais la table entière.
GRANT UPDATE (vinted_sync_pin) ON public.profiles TO authenticated;
