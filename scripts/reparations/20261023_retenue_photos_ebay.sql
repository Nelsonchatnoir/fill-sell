-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 (point 1, urgence — Thierry) : RETENIR AU DÉPART LES PUBLICATIONS DONT LA FICHE eBAY N'A PAS
-- ENCORE TOUTES SES PHOTOS
-- ═══════════════════════════════════════════════════════════════════════════
-- Pose sur les jobs EN FILE la marque que get-pending-jobs (v272) poserait à leur prochain service
-- (platform_fields.attente_lecture_origine + la phrase « en cours de lecture », jamais une erreur) : la base refuse
-- alors leur démarrage au poste qui les tient déjà en mémoire (controler_job_extension, migration 20261023110000).
-- Même règle que _shared/contenu-fiche.js (lectureOrigineEnAttente), pour les fiches nées d'un relevé eBay :
--   · il manque à la fiche son texte, son état ou ses photos (≤ 1) ET le détail de son annonce eBay n'est pas lu ;
--   · ou le détail est lu (moins de 24 h), il porte plus de photos que la fiche, et la seule photo de la fiche est
--     encore celle d'eBay (ou sa copie chez nous).
-- ⛔ Rien d'annulé, rien de supprimé : seuls des jobs « pending » de publication. Aucun job en cours, aucun retrait,
--    aucune republication Vinted. Sauvegarde : _backup_2310_retenues_photos. Inverse : en fin de fichier (commenté).
begin;
set local statement_timeout = '60s';

create table if not exists public._backup_2310_retenues_photos (
  job_id uuid primary key, user_id uuid, inventaire_id bigint, platform text, status text,
  platform_fields jsonb, error text, sauvegarde_le timestamptz default now());
alter table public._backup_2310_retenues_photos enable row level security;

create temp table _cibles on commit drop as
with fiches as (
  select i.id, i.user_id, i.description, i.attributs, i.photos,
         case when jsonb_typeof(i.photos) = 'array' then jsonb_array_length(i.photos) else 0 end n,
         case when jsonb_typeof(i.photos) = 'array' then coalesce(i.photos -> 0 ->> 'url', i.photos ->> 0) end p0
    from inventaire i
   where i.origine = 'releve_ebay' and i.fusionne_dans is null
), lect as (
  select a.inventaire_id,
         bool_or(a.capture_le is not null or a.donnees_index_le is not null) lue,
         max(greatest(a.capture_le, a.donnees_index_le)) lue_le,
         max(greatest(case when jsonb_typeof(a.capture -> 'photos') = 'array' then jsonb_array_length(a.capture -> 'photos') end,
                      case when jsonb_typeof(a.donnees_index -> 'photos') = 'array' then jsonb_array_length(a.donnees_index -> 'photos') end)) n_origine
    from annonces_plateforme a
   where a.platform = 'ebay' and a.disparu_le is null and a.inventaire_id is not null
   group by a.inventaire_id
), f2 as (
  select f.*, l.lue, l.lue_le, l.n_origine,
         array_remove(array[
           case when coalesce(array_length(regexp_split_to_array(btrim(coalesce(f.description, '')), '\s+'), 1), 0) < 2
                  or btrim(coalesce(f.description, '')) = '' then 'description' end,
           case when btrim(coalesce(f.attributs -> 'etat' ->> 'v', '')) = '' then 'etat' end,
           case when f.n <= 1 then 'photos' end], null) manque
    from fiches f join lect l on l.inventaire_id = f.id
), attente as (
  select f2.id, f2.user_id,
         case when not f2.lue then to_jsonb(f2.manque) else '["photos"]'::jsonb end manque
    from f2
   where cardinality(f2.manque) > 0
     and (not f2.lue
          or (f2.n <= 1 and coalesce(f2.n_origine, 0) > f2.n
              and (f2.n = 0 or f2.p0 !~ '/storage/v1/object/public/' or f2.p0 ~ ('/(rapatrie-fiche|rehosted)/' || f2.id::text || '/'))
              and f2.lue_le > now() - interval '24 hours'))
)
select j.id job_id, j.user_id, j.inventaire_id, j.platform, a.manque
  from cross_post_jobs j join attente a on a.id = j.inventaire_id and a.user_id = j.user_id
 where j.status = 'pending' and coalesce(j.action, 'publish') = 'publish'
   and not (coalesce(j.platform_fields, '{}'::jsonb) ? 'attente_lecture_origine');

insert into public._backup_2310_retenues_photos (job_id, user_id, inventaire_id, platform, status, platform_fields, error)
select j.id, j.user_id, j.inventaire_id, j.platform, j.status, j.platform_fields, j.error
  from cross_post_jobs j join _cibles c on c.job_id = j.id
on conflict (job_id) do nothing;

update cross_post_jobs j set
  platform_fields = coalesce(j.platform_fields, '{}'::jsonb) || jsonb_build_object('attente_lecture_origine',
      jsonb_build_object('depuis', now(), 'plateforme', 'ebay', 'manque', c.manque, 'pose_par', 'reparation 23/10 (retenue au départ)')),
  error = 'En cours de lecture de ton annonce d''origine eBay (toutes ses photos, texte, état) : FillSell la lit tout seul et elle partira avec TON contenu. Rien à faire.'
  from _cibles c
 where j.id = c.job_id and j.status = 'pending';

select u.email, c.platform, count(*) retenus from _cibles c join auth.users u on u.id = c.user_id group by 1, 2 order by 3 desc;
commit;

-- INVERSE (à jouer seulement sur décision) : rend aux jobs encore en file leur état d'avant.
-- update cross_post_jobs j set platform_fields = b.platform_fields, error = b.error
--   from public._backup_2310_retenues_photos b
--  where j.id = b.job_id and j.status = 'pending' and j.platform_fields ? 'attente_lecture_origine';

-- ── 2e passage (11:53) : la fiche a reçu ses photos APRÈS que le job a été servi (le job en porte moins) ──
-- Même marque : l'ancienne boucle ne dépose pas sa copie à une photo ; au prochain service, get-pending-jobs lève la
-- retenue (fiche complète) et impose toutes les photos de la fiche (contenuAImposer).
begin;
insert into public._backup_2310_retenues_photos (job_id, user_id, inventaire_id, platform, status, platform_fields, error)
select j.id, j.user_id, j.inventaire_id, j.platform, j.status, j.platform_fields, j.error
  from cross_post_jobs j join inventaire i on i.id = j.inventaire_id and i.user_id = j.user_id
 where i.origine = 'releve_ebay' and j.status = 'pending' and coalesce(j.action, 'publish') = 'publish'
   and coalesce(j.photo_option, 'original') = 'original'
   and not (coalesce(j.platform_fields, '{}'::jsonb) ? 'attente_lecture_origine')
   and jsonb_array_length(case when jsonb_typeof(j.photos) = 'array' then j.photos else '[]' end)
       < jsonb_array_length(case when jsonb_typeof(i.photos) = 'array' then i.photos else '[]' end)
on conflict (job_id) do nothing;
update cross_post_jobs j set
  platform_fields = coalesce(j.platform_fields, '{}'::jsonb) || jsonb_build_object('attente_lecture_origine',
      jsonb_build_object('depuis', now(), 'plateforme', 'ebay', 'manque', '["photos"]'::jsonb, 'pose_par', 'reparation 23/10 (copie servie avant les photos)')),
  error = 'En cours de lecture de ton annonce d''origine eBay (toutes ses photos, texte, état) : FillSell la lit tout seul et elle partira avec TON contenu. Rien à faire.'
  from inventaire i
 where i.id = j.inventaire_id and i.user_id = j.user_id and i.origine = 'releve_ebay'
   and j.status = 'pending' and coalesce(j.action, 'publish') = 'publish' and coalesce(j.photo_option, 'original') = 'original'
   and not (coalesce(j.platform_fields, '{}'::jsonb) ? 'attente_lecture_origine')
   and jsonb_array_length(case when jsonb_typeof(j.photos) = 'array' then j.photos else '[]' end)
       < jsonb_array_length(case when jsonb_typeof(i.photos) = 'array' then i.photos else '[]' end);
select count(*) retenus_2e_passage from public._backup_2310_retenues_photos where sauvegarde_le > now() - interval '1 minute';
commit;

-- ── 3e passage (12:09, feu vert de Nico « en pleine taille ») : les copies à 2 photos servies à 400 px ──
-- Le détail eBay (GetItem) rendait les photos en 400 px ($_1.JPG) : les copies en file de Thierry nées de ces fiches
-- attendent les photos en pleine taille (même marque ; get-pending-jobs les impose au départ, rapatriées d'abord).
begin;
insert into public._backup_2310_retenues_photos (job_id, user_id, inventaire_id, platform, status, platform_fields, error)
select j.id, j.user_id, j.inventaire_id, j.platform, j.status, j.platform_fields, j.error
  from cross_post_jobs j join inventaire i on i.id = j.inventaire_id and i.user_id = j.user_id
 where j.user_id = 'c2175e91-3854-4a66-8388-e28810166a3e' and i.origine = 'releve_ebay'
   and j.status = 'pending' and coalesce(j.action, 'publish') = 'publish' and coalesce(j.photo_option, 'original') = 'original'
   and not (coalesce(j.platform_fields, '{}'::jsonb) ? 'attente_lecture_origine')
on conflict (job_id) do nothing;
update cross_post_jobs j set
  platform_fields = coalesce(j.platform_fields, '{}'::jsonb) || jsonb_build_object('attente_lecture_origine',
      jsonb_build_object('depuis', now(), 'plateforme', 'ebay', 'manque', '["photos"]'::jsonb, 'pose_par', 'reparation 23/10 (photos en pleine taille)')),
  error = 'En cours de lecture de ton annonce d''origine eBay (toutes ses photos, texte, état) : FillSell la lit tout seul et elle partira avec TON contenu. Rien à faire.'
  from inventaire i
 where i.id = j.inventaire_id and i.user_id = j.user_id and j.user_id = 'c2175e91-3854-4a66-8388-e28810166a3e' and i.origine = 'releve_ebay'
   and j.status = 'pending' and coalesce(j.action, 'publish') = 'publish' and coalesce(j.photo_option, 'original') = 'original'
   and not (coalesce(j.platform_fields, '{}'::jsonb) ? 'attente_lecture_origine');
select count(*) retenus_au_total from cross_post_jobs where user_id = 'c2175e91-3854-4a66-8388-e28810166a3e' and status = 'pending' and platform_fields ? 'attente_lecture_origine';
commit;

-- ── Les republications de réparation de Thierry : hors quota (décision de Nico, 12:05 ; migration 20261023120000) ──
begin;
update cross_post_jobs j set platform_fields = coalesce(j.platform_fields, '{}'::jsonb) || jsonb_build_object('hors_quota',
         jsonb_build_object('motif', 'erreur FillSell 23/10 : annonce partie avant ses photos eBay en pleine taille', 'le', now()))
  from public._backup_2310_thierry_republications b
 where j.id = (b.resultat ->> 'job_id')::uuid and j.user_id = 'c2175e91-3854-4a66-8388-e28810166a3e' and j.action = 'republish'
   and not (coalesce(j.platform_fields, '{}'::jsonb) ? 'hors_quota');
select count(*) republications_hors_quota from cross_post_jobs where user_id = 'c2175e91-3854-4a66-8388-e28810166a3e' and action = 'republish' and platform_fields ? 'hors_quota';
commit;
