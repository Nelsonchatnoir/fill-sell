-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 nuit — sebbastien1, job Beebs 17715aee « Décoration black bass gravé fait à la main » (point 1c).
-- Cause prouvée (agent Beebs) : l'âge n'est PAS sur la fiche, et il n'a pas à y être — le rayon était faux. La fiche
-- est de la famille Lens « maison_deco » (« sculpture murale… décoration murale ») ; la résolution par le mot
-- « poisson bois gravé » (IA parmi 2 candidates, toutes deux des jouets) a choisi « Jeux, jouets et loisirs > Jeux
-- d'éveil > Jouets en bois », qui exige l'Âge. Règle corrigée pour tous dans l'app (familleFiltreDesCandidates, 7402d56).
-- Ce job : le rayon de ses 7 décorations murales du même type déjà publiées sur Beebs (dont la « Carpe en bois de
-- peuplier gravée », b01db3e7) — « Maison > Décoration > Décorations murales », qui n'exige ni âge (État, Format du
-- colis, Marque : présents sur le job). La question « Âge » est levée, le job repart UNE fois (relance après
-- correctif). Rien n'est publié par ce script ; aucun mail.
-- Sauvegarde : _backup_2510_sebbastien1_beebs_rayon. Inverse : 20261025_sebbastien1_beebs_rayon_deco_INVERSE.sql.
-- Essai à blanc : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_sebbastien1_beebs_rayon AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_sebbastien1_beebs_rayon ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_sebbastien1_beebs_rayon FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2510_sebbastien1_beebs_rayon SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id::text LIKE '17715aee%' AND c.user_id = '5848bc8f-52d7-4cd5-ae77-f46edb46c2e6' AND c.status = 'needs_user';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = 'pending',
         error = NULL,
         platform_fields = (c.platform_fields
             - 'needsUserField' - 'needsUserFields' - 'needs_user_source' - 'needsUserBoucle' - 'champs_a_completer'
             - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
             - 'needs_user_sans_motif' - 'next_action_after' - 'processing_since' - 'age')
           || jsonb_build_object(
                'beebsCategoryPath', jsonb_build_array('Maison', 'Décoration', 'Décorations murales'),
                'categorie_source', 'correction_famille_lens',
                'needsUserAttempts', 0,
                'rayon_corrige', jsonb_build_object(
                  'le', now(), 'avant', c.platform_fields->'beebsCategoryPath',
                  'apres', jsonb_build_array('Maison', 'Décoration', 'Décorations murales'),
                  'preuve', 'fiche de famille Lens maison_deco ; 7 décorations murales du compte publiées dans cette feuille Beebs (dont b01db3e7) ; la feuille jouets exigeait un âge',
                  'pose_par', 'scripts/reparations/20261025_sebbastien1_beebs_rayon_deco.sql (relance unique après correctif 7402d56)'),
                'erreurs_archivees', COALESCE(CASE WHEN jsonb_typeof(c.platform_fields->'erreurs_archivees') = 'array'
                                                   THEN c.platform_fields->'erreurs_archivees' END, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('le', now(), 'statut', c.status, 'erreur', left(c.error, 600),
                                                          'par', 'réparation 25/10 : rayon Beebs corrigé (famille Lens), question Âge levée')))
   WHERE c.id::text LIKE '17715aee%' AND c.user_id = '5848bc8f-52d7-4cd5-ae77-f46edb46c2e6' AND c.status = 'needs_user'
     AND c.platform = 'beebs' AND c.action = 'publish'
     AND c.platform_fields->'beebsCategoryPath' = '["Jeux, jouets et loisirs", "Jeux d''éveil", "Jouets en bois"]'::jsonb;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job, obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, c.platform_fields->'beebsCategoryPath' AS rayon, c.platform_fields ? 'needsUserField' AS question,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id::text LIKE '17715aee%';
COMMIT;
