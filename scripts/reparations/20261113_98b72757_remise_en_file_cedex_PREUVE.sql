-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PREUVE (lecture seule) de 20261113_98b72757_remise_en_file_cedex.sql — avant ET après, sans rien écrire
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Lu le 13/11 vers 07:10 (AVANT) : publications du 12/11 21:54 → 23:03 en 49308 : pending 12 · processing 0 ·
-- needs_user 0 · autres 6 (5 annulées à la demande, 1 arrêtée « exemplaire vendu ») · bloquees_par_3d 0 · remises_par_n6b 0
-- · servies_49300 0 · sauvegarde absente → le script ne trouverait rien (la règle N6b les servira d'elle-même).
-- À relire JUSTE AVANT de jouer le script (après le déploiement N6b) : bloquees_par_3d = ce que le script remettra en file.
-- ATTENDU APRÈS : bloquees_par_3d 0 · pending + remises_par_n6b = le nombre trouvé · sauvegarde présente.
-- À jouer : npx supabase db query --linked --read-only -f scripts/reparations/20261113_98b72757_remise_en_file_cedex_PREUVE.sql
SELECT
  count(*) FILTER (WHERE j.status = 'pending') AS pending,
  count(*) FILTER (WHERE j.status = 'processing') AS processing,
  count(*) FILTER (WHERE j.status = 'needs_user') AS needs_user,
  count(*) FILTER (WHERE j.status NOT IN ('pending', 'processing', 'needs_user')) AS autres,
  count(*) FILTER (WHERE j.status = 'needs_user' AND j.platform_fields ->> 'needs_user_source' = 'lbc_commune_code_postal') AS bloquees_par_3d,
  count(*) FILTER (WHERE j.platform_fields -> 'remise_en_file' ->> 'par' = 'réparation 20261113 N6b') AS remises_par_n6b,
  count(*) FILTER (WHERE j.platform_fields -> 'lbc_commune_meme_cp' ->> 'code_postal_servi' = '49300') AS servies_49300,
  to_regclass('public._backup_1311_98b72757_remise_en_file') IS NOT NULL AS sauvegarde_presente
FROM public.cross_post_jobs j
WHERE j.user_id = '98b72757-6cd6-4aaf-88f2-39533c71cbae'
  AND j.platform = 'leboncoin' AND j.action = 'publish'
  AND j.created_at >= '2026-11-12 21:54:00+01' AND j.created_at < '2026-11-12 23:04:00+01'
  AND j.platform_fields -> 'ville_publication_lbc' ->> 'code_postal' = '49308';
