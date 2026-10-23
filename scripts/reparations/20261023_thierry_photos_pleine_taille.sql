-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 (point 1, feu vert de Nico 12:05 « en pleine taille ») — LES PHOTOS eBAY DES FICHES DE THIERRY
-- EN PLEINE TAILLE, DANS L'ORDRE DE L'ANNONCE
-- ═══════════════════════════════════════════════════════════════════════════
-- Le détail Trading (GetItem) rendait les photos en 400 px ($_1.JPG) et la liste en 140 px (s-l140) ; la même clé
-- d'image sert l'original (s-l1600 — mesuré : 509×512 au lieu de 400×393). Corrigé à la lecture (ebay-releve-api v7,
-- _shared/ebay-photos.js). Ici, les fiches déjà lues :
--   1. passage A — une fiche dont les photos sont des adresses eBay réduites (140 px, 400 px) de son annonce : elles
--      deviennent l'original (s-l1600), même clé, même ordre ;
--   2. passage B — une fiche dont les photos sont des COPIES chez nous mesurées à 400 px ou moins (liste fournie par
--      la mesure du 23/10 : `_photos_reduites_2310`) : elle reprend les photos de son annonce d'origine, en pleine
--      taille, dans l'ordre de l'annonce (jamais moins de photos qu'avant).
-- Puis rapatriement (photos_a_rapatrier) ; tracé au journal (photos_origine_completees : une copie produite AVANT
-- part avec celles-ci — get-pending-jobs v274, republication Vinted comprise).
-- ⛔ Jamais une photo retouchée (enhanced/) ni ajoutée par la personne : une telle fiche est laissée telle quelle.
-- Sauvegarde : _backup_2310_photos_pleine_taille (photos avant). Inverse : en fin de fichier (commenté).
-- La liste des copies mesurées réduites (passage B) est fournie AVANT ce fichier, dans la même session :
--   create temp table _photos_reduites_2310 (inventaire_id bigint primary key); insert into _photos_reduites_2310 values (…);
begin;
set local statement_timeout = '120s';
create table if not exists public._backup_2310_photos_pleine_taille (
  inventaire_id bigint primary key, user_id uuid, photos jsonb, photos_a_rapatrier boolean, passage text,
  sauvegarde_le timestamptz default now());
alter table public._backup_2310_photos_pleine_taille enable row level security;
revoke all on public._backup_2310_photos_pleine_taille from anon, authenticated;

create temp table _nouvelles on commit drop as
with f as (
  select i.id, i.user_id, i.photos,
         array(select coalesce(o.p ->> 'url', o.p #>> '{}') from jsonb_array_elements(i.photos) with ordinality o(p, n) order by o.n) urls
    from inventaire i
   where i.user_id = 'c2175e91-3854-4a66-8388-e28810166a3e' and i.origine = 'releve_ebay' and i.fusionne_dans is null
     and jsonb_typeof(i.photos) = 'array' and jsonb_array_length(i.photos) > 0
), o as (
  select distinct on (a.inventaire_id) a.inventaire_id,
         array(select public.ebay_cle_image(x.u) from jsonb_array_elements_text(a.donnees_index -> 'photos') with ordinality x(u, n)
                where public.ebay_cle_image(x.u) is not null order by x.n) cles
    from annonces_plateforme a
   where a.platform = 'ebay' and a.disparu_le is null and jsonb_typeof(a.donnees_index -> 'photos') = 'array'
     and a.user_id = 'c2175e91-3854-4a66-8388-e28810166a3e'
   order by a.inventaire_id, a.donnees_index_le desc nulls last
), j as (
  select f.*, o.cles,
         -- passage A : toutes les photos sont des adresses eBay de cette annonce, dont au moins une réduite
         (select bool_and(coalesce(public.ebay_cle_image(u) = any (o.cles), false)) from unnest(f.urls) u) toutes_ebay_de_l_annonce,
         (select bool_or(u ~ '/s-l(140|225|300|400|500)\.jpg' or u ~ '/\$_[0-9]+\.JPG') from unnest(f.urls) u) une_reduite,
         -- passage B : copies mesurées réduites (fiche listée par la mesure)
         exists (select 1 from pg_temp._photos_reduites_2310 r where r.inventaire_id = f.id) copie_reduite,
         (select bool_or(u like '%/enhanced/%') from unnest(f.urls) u) retouchee,
         (select bool_and(u like '%i.ebayimg.com/%' or u ~ ('/(rapatrie-fiche|rehosted)/' || f.id::text || '/')) from unnest(f.urls) u) que_ebay_ou_copies
    from f join o on o.inventaire_id = f.id
)
select j.id, j.user_id, j.photos,
       (select jsonb_agg('https://i.ebayimg.com/images/g/' || c || '/s-l1600.jpg' order by n)
          from (select distinct on (c) c, n from unnest(j.cles) with ordinality t(c, n) order by c, n) d) nouvelles,
       case when j.toutes_ebay_de_l_annonce and j.une_reduite then 'A' else 'B' end passage
  from j
 where coalesce(cardinality(j.cles), 0) >= cardinality(j.urls) and coalesce(cardinality(j.cles), 0) >= 1
   and not coalesce(j.retouchee, false)
   and ((j.toutes_ebay_de_l_annonce and j.une_reduite) or (j.copie_reduite and j.que_ebay_ou_copies));

insert into public._backup_2310_photos_pleine_taille (inventaire_id, user_id, photos, photos_a_rapatrier, passage)
select n.id, n.user_id, i.photos, i.photos_a_rapatrier, n.passage from _nouvelles n join inventaire i on i.id = n.id
on conflict (inventaire_id) do nothing;

update inventaire i set photos = n.nouvelles, photos_a_rapatrier = true
  from _nouvelles n where i.id = n.id and i.photos is distinct from n.nouvelles;

insert into inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
select n.user_id, n.id, 'photos', left(n.photos::text, 500), jsonb_array_length(n.nouvelles)::text || ' photo(s) de l''annonce d''origine en pleine taille',
       'releve', 'photos_origine_completees', jsonb_build_object('pleine_taille', true, 'passage', n.passage, 'avant', jsonb_array_length(n.photos), 'apres', jsonb_array_length(n.nouvelles))
  from _nouvelles n where n.photos is distinct from n.nouvelles;

select passage, count(*) fiches, sum(jsonb_array_length(nouvelles)) photos from _nouvelles where photos is distinct from nouvelles group by 1 order by 1;
commit;

-- INVERSE (sur décision seulement) :
-- update inventaire i set photos = b.photos, photos_a_rapatrier = b.photos_a_rapatrier
--   from public._backup_2310_photos_pleine_taille b where i.id = b.inventaire_id;
