-- Inverse de 20261018170000_recreation_vinted_rattachee_au_releve.sql
drop trigger if exists inventaire_a_rattache_recreation_vinted on public.inventaire;
drop function if exists public.inventaire_rattache_recreation_vinted();
drop function if exists public.recreation_vinted_retrait_le(jsonb);
drop function if exists public.recreation_vinted_envois(jsonb);
drop function if exists public.recreation_vinted_titre_norm(text);
