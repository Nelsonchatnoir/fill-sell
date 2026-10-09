-- INVERSE de 20261009_depop_doublon_parcours.sql : remet TOUT ce que la
-- réparation a retiré ou changé, tel que sauvegardé dans
-- public._backup_0910_depop_doublon, À L'IDENTIQUE.
--
-- (09/10) L'inverse d'origine ne remettait qu'UN job (sous-requête scalaire :
-- erreur dès deux jobs), réécrivait updated_at, posait un JSON null dans
-- `proposition`, et butait sur la garde inventaire_releve_par_decision (une
-- fiche « releve_* » ne sort que d'une décision). Ici : chaque catégorie de
-- la sauvegarde est remise, toutes ses lignes ; `session_replication_role =
-- replica` le temps de la transaction, pour qu'AUCUN déclencheur ne réécrive
-- les lignes remises (traces de prix, rattachement, questions, retraits) —
-- c'est une restauration, pas une décision.
--   inventaire                   réinsérée telle quelle
--   cross_post_jobs              TOUS les jobs de la fiche, réinsérés
--   job_relaunch_log, jobs_reservations_extension, fiches_annonce  réinsérées
--   annonces_plateforme          inventaire_id, job_id, source_rapprochement,
--                                proposition, updated_at d'avant
--   rapprochements               les supprimées réinsérées ; inventaire_id
--                                rendu à celles que la clé étrangère a vidé
--   inventaire_doublons          réinsérées
--   inventaire_lie               a_verifier rendu là où le déclencheur l'a vidé,
--                                fusionne_dans rendu là où la clé l'a vidé
--   vinted_listing_snapshots, vinted_republish_captures  inventaire_id rendu
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $garde$
begin
  if to_regclass('public._backup_0910_depop_doublon') is null
     or not exists (select 1 from public._backup_0910_depop_doublon where t = 'inventaire' and id = '1791529881380') then
    raise exception 'inverse refusé : sauvegarde absente';
  end if;
  if exists (select 1 from inventaire where id = 1791529881380) then
    raise exception 'inverse refusé : la fiche 1791529881380 existe (inverse déjà joué ?)';
  end if;
end
$garde$;

set local session_replication_role = replica;

insert into inventaire
select (jsonb_populate_record(null::inventaire, b.ligne)).*
  from public._backup_0910_depop_doublon b where b.t = 'inventaire';

insert into cross_post_jobs
select (jsonb_populate_record(null::cross_post_jobs, b.ligne)).*
  from public._backup_0910_depop_doublon b
 where b.t = 'cross_post_jobs'
   and not exists (select 1 from cross_post_jobs j where j.id = b.id::uuid);

insert into job_relaunch_log
select (jsonb_populate_record(null::job_relaunch_log, b.ligne)).*
  from public._backup_0910_depop_doublon b
 where b.t = 'job_relaunch_log'
   and not exists (select 1 from job_relaunch_log l where l.id::text = b.id);

insert into jobs_reservations_extension
select (jsonb_populate_record(null::jobs_reservations_extension, b.ligne)).*
  from public._backup_0910_depop_doublon b
 where b.t = 'jobs_reservations_extension'
   and not exists (select 1 from jobs_reservations_extension r where r.job_id::text = b.id);

insert into fiches_annonce
select (jsonb_populate_record(null::fiches_annonce, b.ligne)).*
  from public._backup_0910_depop_doublon b
 where b.t = 'fiches_annonce'
   and not exists (select 1 from fiches_annonce f where f.inventaire_id::text = b.id);

update annonces_plateforme a
   set inventaire_id        = (b.ligne ->> 'inventaire_id')::bigint,
       job_id               = (b.ligne ->> 'job_id')::uuid,
       source_rapprochement = b.ligne ->> 'source_rapprochement',
       proposition          = nullif(b.ligne -> 'proposition', 'null'::jsonb),
       updated_at           = (b.ligne ->> 'updated_at')::timestamptz
  from public._backup_0910_depop_doublon b
 where b.t = 'annonces_plateforme' and a.id = b.id::uuid;

insert into rapprochements
select (jsonb_populate_record(null::rapprochements, b.ligne)).*
  from public._backup_0910_depop_doublon b
 where b.t = 'rapprochements'
   and not exists (select 1 from rapprochements r where r.id = b.id::uuid);
update rapprochements r
   set inventaire_id = (b.ligne ->> 'inventaire_id')::bigint
  from public._backup_0910_depop_doublon b
 where b.t = 'rapprochements' and r.id = b.id::uuid
   and r.inventaire_id is null and (b.ligne ->> 'inventaire_id') is not null;

insert into inventaire_doublons
select (jsonb_populate_record(null::inventaire_doublons, b.ligne)).*
  from public._backup_0910_depop_doublon b
 where b.t = 'inventaire_doublons'
   and not exists (select 1 from inventaire_doublons d where d.id = b.id::uuid);

update inventaire i
   set a_verifier = b.ligne -> 'a_verifier'
  from public._backup_0910_depop_doublon b
 where b.t = 'inventaire_lie' and i.id = b.id::bigint
   and i.a_verifier is null and nullif(b.ligne -> 'a_verifier', 'null'::jsonb) is not null;
update inventaire i
   set fusionne_dans = 1791529881380
  from public._backup_0910_depop_doublon b
 where b.t = 'inventaire_lie' and i.id = b.id::bigint
   and i.fusionne_dans is null and (b.ligne ->> 'fusionne_dans') = '1791529881380';

update vinted_listing_snapshots s
   set inventaire_id = 1791529881380
  from public._backup_0910_depop_doublon b
 where b.t = 'vinted_listing_snapshots' and s.id::text = b.id and s.inventaire_id is null;
update vinted_republish_captures c
   set inventaire_id = 1791529881380
  from public._backup_0910_depop_doublon b
 where b.t = 'vinted_republish_captures' and c.id::text = b.id and c.inventaire_id is null;

set local session_replication_role = origin;

-- Relecture : chaque ligne sauvegardée est revenue.
select jsonb_build_object(
  'fiche', (select count(*) from inventaire where id = 1791529881380),
  'jobs', (select count(*) from cross_post_jobs j join public._backup_0910_depop_doublon b
             on b.t = 'cross_post_jobs' and j.id = b.id::uuid),
  'jobs_sauvegardes', (select count(*) from public._backup_0910_depop_doublon where t = 'cross_post_jobs'),
  'rapprochements', (select count(*) from rapprochements r join public._backup_0910_depop_doublon b
                       on b.t = 'rapprochements' and r.id = b.id::uuid),
  'rapprochements_sauvegardes', (select count(*) from public._backup_0910_depop_doublon where t = 'rapprochements'),
  'questions', (select count(*) from inventaire_doublons d join public._backup_0910_depop_doublon b
                  on b.t = 'inventaire_doublons' and d.id = b.id::uuid),
  'questions_sauvegardees', (select count(*) from public._backup_0910_depop_doublon where t = 'inventaire_doublons'),
  'annonce', (select jsonb_build_object('inv', inventaire_id, 'job', job_id, 'source', source_rapprochement)
                from annonces_plateforme where id = '851b11bc-6f06-4abf-aa54-f638d085901e')) as resultat;
commit;
