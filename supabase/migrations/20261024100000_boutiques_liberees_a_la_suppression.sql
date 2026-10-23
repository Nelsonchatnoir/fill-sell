-- ═══════════════════════════════════════════════════════════════════════════
-- LA SUPPRESSION D'UN COMPTE LIBÈRE SES BOUTIQUES (24/10, point 8 du lot de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ : boutiques_plateforme (une boutique de plateforme = un seul compte FillSell, 18/10) n'avait
-- AUCUN lien vers le compte. Un compte supprimé (delete-account, ou depuis le tableau de bord) gardait sa
-- réservation : le 21/10, reglox560 recréé n'a pas pu importer sa boutique Vinted (« déjà suivie par un autre compte
-- FillSell » — le compte supprimé). Relu le 23/10 à 21:00 : 7 réservations orphelines, toutes Vinted
-- (15685736, 28713404, 277637638, 393141, 282387723, 3139310768, 32668712), 5 comptes supprimés.
-- LA RÈGLE (toutes plateformes, toutes les voies de suppression) : la réservation suit le compte.
--   · boutiques_plateforme.user_id → auth.users(id) ON DELETE CASCADE : quel que soit le chemin (delete-account,
--     tableau de bord, admin), la boutique se libère dans la même transaction que la suppression du compte ;
--   · même règle pour les deux tables qui relient deux comptes entre eux (comptes_lies, fiches_liees_comptes) :
--     jamais un lien vers un compte qui n'existe plus (aucune orpheline aujourd'hui) ;
--   · les orphelines existantes sont sauvegardées (table protégée : RLS, aucun accès client), puis libérées.
-- Rien d'autre ne bouge : aucune fiche, aucune annonce, aucun job ; les comptes vivants gardent leurs boutiques.
-- Inverse : supabase/rollbacks/20261024100000_boutiques_liberees_a_la_suppression_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- 1. Sauvegarde des réservations orphelines (née protégée : RLS, aucun droit client).
CREATE TABLE IF NOT EXISTS public._backup_2410_boutiques_orphelines AS
  SELECT b.*, now() AS sauvegarde_le
    FROM public.boutiques_plateforme b
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.user_id);
ALTER TABLE public._backup_2410_boutiques_orphelines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_2410_boutiques_orphelines FROM anon, authenticated;

-- 2. Les orphelines sont libérées (leur compte n'existe plus).
DELETE FROM public.boutiques_plateforme b
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = b.user_id);

-- 3. La règle : la réservation suit le compte.
ALTER TABLE public.boutiques_plateforme
  ADD CONSTRAINT boutiques_plateforme_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.comptes_lies
  ADD CONSTRAINT comptes_lies_user_a_fkey FOREIGN KEY (user_a) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT comptes_lies_user_b_fkey FOREIGN KEY (user_b) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.fiches_liees_comptes
  ADD CONSTRAINT fiches_liees_comptes_user_a_fkey FOREIGN KEY (user_a) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fiches_liees_comptes_user_b_fkey FOREIGN KEY (user_b) REFERENCES auth.users(id) ON DELETE CASCADE;
-- Index : boutiques_plateforme_user_idx (user_id) existe déjà ; comptes_lies (1 ligne) et fiches_liees_comptes
-- (195 lignes) se parcourent en entier à la suppression d'un compte sans coût mesurable : aucun index ajouté.

COMMIT;
