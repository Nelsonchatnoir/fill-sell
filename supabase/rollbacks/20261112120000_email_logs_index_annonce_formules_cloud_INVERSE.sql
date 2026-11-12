-- RETOUR ARRIÈRE de 20261112120000_email_logs_index_annonce_formules_cloud.sql (2026-11-12).
-- Remet l'index one-shot EXACTEMENT comme en prod le 12/11/2026 (pg_indexes), sans 'annonce_formules_cloud'.
-- Les lignes email_logs du type restent (rien n'est supprimé) ; seul le contrôle d'unicité de ce type disparaît.
--
-- EN PROD, hors transaction, trois ordres SÉPARÉS :
--   create unique index concurrently email_logs_one_shot_unique_v1 on public.email_logs (user_id, email_type)
--     where email_type = any (array[…la liste ci-dessous…]);
--   drop index concurrently public.email_logs_one_shot_unique;
--   alter index public.email_logs_one_shot_unique_v1 rename to email_logs_one_shot_unique;
-- puis `npx supabase migration repair --linked --status reverted 20261112120000`.

drop index if exists public.email_logs_one_shot_unique;

create unique index if not exists email_logs_one_shot_unique
  on public.email_logs (user_id, email_type)
  where email_type = any (array[
    'welcome', 'how_it_works', 'blast_relaunch_aout', 'blast_founder',
    'founder_plan', 'voice_conversion', 'blast_sync_dressing',
    'reactiv_1409_a', 'reactiv_1409_b', 'reactiv_1409_c', 'reactiv_1409_d',
    'extension_link_rattrapage', 'stock_pret_2309',
    'blast_rentree_fillsell50_2609', 'cloud_essai_veille'
  ]);
