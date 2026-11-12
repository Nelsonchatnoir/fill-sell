-- INVERSE de supabase/migrations/20261112000000_profiles_cloud_formule.sql (12/11/2026) : la colonne retirée (sa contrainte
-- et son commentaire partent avec elle). ⚠ À jouer seulement APRÈS avoir redéployé les fonctions de paiement d'avant les
-- formules (elles n'écrivent pas cette colonne) : une fonction qui l'écrit échouerait sur une colonne absente.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cloud_formule;
