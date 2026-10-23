-- Tests de 20261024110000_securite_droits_explicites_3010 (assemblés par 20261024110000_generer.sh, ROLLBACK).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;

-- ── S : sauvegardes ─────────────────────────────────────────────────────────
insert into _r select 'S1 aucune sauvegarde sans RLS', count(*) = 0, count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and public.est_table_de_sauvegarde(c.relname) and not c.relrowsecurity;
insert into _r select 'S2 aucune sauvegarde lisible par anon ou authenticated', count(*) = 0, count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') and public.est_table_de_sauvegarde(c.relname)
   and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE'));
insert into _r select 'S3 les 4 sauvegardes ouvertes du 20-21/10 ont la RLS',
  bool_and(c.relrowsecurity) and count(*) = 4, count(*)::text
  from pg_class c where c.oid in ('public._backup_2010_sebastien_beebs_jobs'::regclass, 'public._backup_2010_louis_seller_lbc_echecs'::regclass,
                                  'public._backup_2110_parc_jamais_vues_jobs'::regclass, 'public._backup_2110_louis_seller_doublons'::regclass);
insert into _r select 'S4 aucune table réelle classée sauvegarde (cross_post_jobs, inventaire, jobs_reservations_extension, lens_temp_purge_trace, backfill…)',
  not (public.est_table_de_sauvegarde('cross_post_jobs') or public.est_table_de_sauvegarde('inventaire') or public.est_table_de_sauvegarde('jobs_reservations_extension')
       or public.est_table_de_sauvegarde('lens_temp_purge_trace') or public.est_table_de_sauvegarde('backfill_vinted_account_trace')
       or public.est_table_de_sauvegarde('vinted_republish_captures') or public.est_table_de_sauvegarde('ventes_prouvees_passages')), null;
insert into _r select 'S5 les tables réelles gardent leurs droits (authenticated lit cross_post_jobs, inventaire, ventes)',
  has_table_privilege('authenticated', 'public.cross_post_jobs', 'SELECT') and has_table_privilege('authenticated', 'public.inventaire', 'UPDATE')
  and has_table_privilege('authenticated', 'public.ventes', 'INSERT') and has_table_privilege('service_role', 'public.cross_post_jobs', 'UPDATE'), null;

-- ── D : droits par défaut (régime du 30/10) ───────────────────────────────────
insert into _r select 'D1 tables : plus aucun droit implicite (anon, authenticated, service_role)',
  not exists (select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
               and d.defaclobjtype = 'r' and d.defaclacl::text ~ '(anon|authenticated|service_role)='), null;
insert into _r select 'D2 séquences : plus aucun droit implicite',
  not exists (select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
               and d.defaclobjtype = 'S' and d.defaclacl::text ~ '(anon|authenticated|service_role)='), null;
insert into _r select 'D3 fonctions : plus exécutables par anon par défaut (authenticated, service_role gardés)',
  exists (select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
           and d.defaclobjtype = 'f' and d.defaclacl::text !~ 'anon=' and d.defaclacl::text ~ 'authenticated=X' and d.defaclacl::text ~ 'service_role=X'), null;

-- ── N : une table naît protégée ─────────────────────────────────────────────────
create table public.essai_2410_reelle (id bigserial primary key, v text);
insert into _r select 'N1 table réelle : RLS active à la naissance', relrowsecurity, null from pg_class where oid = 'public.essai_2410_reelle'::regclass;
insert into _r select 'N2 table réelle : service_role lit et écrit (table et séquence)',
  has_table_privilege('service_role', 'public.essai_2410_reelle', 'SELECT') and has_table_privilege('service_role', 'public.essai_2410_reelle', 'INSERT')
  and has_sequence_privilege('service_role', 'public.essai_2410_reelle_id_seq', 'USAGE'), null;
insert into _r select 'N3 table réelle : rien pour anon ni authenticated tant que la migration ne le donne pas',
  not has_table_privilege('anon', 'public.essai_2410_reelle', 'SELECT') and not has_table_privilege('authenticated', 'public.essai_2410_reelle', 'SELECT'), null;
create table public._backup_2410_essai_protegee as select 1 as x;
insert into _r select 'N4 sauvegarde (CREATE TABLE AS) : RLS, aucun droit client, ni service_role',
  c.relrowsecurity and not has_table_privilege('anon', c.oid, 'SELECT') and not has_table_privilege('authenticated', c.oid, 'SELECT')
  and not has_table_privilege('service_role', c.oid, 'SELECT'), null
  from pg_class c where c.oid = 'public._backup_2410_essai_protegee'::regclass;
select 1 as y into public.sauvegarde_2410_essai_select_into;
insert into _r select 'N5 sauvegarde (SELECT INTO) : RLS, aucun droit client',
  c.relrowsecurity and not has_table_privilege('authenticated', c.oid, 'SELECT'), null
  from pg_class c where c.oid = 'public.sauvegarde_2410_essai_select_into'::regclass;
create temp table _essai_temporaire (x int);
insert into _r values ('N6 table temporaire : création intacte (hors public)', true, null);

-- ── T : un déclencheur SECURITY DEFINER se déclenche sans EXECUTE pour la session ─
create table public.essai_2410_trg (id int, marque text);
grant select, insert on public.essai_2410_trg to authenticated;
create policy essai_2410_trg_tout on public.essai_2410_trg for all to authenticated using (true) with check (true);
create function public.essai_2410_trg_fn() returns trigger language plpgsql security definer set search_path to 'public' as
  $f$ begin new.marque := 'declenche'; return new; end $f$;
revoke execute on function public.essai_2410_trg_fn() from public, anon, authenticated;
create trigger essai_2410_trg_bi before insert on public.essai_2410_trg for each row execute function public.essai_2410_trg_fn();
set local role authenticated;
insert into public.essai_2410_trg (id) values (1);
reset role;
insert into _r select 'T1 déclencheur sans EXECUTE pour authenticated : il se déclenche', marque = 'declenche', marque from public.essai_2410_trg where id = 1;

-- ── F : les fonctions de lecture ─────────────────────────────────────────────────
insert into _r select 'F1 anon n''exécute plus aucune des 19 fonctions de lecture', count(*) = 0, string_agg(p.proname, ', ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('annonce_publiee_par_compte','annonce_publiee_par_compte_lie','article_vendu','boutique_proprietaire',
   'boutique_vinted_autre_compte','comptes_sont_lies','debut_cycle_quotas','fiche_annonces_vivantes','opla_sortie_passee','plateforme_ecartee_pour',
   'quota_annonces_consommees','quotas_etat','rapprocher_classer_identifiant','releve_ebay_par_api','republish_planifiee_actives_eligibles',
   'retrait_job_prouve','sync_multi_ouverte_pour','vente_prouvee_fiche_liee','vinted_boutique_du_poste')
   and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into _r select 'F2 authenticated n''exécute plus que quotas_etat et boutique_vinted_autre_compte',
  string_agg(p.proname, ', ' order by p.proname) = 'boutique_vinted_autre_compte, quotas_etat', string_agg(p.proname, ', ' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('annonce_publiee_par_compte','annonce_publiee_par_compte_lie','article_vendu','boutique_proprietaire',
   'boutique_vinted_autre_compte','comptes_sont_lies','debut_cycle_quotas','fiche_annonces_vivantes','opla_sortie_passee','plateforme_ecartee_pour',
   'quota_annonces_consommees','quotas_etat','rapprocher_classer_identifiant','releve_ebay_par_api','republish_planifiee_actives_eligibles',
   'retrait_job_prouve','sync_multi_ouverte_pour','vente_prouvee_fiche_liee','vinted_boutique_du_poste')
   and has_function_privilege('authenticated', p.oid, 'EXECUTE');
insert into _r select 'F3 service_role les exécute toutes (fonctions edge : article_vendu, retrait_job_prouve, debut_cycle_quotas…)',
  bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')) and count(*) = 20, count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('annonce_publiee_par_compte','annonce_publiee_par_compte_lie','article_vendu','boutique_proprietaire',
   'boutique_vinted_autre_compte','comptes_sont_lies','debut_cycle_quotas','fiche_annonces_vivantes','opla_sortie_passee','plateforme_ecartee_pour',
   'quota_annonces_consommees','quotas_etat','rapprocher_classer_identifiant','releve_ebay_par_api','republish_planifiee_actives_eligibles',
   'retrait_job_prouve','sync_multi_ouverte_pour','vente_prouvee_fiche_liee','vinted_boutique_du_poste');
-- F4 appels réels sous la session de la personne (Nico) : ce que l'app et get-pending-jobs font.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
create temp table _f4 as select public.quotas_etat() as q, public.boutique_vinted_autre_compte('f44b5917-bccc-4431-ba41-f40571a2ed18', '000') as b;
reset role;
insert into _r select 'F4 sous la session : quotas_etat() et boutique_vinted_autre_compte(user.id) répondent', q is not null and b is not null, left(q::text, 80) from _f4;
-- F5 un appel direct d'une fonction fermée sous la session échoue (42501).
do $$ begin
  set local role authenticated;
  perform public.article_vendu(1);
  reset role;
  insert into _r values ('F5 article_vendu sous la session : refusée', false, 'acceptée');
exception when insufficient_privilege then
  reset role;
  insert into _r values ('F5 article_vendu sous la session : refusée', true, 'refusée (42501)');
end $$;

-- ── G : déclencheurs et RPC de l'app ─────────────────────────────────────────────
insert into _r select 'G1 plus aucune fonction de déclencheur SECURITY DEFINER exécutable par anon ou authenticated', count(*) = 0, count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and p.prorettype = 'trigger'::regtype
   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
insert into _r select 'G2 plus aucune fonction SECURITY DEFINER exécutable par anon (hors événement)', count(*) = 0, string_agg(p.proname, ', ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');
insert into _r select 'G3 les 5 RPC de l''app connectée restent exécutables par authenticated',
  bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) and count(*) = 5, count(*)::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('reserver_scan_lens','set_app_build','set_profile_currency','set_profile_username','synchro_relancer_rangement');
-- G4 les déclencheurs réels se déclenchent sous la session : écritures de Nico sur sa propre fiche et son propre job.
set local role authenticated;
update public.inventaire set titre = titre where id = (select id from public.inventaire where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' and titre ilike '%TEST FillSell%' order by id limit 1);
update public.cross_post_jobs set error = error where id = (select id from public.cross_post_jobs where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' order by created_at desc limit 1);
reset role;
insert into _r values ('G4 écritures réelles sous la session (inventaire, cross_post_jobs) : déclencheurs passés sans erreur', true, null);

select essai, ok, detail from _r order by essai;
select count(*) filter (where ok) as verts, count(*) as total, string_agg(essai, ' | ') filter (where not ok) as rouges from _r;
