-- Essai à blanc de 20261024235900 — joué APRÈS le corps de la migration, puis ROLLBACK. Une remise Vinted « à faire »
-- dont le job vendu (une republication) n'a pas de catégorie : le job créé prend celle de la dernière capture.
create temp table _r (essai text, ok boolean, detail text) on commit drop;
-- Fiche, capture et job vendu FICTIFS du compte de Nico (créés et effacés dans la transaction).
insert into inventaire (id, user_id, titre, description, prix_vente, photos, statut, quantite)
values (999000000000779, 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai remise vinted capture', 'description de la fiche', 999,
        '[{"url":"https://exemple.invalid/a.jpg"},{"url":"https://exemple.invalid/b.jpg"}]'::jsonb, 'stock', 1);
insert into vinted_republish_captures (user_id, inventaire_id, vinted_item_id, captured_at, verdict, champs_manquants, payload, libelles, photos_urls)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000779, '999000779', now() - interval '20 days',
        (select verdict from vinted_republish_captures where id = 8351), '{}', '{}'::jsonb,
        '{"categoryPath":["Hommes","Vêtements","Shorts"],"etat":"Bon état","taille":"M","marque":"Quiksilver","couleurs":["Marine","Orange"],"colis":"Petit"}'::jsonb,
        '{}');
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_listing_id, platform_fields)
values ('00000000-0000-4000-8000-000000000779', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000779, 'vinted', 'republish', 'cancelled',
        'titre du job vendu', null, '[]'::jsonb, '999000779',
        jsonb_build_object('capture_id', 1, 'vente_annulee_remise', jsonb_build_object('le', now() - interval '30 minutes')));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000779, 'vinted', '00000000-0000-4000-8000-000000000779', 'a_faire', now() - interval '1 minute');
-- Un relevé du dressing « fait » maintenant (la remise attend un relevé après l'annulation) — gardes d'insertion
-- contournées dans la transaction seulement (rien ne reste).
set local session_replication_role = replica;
insert into vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at, started_at, finished_at, items_vus, total_entries)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'dressing', 'vinted', 'done', 'app', now(), now(), now(), 5, 5);
set local session_replication_role = origin;
select public.remises_en_vente_tick(50, 'f44b5917-bccc-4431-ba41-f40571a2ed18');
insert into _r select 'V1 un job Vinted est créé pour la remise', count(*) = 1, string_agg(j.status || ' ' || j.action, ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000779 and j.id <> '00000000-0000-4000-8000-000000000779';
insert into _r select 'V2 catégorie, état, taille, marque, couleurs : ceux de la CAPTURE',
  bool_and(j.platform_fields->'categoryPath' = '["Hommes","Vêtements","Shorts"]'::jsonb and j.platform_fields->>'etat' = 'Bon état'
           and j.platform_fields->>'taille' = 'M' and j.platform_fields->>'marque' = 'Quiksilver'
           and j.platform_fields->'colors' = '["Marine","Orange"]'::jsonb and j.platform_fields ? 'remise_capture'),
  string_agg((j.platform_fields - 'remise_en_vente')::text, ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000779 and j.id <> '00000000-0000-4000-8000-000000000779';
insert into _r select 'V3 titre du job vendu, prix et photos de la fiche (235800 intact)',
  bool_and(j.title = 'titre du job vendu' and j.price = 999 and jsonb_array_length(j.photos) = 2), string_agg(j.title || ' / ' || j.price, ' ; ')
  from cross_post_jobs j where j.inventaire_id = 999000000000779 and j.id <> '00000000-0000-4000-8000-000000000779';
insert into _r select 'V4 un job vendu AVEC catégorie garde la sienne (rien de la capture)',
  public.remise_en_vente_champs_capture('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000779, 'vinted', '{"categoryPath":["Femmes"]}'::jsonb) = '{}'::jsonb, null;
insert into _r select 'V5 hors Vinted : rien de la capture',
  public.remise_en_vente_champs_capture('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000779, 'beebs', '{}'::jsonb) = '{}'::jsonb, null;
insert into _r select 'V6 sans capture : rien (comme avant)',
  public.remise_en_vente_champs_capture('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000777, 'vinted', '{}'::jsonb) = '{}'::jsonb, null;
insert into _r select 'V7 aide fermée aux clients (anon, authenticated)',
  not has_function_privilege('anon', 'public.remise_en_vente_champs_capture(uuid,bigint,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.remise_en_vente_champs_capture(uuid,bigint,text,jsonb)', 'EXECUTE'), null;
insert into _r select 'V8 le VRAI short : la capture 8351 donne Hommes > … > Shorts, Bon état, M, Quiksilver, Marine/Orange',
  c->'categoryPath' = '["Hommes","Vêtements","Vêtements de sport et accessoires","Shorts"]'::jsonb and c->>'etat' = 'Bon état'
  and c->>'taille' = 'M' and c->>'marque' = 'Quiksilver' and c->'colors' = '["Marine","Orange"]'::jsonb, c::text
  from (select public.remise_en_vente_champs_capture(j.user_id, j.inventaire_id, j.platform, j.platform_fields) c
          from cross_post_jobs j where j.id::text like '6c02755d%') x;
select essai, ok, left(detail, 300) detail from _r order by essai;
