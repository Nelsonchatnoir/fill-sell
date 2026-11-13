-- INVERSE de 20261113210000_comptes_plateformes (M1, étape 4 L1, 13/11/2026) : retire la table (son déclencheur et sa
-- policy partent avec elle). Rien d'autre ne la lit en base ; les fonctions edge déjà déployées retombent d'elles-mêmes
-- sur « table absente → rien » (aucune erreur) et etatPublic sur le site GetUser d'ebay_accounts.
-- Si le remplissage initial a été passé : jouer d'abord son inverse
-- (scripts/reparations/20261113_comptes_plateformes_remplissage_INVERSE.sql), qui retire aussi sa sauvegarde.
-- Les lignes écrites depuis par les fonctions sont perdues : elles se réécrivent à la prochaine lecture (liaison eBay,
-- sondes de l'extension).
-- Puis : npx supabase migration repair --linked --status reverted 20261113210000
DROP TABLE IF EXISTS public.comptes_plateformes;
