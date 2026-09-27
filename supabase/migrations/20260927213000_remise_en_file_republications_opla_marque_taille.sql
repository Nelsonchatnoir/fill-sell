-- REMISE EN FILE des republications Opla bloquées par le pré-vol « Opla exige
-- une marque » / « … exige une taille » (27/09/2026, consigne de Nico).
-- Cause : la republication se jugeait sur la fiche IMPORTÉE (sans marque ni
-- taille) au lieu de l'annonce en ligne qui les porte. Corrigé par l'extension
-- 0.6.74 (e1dbc59) ; get-pending-jobs v149 ne sert ces jobs qu'à un poste qui
-- porte ce build (plus de boucle de relances sur la 0.6.69).
-- Périmètre (mesuré le 27/09 ~20:25) : les 19 republications Opla de
-- doriane-henri, toutes à l'étape a_capturer ; aucun autre compte depuis le
-- 18/09. Tentatives à zéro, needs_user_* et next_action_after retirés,
-- republish_step et erreurs_archivees CONSERVÉS (l'erreur en cours y est
-- ajoutée). Rien n'est envoyé à Opla ici ; aucune annonce touchée.
UPDATE cross_post_jobs j
   SET status = 'pending',
       error = NULL,
       platform_fields = (j.platform_fields - ARRAY['needsUserAttempts', 'next_action_after', 'needs_user_source',
                                                   'needs_user_sans_motif', 'needsUserField', 'needsUserFields'])
         || jsonb_build_object('needsUserAttempts', 0)
         || CASE WHEN j.error IS NOT NULL THEN jsonb_build_object('erreurs_archivees',
              COALESCE(CASE WHEN jsonb_typeof(j.platform_fields -> 'erreurs_archivees') = 'array'
                            THEN j.platform_fields -> 'erreurs_archivees' END, '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('erreur', left(j.error, 500), 'le', now(),
                                                      'par', 'remise_en_file_2709_opla_marque_taille', 'statut', j.status)))
            ELSE '{}'::jsonb END
  FROM profiles p
 WHERE p.id = j.user_id AND split_part(p.email, '@', 1) = 'doriane-henri'
   AND j.platform = 'opla' AND j.action = 'republish'
   AND j.status IN ('pending', 'needs_user')
   AND COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') = 'a_capturer';
