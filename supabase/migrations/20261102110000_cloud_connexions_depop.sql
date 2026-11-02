-- ═══════════════════════════════════════════════════════════════════════════
-- FillSell Cloud — DEPOP DANS LE JOURNAL DES CONNEXIONS (proposée le 01/11, feu vert de Nico le 02/11)
--
-- Constat (essai du 01/11 au soir) : cloud_connexions_plateforme_check ne connaissait que vinted, leboncoin, beebs.
-- Les « Me connecter » Depop de Nico (21:17, 21:22) n'y avaient AUCUNE ligne : l'insertion était refusée sans bruit
-- (l'orchestrateur le dit depuis : « connexion_journal_echec »). Sans conséquence sur la connexion ni sur le coffre
-- (cloud_coffre connaît déjà depop) ; seule la trace manquait. Aucune ligne existante n'est touchée.
--
-- Inverse : supabase/rollbacks/20261102110000_cloud_connexions_depop_INVERSE.sql (les lignes Depop du journal partent).
SET lock_timeout = '5s';
BEGIN;
ALTER TABLE public.cloud_connexions DROP CONSTRAINT cloud_connexions_plateforme_check;
ALTER TABLE public.cloud_connexions ADD CONSTRAINT cloud_connexions_plateforme_check
  CHECK (plateforme = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'depop'::text]));
COMMIT;
