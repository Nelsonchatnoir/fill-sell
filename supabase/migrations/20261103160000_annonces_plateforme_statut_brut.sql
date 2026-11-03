-- ═══════════════════════════════════════════════════════════════════════════
-- LE STATUT BRUT D'UNE ANNONCE RELEVÉE (03/11, point 5 Leboncoin « déposée » — feu vert de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell prenait « numéro obtenu » pour « annonce en ligne » : chez Leboncoin, une annonce passe par la modération
-- (mesuré : jusqu'à 46 h), un brouillon Pro à payer, un refus — le relevé jetait ces états (« en_ligne » ou « inconnu »).
-- L'extension 0.6.170 écrit le statut BRUT de Leboncoin (champ `status` de la liste « Mes annonces ») dans cette colonne,
-- seulement si elle existe ; rien d'autre ne la lit encore (le statut FillSell `statut_plateforme` ne change pas). Le
-- comportement « déposée » (garde-fous de Nico, rapport docs/enquetes/six-points-0311/RAPPORT.md § 5) se pose quand les
-- valeurs sont mesurées. Ajout d'une colonne vide, sans défaut : aucune ligne réécrite.
-- Inverse : supabase/rollbacks/20261103160000_annonces_plateforme_statut_brut_INVERSE.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS statut_brut text;
COMMENT ON COLUMN public.annonces_plateforme.statut_brut IS
  'Statut brut de la plateforme lu par le relevé (Leboncoin : champ status de « Mes annonces »), tel quel. Écrit par l''extension ≥ 0.6.170. Jamais interprété ici.';
COMMIT;
