-- 25/10 ~11:30 Paris — chaouidz (90ace0e4), republication Beebs 8a608034 « basket Nike noir et blanche taille 18 1/2 »
-- (annonce 32089448, en ligne, étape « captured » : rien retiré). Le rayon est posé (réponse de la personne :
-- « Mode › Garçon › Chaussures (garçon) › Baskets (garçon) », le rayon même de l'annonce) ; le pré-vol demande
-- maintenant « Fermeture » (aucune valeur certaine dans la copie, venue d'un relevé). L'annonce en ligne l'ÉCRIT :
-- page publique https://www.beebs.app/fr/p/32089448 relue le 25/10 au matin — « Marque Nike · Pointure 18 · Couleur
-- Noir · État Neuf, avec étiquette · Fermeture À enfiler ». Règle corrigée pour tous (extension 0.6.143 :
-- capturerFicheEnPage garde chaque ligne libellé / valeur, reprendreChampsDeLAnnonce comble les attributs Beebs
-- VIDES) ; ce script pose la valeur LUE dans beebsAspects (là où le connecteur la lit) et lève la question, sans
-- needsUserResolved (ce n'est pas une réponse de la personne). Étape inchangée : les pré-vols refont leur contrôle
-- AVANT tout retrait. Aucun mail, aucun quota. Sauvegarde _backup_2510_chaouidz_fermeture ; inverse à côté.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public._backup_2510_chaouidz_fermeture AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_chaouidz_fermeture ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_chaouidz_fermeture FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2510_chaouidz_fermeture SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3' AND c.status = 'needs_user'
   AND NOT EXISTS (SELECT 1 FROM public._backup_2510_chaouidz_fermeture b WHERE b.id = c.id);
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = 'pending', error = NULL,
         platform_fields = (c.platform_fields
             - 'needsUserField' - 'needsUserFields' - 'needs_user_source' - 'needsUserBoucle' - 'champs_a_completer'
             - 'needs_user_tick_le' - 'needs_user_actif_ms' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
             - 'needs_user_sans_motif' - 'republish_prevol_manquants' - 'next_action_after' - 'processing_since')
           || jsonb_build_object(
                'beebsAspects', COALESCE(CASE WHEN jsonb_typeof(c.platform_fields->'beebsAspects') = 'object'
                                              THEN c.platform_fields->'beebsAspects' END, '{}'::jsonb)
                                || jsonb_build_object('Fermeture', 'À enfiler'),
                'needsUserAttempts', 0,
                'attributs_repris_de_l_annonce', jsonb_build_object(
                  'attributs', jsonb_build_object('Fermeture', 'À enfiler'),
                  'source', 'page publique de l''annonce 32089448, relue le 25/10 au matin',
                  'le', now(), 'pose_par', 'scripts/reparations/20261025_chaouidz_beebs_fermeture.sql'),
                'erreurs_archivees', COALESCE(CASE WHEN jsonb_typeof(c.platform_fields->'erreurs_archivees') = 'array'
                                                   THEN c.platform_fields->'erreurs_archivees' END, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('le', now(), 'statut', c.status, 'erreur', left(c.error, 600),
                                                          'par', 'réparation 25/10 : « Fermeture » reprise de l''annonce en ligne')))
   WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3' AND c.user_id = '90ace0e4-3dbd-4e4f-b23e-02cd27dbd1b3'
     AND c.status = 'needs_user' AND c.platform = 'beebs' AND c.action = 'republish'
     AND c.platform_fields->>'republish_step' = 'captured'
     AND c.platform_fields->'needsUserField'->>'field_key' = 'Fermeture'
     AND NOT (c.platform_fields ? 'deleted_at');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job (needs_user, étape captured, question Fermeture), obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.status, c.platform_fields->'beebsAspects' AS aspects, c.platform_fields->>'republish_step' AS etape,
       c.platform_fields ? 'needsUserField' AS question,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails
  FROM public.cross_post_jobs c WHERE c.id = '8a608034-6cce-4b78-b924-5e0097c1fcf3';
COMMIT;
