-- ═══════════════════════════════════════════════════════════════════════════
-- LOUIS — LE PRIX DE L'ANNONCE EN LIGNE, PAS CELUI DU 19/09 (03/10, 21:00)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ses 5 inserts Zombicide étaient en ligne à 10 € (relevé du 03/10 08:51 et
-- page publique). La republication reprenait le prix de la tâche source du
-- 19/09 (12 €, relevé ancien) : spend_coins_and_republish → COALESCE(prix de
-- republication, prix de la tâche source). Deux sont déjà repartis à 12 €
-- (34101791, 34101820). Ici : les trois encore en file repartent au prix EN
-- LIGNE (10 €), avant leur recréation. Aucune autre valeur touchée.
-- Sauvegarde : _backup_0310_louis_age (même table, quoi = 'job_prix'). Inverse : _INVERSE.sql.
begin;
insert into public._backup_0310_louis_age (quoi, id, ligne)
select 'job_prix', j.id::text, to_jsonb(j) from public.cross_post_jobs j
where j.id in ('af1e96be-7d1e-405c-b64c-5c6b4657ca68','b023c9f3-0cb0-4c75-87a0-038235473915','ee7039df-6455-4fa4-b0fd-c10e5530fdb6')
  and j.status in ('pending','processing');

update public.cross_post_jobs j
set price = 10,
    platform_fields = j.platform_fields || jsonb_build_object('prix_repris_de_l_annonce', jsonb_build_object(
      'avant', j.price, 'apres', 10, 'source', 'relevé Beebs du 03/10 08:51 (10 €, page publique identique)',
      'pose_par', 'scripts/reparations/20261003_louis_beebs_prix_republication.sql', 'le', now()))
where j.id in ('af1e96be-7d1e-405c-b64c-5c6b4657ca68','b023c9f3-0cb0-4c75-87a0-038235473915','ee7039df-6455-4fa4-b0fd-c10e5530fdb6')
  and j.status in ('pending','processing') and j.price = 12;

select left(id::text,8) id, status, price, platform_fields->>'republish_step' step from public.cross_post_jobs
where id in ('af1e96be-7d1e-405c-b64c-5c6b4657ca68','b023c9f3-0cb0-4c75-87a0-038235473915','ee7039df-6455-4fa4-b0fd-c10e5530fdb6');
commit;
