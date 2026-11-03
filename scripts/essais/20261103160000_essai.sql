-- Essai à blanc de 20261103160000_annonces_plateforme_statut_brut : annulé (ROLLBACK).
begin;
set local lock_timeout = '5s';
alter table public.annonces_plateforme add column if not exists statut_brut text;
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'annonces_plateforme' and column_name = 'statut_brut') as colonne,
       (select count(*) from public.annonces_plateforme where statut_brut is not null) as lignes_ecrites;
rollback;
