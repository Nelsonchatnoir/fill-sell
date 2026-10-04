-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE : LES PHOTOS MANQUANTES DE SIX FICHES BEEBS DE LOUIS — 04/10/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis (Business, louis@ttfamily.fr) : six « Rangement Rouge et … » nés du
-- relevé Beebs avec la SEULE vignette de l'index (Beebs n'en donne qu'une),
-- jamais capturés depuis (file de capture de l'extension en retard). Sur
-- Beebs, chaque annonce a 4 ou 5 photos.
-- Lues le 04/10 vers 19:35 sur la page publique de chaque annonce (requête de
-- même origine dans Chrome, ld+json — la même lecture que l'extension 0.6.96).
-- PREUVE que la photo de la fiche vient de CETTE annonce : la fiche porte une
-- seule photo, la copie (rapatrie-fiche) de la vignette de l'annonce (dhash
-- identique ou à 1 bit), et cette copie est la PREMIÈRE photo de l'annonce
-- (dhash de la photo 1 à 0–2 bits sur 64). Rien d'ajouté par Louis.
-- GESTE : on GARDE la photo de la fiche à sa place (en tête) et on AJOUTE à la
-- suite les photos 2 à n de l'annonce, dans leur ordre. Rien supprimé, rien
-- réordonné. Chaque mise à jour est CONDITIONNÉE à la photo actuelle exacte
-- (une fiche modifiée entre-temps n'est pas touchée), écrite au journal
-- (inventaire_journal, motif photos_manquantes_completees), et remise dans la
-- file de rapatriement (photos_a_rapatrier) : handler-watch recopie les
-- photos Beebs chez nous (Beebs refuse le CORS, une photo restée chez lui ne
-- se republierait nulle part).
-- Six lignes, une instruction par fiche : aucune opération lourde.
-- Sauvegarde : 20261004_photos_beebs_louis_SAUVEGARDE.json.
-- Inverse : 20261004_photos_beebs_louis_INVERSE.sql.

-- Rouge et Noir — fiche 1791017761617, annonce Beebs 34097735 : 1 → 5 photos (dhash photo 1 : 2 bit(s))
WITH maj AS (
  UPDATE public.inventaire
     SET photos = photos || '["https://cdn.beebs.app/9fd239bf-84b3-4ccc-b06f-a7280b01691c.jpg","https://cdn.beebs.app/dbe571fc-d8f5-4cf4-8527-e25b487f458b.jpg","https://cdn.beebs.app/f24c4eb0-f214-42ee-b68a-a13edfa9216b.jpg","https://cdn.beebs.app/c5de37b0-5cb7-4616-8359-2f69a08bade1.jpg"]'::jsonb, photos_a_rapatrier = true
   WHERE id = 1791017761617 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND photos = '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017761617/1791017820954_0.jpg"]'::jsonb
  RETURNING id, user_id, photos)
INSERT INTO public.inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
SELECT user_id, id, 'photos', '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017761617/1791017820954_0.jpg"]', photos::text, 'releve_beebs', 'photos_manquantes_completees',
       jsonb_build_object('listing_id', '34097735', 'ajoutees', 4, 'lecture', 'page de l''annonce, ld+json, 04/10',
                          'preuve', 'photo de la fiche = photo 1 de l''annonce (dhash 2/64)', 'reparation', '20261004_photos_beebs_louis')
  FROM maj;

-- Rouge et Jaune — fiche 1791017762018, annonce Beebs 34097727 : 1 → 5 photos (dhash photo 1 : 0 bit(s))
WITH maj AS (
  UPDATE public.inventaire
     SET photos = photos || '["https://cdn.beebs.app/ee0df57c-11c8-458c-8dc1-28af1ae0470b.jpg","https://cdn.beebs.app/44c3481b-c731-42a4-a82d-5f811fe8b992.jpg","https://cdn.beebs.app/299f0091-ccb1-4cfe-b1c0-0dfb551d45f0.jpg","https://cdn.beebs.app/b344239d-d719-4354-b75d-cdcaf18f7091.jpg"]'::jsonb, photos_a_rapatrier = true
   WHERE id = 1791017762018 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND photos = '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762018/1791017820954_0.jpg"]'::jsonb
  RETURNING id, user_id, photos)
INSERT INTO public.inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
SELECT user_id, id, 'photos', '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762018/1791017820954_0.jpg"]', photos::text, 'releve_beebs', 'photos_manquantes_completees',
       jsonb_build_object('listing_id', '34097727', 'ajoutees', 4, 'lecture', 'page de l''annonce, ld+json, 04/10',
                          'preuve', 'photo de la fiche = photo 1 de l''annonce (dhash 0/64)', 'reparation', '20261004_photos_beebs_louis')
  FROM maj;

-- Rouge et Gris — fiche 1791017762274, annonce Beebs 34097717 : 1 → 4 photos (dhash photo 1 : 1 bit(s))
WITH maj AS (
  UPDATE public.inventaire
     SET photos = photos || '["https://cdn.beebs.app/b3794648-a08f-4924-abb0-10829ddae95e.jpg","https://cdn.beebs.app/088aca9d-a5fb-427e-9016-ab991f8eaaf8.jpg","https://cdn.beebs.app/a6dec52d-ed60-4db0-8fff-91ab64af16e2.jpg"]'::jsonb, photos_a_rapatrier = true
   WHERE id = 1791017762274 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND photos = '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762274/1791017820954_0.jpg"]'::jsonb
  RETURNING id, user_id, photos)
INSERT INTO public.inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
SELECT user_id, id, 'photos', '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762274/1791017820954_0.jpg"]', photos::text, 'releve_beebs', 'photos_manquantes_completees',
       jsonb_build_object('listing_id', '34097717', 'ajoutees', 3, 'lecture', 'page de l''annonce, ld+json, 04/10',
                          'preuve', 'photo de la fiche = photo 1 de l''annonce (dhash 1/64)', 'reparation', '20261004_photos_beebs_louis')
  FROM maj;

-- Rouge et Bleu — fiche 1791017762605, annonce Beebs 34097705 : 1 → 5 photos (dhash photo 1 : 2 bit(s))
WITH maj AS (
  UPDATE public.inventaire
     SET photos = photos || '["https://cdn.beebs.app/695ffdf5-98bc-43db-8e0a-36448c93d712.jpg","https://cdn.beebs.app/4405b12b-fb0b-40bf-b9e8-8fa4037f5da0.jpg","https://cdn.beebs.app/90c7201f-acfd-4a1d-a7c7-c09994145c2c.jpg","https://cdn.beebs.app/d796ed4f-56a9-4854-94ad-83e742e13479.jpg"]'::jsonb, photos_a_rapatrier = true
   WHERE id = 1791017762605 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND photos = '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762605/1791017820954_0.jpg"]'::jsonb
  RETURNING id, user_id, photos)
INSERT INTO public.inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
SELECT user_id, id, 'photos', '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762605/1791017820954_0.jpg"]', photos::text, 'releve_beebs', 'photos_manquantes_completees',
       jsonb_build_object('listing_id', '34097705', 'ajoutees', 4, 'lecture', 'page de l''annonce, ld+json, 04/10',
                          'preuve', 'photo de la fiche = photo 1 de l''annonce (dhash 2/64)', 'reparation', '20261004_photos_beebs_louis')
  FROM maj;

-- Rouge et Bleu Ciel — fiche 1791017762915, annonce Beebs 34097713 : 1 → 5 photos (dhash photo 1 : 1 bit(s))
WITH maj AS (
  UPDATE public.inventaire
     SET photos = photos || '["https://cdn.beebs.app/58f77f00-067c-470b-9a18-7775c5439d49.jpg","https://cdn.beebs.app/1dc0088e-8f74-43d6-b145-f5b248d18243.jpg","https://cdn.beebs.app/90b67b7f-0f15-4999-bac0-f506e502b697.jpg","https://cdn.beebs.app/71401d5e-bb9b-4a07-9133-fa059cf9b71f.jpg"]'::jsonb, photos_a_rapatrier = true
   WHERE id = 1791017762915 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND photos = '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762915/1791017820954_0.jpg"]'::jsonb
  RETURNING id, user_id, photos)
INSERT INTO public.inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
SELECT user_id, id, 'photos', '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017762915/1791017820954_0.jpg"]', photos::text, 'releve_beebs', 'photos_manquantes_completees',
       jsonb_build_object('listing_id', '34097713', 'ajoutees', 4, 'lecture', 'page de l''annonce, ld+json, 04/10',
                          'preuve', 'photo de la fiche = photo 1 de l''annonce (dhash 1/64)', 'reparation', '20261004_photos_beebs_louis')
  FROM maj;

-- Rouge et Blanc — fiche 1791017821167, annonce Beebs 34097700 : 1 → 5 photos (dhash photo 1 : 1 bit(s))
WITH maj AS (
  UPDATE public.inventaire
     SET photos = photos || '["https://cdn.beebs.app/fd454948-46a8-442e-aa43-d7bb43109d5d.jpg","https://cdn.beebs.app/b363d019-7f48-49a3-aa9d-c25fdd519512.jpg","https://cdn.beebs.app/75dc3c93-7084-480a-bf7e-db70aceaf4ac.jpg","https://cdn.beebs.app/058dd534-db9c-4926-9b0a-4577c81a658d.jpg"]'::jsonb, photos_a_rapatrier = true
   WHERE id = 1791017821167 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND photos = '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017821167/1791017820954_0.jpg"]'::jsonb
  RETURNING id, user_id, photos)
INSERT INTO public.inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
SELECT user_id, id, 'photos', '["https://tojihnuawsoohlolangc.supabase.co/storage/v1/object/public/listing-photos/faf5021a-479a-4bb3-b3ec-c296770739b7/rapatrie-fiche/1791017821167/1791017820954_0.jpg"]', photos::text, 'releve_beebs', 'photos_manquantes_completees',
       jsonb_build_object('listing_id', '34097700', 'ajoutees', 4, 'lecture', 'page de l''annonce, ld+json, 04/10',
                          'preuve', 'photo de la fiche = photo 1 de l''annonce (dhash 1/64)', 'reparation', '20261004_photos_beebs_louis')
  FROM maj;

-- Vérification
SELECT id, jsonb_array_length(photos) n_photos, photos_a_rapatrier FROM public.inventaire
 WHERE id IN (1791017761617, 1791017762018, 1791017762274, 1791017762605, 1791017762915, 1791017821167) ORDER BY id;
