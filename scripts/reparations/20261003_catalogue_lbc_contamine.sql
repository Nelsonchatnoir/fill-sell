-- ═══════════════════════════════════════════════════════════════════════════
-- CATALOGUE LEBONCOIN CONTAMINÉ — RÉPARATION (03/10, point 9)
-- ═══════════════════════════════════════════════════════════════════════════
-- Données de CATALOGUE (platform_category_aspects), aucune donnée d'utilisateur.
-- Cause (corrigée dans l'extension 0.6.90) : le relevé des options retombait
-- sur tout le document quand le menu propre du champ manquait (listes d'un
-- autre champ apprises), et les champs observés étaient rangés sous NOTRE
-- rayon même quand Leboncoin avait retenu sa propre suggestion (champs
-- obligatoires d'un autre rayon). Effets visibles : « Poids » proposant les
-- choix de « Type » (peinture en Bricolage), questions d'un autre rayon.
--   1. les listes empruntées (identiques à la liste du champ « Type ») sont vidées ;
--   2. les champs obligatoires d'un autre rayon passent en facultatif
--      (la ligne reste, elle ne génère plus de question).
-- Sauvegarde AVANT : _backup_0310_catalogue_lbc. Inverse :
-- 20261003_catalogue_lbc_contamine_INVERSE.sql.

begin;

create table if not exists public._backup_0310_catalogue_lbc as
select now() as sauvegarde_le, a.* from public.platform_category_aspects a where false;

insert into public._backup_0310_catalogue_lbc
select now(), a.* from public.platform_category_aspects a
where a.platform = 'leboncoin' and (
  (a.category_key = 'Maison & Jardin > Bricolage'   and a.field_key = 'diy_weight') or
  (a.category_key = 'Maison & Jardin > Ameublement' and a.field_key in ('furniture_weight', 'furniture_quantity')) or
  (a.category_key = 'Maison & Jardin > Décoration'  and a.field_key = 'table_art_product') or
  (a.category_key = 'Maison & Jardin > Arts de la table' and a.field_key in ('house_and_garden_type', 'decoration_type')) or
  (a.category_key = 'Mode > Montres & Bijoux'       and a.field_key = 'creative_activities_product') or
  (a.category_key = 'Maison & Jardin > Linge de maison' and a.field_key = 'leisure_collection_product') or
  (a.category_key = 'Loisirs > Instruments de musique' and a.field_key = 'toy_type') or
  (a.category_key = 'Divers > Autres'               and a.field_key = 'sports_hobbies_universe')
)
and not exists (select 1 from public._backup_0310_catalogue_lbc b where b.id = a.id);

-- 1. Listes empruntées (exactement la liste du champ « Type » du même rayon).
-- Liste VIDE ('[]'), pas NULL : la garde platform_category_aspects_garde_source
-- rend l'ancienne liste à toute écriture NULL (elle protège les listes du DOM
-- contre un refus 400 qui ne nomme que le champ). L'app lit [] comme « aucune
-- liste connue » (hasOpts), exactement comme NULL.
update public.platform_category_aspects a set allowed_values = '[]'::jsonb
where a.platform = 'leboncoin'
  and ((a.category_key = 'Maison & Jardin > Bricolage'   and a.field_key = 'diy_weight')
    or (a.category_key = 'Maison & Jardin > Ameublement' and a.field_key in ('furniture_weight', 'furniture_quantity')))
  and a.allowed_values = (select t.allowed_values from public.platform_category_aspects t
                          where t.platform = a.platform and t.category_key = a.category_key
                            and t.field_key in ('diy_type', 'furniture_category') limit 1);

-- 2. Champs obligatoires d'un autre rayon : facultatifs.
update public.platform_category_aspects a set required = false
where a.platform = 'leboncoin' and a.required = true and (
  (a.category_key = 'Maison & Jardin > Décoration'  and a.field_key = 'table_art_product') or
  (a.category_key = 'Maison & Jardin > Arts de la table' and a.field_key in ('house_and_garden_type', 'decoration_type')) or
  (a.category_key = 'Mode > Montres & Bijoux'       and a.field_key = 'creative_activities_product') or
  (a.category_key = 'Maison & Jardin > Linge de maison' and a.field_key = 'leisure_collection_product') or
  (a.category_key = 'Loisirs > Instruments de musique' and a.field_key = 'toy_type') or
  (a.category_key = 'Divers > Autres'               and a.field_key = 'sports_hobbies_universe')
);

commit;

-- Relecture :
-- select category_key, field_key, required, allowed_values is null as liste_videe from platform_category_aspects
-- where id in (select id from _backup_0310_catalogue_lbc) order by 1, 2;
