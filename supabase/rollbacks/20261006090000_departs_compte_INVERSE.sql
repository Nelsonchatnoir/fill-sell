-- Inverse de 20261006090000_departs_compte.sql.
-- ⚠️ Efface les réponses de départ déjà reçues : les sauvegarder d'abord
--   (select * from public.departs_compte) si la table en contient.
-- L'app reste sûre sans la fonction : l'appel échoue, la suppression du compte
-- continue (src/compte/supprimerCompte.js).
BEGIN;
DROP FUNCTION IF EXISTS public.enregistrer_depart(text, text, text, text);
DROP TABLE IF EXISTS public.departs_compte_garde;
DROP TABLE IF EXISTS public.departs_compte;
COMMIT;
-- Index du 06/10 (un par fichier, hors transaction) :
-- DROP INDEX CONCURRENTLY IF EXISTS public.vinted_listing_snapshots_inventaire_idx;
-- DROP INDEX CONCURRENTLY IF EXISTS public.rapprochements_inventaire_idx;
-- DROP INDEX CONCURRENTLY IF EXISTS public.vinted_republish_captures_inventaire_idx;
