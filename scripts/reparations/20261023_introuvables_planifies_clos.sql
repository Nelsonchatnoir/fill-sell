-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 (point 3 — Louis) : LES REPUBLICATIONS AUTOMATIQUES EN PAUSE « INTROUVABLE » D'UNE ANNONCE MORTE
-- SE CLOSENT SANS BRUIT
-- ═══════════════════════════════════════════════════════════════════════════
-- Republications créées par la republication AUTOMATIQUE (republish_planifie), arrêtées à l'étape a_capturer (rien
-- retiré), en pause « introuvable à confirmer », dont l'annonce exacte a une absence établie (dépôt signalé « plus en
-- ligne » et jamais revu par un relevé depuis, ou republication précédente close « disparue »). Elles n'ont plus d'objet :
-- l'annonce n'existe plus (Louis : ses 8 articles sont en vente chez louis-seller sous de nouveaux numéros). Closes
-- « annonce disparue » (la règle 20261023140000 ne les recrée plus), sans message chez la personne.
-- ⛔ La question « vendue ? » du dépôt reste posée (la seule) : jamais une double vente manquée. Rien n'est retiré.
-- Sauvegarde : _backup_2310_introuvables_clos. Inverse : en fin de fichier (commenté). Essai : COMMIT → ROLLBACK.
begin;
set local statement_timeout = '60s';
create table if not exists public._backup_2310_introuvables_clos (
  job_id uuid primary key, user_id uuid, status text, error text, platform_fields jsonb, sauvegarde_le timestamptz default now());
alter table public._backup_2310_introuvables_clos enable row level security;
revoke all on public._backup_2310_introuvables_clos from anon, authenticated;

create temp table _clos on commit drop as
select j.id, j.user_id, j.platform, j.platform_listing_id
  from cross_post_jobs j
 where j.action = 'republish' and j.status = 'needs_user' and j.platform <> 'vinted'
   and j.platform_fields ->> 'needs_user_source' = 'introuvable_a_confirmer'
   and coalesce(j.platform_fields ->> 'republish_step', 'a_capturer') = 'a_capturer'
   and (j.platform_fields ->> 'republish_planifie') = 'true'
   and exists (
     select 1 from cross_post_jobs x
      where x.user_id = j.user_id and x.inventaire_id = j.inventaire_id and x.platform = j.platform
        and nullif(trim(x.platform_listing_id), '') = nullif(trim(j.platform_listing_id), '')
        and ((x.status = 'published' and x.platform_fields ->> 'sale_signal' = 'unavailable')
             or (x.action = 'republish' and x.platform_fields ? 'annonce_disparue'))
        and not exists (
          select 1 from annonces_plateforme a
           where a.user_id = j.user_id and a.platform = j.platform and a.listing_id = nullif(trim(j.platform_listing_id), '')
             and a.vu_le > coalesce(public._ts_ou_null(x.platform_fields ->> 'unavailable_since'),
                                    public._ts_ou_null(x.platform_fields #>> '{annonce_disparue,at}'), x.created_at)));

insert into public._backup_2310_introuvables_clos (job_id, user_id, status, error, platform_fields)
select j.id, j.user_id, j.status, j.error, j.platform_fields from cross_post_jobs j join _clos c on c.id = j.id
on conflict (job_id) do nothing;

update cross_post_jobs j set status = 'cancelled', error = null,
       platform_fields = (coalesce(j.platform_fields, '{}'::jsonb) - 'needs_user_source')
         || jsonb_build_object('annonce_disparue', jsonb_build_object('at', now(), 'motif', 'absence établie : dépôt plus en ligne, jamais revu par un relevé depuis',
                                                                   'pose_par', 'reparation 23/10 (republication automatique d''une annonce morte)'))
  from _clos c where j.id = c.id and j.status = 'needs_user';

select u.email, c.platform, count(*) closes, string_agg(c.platform_listing_id, ', ') annonces
  from _clos c join auth.users u on u.id = c.user_id group by 1, 2 order by 3 desc;
commit;

-- INVERSE (sur décision seulement) :
-- update cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
--   from public._backup_2310_introuvables_clos b where j.id = b.job_id and j.status = 'cancelled';
