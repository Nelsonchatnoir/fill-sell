-- (21/11/2026 après-midi, décision de Nico, point 1) LES TÂCHES BLOQUÉES SUR UN « CONNECTE-TOI » QUE LA PLATEFORME N'A PAS DIT.
-- Règle (extension 0.6.197, update-job-status, _shared/verdict-session.js) : « connecte-toi » seulement si la session a été
-- lue PERDUE sur la vraie plateforme, sur le moment. Les tâches qui portent aujourd'hui ce message sans cette preuve sont
-- RELANCÉES : pending, message retiré, attente retirée, tentative intacte, échéance tout de suite — l'extension relit alors
-- la session sur la plateforme avant de les traiter (bonne : elles partent ; perdue : le message revient, à juste titre).
-- Sélection (règle, pas une liste) : tâches ouvertes (pending / needs_user) de moins de 14 jours dont le message est un
-- « connecte-toi » (« En attente de ta connexion à … » ou « Connexion X requise … »), sur un compte ACTIF (extension vue
-- depuis 72 h) dont la dernière sonde de cette plateforme ne dit PAS « déconnecté » ; un compte au Cloud seulement si sa
-- plateforme y est connectée (sinon « pas encore connecté au Cloud » est la vérité). eBay garde sa règle (sonde confirmée).
-- Aucun mail, aucune notification. Sauvegarde : _backup_2111_taches_connecte_toi ; inverse : …_INVERSE.sql.
-- Lancer : npx supabase db query --remote --yes -f scripts/reparations/20261121_taches_connecte_toi_relance.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_2111_taches_connecte_toi AS
  SELECT now() AS le, j.id, j.user_id, j.platform, j.action, j.status, j.error, j.platform_fields
    FROM public.cross_post_jobs j
    JOIN public.profiles p ON p.id = j.user_id
   WHERE j.status IN ('pending', 'needs_user')
     AND j.created_at > now() - interval '14 days'
     AND j.platform IN ('vinted', 'leboncoin', 'beebs', 'depop')
     AND (j.error ILIKE 'En attente de ta connexion à%' OR j.error ~* '^Connexion \S+ requise')
     AND p.extension_last_seen_at > now() - interval '72 hours'
     AND COALESCE(p.extension_sessions ->> j.platform, '') <> 'false'
     AND (p.cloud_voie IS NOT TRUE
          OR EXISTS (SELECT 1 FROM public.cloud_coffre c WHERE c.user_id = j.user_id AND c.plateforme = j.platform AND c.connecte));
ALTER TABLE public._backup_2111_taches_connecte_toi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_taches_connecte_toi FROM PUBLIC, anon, authenticated;
DO $$ DECLARE n int := (SELECT count(*) FROM public._backup_2111_taches_connecte_toi);
BEGIN IF n > 40 THEN RAISE EXCEPTION 'tâches à relancer : % (au-delà de 40, relire avant)', n; END IF; END $$;
UPDATE public.cross_post_jobs j
   SET status = 'pending', error = NULL,
       platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb) - 'attente_session' - 'next_action_after')
         || jsonb_build_object('relance_connecte_toi', jsonb_build_object('le', now(), 'par', 'réparation du 21/11 (point 1 de Nico)',
              'message_avant', left(b.error, 200), 'statut_avant', b.status))
  FROM public._backup_2111_taches_connecte_toi b
 WHERE j.id = b.id AND j.status = b.status;
SELECT left(b.user_id::text, 8) AS compte, b.platform, b.action, b.status AS avant, j.status AS apres, count(*) AS n
  FROM public._backup_2111_taches_connecte_toi b JOIN public.cross_post_jobs j ON j.id = b.id
 GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2;
COMMIT;
