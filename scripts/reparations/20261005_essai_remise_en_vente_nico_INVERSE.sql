-- INVERSE de l'essai du 05/10 (compte de Nico, fiche de test 1791142468699).
-- ⚠️ Retirer d'abord les annonces Vinted de l'essai (jobs 'essai_0510' /
-- 'remise_en_vente' de cette fiche) par des retraits, puis :
UPDATE public.inventaire i SET quantite = s.quantite, statut = s.statut
  FROM public._essai_0510_remise_fiche s WHERE i.id = s.id;
DELETE FROM public.ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
  AND inventaire_id = 1791142468699 AND created_at >= '2026-10-05';
DELETE FROM public.ventes_operations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
  AND inventaire_id = 1791142468699 AND created_at >= '2026-10-05';
