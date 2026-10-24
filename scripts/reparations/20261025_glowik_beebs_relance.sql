-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 nuit — Glowik, republication Beebs 6d95f4eb « Gomme de musculation » (point 1c). Relance UNIQUE
-- après correctif (get-pending-jobs, 7402d56 : « une republication Beebs dont le lien et la copie désignent deux
-- annonces »).
-- Prouvé (agent Beebs + relu le 25/10 01:2x) : l'annonce 34119130 est EN LIGNE et rattachée à CE job (ligne de relevé
-- job_id = 6d95f4eb, vue le 24/10 02:37) — mise en ligne par lui le 06/10 ; l'ancienne 33946058 est datée disparue.
-- Mais sa copie (republish_snapshot, du 30/09) désignait encore 33946058 : l'extension voyait deux identifiants et
-- s'abstenait (« pas encore rattaché par le relevé », faux) — 5 essais, puis needs_user « relancer ».
-- Ce script ne fait que remettre le job en file (pending), comme « Relancer » : au service, get-pending-jobs réaligne
-- la copie sur 34119130 (preuve du relevé), revient à « a_capturer », et l'annonce est relue avant tout retrait.
-- Rien n'est retiré ni publié par ce script ; aucun mail.
-- Sauvegarde : _backup_2510_glowik_beebs. Inverse : 20261025_glowik_beebs_relance_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_glowik_beebs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_glowik_beebs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_glowik_beebs FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2510_glowik_beebs SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id::text LIKE '6d95f4eb%' AND c.user_id = '869e5f03-d746-417e-b567-3f9fff438474' AND c.status = 'needs_user';
DO $$
DECLARE n integer;
BEGIN
  -- La preuve, relue AU MOMENT du geste : l'annonce du job en ligne et à lui, l'ancienne disparue.
  IF NOT EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.user_id = '869e5f03-d746-417e-b567-3f9fff438474'
                   AND a.platform = 'beebs' AND a.listing_id = '34119130' AND a.job_id::text LIKE '6d95f4eb%'
                   AND a.disparu_le IS NULL AND a.retiree_le IS NULL)
     OR EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.user_id = '869e5f03-d746-417e-b567-3f9fff438474'
                   AND a.platform = 'beebs' AND a.listing_id = '33946058' AND a.disparu_le IS NULL AND a.retiree_le IS NULL) THEN
    RAISE EXCEPTION 'preuve du relevé absente — rien n''est fait';
  END IF;
  UPDATE public.cross_post_jobs c
     SET status = 'pending', error = NULL,
         platform_fields = (c.platform_fields - 'needs_user_source' - 'needsUserField' - 'needs_user_tick_le'
             - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'next_action_after' - 'processing_since')
           || jsonb_build_object('needsUserAttempts', 0,
                'relance_apres_correctif', jsonb_build_object('le', now(), 'correctif', '7402d56 (copie réalignée sur preuve du relevé)',
                  'pose_par', 'scripts/reparations/20261025_glowik_beebs_relance.sql'),
                'erreurs_archivees', COALESCE(CASE WHEN jsonb_typeof(c.platform_fields->'erreurs_archivees') = 'array'
                                                   THEN c.platform_fields->'erreurs_archivees' END, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('le', now(), 'statut', c.status, 'erreur', left(c.error, 600),
                                                          'par', 'réparation 25/10 : relance unique après correctif (copie Beebs réalignée)')))
   WHERE c.id::text LIKE '6d95f4eb%' AND c.user_id = '869e5f03-d746-417e-b567-3f9fff438474' AND c.status = 'needs_user'
     AND c.platform = 'beebs' AND c.action = 'republish' AND c.platform_fields->>'republish_step' = 'captured'
     AND NOT (c.platform_fields ? 'deleted_at');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job, obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, c.platform_fields->>'republish_step' AS etape,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id::text LIKE '6d95f4eb%';
COMMIT;
