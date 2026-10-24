-- Essai à blanc de 20261024235800 — joué APRÈS le corps de la migration, puis ROLLBACK. Une remise « à faire », sans
-- condition d'attente, dont le job source n'a ni prix ni photo : le job créé prend le contenu de la fiche.
create temp table _r (essai text, ok boolean, detail text) on commit drop;
-- Fiche et job source FICTIFS du compte de Nico (créés et effacés dans la transaction).
insert into inventaire (id, user_id, titre, description, prix_vente, photos, statut, quantite)
values (999000000000777, 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai remise fiche', 'description de la fiche', 999,
        '[{"url":"https://exemple.invalid/a.jpg"},{"url":"https://exemple.invalid/b.jpg"}]'::jsonb, 'stock', 1);
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values ('00000000-0000-4000-8000-000000000777', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'beebs', 'publish', 'cancelled',
        'titre du job source', null, '[]'::jsonb, jsonb_build_object('vente_annulee_remise', jsonb_build_object('le', now() - interval '30 minutes')));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'beebs', '00000000-0000-4000-8000-000000000777', 'a_faire', now() - interval '1 minute');
-- Un relevé Beebs « fait » maintenant (la remise attend un relevé après l'annulation) — gardes d'insertion contournées
-- dans la transaction seulement (rien ne reste).
set local session_replication_role = replica;
insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at, started_at, finished_at, items_vus, total_entries)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'annonces', 'beebs', 'done', 'app', now(), now(), now(), 5, 5);
set local session_replication_role = origin;
select public.remises_en_vente_tick(50, 'f44b5917-bccc-4431-ba41-f40571a2ed18');
insert into _r select 'E1 un job est créé pour la remise', count(*) = 1, string_agg(j.status || ' ' || j.action, ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000777 and j.id <> '00000000-0000-4000-8000-000000000777';
insert into _r select 'E2 le titre du job source est gardé (il en avait un)', bool_and(j.title = 'titre du job source'), string_agg(j.title, ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000777 and j.id <> '00000000-0000-4000-8000-000000000777';
insert into _r select 'E3 prix et photos : ceux de la FICHE (le job source n''en avait pas)',
  bool_and(j.price = 999 and jsonb_array_length(j.photos) = 2 and j.description = 'description de la fiche'), string_agg(coalesce(j.price::text, '∅') || ' / ' || jsonb_array_length(coalesce(j.photos, '[]'::jsonb)), ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000777 and j.id <> '00000000-0000-4000-8000-000000000777';
-- AVANT l'appui : l'annonce Vinted vendue revue ACTIVE après l'annulation (remise en ligne directement sur Vinted) →
-- la proposition se ferme « déjà en vente », rien n'est republié.
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_listing_id, platform_fields)
values ('00000000-0000-4000-8000-000000000778', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'vinted', 'publish', 'cancelled',
        'essai vinted', 10, '[]'::jsonb, '999000777', jsonb_build_object('vente_annulee_remise', jsonb_build_object('le', now() - interval '30 minutes')));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'vinted', '00000000-0000-4000-8000-000000000778', 'proposee', now());
insert into vinted_listing_snapshots (user_id, vinted_item_id, status, captured_at, captured_on)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', '999000777', 'active', now() - interval '5 minutes', current_date);
select public.remises_en_vente_tick(50, 'f44b5917-bccc-4431-ba41-f40571a2ed18');
insert into _r select 'E4 remis en ligne directement sur Vinted (avant l''appui) → « déjà en vente », rien republié',
  bool_and(r.statut = 'abandonnee' and r.motif = 'deja_en_vente')
  and not exists (select 1 from cross_post_jobs c where c.inventaire_id = 999000000000777 and c.platform = 'vinted' and c.status = 'pending'),
  string_agg(r.statut || ':' || coalesce(r.motif, '∅'), ' ; ')
  from remises_en_vente r where r.job_vendu = '00000000-0000-4000-8000-000000000778';
insert into _r select 'E5 une proposition dont l''annonce n''est PAS revue en ligne reste proposée (le short n''est pas touché)',
  count(*) = 0, count(*)::text from remises_en_vente r where r.inventaire_id = 1785871917724004 and r.statut = 'abandonnee' and r.traite_le = now();
select essai, ok, left(detail, 300) detail from _r order by essai;
