-- INVERSE de 20261116170000_ventes_beebs_historique : la fonction et son interrupteur disparaissent ; la base revient à
-- l'état d'avant (aucune autre fonction n'a été touchée par la migration).
--
-- ⚠️ DONNÉES : les ventes déjà créées par l'historique (plateforme_code = 'beebs', source = 'releve') RESTENT. Les retirer
-- est une décision de Nico, par le bloc commenté ci-dessous (journalisé dans ventes_suppressions_journal avec son motif ;
-- une suppression par le rôle postgres ne pose pas de pierre tombale ventes_supprimees : la lecture suivante d'une
-- 0.6.192 les recréerait si la fonction était remise). Rien d'autre à défaire : ni job, ni fiche, ni note n'a été écrit
-- (hors prix_vente vide d'une fiche déjà vendue, complété — gardé).

DROP FUNCTION IF EXISTS public.ventes_beebs_historique_noter(jsonb, jsonb);
DELETE FROM public.coin_config WHERE key = 'ventes_beebs_historique';

-- Sur décision de Nico seulement :
-- BEGIN;
-- SELECT set_config('fillsell.motif_suppression_ventes', 'inverse 20261116170000_ventes_beebs_historique', true);
-- DELETE FROM public.ventes WHERE plateforme_code = 'beebs' AND source = 'releve' AND releve_le >= '2026-11-16';
-- COMMIT;
