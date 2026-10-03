-- TEST RÉEL 0.6.94 (03/10 nuit, compte de Nico uniquement) — marque inconnue
-- de Vinted → la question « Marque » doit partir AVANT tout dépôt, avec la
-- raison « marque_hors_catalogue » et de vraies marques du catalogue.
-- Copie de la tâche de test 59980e9d (jogging Primark, photos du jogging —
-- JAMAIS le tableau), prix dissuasif 999 €, titre « ne pas acheter », marque
-- « Zorglubia Atelier » (inconnue de Vinted). Aucune annonce attendue.
-- Inverse : annuler la tâche (status cancelled) si elle n'est pas partie.
insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, description, price, photos, listing_url, platform_fields)
select j.user_id, null, 'vinted', 'publish', 'pending', j.photo_option,
       'Jogging vert XS (test FillSell, ne pas acheter)', j.description, 999, j.photos, null,
       (j.platform_fields - 'needsUserField' - 'needsUserFields' - 'needsUserResolved' - 'warnings' - 'last_diagnostic'
          - 'processing_since' - 'erreurs_archivees' - 'vinted_item_id' - 'work_window_state')
       || jsonb_build_object('marque', 'Zorglubia Atelier', 'test_reel', 'question marque 0.6.94 (03/10 nuit)')
from public.cross_post_jobs j where j.id = '59980e9d-613f-4a97-845d-cbc99efb859d'
returning left(id::text, 8) id, status, price, title, platform_fields->>'marque' marque;

-- 2e passage (23:29, paquet final 2a088e4) : la même tâche repart, pour
-- vérifier que la raison et la marque demandée arrivent jusqu'à l'app.
-- update public.cross_post_jobs set status = 'pending', error = null,
--   platform_fields = platform_fields - 'needsUserField' - 'needsUserFields'
-- where id = 'fe223d47-…' and status = 'needs_user';
-- Fin du test : la tâche est annulée (aucune annonce n'a été créée) :
-- update public.cross_post_jobs set status = 'cancelled', error = 'Test réel terminé (question Marque 0.6.94) — aucune annonce créée.'
-- where id = 'fe223d47-…' and status = 'needs_user';
