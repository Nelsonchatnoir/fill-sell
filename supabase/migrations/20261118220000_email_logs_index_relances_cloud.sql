-- ═════════════════════════════════════════════════════════════════════════════
-- RELANCES CLOUD : LEURS DEUX TYPES ENTRENT DANS L'INDEX ONE-SHOT (2026-11-18 soir)
-- ═════════════════════════════════════════════════════════════════════════════
-- Deux mails automatiques, UN envoi par personne à vie (ordre de Nico, 18/11) : `cloud_relance_arret` (renouvellement
-- coupé, J-3) et `cloud_relance_essai` (essai commencé sans aller au bout). Envoi en mode `reservation` par email-tunnel
-- (_shared/cloud-relances.js) : l'index porte la garantie « jamais deux ».
-- + `index_one_shot_types()` : lecture seule (service_role) des types que l'index nomme ; email-tunnel s'en sert comme
-- GARDE — si l'index ne nomme pas les deux types, aucune relance ne part.
--
-- Définition de départ : celle de la PROD, lue le 18/11/2026 (pg_get_indexdef), dernière entrée « annonce_formules_cloud ».
-- Seuls ajouts : 'cloud_relance_arret', 'cloud_relance_essai'. Types neufs (0 ligne).
-- EN PROD (feu vert de Nico), hors transaction, trois ordres SÉPARÉS (comme 20261112120000) :
--   create unique index concurrently email_logs_one_shot_unique_v2 on public.email_logs (user_id, email_type) where email_type = any (array[…]);
--   drop index concurrently public.email_logs_one_shot_unique;
--   alter index public.email_logs_one_shot_unique_v2 rename to email_logs_one_shot_unique;
-- puis la fonction, puis `npx supabase migration repair --linked --status applied 20261118220000`.
-- Retour arrière : supabase/rollbacks/20261118220000_email_logs_index_relances_cloud_INVERSE.sql.

drop index if exists public.email_logs_one_shot_unique;

create unique index if not exists email_logs_one_shot_unique
  on public.email_logs (user_id, email_type)
  where email_type = any (array[
    'welcome', 'how_it_works', 'blast_relaunch_aout', 'blast_founder',
    'founder_plan', 'voice_conversion', 'blast_sync_dressing',
    'reactiv_1409_a', 'reactiv_1409_b', 'reactiv_1409_c', 'reactiv_1409_d',
    'extension_link_rattrapage', 'stock_pret_2309',
    'blast_rentree_fillsell50_2609', 'cloud_essai_veille',
    'annonce_formules_cloud', 'cloud_relance_arret', 'cloud_relance_essai'
  ]);

create or replace function public.index_one_shot_types()
returns text[]
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(array_agg(m[1]), array[]::text[])
  from regexp_matches(
    coalesce((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'email_logs_one_shot_unique'), ''),
    '''([^'']+)''::text', 'g') as m;
$$;
revoke all on function public.index_one_shot_types() from public, anon, authenticated;
grant execute on function public.index_one_shot_types() to service_role;
