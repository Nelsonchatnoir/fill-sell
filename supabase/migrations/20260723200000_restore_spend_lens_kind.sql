-- ── Répare le CHECK de coin_ledger.kind : 'spend_lens' perdu le 23/07 ────────
-- La migration top-up (20260723150000) a réécrit la contrainte depuis la liste
-- du fichier foundations sans voir que 20260706300000_lens_overflow_coins.sql
-- avait ajouté 'spend_lens' en prod : depuis, tout débit Lens overflow levait
-- une violation de contrainte (rollback complet, aucune Pépite perdue, mais
-- analyse refusée). Impact réel : nul (0 ligne spend_lens jamais écrite).
-- Leçon gravée : lire pg_get_constraintdef LIVE avant de réécrire un CHECK.
ALTER TABLE public.coin_ledger DROP CONSTRAINT IF EXISTS coin_ledger_kind_check;
ALTER TABLE public.coin_ledger ADD CONSTRAINT coin_ledger_kind_check
  CHECK (kind IN ('grant_monthly','grant_upgrade','purchase','spend_publish','spend_lens','refund','admin'));
