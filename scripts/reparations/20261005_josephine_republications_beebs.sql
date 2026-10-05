-- RÉPARATION (05/10) — Joséphine (Joe0410, afeef3c7…) : republications Beebs
-- arrêtées à tort « FillSell n'a rien retiré » alors que NOTRE suppression
-- était partie (« Suppression envoyée à Beebs… » dans l'erreur archivée) :
-- l'annonce est hors de Beebs, le redépôt n'est jamais parti, l'article (en
-- stock) n'est plus en vente sur Beebs.
-- Relance à l'étape de vérification, servie SEULEMENT à un poste 0.6.97
-- (build_min_requis) : la 0.6.97 reconnaît la suppression déjà envoyée, PROUVE
-- l'absence (« Mes annonces », ou page 404 + hors vérification + hors index)
-- puis redépose. Le moindre doute : rien n'est redéposé.
-- Seuls les jobs dont la trace dit « Suppression envoyée » (e9986ca5,
-- interrompu, n'en a pas : laissé tel quel).
-- Inverse : 20261005_josephine_republications_beebs_INVERSE.sql
CREATE TABLE IF NOT EXISTS public._backup_0510_josephine_repub_beebs AS
  SELECT * FROM public.cross_post_jobs
   WHERE user_id = 'afeef3c7-0b0b-408c-a25b-3823448e3eb1' AND platform = 'beebs' AND action = 'republish'
     AND status = 'cancelled' AND created_at > '2026-10-02' AND error ILIKE '%rien retiré%'
     AND platform_fields::text ILIKE '%Suppression envoyée à Beebs%';
ALTER TABLE public._backup_0510_josephine_repub_beebs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0510_josephine_repub_beebs FROM anon, authenticated;

UPDATE public.cross_post_jobs c
   SET status = 'pending', error = NULL,
       platform_fields = (c.platform_fields - 'needsUserAttempts' - 'next_action_after' - 'processing_since')
         || jsonb_build_object('republish_step', 'a_capturer',
              'build_min_requis', '__BUILD_0697__',
              'relance_par', jsonb_build_object('le', now(), 'par', 'réparation 05/10 (suppression déjà envoyée, 0.6.97)'))
  FROM public._backup_0510_josephine_repub_beebs b
 WHERE c.id = b.id AND c.status = 'cancelled'
RETURNING c.id, c.platform_listing_id;
