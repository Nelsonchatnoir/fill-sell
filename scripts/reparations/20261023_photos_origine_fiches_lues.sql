-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 (point 1) : LES FICHES DONT L'ANNONCE D'ORIGINE EST DÉJÀ LUE REÇOIVENT TOUTES SES PHOTOS
-- ═══════════════════════════════════════════════════════════════════════════
-- Le détail de leur annonce a été lu AVANT la migration 20261023100000 (11:40) : la complétion d'alors ne
-- reconnaissait pas la vignette recopiée chez nous (rehosted/<fiche>/, au format {url}) — la fiche est restée à
-- une photo. On rejoue la règle d'aujourd'hui (fiche_completer_photos_capture), la même que la base applique à
-- chaque lecture : toutes les photos de l'annonce, dans son ordre, sans doublon, à la place de la vignette (ou de
-- sa copie) ; jamais au-dessus d'une fiche qui a déjà deux photos, d'une photo retouchée ou ajoutée par la personne.
-- Sauvegarde AVANT : _backup_2310_photos_origine (3 219 fiches ≤ 1 photo, 89 comptes, 11:40:06).
-- Inverse (sur décision) : en fin de fichier, commenté.
begin;
set local statement_timeout = '120s';
create temp table _faites (inventaire_id bigint, user_id uuid, avant integer, apres integer) on commit drop;
do $$
declare r record; v_ok boolean; n integer;
begin
  for r in
    select distinct on (i.id) i.id, i.user_id, a.photo_url,
           case when jsonb_typeof(a.capture -> 'photos') = 'array' and jsonb_array_length(a.capture -> 'photos') > 1 then a.capture
                else a.donnees_index end src,
           jsonb_array_length(case when jsonb_typeof(i.photos) = 'array' then i.photos else '[]' end) avant
      from inventaire i
      join annonces_plateforme a on a.inventaire_id = i.id and a.user_id = i.user_id and a.disparu_le is null
     where i.fusionne_dans is null
       and jsonb_array_length(case when jsonb_typeof(i.photos) = 'array' then i.photos else '[]' end) <= 1
       and ((jsonb_typeof(a.capture -> 'photos') = 'array' and jsonb_array_length(a.capture -> 'photos') > 1)
            or (jsonb_typeof(a.donnees_index -> 'photos') = 'array' and jsonb_array_length(a.donnees_index -> 'photos') > 1))
     order by i.id, a.vu_le desc nulls last
  loop
    v_ok := public.fiche_completer_photos_capture(r.id, r.photo_url, r.src);
    if v_ok then
      select jsonb_array_length(photos) into n from inventaire where id = r.id;
      insert into _faites values (r.id, r.user_id, r.avant, n);
    end if;
  end loop;
end $$;
select u.email, count(*) fiches, sum(f.apres - f.avant) photos_ajoutees from _faites f join auth.users u on u.id = f.user_id group by 1 order by 2 desc;
commit;

-- INVERSE (sur décision seulement) : rend aux fiches complétées ce jour leurs photos d'avant.
-- update inventaire i set photos = b.photos, photos_a_rapatrier = b.photos_a_rapatrier
--   from public._backup_2310_photos_origine b
--  where i.id = b.inventaire_id
--    and exists (select 1 from inventaire_journal jl where jl.inventaire_id = i.id and jl.motif = 'photos_origine_completees'
--                and jl.created_at >= '2026-10-23 11:40:00+02');
