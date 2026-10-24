-- INVERSE de supabase/migrations/20261024220000_catalogue_vinted_langue_de_la_page.sql : retire la garde (le
-- catalogue Vinted s'écrit de nouveau tel que chaque page l'affiche, comme avant le 24/10).
DROP TRIGGER IF EXISTS aspects_vinted_langue_de_la_page ON public.platform_category_aspects;
DROP FUNCTION IF EXISTS public.aspects_vinted_langue_de_la_page();
