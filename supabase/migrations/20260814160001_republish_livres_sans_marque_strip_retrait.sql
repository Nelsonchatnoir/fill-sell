-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ NE PAS APPLIQUER MAINTENANT ⛔
-- Retrait du pont temporaire « Livres Sans marque » posé par
-- 20260814160000_republish_livres_sans_marque_strip.sql.
--
-- À APPLIQUER UNIQUEMENT quand la 0.6.5 (no-op Marque, commit 401c649) est
-- ACCEPTÉE par le Chrome Web Store ET que le parc a basculé — vérifiable par
-- profiles.extension_build / cross_post_jobs.handler_build. Tant qu'un compte
-- actif reste en 0.6.2, le trigger le protège encore.
-- Idempotent : rejouable sans effet de bord.
-- ─────────────────────────────────────────────────────────────────────────────

drop trigger if exists trg_republish_livres_sans_marque_strip on public.vinted_republish_captures;
drop function if exists public.republish_livres_sans_marque_strip();
