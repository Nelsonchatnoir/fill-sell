-- (28/10 ~23:12) recrutementgroupezk704, republication Beebs 1a323b66 « Jean Levi's vintage 514 W34 L32 FR44 … J150 » :
-- suppression envoyée le 26/10 09:12, annonce Beebs 34165538 en 404 (constat navigateur ~23:05), MAIS la fiche est
-- « disparue » depuis le 26/10 20:21 et son annonce Vinted d'origine (10440296599) n'existe plus (« Page not found »,
-- constat ~23:10). Article peut-être vendu ailleurs : AUCUNE recréation d'office (le doute devient une question).
-- La tâche s'arrête à la personne, avec le vrai motif ; « Relancer » si l'article est toujours à vendre.
-- Inverse : 20261028_beebs_levis_j150_question_INVERSE.sql
BEGIN;
CREATE TABLE public._backup_2810_beebs_levis_j150 AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE c.id = '1a323b66-a2a2-4070-b4b6-261ce7bb3ce5';
ALTER TABLE public._backup_2810_beebs_levis_j150 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2810_beebs_levis_j150 FROM PUBLIC, anon, authenticated;
UPDATE public.cross_post_jobs c SET
  status = 'needs_user',
  error = 'Ton annonce Beebs a été retirée le 26/10 pour être republiée, mais ton annonce Vinted d''origine n''existe plus '
       || 'depuis le 26/10 (vendue ou supprimée ?). On ne la remet pas en ligne sur Beebs sans toi : si l''article est '
       || 'toujours à vendre, relance la republication ; sinon, annule-la.',
  platform_fields = (c.platform_fields - ARRAY['processing_since','next_action_after','needsUserAttempts'])
    || jsonb_build_object('needs_user_source', 'relancer',
      'constat_2810', jsonb_build_object('le', now(), 'beebs_34165538', 404, 'vinted_10440296599', 'page_not_found',
        'fiche_disparue_le', '2026-10-26T20:21:07Z', 'par', 'réparation 28/10 (terminal principal)'),
      'erreurs_archivees', COALESCE(c.platform_fields -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'le', now(), 'statut', c.status, 'erreur', c.error, 'par', 'réparation 28/10 (fiche disparue : question à la personne)')))
 WHERE c.id = '1a323b66-a2a2-4070-b4b6-261ce7bb3ce5' AND c.status = 'pending'
   AND c.platform_fields->>'republish_step' = 'captured';
COMMIT;
