-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS — SES 4 REPUBLICATIONS BEEBS PARTENT CE SOIR, HORS DE SON CRÉNEAU
-- (03/10, 22:35 — décision de Nico, pour ces 4 tâches seulement)
-- ═══════════════════════════════════════════════════════════════════════════
-- Créées dans son créneau (samedi 19:00–22:00) puis bloquées par NOTRE défaut
-- (âge non repris) ; remises en file à 22:15, après la fin du créneau, donc
-- retenues jusqu'à mardi 06/10 19:00. Nico : « les lancer ce soir ».
-- Exception lue par get-pending-jobs v204 (creneau_exception), bornée à
-- 04/10 01:30 Paris (d'abord 23:59, allongée à 22:56 pour couvrir les 6 tâches
-- en file, une à la fois) : passé ce délai, la règle du créneau reprend.
-- La source reste 'auto' (comptage inchangé). Rien d'autre ne change.
-- Sauvegarde : _backup_0310_louis_age (quoi = 'job3'). Inverse : _INVERSE.sql.
begin;
insert into public._backup_0310_louis_age (quoi, id, ligne)
select 'job3', j.id::text, to_jsonb(j) from public.cross_post_jobs j
where j.id in ('cf867d47-6d54-4886-ba87-4683513fb0cc','af0c95c3-6290-4cb4-b19f-7872e42239b0',
               'd64f7a1d-fb9e-4cdd-9953-03612bcaa196','f7e1fe3d-9cfb-44c1-9a02-d20eeeb32cdd')
  and j.status = 'pending';

update public.cross_post_jobs j
set platform_fields = j.platform_fields || jsonb_build_object('creneau_exception', jsonb_build_object(
      'par', 'Nico (03/10 22:35)',
      'motif', 'tâches créées dans le créneau, bloquées par notre défaut (âge non repris), remises en file après 22:00',
      'jusqu_a', '2026-10-03T23:30:00Z',
      'pose_par', 'scripts/reparations/20261003_louis_beebs_creneau_exception.sql')),
    error = null
where j.id in ('cf867d47-6d54-4886-ba87-4683513fb0cc','af0c95c3-6290-4cb4-b19f-7872e42239b0',
               'd64f7a1d-fb9e-4cdd-9953-03612bcaa196','f7e1fe3d-9cfb-44c1-9a02-d20eeeb32cdd')
  and j.status = 'pending' and j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';

select left(id::text, 8) id, status, platform_fields->'creneau_exception'->>'jusqu_a' jusqu_a
from public.cross_post_jobs
where id in ('cf867d47-6d54-4886-ba87-4683513fb0cc','af0c95c3-6290-4cb4-b19f-7872e42239b0',
             'd64f7a1d-fb9e-4cdd-9953-03612bcaa196','f7e1fe3d-9cfb-44c1-9a02-d20eeeb32cdd');
commit;
