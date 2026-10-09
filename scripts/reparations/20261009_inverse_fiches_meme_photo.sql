-- INVERSE de 20261009200000_fiches_meme_photo_questions : retire la fonction (les questions
-- déjà posées restent : ce sont des questions, la personne y répond ou non).
-- npx supabase db query --linked -f scripts/reparations/20261009_inverse_fiches_meme_photo.sql
DROP FUNCTION IF EXISTS public.fiches_meme_photo_questions(uuid, integer);
