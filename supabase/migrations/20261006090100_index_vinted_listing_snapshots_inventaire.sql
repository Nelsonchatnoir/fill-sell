-- ═══════════════════════════════════════════════════════════════════════════
-- vinted_listing_snapshots : un index sur inventaire_id — suppression d'un stock sans délai (06/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- `supprimer_mon_stock_sans_retrait` répondait 500 (« statement timeout », 8 s)
-- chez Marine le 05/10 avec moins d'une centaine d'articles. Cause : la clé
-- étrangère vinted_listing_snapshots.inventaire_id → inventaire(id) (ON DELETE SET NULL)
-- n'avait AUCUN index. Pour CHAQUE article effacé, la base relisait toute la
-- table (347 000 lignes, 30 à 60 ms le parcours) pour trouver les lignes à détacher. Effacer N
-- articles = N parcours complets : ~60 ms × 100 articles = 6 s ; les plus gros
-- stocks (3 434 articles) ne pouvaient plus être effacés du tout, ni par l'app
-- ni par delete-account. Avec l'index, chaque recherche est une lecture directe.
-- Rien d'autre ne change : ni ce qui est effacé, ni ce qui est détaché.
-- CONCURRENTLY : aucun verrou d'écriture pendant la construction. À lancer
-- SEUL (hors transaction) : `db query --linked -f` puis `migration repair`.
-- Inverse : DROP INDEX CONCURRENTLY IF EXISTS public.vinted_listing_snapshots_inventaire_idx;
CREATE INDEX CONCURRENTLY IF NOT EXISTS vinted_listing_snapshots_inventaire_idx
  ON public.vinted_listing_snapshots (inventaire_id);
