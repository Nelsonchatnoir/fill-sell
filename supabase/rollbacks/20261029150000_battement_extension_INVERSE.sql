-- INVERSE de 20261029150000_battement_extension (point 5, 29/10/2026).
-- La fonction n'écrit que profiles.extension_last_seen_at et extension_postes[session] (déjà écrits par
-- get-pending-jobs) : la retirer ne laisse rien à défaire en données. Les extensions ≥ 0.6.153 qui l'appellent
-- reçoivent alors un 404, rattrapé sans effet (battement perdu, le poll suivant stampe la présence).
drop function if exists public.battement_extension(jsonb);
