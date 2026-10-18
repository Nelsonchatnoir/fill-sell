-- Set A : annonces créées par les vendeurs (relevés), valeur choisie par le vendeur = vérité
with r as (
  select a.id, a.user_id, a.platform, a.inventaire_id, a.capture
  from annonces_plateforme a join cross_post_jobs j on j.id=a.job_id
  where j.handler_build like 'releve%' and a.inventaire_id is not null and a.platform in ('leboncoin','beebs')),
lbc as (
  select r.id, r.user_id, r.inventaire_id, 'leboncoin' platform, r.capture->>'categorie' feuille,
    jsonb_object_agg(e->>'key', e->>'value_label') valeurs
  from r cross join lateral jsonb_array_elements(case when jsonb_typeof(r.capture->'attributs_bruts')='array' then r.capture->'attributs_bruts' else '[]' end) e
  where r.platform='leboncoin' and e->>'key' is not null and coalesce(e->>'value_label','')<>''
  group by 1,2,3,4,5),
lbc2 as (
  select *, row_number() over (partition by feuille order by md5(id::text)) rang from lbc
  where feuille in ('Décoration','Arts de la table','Bricolage','Électroménager','Jardin & Plantes','Ameublement','Linge de maison','Collection','Jeux & Jouets','Livres','Photo, audio & vidéo','DVD - Films','Antiquités','Accessoires informatique','Vêtements','Sport & Plein air','Loisirs créatifs','Équipement bébé','Montres & Bijoux','Accessoires & Bagagerie')),
bb as (
  select r.id, r.user_id, r.inventaire_id, 'beebs' platform, r.capture->>'categorie' feuille, jsonb_build_object('Âge', r.capture->>'age') valeurs,
    row_number() over (order by md5(r.id::text)) rang
  from r where r.platform='beebs' and coalesce(r.capture->>'age','')<>''),
tout as (
  select id, user_id, inventaire_id, platform, feuille, valeurs from lbc2 where rang <= case when feuille in ('Vêtements','Livres','Jeux & Jouets','Collection','Décoration','Arts de la table','Ameublement') then 40 else 30 end
  union all select id, user_id, inventaire_id, platform, feuille, valeurs from bb where rang <= 80)
select t.id, t.user_id, t.inventaire_id, t.platform, t.feuille, t.valeurs,
  i.titre, left(i.description, 1500) description, i.marque, i.attributs->'genre'->>'v' genre, i.attributs->'taille'->>'v' taille,
  i.attributs->'categorie_vinted'->'chemin' chemin_vinted, i.attributs->'attributs_visibles'->'v' attributs_visibles,
  (select jsonb_agg(x) from (select x from jsonb_array_elements(case when jsonb_typeof(i.photos)='array' then i.photos else '[]' end) x limit 2) s) photos
from tout t join inventaire i on i.id=t.inventaire_id;
