-- INVERSE de 20261118220000 : l'index retrouve sa liste du 12/11 (sans les deux types de relance) ; la fonction part.
-- À lancer hors transaction ; vérifier AVANT qu'aucune ligne cloud_relance_* n'existe en double (sinon le create échoue).
drop function if exists public.index_one_shot_types();
drop index if exists public.email_logs_one_shot_unique;
create unique index if not exists email_logs_one_shot_unique
  on public.email_logs (user_id, email_type)
  where email_type = any (array[
    'welcome', 'how_it_works', 'blast_relaunch_aout', 'blast_founder',
    'founder_plan', 'voice_conversion', 'blast_sync_dressing',
    'reactiv_1409_a', 'reactiv_1409_b', 'reactiv_1409_c', 'reactiv_1409_d',
    'extension_link_rattrapage', 'stock_pret_2309',
    'blast_rentree_fillsell50_2609', 'cloud_essai_veille',
    'annonce_formules_cloud'
  ]);
