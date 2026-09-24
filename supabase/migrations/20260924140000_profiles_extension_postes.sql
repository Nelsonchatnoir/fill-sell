-- ═══════════════════════════════════════════════════════════════════════════
-- LE POSTE — UN COMPTE, PLUSIEURS CHROME (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis (Business), nuit du 23 au 24/09 : deux profils Chrome sur le même
-- compte, un seul avec la permission opla.co. Le profil sans accès parquait
-- chaque job Opla « Opla attend ton autorisation », l'autre le relançait au
-- réveil de son service worker : 131 parcages, 13 kits jamais partis.
-- Le serveur ne voyait qu'UN compte ; il voit désormais des POSTES, identifiés
-- par la session du JWT (claim session_id). Écrit par get-pending-jobs et
-- update-job-status (service role), lu par handler-watch.
-- Cf. supabase/functions/_shared/poste-extension.ts.
-- Appliquée en prod le 24/09/2026 (execute_sql), fichier pour la trace.
alter table public.profiles add column if not exists extension_postes jsonb;
comment on column public.profiles.extension_postes is 'Par session JWT de l''extension (= poste / profil Chrome) : { "<session_id>": { "opla_acces": true|false, "le": iso, "build": "...", "rearme_le": iso } }. Écrit par get-pending-jobs et update-job-status (service role), lu par handler-watch. Entrées vivantes 48 h. Cf. supabase/functions/_shared/poste-extension.ts (2026-09-24).';
