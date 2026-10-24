-- Essai à blanc de 20261024220000 (24/10 soir, avant application) : ROLLBACK.
begin;
set local statement_timeout = '60s';
create temp table _r (essai text, ok boolean, detail text);

CREATE OR REPLACE FUNCTION public.aspects_vinted_langue_de_la_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_etrangere boolean := false;
BEGIN
  IF NEW.platform IS DISTINCT FROM 'vinted' OR v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p,
           LATERAL jsonb_path_query(COALESCE(p.extension_sessions, '{}'::jsonb), '$.**.langue') AS l(v)
     WHERE p.id = v_uid
       AND jsonb_typeof(l.v) = 'string'
       AND lower(l.v #>> '{}') !~ '^fr'
  ) INTO v_etrangere;
  IF NOT v_etrangere THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NULL;
  END IF;
  NEW.field_label := OLD.field_label;
  NEW.allowed_values := OLD.allowed_values;
  NEW.input_type := OLD.input_type;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.aspects_vinted_langue_de_la_page() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aspects_vinted_langue_de_la_page ON public.platform_category_aspects;
CREATE TRIGGER aspects_vinted_langue_de_la_page
  BEFORE INSERT OR UPDATE ON public.platform_category_aspects
  FOR EACH ROW EXECUTE FUNCTION public.aspects_vinted_langue_de_la_page();
-- Une ligne Vinted d'essai, écrite par le service (auth.uid() nul : la garde ne joue pas).
insert into platform_category_aspects (platform, category_key, field_key, field_label, required, input_type, allowed_values, source)
values ('vinted', 'ESSAI/rayon', 'etat', 'État', true, 'select', '["Neuf"]'::jsonb, 'dom');
-- 1. mele.marta (page en italien) : son INSERT n'est pas créé.
select set_config('request.jwt.claims', '{"sub":"ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3","role":"authenticated"}', true);
insert into platform_category_aspects (platform, category_key, field_key, field_label, required, input_type, allowed_values, source)
values ('vinted', 'ESSAI/rayon', 'taglia', 'Taglia', true, 'select', '["M"]'::jsonb, 'dom');
insert into _r select 'E1 page italienne : INSERT écarté', count(*) = 0, count(*)::text from platform_category_aspects where category_key = 'ESSAI/rayon' and field_key = 'taglia';
-- 2. Son UPDATE garde libellé, liste et type ; le reste suit.
update platform_category_aspects set field_label = 'Condizioni', allowed_values = '["Nuovo"]'::jsonb, input_type = 'text', seen_count = 7
 where category_key = 'ESSAI/rayon' and field_key = 'etat';
insert into _r select 'E2 page italienne : UPDATE garde libellé/liste/type, compteur suit',
  field_label = 'État' and allowed_values = '["Neuf"]'::jsonb and input_type = 'select' and seen_count = 7, field_label || ' ' || allowed_values::text || ' ' || coalesce(seen_count::text, '-')
  from platform_category_aspects where category_key = 'ESSAI/rayon' and field_key = 'etat';
-- 3. Nico (page française) : INSERT et UPDATE comme avant.
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
insert into platform_category_aspects (platform, category_key, field_key, field_label, required, input_type, allowed_values, source)
values ('vinted', 'ESSAI/rayon', 'taille', 'Taille', true, 'select', '["M"]'::jsonb, 'dom');
update platform_category_aspects set field_label = 'État (fr)' where category_key = 'ESSAI/rayon' and field_key = 'etat';
insert into _r select 'E3 page française : INSERT et UPDATE comme avant',
  (select count(*) from platform_category_aspects where category_key = 'ESSAI/rayon' and field_key = 'taille') = 1
  and (select field_label from platform_category_aspects where category_key = 'ESSAI/rayon' and field_key = 'etat') = 'État (fr)', '';
-- 4. Une autre plateforme n'est jamais touchée.
select set_config('request.jwt.claims', '{"sub":"ac19c8c9-586a-4f76-a0fc-55e4e59ab3c3","role":"authenticated"}', true);
insert into platform_category_aspects (platform, category_key, field_key, field_label, required, input_type, allowed_values, source)
values ('leboncoin', 'ESSAI/rayon', 'etat', 'Condizioni', true, 'select', '["x"]'::jsonb, 'dom');
insert into _r select 'E4 autre plateforme : inchangé', count(*) = 1, '' from platform_category_aspects where platform = 'leboncoin' and category_key = 'ESSAI/rayon';
select essai, ok, detail from _r order by essai;
rollback;
