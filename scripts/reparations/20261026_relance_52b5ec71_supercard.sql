-- ═══════════════════════════════════════════════════════════════════════════
-- RELANCE 26/10 nuit (point 5) — xxewwer, 52b5ec71 « 🎮 WWE 2K20 – PS4 – » (Leboncoin, publication)
-- ═══════════════════════════════════════════════════════════════════════════
-- La cause est trouvée et corrigée à la règle : la modération de Leboncoin refuse « SuperCard » (essais T1 → T6 sur
-- le compte de Nico, 26/10 02:29 → 03:10, fiches TEST à 999 €, même rubrique, même texte : T1 tel quel REFUSÉ, T4
-- avec la seule ligne « ✅ Carte promotionnelle WWE SuperCard. » REFUSÉ, T5 « Carte promotionnelle » sans « WWE
-- SuperCard » accepté, T6 = le texte exact servi désormais pour ce job ACCEPTÉ). get-pending-jobs sert la copie
-- Leboncoin sans la phrase (_shared/description-leboncoin.ts, TERMES_MODERATION_LEBONCOIN) ; la fiche ne change pas.
-- Règle habituelle de relance : status pending ; retrait de error, needs_user_*, needsUser*, champs_a_completer,
-- next_action_after, error_technique, processing_since ; needsUserAttempts = 0 ; erreurs_archivees CONSERVÉ (le
-- message archivé) ; lbc_refus_contenu CONSERVÉ (les textes déjà refusés ne repartent jamais tels quels).
-- Un nouveau refus repasse en pause « FillSell s'en occupe » et réarme l'alerte au support (update-job-status).
-- Sauvegarde : _backup_2610_relance_52b5ec71 (RLS, aucun droit). Inverse : 20261026_relance_52b5ec71_supercard_INVERSE.sql.
-- Aucun mail, aucun quota touché, rien publié par ce script (l'extension de la personne dépose). Essai à blanc :
-- remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2610_relance_52b5ec71 AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2610_relance_52b5ec71 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2610_relance_52b5ec71 FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2610_relance_52b5ec71 SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = '52b5ec71-997c-400c-ae56-2e04b893256d' AND c.status = 'needs_user'
   AND c.platform_fields->>'needs_user_source' = 'lbc_moderation';
DO $$
DECLARE n integer;
BEGIN
  IF (SELECT count(*) FROM public._backup_2610_relance_52b5ec71 WHERE id = '52b5ec71-997c-400c-ae56-2e04b893256d') <> 1 THEN
    RAISE EXCEPTION 'sauvegarde : 1 ligne attendue (needs_user, pause lbc_moderation) — rien n''est fait';
  END IF;
  UPDATE public.cross_post_jobs c
     SET status = 'pending',
         error = NULL,
         platform_fields = (c.platform_fields
             - 'needsUserField' - 'needsUserFields' - 'needs_user_source' - 'needsUserBoucle' - 'champs_a_completer'
             - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
             - 'needs_user_sans_motif' - 'next_action_after' - 'processing_since' - 'error_technique')
           || jsonb_build_object(
                'needsUserAttempts', 0,
                'relance_regle_corrigee', jsonb_build_object('le', now(), 'par', 'scripts/reparations/20261026_relance_52b5ec71_supercard.sql',
                  'cause', 'point 5 : la modération Leboncoin refuse « SuperCard » — la phrase part de la copie servie (TERMES_MODERATION_LEBONCOIN)'),
                'erreurs_archivees', COALESCE(CASE WHEN jsonb_typeof(c.platform_fields->'erreurs_archivees') = 'array'
                                                   THEN c.platform_fields->'erreurs_archivees' END, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('le', now(), 'statut', c.status, 'erreur', left(c.error, 600),
                                                          'par', 'relance 26/10 nuit : cause corrigée à la règle (phrase « SuperCard » retirée de la copie Leboncoin)')))
   WHERE c.id = '52b5ec71-997c-400c-ae56-2e04b893256d'
     AND c.status = 'needs_user' AND c.action = 'publish' AND c.platform = 'leboncoin'
     AND c.platform_fields->>'needs_user_source' = 'lbc_moderation';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job (needs_user, pause lbc_moderation), obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.platform, c.status, c.error, c.platform_fields->'lbc_refus_contenu'->'empreintes' AS empreintes,
       c.platform_fields->>'needsUserAttempts' AS essais, jsonb_array_length(c.platform_fields->'erreurs_archivees') AS archives
  FROM public.cross_post_jobs c WHERE c.id = '52b5ec71-997c-400c-ae56-2e04b893256d';
COMMIT;
