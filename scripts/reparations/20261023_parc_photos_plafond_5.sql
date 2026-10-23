-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 (point 1, audit du parc) — LES FICHES eBAY RESTÉES À 5 PHOTOS REÇOIVENT TOUTES CELLES DE LEUR ANNONCE
-- ═══════════════════════════════════════════════════════════════════════════
-- Fiches importées depuis le 18/09 (origine releve_ebay), complétées par la page eBay lue par l'extension (ld+json :
-- 5 photos au plus) alors que le détail par l'API en porte davantage (6 à 24). Signature exacte du défaut : la fiche a
-- autant de photos que la page capturée (≤ 5), le détail API en a plus, et TOUTES ses photos sont des copies FillSell
-- de CETTE fiche ou des photos eBay de l'annonce. Elle reçoit toutes les photos du détail, dans son ordre, en pleine
-- taille ; rapatriement ; tracé (photos_origine_completees, mode reparation_plafond_5).
-- ⛔ Une photo retouchée ou ajoutée par la personne, un nombre qui ne correspond pas à la page : la fiche est laissée.
-- ⛔ Aucune annonce en ligne n'est touchée (liste à part, pour décision) ; aucun mail.
-- Sauvegarde : _backup_2310_photos_plafond5. Inverse : en fin de fichier (commenté). Essai : COMMIT → ROLLBACK.
begin;
set local statement_timeout = '120s';
create table if not exists public._backup_2310_photos_plafond5 (
  inventaire_id bigint primary key, user_id uuid, photos jsonb, photos_a_rapatrier boolean, n_avant integer, n_apres integer,
  sauvegarde_le timestamptz default now());
alter table public._backup_2310_photos_plafond5 enable row level security;
revoke all on public._backup_2310_photos_plafond5 from anon, authenticated;

create temp table _plafond on commit drop as
with f as (
  select i.id, i.user_id, i.photos, jsonb_array_length(i.photos) k
    from inventaire i
   where i.fusionne_dans is null and i.origine = 'releve_ebay' and i.created_at >= '2026-09-18 00:00:00+02'
     and jsonb_typeof(i.photos) = 'array' and jsonb_array_length(i.photos) between 2 and 5
), a as (
  select distinct on (a.inventaire_id) a.inventaire_id,
         case when jsonb_typeof(a.capture -> 'photos') = 'array' then jsonb_array_length(a.capture -> 'photos') else 0 end n_cap,
         jsonb_array_length(a.donnees_index -> 'photos') n_idx, a.donnees_index -> 'photos' idx
    from annonces_plateforme a
   where a.platform = 'ebay' and a.inventaire_id in (select id from f) and jsonb_typeof(a.donnees_index -> 'photos') = 'array'
   order by a.inventaire_id, jsonb_array_length(a.donnees_index -> 'photos') desc
), nouvelles as (
  select a.inventaire_id,
         (select jsonb_agg(to_jsonb('https://i.ebayimg.com/images/g/' || d.c || '/s-l1600.jpg') order by d.o)
            from (select distinct on (public.ebay_cle_image(x.u)) public.ebay_cle_image(x.u) c, x.o
                    from jsonb_array_elements_text(a.idx) with ordinality x(u, o)
                   where public.ebay_cle_image(x.u) is not null
                   order by public.ebay_cle_image(x.u), x.o) d) photos
    from a
)
select f.id, f.user_id, f.photos avant, f.k, n.photos apres
  from f join a on a.inventaire_id = f.id join nouvelles n on n.inventaire_id = f.id
 where a.n_cap = f.k and a.n_idx > f.k and jsonb_array_length(n.photos) > f.k
   and not exists (select 1 from jsonb_array_elements(f.photos) e(p)
                    where not coalesce(coalesce(e.p ->> 'url', e.p #>> '{}') ~ ('/(rapatrie-fiche|rehosted)/' || f.id::text || '/')
                                       or public.ebay_cle_image(coalesce(e.p ->> 'url', e.p #>> '{}')) in
                                          (select public.ebay_cle_image(v.u) from jsonb_array_elements_text(n.photos) v(u)), false));

insert into public._backup_2310_photos_plafond5 (inventaire_id, user_id, photos, photos_a_rapatrier, n_avant, n_apres)
select p.id, p.user_id, i.photos, i.photos_a_rapatrier, p.k, jsonb_array_length(p.apres)
  from _plafond p join inventaire i on i.id = p.id
on conflict (inventaire_id) do nothing;

update inventaire i set photos = p.apres, photos_a_rapatrier = true from _plafond p where i.id = p.id and i.photos = p.avant;

insert into inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
select p.user_id, p.id, 'photos', left(p.avant::text, 500), jsonb_array_length(p.apres)::text || ' photo(s) de l''annonce d''origine',
       'releve', 'photos_origine_completees', jsonb_build_object('avant', p.k, 'apres', jsonb_array_length(p.apres), 'mode', 'reparation_plafond_5')
  from _plafond p;

select u.email, public.palier_de(p.user_id) palier, count(*) fiches, sum(jsonb_array_length(p.apres) - p.k) photos_ajoutees
  from _plafond p join auth.users u on u.id = p.user_id group by 1, 2 order by (public.palier_de(p.user_id) = 'free'), 3 desc;
commit;

-- INVERSE (sur décision seulement) :
-- update inventaire i set photos = b.photos, photos_a_rapatrier = b.photos_a_rapatrier
--   from public._backup_2310_photos_plafond5 b where i.id = b.inventaire_id;
