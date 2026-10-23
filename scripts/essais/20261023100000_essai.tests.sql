-- Tests de 20261023100000_photos_origine_toutes (assemblés par 20261023100000_generer.sh, transaction annulée).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  thierry uuid := 'c2175e91-3854-4a66-8388-e28810166a3e';
  r jsonb; n integer; ok boolean; rec record; v_ann record; v_av jsonb; v_id bigint;
begin
  -- A. La clé d'une image eBay, sous ses trois formes
  insert into _r values ('A1 clé eBay : vignette 140 px et grande taille = même clé',
    public.ebay_cle_image('https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg') = 'QVgAAeSwd4xqonZY'
    and public.ebay_cle_image('https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg') = 'QVgAAeSwd4xqonZY', null);
  insert into _r values ('A2 clé eBay : forme $_1.JPG (Trading)',
    public.ebay_cle_image('https://i.ebayimg.com/00/s/NTEyWDUwOQ==/z/Jk8AAeSwJDpq2a78/$_1.JPG?set_id=8800005007') = 'Jk8AAeSwJDpq2a78', null);
  insert into _r values ('A3 clé eBay : une adresse qui n''est pas eBay → aucune clé',
    public.ebay_cle_image('https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/x/rehosted/1/2_0.jpg') is null, null);

  -- B. La photo d'une fiche est-elle la vignette (ou sa copie) ?
  insert into _r values ('B1 copie rehosted/<fiche> d''une fiche née d''un relevé = vignette',
    public.photo_est_vignette_de_fiche(1792745533806, 'releve_ebay',
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/rehosted/1792745533806/1792747072642_0.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), null);
  insert into _r values ('B2 copie rehosted d''une AUTRE fiche ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1792745533806, 'releve_ebay',
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/rehosted/1792745533999/1_0.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), false), null);
  insert into _r values ('B3 photo retouchée (enhanced) ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1792745534214, 'releve_ebay',
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/enhanced/1792746017692_0.png', 'https://i.ebayimg.com/images/g/abcdefgh/s-l140.jpg', null), false), null);
  insert into _r values ('B4 rehosted d''une fiche écrite dans FillSell (pas un relevé) ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1792745533806, null,
      'https://x.supabase.co/storage/v1/object/public/listing-photos/u/rehosted/1792745533806/1_0.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), false), null);
  insert into _r values ('B5 même image eBay en grande taille = vignette',
    public.photo_est_vignette_de_fiche(1, 'releve_ebay', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg',
      'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', null), null);
  insert into _r values ('B6 une autre image eBay ≠ vignette',
    not coalesce(public.photo_est_vignette_de_fiche(1, 'releve_ebay', 'https://i.ebayimg.com/images/g/ZZZZAAeSwd4xqonZ/s-l1600.jpg',
      'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l140.jpg', 'https://i.ebayimg.com/images/g/QVgAAeSwd4xqonZY/s-l1600.jpg'), false), null);

  -- C. Une fiche de Thierry restée à 1 photo (copie rehosted, au format {url}) alors que son détail eBay en porte 2
  select a.photo_url, a.donnees_index into v_ann from annonces_plateforme a where a.inventaire_id = 1792745533806 and a.platform = 'ebay';
  select photos into v_av from inventaire where id = 1792745533806;
  ok := public.fiche_completer_photos_capture(1792745533806, v_ann.photo_url, v_ann.donnees_index);
  select * into rec from inventaire where id = 1792745533806;
  insert into _r values ('C1 fiche 1792745533806 : complétée (copie rehosted au format {url})', ok and jsonb_array_length(rec.photos) = jsonb_array_length(v_ann.donnees_index -> 'photos') and rec.photos_a_rapatrier,
    jsonb_array_length(v_av)::text || ' → ' || jsonb_array_length(rec.photos)::text);
  insert into _r values ('C2 dans l''ordre de l''annonce (avers puis revers)', rec.photos -> 0 = v_ann.donnees_index -> 'photos' -> 0 and rec.photos -> 1 = v_ann.donnees_index -> 'photos' -> 1, rec.photos::text);
  select count(*) into n from inventaire_journal where inventaire_id = 1792745533806 and champ = 'photos' and motif = 'photos_origine_completees';
  insert into _r values ('C3 tracé au journal de la fiche', n = 1, n::text);
  ok := public.fiche_completer_photos_capture(1792745533806, v_ann.photo_url, v_ann.donnees_index);
  insert into _r values ('C4 rejouée : rien (la fiche a déjà ses photos)', not ok, null);

  -- D. Jamais au-dessus d'une fiche qui a déjà 2 photos, ni d'une photo retouchée
  select i.id into v_id from annonces_plateforme a join inventaire i on i.id = a.inventaire_id
   where i.user_id = thierry and a.platform = 'ebay' and jsonb_array_length(i.photos) = 2 limit 1;
  ok := public.fiche_completer_photos_capture(v_id, 'https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l140.jpg',
          jsonb_build_object('photos', jsonb_build_array('https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l1600.jpg', 'https://i.ebayimg.com/images/g/BBBBBBBBBB/s-l1600.jpg', 'https://i.ebayimg.com/images/g/CCCCCCCCCC/s-l1600.jpg')));
  insert into _r values ('D1 fiche à 2 photos : jamais touchée', not ok, v_id::text);
  ok := public.fiche_completer_photos_capture(1792745534214, 'https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l140.jpg',
          jsonb_build_object('photos', jsonb_build_array('https://i.ebayimg.com/images/g/AAAAAAAAAA/s-l1600.jpg', 'https://i.ebayimg.com/images/g/BBBBBBBBBB/s-l1600.jpg')));
  insert into _r values ('D2 fiche à photo retouchée (enhanced) : jamais touchée', not ok, null);
  ok := public.fiche_completer_photos_capture(1792745533806, null, jsonb_build_object('photos', jsonb_build_array('https://a/1.jpg')));
  insert into _r values ('D3 une seule photo à l''origine : rien', not ok, null);

  -- E. Doublons retirés, ordre gardé
  update inventaire set photos = jsonb_build_array('https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l140.jpg') where id = 1792745533317;
  ok := public.fiche_completer_photos_capture(1792745533317, 'https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l140.jpg',
          jsonb_build_object('photos', jsonb_build_array('https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l1600.jpg', 'https://i.ebayimg.com/images/g/eIMAAeSw4T1qomqC/s-l1600.jpg', 'https://i.ebayimg.com/images/g/ikcAAeSwCNFqomp7/s-l1600.jpg')));
  select * into rec from inventaire where id = 1792745533317;
  insert into _r values ('E1 doublon de l''annonce retiré, ordre gardé', ok and jsonb_array_length(rec.photos) = 2 and rec.photos ->> 0 like '%ikcAAeSwCNFqomp7/s-l1600%', rec.photos::text);

  -- F. Le fournisseur de contenu dit la lecture du détail eBay et le nombre de photos de l'origine
  select * into rec from public.fiches_contenu_vendeur(thierry, array[1792745533806]::bigint[]);
  insert into _r values ('F1 annonces : detail_le et photos_origine (2)', (rec.annonces -> 0 ->> 'detail_le') is not null and (rec.annonces -> 0 ->> 'photos_origine')::int = 2, rec.annonces::text);
  insert into _r values ('F2 photos_lues_le : la complétion (C1) compte', rec.photos_lues_le >= now() - interval '1 minute', coalesce(rec.photos_lues_le::text, 'null'));
  select i.id into v_id from inventaire i join annonces_plateforme a on a.inventaire_id = i.id
   where i.user_id = thierry and a.platform = 'ebay' and a.donnees_index_le is null limit 1;
  select * into rec from public.fiches_contenu_vendeur(thierry, array[v_id]::bigint[]);
  insert into _r values ('F3 fiche eBay jamais lue : detail_le vide, photos_origine vide', (rec.annonces -> 0 ->> 'detail_le') is null and (rec.annonces -> 0 ->> 'photos_origine') is null, rec.annonces::text);

  -- G. Une fiche eBay demande sa lecture (relevé de veille eBay)
  perform set_config('request.jwt.claims', json_build_object('sub', thierry, 'role', 'authenticated')::text, true);
  r := public.demander_lecture_origine(1792745533806);
  insert into _r values ('G1 fiche eBay : lecture demandée (relevé eBay)', r ->> 'plateforme' = 'ebay' and r ->> 'reason' in ('releve_demande', 'releve_deja_en_file', 'releve_recent'), r::text);
  r := public.demander_lecture_origine((select id from inventaire where user_id = thierry and origine = 'vinted_sync' limit 1));
  insert into _r values ('G2 fiche Vinted : inchangé (l''extension)', r ->> 'reason' = 'lecture_par_l_extension', r::text);
  r := public.demander_lecture_origine(1792497207175);   -- fiche d'un AUTRE compte (Louis)
  insert into _r values ('G3 fiche d''un autre compte : introuvable', r ->> 'reason' = 'introuvable', r::text);
  perform set_config('request.jwt.claims', '', true);
end $$;
select essai, ok, left(coalesce(detail, ''), 160) detail from _r order by essai;
select count(*) filter (where ok) || ' / ' || count(*) as bilan from _r;
