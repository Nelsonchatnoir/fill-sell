-- ── ventes : policy UPDATE manquante + colonne selling_fees (14/08, RoCotCot)
-- RLS actif sur `ventes` avec select/insert/delete own mais AUCUNE policy
-- UPDATE : tout update PostgREST rendait 0 ligne SANS erreur — la branche
-- d'édition de vente (App.jsx, _table:'ventes', 03/08) n'a JAMAIS fonctionné
-- (« Vente introuvable » pour tout le monde). Vérifié dans pg_policy le
-- 14/08, contre-vérifié par Nico.
-- selling_fees : le champ « frais » de la modale entrait dans le calcul du
-- bénéfice sans être persisté nulle part (et l'ouvreur reposait 0 en dur) —
-- les frais s'évaporaient à la ré-édition. L'import CSV (App.jsx:3183)
-- envoyait déjà cette colonne : ses inserts avec frais échouaient aussi.
-- AUCUN backfill : les ventes existantes restent telles quelles (consigne
-- Nico 14/08). Idempotente : rejouable sans effet.

DROP POLICY IF EXISTS "update own" ON public.ventes;
CREATE POLICY "update own" ON public.ventes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.ventes
  ADD COLUMN IF NOT EXISTS selling_fees numeric;

-- Grants de table déjà en place (SELECT/INSERT/UPDATE/DELETE authenticated,
-- vérifiés le 14/08) — re-posés pour couvrir explicitement la colonne neuve.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventes TO authenticated;
