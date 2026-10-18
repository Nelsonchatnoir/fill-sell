-- 18/10 ~16:45 Paris — Régis (309d0787), recréations Vinted en boucle : chaque « canal coupé » était un SUCCÈS
-- non reconnu (Vinted redirige vers /member/<id> ; date de suppression recalée 7 min trop tard ; voir
-- docs/enquetes/finition-1810/RAPPORT.md). Le bloc-feuillet (8ab903a4) a recréé une 4e copie à 16:41 et repartait à
-- 16:51 : on RETIENT les deux jobs (aucune annonce touchée, aucun statut changé) jusqu'au correctif.
-- Sauvegarde : _backup_1810_regis_recreations. Inverse : 20261018_regis_recreations_arretees_INVERSE.sql.
begin;
create table if not exists public._backup_1810_regis_recreations as
  select id, status, platform_fields, now() as sauve_le
  from public.cross_post_jobs
  where id in ('8ab903a4-74f5-42f8-b096-5ae341f41175', 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882');

update public.cross_post_jobs
set platform_fields = platform_fields
  || jsonb_build_object(
       'retenu_par_claude_1810', true,
       'next_action_after', '2026-10-25T00:00:00Z',
       'recreation_arretee_1810', jsonb_build_object(
         'at', now(), 'motif', 'recréations réussies non reconnues (copies en ligne) — arrêt avant correctif'))
where id in ('8ab903a4-74f5-42f8-b096-5ae341f41175', 'f33d2e5d-da62-4e91-a9e8-c1ec28fca882')
  and user_id = '309d0787-9000-46cc-9c6a-51f7475d7d41'
  and status in ('pending', 'needs_user');
commit;
