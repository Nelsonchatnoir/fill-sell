-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION (09/10, chantier A) — ⛔ NON EXÉCUTÉE, SUR GO DE NICO SEULEMENT
-- ═══════════════════════════════════════════════════════════════════════════
-- La fausse vente 108675 de Marta (enchère eBay 920016444915, job 3a4dd818) a
-- été annulée à la main le 09/10 (vente supprimée, fiche et job remis), mais
-- son REÇU est resté : ventes_operations (cle « annonce:ebay:920016444915 »,
-- resultat ok/venteCreated). enregistrer_vente_atomique rejoue tout reçu
-- existant (« rejouee ») sans rien écrire : si l'enchère trouve un acheteur
-- (fin le 14/10, ou « Achat immédiat » à tout moment), le veilleur eBay lira
-- la vente, l'enregistrement rendra l'ancien reçu… et AUCUNE vente ne sera
-- écrite (stock jamais décompté). Prouvé le 09/10 en transaction annulée
-- (scripts/preuves/preuve-vente-annonce-en-ligne.mjs : sans écarter ce reçu,
-- les cas 1, 2 et 5 rendent « ok » sans vente).
-- Le geste : renommer la clé du reçu (gardé pour l'historique), rien d'autre.
-- Sauvegarde d'abord ; inverse en bas.

BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0910_marta_recu AS
  SELECT o.*, now() AS sauve_le FROM public.ventes_operations o
   WHERE o.user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3' AND o.cle = 'annonce:ebay:920016444915';
UPDATE public.ventes_operations
   SET cle = 'annulee_0910:annonce:ebay:920016444915'
 WHERE user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3' AND cle = 'annonce:ebay:920016444915';
-- Le job garde « vente_operation_cle » ? (posé par la vente annulée) : il est retiré.
UPDATE public.cross_post_jobs
   SET platform_fields = platform_fields - 'vente_operation_cle'
 WHERE id = '3a4dd818-b4e9-4c32-9017-daf8fd5638c5' AND status = 'published'
   AND platform_fields ->> 'vente_operation_cle' = 'annonce:ebay:920016444915';
SELECT cle FROM public.ventes_operations WHERE user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3';
COMMIT;

-- INVERSE (à lancer seul, sur décision) :
-- UPDATE public.ventes_operations SET cle = 'annonce:ebay:920016444915'
--  WHERE user_id = 'ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3' AND cle = 'annulee_0910:annonce:ebay:920016444915';
-- UPDATE public.cross_post_jobs SET platform_fields = platform_fields || jsonb_build_object('vente_operation_cle','annonce:ebay:920016444915')
--  WHERE id = '3a4dd818-b4e9-4c32-9017-daf8fd5638c5';
