-- ═══════════════════════════════════════════════════════════════════════════
-- RELANCE DES JOBS ARRÊTÉS SUR UN RATÉ TECHNIQUE (04/10, consigne de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- « La plupart des lignes rouges ont échoué AVANT les correctifs d'hier, et
-- n'ont jamais été réessayées depuis, parce qu'un job en needs_user ne repart
-- pas seul. Relance d'abord tout ce qui a buté sur un raté technique (timeout,
-- onglet, content script muet, plantage d'extension). »
-- Sélection (needs_user/failed, créés depuis 30 jours) : texte d'erreur
-- technique (timeout, content script muet, réinjection impossible, canal
-- coupé, « listener … message channel closed », tâche servie sans démarrer),
-- fiche en stock, AUCUNE garde volontaire (boutique_etrangere,
-- plateforme_ecartee, article_vendu, livres_isbn_garde). 19 jobs :
--   doriane-henri ×2 (Vinted, tâche servie sans démarrer, 0.6.81/0.6.89) ;
--   malena.patarin85 ×12, thomas.vinted590002, duport.leo3, geronimo0550
--   (Opla, « réinjection impossible », 0.6.69 → 0.6.89) ;
--   kacemksoukaina (Leboncoin, timeout content script, 0.6.69) ;
--   patrick.giry07 (Leboncoin, « listener … channel closed », 0.6.79).
-- Format (garde-fous de Nico) : status='pending', error=null, retrait de
-- needs_user_*, needsUserAttempts, next_action_after, error_technique,
-- processing_since ; erreurs_archivees (l'erreur du jour y est AJOUTÉE) et
-- republish_step CONSERVÉS. Ils repasseront sur la version actuelle dès que
-- le PC de chacun tourne (Chrome met l'extension à jour tout seul).
-- Sauvegarde : sauvegarde_relance_techniques_20261004 ; inverse :
-- 20261004_relance_rates_techniques_INVERSE.sql.

CREATE TABLE IF NOT EXISTS public.sauvegarde_relance_techniques_20261004 AS
  SELECT id, status, error, platform_fields, now() AS sauvegarde_le
    FROM public.cross_post_jobs WHERE id IN ('03fffbbe-2599-46dd-9b8a-0d36d0184544','0a0efbf0-b48d-48d1-b8d4-ad525bb74f42','28cdfa9f-d908-48e5-a247-4a05b034db2d','44afd2bf-9a55-4fe3-b008-2495b35e7939','4bf31094-921c-42c6-9ca8-0e4c419e5dc3','4f232539-1364-47bc-8a8e-61eb3e7c36e4','58293b9b-8260-4447-a78b-075fa7606a72','5ca789fb-abee-4e3d-bba2-5341e72a719f','63b68552-e186-4f52-9bb5-66b8aa6c4ce2','82e93970-8d90-4843-8991-c4f6ca124ade','840b67ec-059e-4c6c-8c5f-f7ab4a5e9c9f','90d5629b-2dd4-4d0a-b174-dd706b64c2c6','98460b3d-81c9-4298-ae31-22d51e5aae12','9d1089dd-2f3d-4382-8347-36f889f6701a','b0c68f34-f9b0-4641-9f11-28deb13f9253','bb9381a2-05d5-4722-8aaf-7ca17d025b69','cc05c09a-23e9-4ce5-a7cc-5352be9d2ac3','ed7e294d-ddbe-4c30-87bf-b3260744c1a0','f04c1872-73ac-4c66-9186-b9015830d743');

UPDATE public.cross_post_jobs j SET
  status = 'pending',
  error = NULL,
  platform_fields = (j.platform_fields
      - ARRAY['needs_user_source','needs_user_vu_le','needs_user_vu_erreur','needs_user_tick_le','needs_user_actif_ms',
              'needs_user_sans_motif','needsUserAttempts','next_action_after','error_technique','processing_since'])
    || jsonb_build_object(
         'erreurs_archivees', COALESCE(j.platform_fields->'erreurs_archivees', '[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('le', now(), 'statut', j.status, 'erreur', left(COALESCE(j.error, ''), 600),
                                                     'par', 'relance du 04/10 (raté technique, consigne Nico)')),
         'relance_technique', jsonb_build_object('le', now(), 'par', 'scripts/reparations/20261004_relance_rates_techniques.sql',
                                                 'avant', j.status, 'source_avant', j.platform_fields->>'needs_user_source'))
WHERE j.id IN ('03fffbbe-2599-46dd-9b8a-0d36d0184544','0a0efbf0-b48d-48d1-b8d4-ad525bb74f42','28cdfa9f-d908-48e5-a247-4a05b034db2d','44afd2bf-9a55-4fe3-b008-2495b35e7939','4bf31094-921c-42c6-9ca8-0e4c419e5dc3','4f232539-1364-47bc-8a8e-61eb3e7c36e4','58293b9b-8260-4447-a78b-075fa7606a72','5ca789fb-abee-4e3d-bba2-5341e72a719f','63b68552-e186-4f52-9bb5-66b8aa6c4ce2','82e93970-8d90-4843-8991-c4f6ca124ade','840b67ec-059e-4c6c-8c5f-f7ab4a5e9c9f','90d5629b-2dd4-4d0a-b174-dd706b64c2c6','98460b3d-81c9-4298-ae31-22d51e5aae12','9d1089dd-2f3d-4382-8347-36f889f6701a','b0c68f34-f9b0-4641-9f11-28deb13f9253','bb9381a2-05d5-4722-8aaf-7ca17d025b69','cc05c09a-23e9-4ce5-a7cc-5352be9d2ac3','ed7e294d-ddbe-4c30-87bf-b3260744c1a0','f04c1872-73ac-4c66-9186-b9015830d743')
  AND j.status IN ('needs_user', 'failed')
  AND COALESCE(j.platform_fields->>'needs_user_source', '') NOT IN ('boutique_etrangere', 'plateforme_ecartee', 'article_vendu', 'livres_isbn_garde');

SELECT j.id, j.platform, j.action, j.status, j.platform_fields->>'republish_step' etape,
       jsonb_array_length(COALESCE(j.platform_fields->'erreurs_archivees','[]'::jsonb)) archives
  FROM public.cross_post_jobs j WHERE j.id IN ('03fffbbe-2599-46dd-9b8a-0d36d0184544','0a0efbf0-b48d-48d1-b8d4-ad525bb74f42','28cdfa9f-d908-48e5-a247-4a05b034db2d','44afd2bf-9a55-4fe3-b008-2495b35e7939','4bf31094-921c-42c6-9ca8-0e4c419e5dc3','4f232539-1364-47bc-8a8e-61eb3e7c36e4','58293b9b-8260-4447-a78b-075fa7606a72','5ca789fb-abee-4e3d-bba2-5341e72a719f','63b68552-e186-4f52-9bb5-66b8aa6c4ce2','82e93970-8d90-4843-8991-c4f6ca124ade','840b67ec-059e-4c6c-8c5f-f7ab4a5e9c9f','90d5629b-2dd4-4d0a-b174-dd706b64c2c6','98460b3d-81c9-4298-ae31-22d51e5aae12','9d1089dd-2f3d-4382-8347-36f889f6701a','b0c68f34-f9b0-4641-9f11-28deb13f9253','bb9381a2-05d5-4722-8aaf-7ca17d025b69','cc05c09a-23e9-4ce5-a7cc-5352be9d2ac3','ed7e294d-ddbe-4c30-87bf-b3260744c1a0','f04c1872-73ac-4c66-9186-b9015830d743') ORDER BY j.platform, j.created_at;
