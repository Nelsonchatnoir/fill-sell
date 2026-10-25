-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 (a) — chaouidz, republication Beebs 8a608034 « basket Nike noir et blanche taille 18 1/2 »
-- (annonce 32089448, toujours en ligne). ÉCRIT, NON LANCÉ.
-- ═══════════════════════════════════════════════════════════════════════════
-- Beebs n'a RIEN refusé : la copie (snapshot v2 du relevé 89beeeb5, aucune capture de l'annonce) n'avait pas de
-- rayon ; le pré-vol (25/10 02:24, AVANT tout retrait) s'est arrêté sur « le rayon Beebs », le moteur sans genre a
-- posé une question à 579 feuilles sous un message faux (« Beebs n'accepte plus la catégorie… »). Le rayon se lit
-- sur l'annonce elle-même : page publique https://www.beebs.app/fr/p/32089448 relevée le 25/10 au matin,
-- BreadcrumbList ld+json « Accueil › Mode › Garçon › Chaussures (garçon) › Baskets (garçon) », InStock, 15 €
-- (feuille connue de l'arbre Beebs, src/utils/arbres/beebsFeuilles.js). Règle corrigée pour tous : l'extension
-- reprend ce fil d'Ariane quand la copie n'a pas de rayon (reprendreChampsDeLAnnonce), le message d'un rayon absent
-- est vrai (_shared/rayon-refuse-moteur.js, raison rayon_absent_de_la_copie).
-- Ce script : le rayon OBSERVÉ est posé là où l'extension le lit (beebsCategoryPath), la question est levée comme
-- le fait le service des jobs après une réponse (pfApresRayon : needsUserField, champs_a_completer,
-- needs_user_source, republish_prevol_manquants, needs_user_sans_motif… retirés ; compteurs d'attente remis à zéro
-- comme « ✋ Compléter ») — SANS needsUserResolved : ce n'est pas une réponse de la personne. Le job repart en file à
-- la MÊME étape (« captured ») : le pré-vol de la copie puis le pré-vol complet (vrai formulaire, catégorie comprise)
-- refont leur contrôle AVANT tout retrait. Rien n'est publié ni retiré par ce script ; aucun mail ; aucun quota.
-- Sauvegarde : _backup_2510_rayon_beebs_8a608034 (RLS, aucun droit). Inverse : 20261025_rayon_beebs_8a608034_INVERSE.sql.
-- Essai à blanc : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_rayon_beebs_8a608034 AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_rayon_beebs_8a608034 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_rayon_beebs_8a608034 FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2510_rayon_beebs_8a608034 SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3' AND c.user_id = '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3'
   AND c.status = 'needs_user';
DO $$
DECLARE n integer;
BEGIN
  IF (SELECT count(*) FROM public._backup_2510_rayon_beebs_8a608034 WHERE id = '8a608034-6cce-4b78-b924-5e0097c1fcf3') <> 1 THEN
    RAISE EXCEPTION 'sauvegarde : 1 ligne attendue (job needs_user) — rien n''est fait';
  END IF;
  UPDATE public.cross_post_jobs c
     SET status = 'pending',
         error = NULL,
         platform_fields = (c.platform_fields
             - 'needsUserField' - 'needsUserFields' - 'needs_user_source' - 'needsUserBoucle' - 'champs_a_completer'
             - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
             - 'needs_user_sans_motif' - 'republish_prevol_manquants' - 'rayonChoisi' - 'categoryLevelChoice'
             - 'next_action_after' - 'processing_since')
           || jsonb_build_object(
                'beebsCategoryPath', jsonb_build_array('Mode', 'Garçon', 'Chaussures (garçon)', 'Baskets (garçon)'),
                'needsUserAttempts', 0,
                'rayon_moteur', jsonb_build_object(
                  'plateforme', 'beebs', 'base', '[]'::jsonb,
                  'chemin', jsonb_build_array('Mode', 'Garçon', 'Chaussures (garçon)', 'Baskets (garçon)'),
                  'id', NULL, 'source', 'annonce_d_origine', 'par', 'scripts/reparations/20261025_rayon_beebs_8a608034.sql',
                  'le', now(), 'avant', c.platform_fields->'rayon_moteur'),
                'rayon_repris_de_l_annonce', jsonb_build_object(
                  'chemin', jsonb_build_array('Mode', 'Garçon', 'Chaussures (garçon)', 'Baskets (garçon)'),
                  'source', 'fil d''Ariane (ld+json) de l''annonce en ligne 32089448, relevé le 25/10 au matin (Accueil › Mode › Garçon › Chaussures (garçon) › Baskets (garçon), InStock, 15 €)',
                  'le', now(), 'pose_par', 'scripts/reparations/20261025_rayon_beebs_8a608034.sql'),
                'erreurs_archivees', COALESCE(CASE WHEN jsonb_typeof(c.platform_fields->'erreurs_archivees') = 'array'
                                                   THEN c.platform_fields->'erreurs_archivees' END, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('le', now(), 'statut', c.status, 'erreur', left(c.error, 600),
                                                          'par', 'réparation 25/10 : rayon Beebs repris de l''annonce en ligne, question levée')))
   WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3' AND c.user_id = '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3'
     AND c.status = 'needs_user' AND c.platform = 'beebs' AND c.action = 'republish'
     AND c.platform_listing_id = '32089448'
     AND c.platform_fields->>'republish_step' = 'captured'
     AND c.platform_fields->'needsUserField'->>'field_key' = 'rayonChoisi'
     AND NOT (c.platform_fields ? 'beebsCategoryPath')
     AND NOT (c.platform_fields ? 'deleted_at');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job (needs_user, étape captured, question rayonChoisi, sans rayon), obtenu % — rien n''est fait', n; END IF;
END $$;
-- Relecture : le rayon posé, la question levée, l'étape inchangée, aucun mail parti.
SELECT c.id, c.status, c.error, c.platform_fields->'beebsCategoryPath' AS rayon, c.platform_fields->>'republish_step' AS etape,
       c.platform_fields ? 'needsUserField' AS question, c.platform_fields ? 'republish_prevol_manquants' AS manquants,
       c.platform_fields->'rayon_moteur'->>'source' AS source_rayon,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3';
COMMIT;
