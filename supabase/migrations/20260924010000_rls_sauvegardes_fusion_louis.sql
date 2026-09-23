-- 24/09/2026 00:55 — RLS sur les trois sauvegardes de la fusion de Louis.
--
-- Ces tables (_backup_fusion_louis_2409_*) ont été créées en public sans RLS :
-- elles étaient donc lisibles par l'API avec la clé anon / un JWT ordinaire.
-- On active la RLS SANS créer de politique : plus personne ne les lit par
-- l'API, seul le rôle service (ou une session SQL) y accède. Elles restent
-- en place : c'est la sauvegarde de la fusion, réversible par
-- inventaire_defusionner. Ne pas les supprimer.
--
-- Appliquée en prod le 24/09/2026 à 00:55 (ALTER TABLE direct), fichier posé
-- pour la trace. Idempotente.
alter table if exists public._backup_fusion_louis_2409_inventaire enable row level security;
alter table if exists public._backup_fusion_louis_2409_jobs        enable row level security;
alter table if exists public._backup_fusion_louis_2409_annonces    enable row level security;
