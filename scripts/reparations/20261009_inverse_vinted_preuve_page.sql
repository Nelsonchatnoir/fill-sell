-- INVERSE de la migration 20261009130000_vinted_preuve_page (09/10) : retire le
-- déclencheur et sa fonction (ils n'existaient pas avant). À lancer seulement sur décision :
-- npx supabase db query --linked -f scripts/reparations/20261009_inverse_vinted_preuve_page.sql
DROP TRIGGER IF EXISTS cross_post_jobs_vinted_preuve_page ON public.cross_post_jobs;
DROP FUNCTION IF EXISTS public.vinted_preuve_page_veilleur();
