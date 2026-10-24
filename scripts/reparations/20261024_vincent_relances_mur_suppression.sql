-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 soir — vincent.armengol : 4 republications Vinted « en pause » depuis 14:09, RELANCÉES (pending,
-- étape « captured » gardée : rien n'a été retiré, le contrôle avant retrait rejoue tout).
-- Cause : l'API de suppression de Vinted a répondu par un mur passager, lu « Connexion Vinted requise » ; la branche
-- « suppression refusée » écrivait needs_user « Relance depuis l'app quand tu veux » au lieu d'arbitrer le mur.
-- Preuve que la cause est levée : le compte a publié 14 annonces Vinted APRÈS ces 4 jobs (session vivante).
-- Règle corrigée : extension 0.6.139 (mur arbitré : refus passager ou attente de session, jamais needs_user) ;
-- selftest mur-suppression-arbitre.
-- Sauvegarde : _backup_2410_vincent_relances. Inverse : 20261024_vincent_relances_mur_suppression_INVERSE.sql.
-- Aucun mail, aucune notification.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_vincent_relances AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_vincent_relances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_vincent_relances FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_vincent_relances SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id IN ('e99f33cc-b422-47bc-a20b-e6bffe69850b', '2395e70e-41a9-4e67-add8-90faabcf55e9',
                'cddaa3cc-1129-457c-8eee-06bbc202e626', '1d3f4101-703e-47d3-a939-452a704493af');
DO $$
DECLARE n integer;
  v_trace jsonb := jsonb_build_object('le', now(), 'par', 'Claude — 24/10 soir (liste de Nico)', 'pose_par',
    'scripts/reparations/20261024_vincent_relances_mur_suppression.sql',
    'cause', 'mur passager de l''API de suppression lu « Connexion Vinted requise » ; 14 publications Vinted du compte ensuite');
BEGIN
  UPDATE public.cross_post_jobs
     SET status = 'pending', error = NULL,
         platform_fields = (platform_fields - 'needs_user_source' - 'next_action_after' - 'processing_since' - 'needsUserAttempts'
                              - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur')
           || jsonb_build_object('relance_support', v_trace,
                'erreurs_archivees', coalesce(CASE WHEN jsonb_typeof(platform_fields -> 'erreurs_archivees') = 'array' THEN platform_fields -> 'erreurs_archivees' END, '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object('le', now(), 'statut', status, 'erreur', left(btrim(coalesce(error, '')), 600), 'par', 'relance support (24/10 soir)')))
   WHERE id IN ('e99f33cc-b422-47bc-a20b-e6bffe69850b', '2395e70e-41a9-4e67-add8-90faabcf55e9',
                'cddaa3cc-1129-457c-8eee-06bbc202e626', '1d3f4101-703e-47d3-a939-452a704493af')
     AND user_id = '67a8b907-29dd-4454-9d40-db8dd9107236'
     AND platform = 'vinted' AND action = 'republish' AND status = 'needs_user'
     AND platform_fields ->> 'needs_user_source' = 'relancer'
     AND platform_fields ->> 'republish_step' = 'captured'
     AND error LIKE 'Republication en pause avant toute suppression%Connexion Vinted requise%';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'vincent.armengol : % ligne(s) au lieu de 4 — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, c.platform_fields ->> 'republish_step' AS etape,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c
 WHERE c.id IN ('e99f33cc-b422-47bc-a20b-e6bffe69850b', '2395e70e-41a9-4e67-add8-90faabcf55e9',
                'cddaa3cc-1129-457c-8eee-06bbc202e626', '1d3f4101-703e-47d3-a939-452a704493af');
COMMIT;
