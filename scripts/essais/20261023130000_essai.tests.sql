-- Tests de 20261023130000_photos_origine_source_la_plus_riche (assemblés par 20261023130000_generer.sh, ROLLBACK).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  f bigint := 1791016622513;   -- jocabroc8 : 5 photos (page eBay), le détail Browse en porte 12
  v_user uuid; v_a uuid; v_av jsonb; rec record; n integer;
begin
  select user_id, photos into v_user, v_av from inventaire where id = f;
  select id into v_a from annonces_plateforme where inventaire_id = f and platform = 'ebay' and jsonb_typeof(capture -> 'photos') = 'array' limit 1;
  -- 1. Fiche historique (aucune complétion tracée) : la règle ne la touche pas (la réparation s'en charge)
  update annonces_plateforme set donnees_index = donnees_index where id = v_a;
  select * into rec from inventaire where id = f;
  insert into _r values ('A1 fiche historique sans trace de complétion : la règle ne touche à rien', rec.photos = v_av, jsonb_array_length(rec.photos)::text);
  -- 2. La base lui a mis 5 photos (tracé) : la lecture plus riche (12) l'emporte
  insert into inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
  values (v_user, f, 'photos', '', '5 photo(s)', 'releve', 'photos_origine_completees', jsonb_build_object('apres', 5));
  update annonces_plateforme set donnees_index = donnees_index where id = v_a;
  select * into rec from inventaire where id = f;
  insert into _r values ('A2 la fiche porte encore les 5 de la base : la lecture la plus riche (12) l''emporte', jsonb_array_length(rec.photos) = 12 and rec.photos_a_rapatrier, jsonb_array_length(rec.photos)::text);
  insert into _r values ('A3 en pleine taille, dans l''ordre de l''annonce', rec.photos ->> 0 like 'https://i.ebayimg.com/images/g/%/s-l1600.jpg'
     and public.ebay_cle_image(rec.photos ->> 0) = public.ebay_cle_image((select donnees_index -> 'photos' ->> 0 from annonces_plateforme where id = v_a)), rec.photos ->> 0);
  select count(*) into n from inventaire_journal where inventaire_id = f and motif = 'photos_origine_completees' and detail ->> 'mode' = 'lecture_plus_riche';
  insert into _r values ('A4 tracé (mode lecture_plus_riche)', n = 1, n::text);
  -- 3. La personne a retiré une photo (4 au lieu des 5 de la base) : plus jamais touchée
  update inventaire set photos = (select jsonb_agg(p) from (select p from jsonb_array_elements(v_av) with ordinality t(p, o) where o <= 4) x) where id = f;
  update annonces_plateforme set donnees_index = donnees_index where id = v_a;
  select * into rec from inventaire where id = f;
  insert into _r values ('B1 ⛔ une photo retirée par la personne : la fiche n''est plus touchée', jsonb_array_length(rec.photos) = 4, jsonb_array_length(rec.photos)::text);
  -- 4. La personne a ajouté sa propre photo : plus jamais touchée
  update inventaire set photos = (v_av - 4) || jsonb_build_array('https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/' || v_user::text || '/1792000000000_photo.jpg') where id = f;
  update annonces_plateforme set donnees_index = donnees_index where id = v_a;
  select * into rec from inventaire where id = f;
  insert into _r values ('B2 ⛔ une photo ajoutée par la personne : la fiche n''est plus touchée', jsonb_array_length(rec.photos) = 5 and rec.photos ->> 4 like '%_photo.jpg', jsonb_array_length(rec.photos)::text);
  -- 5. Normalisation : une photo Trading en 400 px devient l'original, deux tailles d'une même photo ne font qu'une
  update inventaire set photos = '[]'::jsonb where id = f;
  perform public.fiche_completer_photos_capture(f, null, jsonb_build_object('photos', jsonb_build_array(
    'https://i.ebayimg.com/00/s/NTEyWDUwOQ==/z/Jk8AAeSwJDpq2a78/$_1.JPG?set_id=8800005007',
    'https://i.ebayimg.com/images/g/Jk8AAeSwJDpq2a78/s-l500.jpg',
    'https://i.ebayimg.com/00/s/NTcwWDYyOA==/z/UMYAAeSwEmpq2a8D/$_1.JPG?set_id=8800005007')));
  select * into rec from inventaire where id = f;
  insert into _r values ('C1 photos Trading 400 px → originales, sans doublon, dans l''ordre', rec.photos = jsonb_build_array(
    'https://i.ebayimg.com/images/g/Jk8AAeSwJDpq2a78/s-l1600.jpg', 'https://i.ebayimg.com/images/g/UMYAAeSwEmpq2a8D/s-l1600.jpg'), rec.photos::text);
  -- 6. Le déclencheur : une page à 5 photos ne recouvre jamais un détail à 12
  update inventaire set photos = jsonb_build_array((select a.photo_url from annonces_plateforme a where a.id = v_a)) where id = f;
  update annonces_plateforme set capture = capture where id = v_a;
  select * into rec from inventaire where id = f;
  insert into _r values ('D1 vignette seule : le déclencheur prend la lecture la plus riche (12, pas les 5 de la page)', jsonb_array_length(rec.photos) = 12, jsonb_array_length(rec.photos)::text);
end $$;
select essai, ok, left(coalesce(detail, ''), 160) detail from _r order by essai;
select count(*) filter (where ok) || ' / ' || count(*) as bilan from _r;
