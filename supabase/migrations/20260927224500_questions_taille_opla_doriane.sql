-- ═══════════════════════════════════════════════════════════════════════════
-- QUESTIONS DE TAILLE OPLA DE doriane-henri (Pro) — 27/09 soir
-- ═══════════════════════════════════════════════════════════════════════════
-- Trois questions posées le 27/09 à 21:17, dont deux n'avaient pas lieu d'être :
--  · « Pantalon taille 86 beige » (469501b4) et « T-shirt enfant Batman » en
--    80 (d6627909) : 86 cm = 18 mois, 80 cm = 12 mois — c'est l'étiquette
--    enfant française. get-pending-jobs v150 (tailles.js, étape 6) traduit
--    désormais la stature en âge quand la grille Opla n'écrit que des âges.
--    Les deux jobs repartent en file (statut corrigé, rien d'autre) : ils
--    seront servis avec 18M et 12M.
--  · « Gigoteuse nuage pluie » (b6af82cc) : la fiche (Lens) n'a pas de taille,
--    la question est légitime — mais elle montrait « KID_SLEEPSACK_BOYS_NEW »
--    et des codes « 0M, 0-3M… ». Elle est réécrite en français (« 0 mois »,
--    « 18 mois », « 2 ans ») ; update-job-status v91 le fait désormais pour
--    toute nouvelle question. La réponse « 18 mois » est relue « 18M ».
-- Rien n'est publié, retiré ni supprimé ici.

UPDATE cross_post_jobs j SET
  status = 'pending',
  error = NULL,
  platform_fields = (j.platform_fields - 'needsUserField' - 'needs_user_source' - 'next_action_after' - 'needsUserAttempts')
    || jsonb_build_object('taille_traduite_serveur', jsonb_build_object(
         'le', now(), 'avant', j.platform_fields ->> 'taille',
         'regle', 'étiquette enfant : stature en cm → âge de la grille Opla (tailles.js, get-pending-jobs v150)',
         'par', 'migration 20260927224500'))
 WHERE j.id IN ('469501b4-55e1-4ff6-8789-490c55b9f0e0', 'd6627909-5f99-43d4-b5e6-6f6b7c8fb473')
   AND j.status = 'needs_user' AND j.platform = 'opla';

UPDATE cross_post_jobs j SET
  error = 'Opla demande la taille de cet article pour le déposer. Choisis-la dans la liste ci-dessous : un seul geste, et la publication repart.',
  platform_fields = jsonb_set(
    jsonb_set(j.platform_fields, '{needsUserField,field_label}', '"Taille"'::jsonb),
    '{needsUserField,allowed_values}',
    '["0 mois","0-3 mois","1 mois","3 mois","3-6 mois","6 mois","9 mois","6-12 mois","12 mois","12-18 mois","18 mois","18-24 mois","24 mois","36 mois","2 ans","3 ans","4 ans","5 ans","6 ans","7 ans","8 ans","9 ans","10 ans","11 ans","12 ans","13 ans","14 ans","15 ans","16 ans"]'::jsonb)
 WHERE j.id = 'b6af82cc-4ff0-466b-8e45-7f67e5ea6784'
   AND j.status = 'needs_user'
   AND j.platform_fields #>> '{needsUserField,field_key}' = 'oplaSizeChoice';
