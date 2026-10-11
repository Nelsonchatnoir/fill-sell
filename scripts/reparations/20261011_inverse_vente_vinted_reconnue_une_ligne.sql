-- INVERSE de supabase/migrations/20261011120000_vente_vinted_reconnue_une_ligne.sql
-- ⚠️ Rejouer cet inverse RÉTABLIT le défaut du 09/10 : tout signal de vente
-- Vinted posé par l'extension retombe en 403 (_ts_ou_null fermée à
-- authenticated) et la fiche repasse « vendu » sans ligne de vente.
--   npx supabase db query --linked -f scripts/reparations/20261011_inverse_vente_vinted_reconnue_une_ligne.sql
DROP TRIGGER IF EXISTS inventaire_0_vendu_vinted_par_la_vente ON public.inventaire;
DROP FUNCTION IF EXISTS public.inventaire_vendu_vinted_par_la_vente();
ALTER FUNCTION public.vinted_preuve_page_veilleur() SECURITY INVOKER;
