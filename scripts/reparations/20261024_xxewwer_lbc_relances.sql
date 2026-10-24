-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 soir (lot « zéro blocage », A4) — xxewwer : 5 republications Leboncoin « introuvable à confirmer »
-- RELANCÉES (pending, étape a_capturer). Même cause et même geste que e104cacb (script
-- 20261024_zero_blocage_clotures_et_relances.sql) : la lecture rendait « plus en ligne » depuis la mémoire « annonce
-- morte » de l'extension, que le poste (0.6.131) a oubliée depuis — son veilleur relit ces annonces « active » ; le
-- relevé complet du 22/10 22:31 les voit en ligne sous leur numéro exact. Le contrôle avant retrait reste : rien
-- n'est retiré si la lecture ne rend pas l'annonce.
-- Sauvegarde : _backup_2410_zero_blocage_jobs. Inverse : …_INVERSE.sql. Aucun mail, aucune notification.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_zero_blocage_jobs AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_zero_blocage_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_zero_blocage_jobs FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_zero_blocage_jobs SELECT now(), c.* FROM public.cross_post_jobs c WHERE c.id IN ('248dcbf3-b44b-42b6-bc3d-e965aa68afb5', 'ba629cd2-dc0e-4604-97b5-76dabe9e6060', '8ca2071f-e6a2-4f55-b83b-51f1b34df5d1', '9ed000c9-390f-45b8-8aaa-22ba29ce6bd4', '8b8a1d62-5a3c-402a-84de-de8afc1e6207');
DO $$
DECLARE n integer;
  v_trace jsonb := jsonb_build_object('le', now(), 'par', 'Claude — lot « zéro blocage » (24/10 soir)', 'pose_par', 'scripts/reparations/20261024_xxewwer_lbc_relances.sql');
BEGIN
  UPDATE public.cross_post_jobs
     SET status = 'pending', error = NULL,
         platform_fields = (platform_fields - 'needs_user_source' - 'next_action_after' - 'processing_since' - 'needsUserAttempts'
                              - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'introuvable_404')
           || jsonb_build_object(
                'introuvable_a_confirmer', coalesce(platform_fields -> 'introuvable_a_confirmer', '{}'::jsonb)
                    || jsonb_build_object('reprises', 0, 'dementi_le', now(), 'dementi_par', 'relevé en ligne, mémoire « annonce morte » oubliée par le poste (0.6.131)'),
                'relance_support', v_trace || jsonb_build_object('cause', 'mémoire « annonce morte » de l''extension, oubliée depuis par le poste'),
                'erreurs_archivees', coalesce(CASE WHEN jsonb_typeof(platform_fields -> 'erreurs_archivees') = 'array' THEN platform_fields -> 'erreurs_archivees' END, '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object('le', now(), 'statut', status, 'erreur', left(btrim(coalesce(error, '')), 600), 'par', 'relance support (lot zéro blocage)')))
   WHERE id IN ('248dcbf3-b44b-42b6-bc3d-e965aa68afb5', 'ba629cd2-dc0e-4604-97b5-76dabe9e6060', '8ca2071f-e6a2-4f55-b83b-51f1b34df5d1', '9ed000c9-390f-45b8-8aaa-22ba29ce6bd4', '8b8a1d62-5a3c-402a-84de-de8afc1e6207')
     AND platform = 'leboncoin' AND action = 'republish' AND status = 'needs_user'
     AND platform_fields ->> 'needs_user_source' = 'introuvable_a_confirmer'
     AND coalesce(platform_fields ->> 'republish_step', 'a_capturer') = 'a_capturer';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 5 THEN RAISE EXCEPTION 'xxewwer : % ligne(s) au lieu de 5 — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id IN ('248dcbf3-b44b-42b6-bc3d-e965aa68afb5', 'ba629cd2-dc0e-4604-97b5-76dabe9e6060', '8ca2071f-e6a2-4f55-b83b-51f1b34df5d1', '9ed000c9-390f-45b8-8aaa-22ba29ce6bd4', '8b8a1d62-5a3c-402a-84de-de8afc1e6207');
COMMIT;
