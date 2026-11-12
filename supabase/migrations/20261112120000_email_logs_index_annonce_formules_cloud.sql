-- ═════════════════════════════════════════════════════════════════════════════
-- MAIL D'ANNONCE DES FORMULES AVEC CLOUD : SON TYPE ENTRE DANS L'INDEX ONE-SHOT (2026-11-12)
-- ═════════════════════════════════════════════════════════════════════════════
-- Campagne marketing « Plus besoin d'ordinateur : le Cloud se prend avec ta formule », envoyée par
-- envoyer_mail_ponctuel APRÈS l'ouverture des formules, sur feu vert de Nico. Type : `annonce_formules_cloud` — UN
-- envoi par personne, à vie (docs/regles/mails-paiements-comptabilite.md : un type one-shot entre dans
-- email_logs_one_shot_unique AVANT le premier envoi au parc, sinon il repart en doublon sans que rien ne le signale).
--
-- Définition de départ : celle de la PROD, lue le 12/11/2026 (pg_indexes), dernière entrée « cloud_essai_veille ».
-- Seul ajout : 'annonce_formules_cloud'. Vérifié AVANT : 0 ligne de ce type en base (type neuf).
--
-- ⚠️ CE QUE L'INDEX FAIT : envoyer_mail_ponctuel appelle la porte en mode `journal` (ligne posée APRÈS l'envoi) ;
-- l'index rend un second envoi VISIBLE (23505 dans email_log_echecs, ops-digest de 8 h 50). Ce qui l'empêche, c'est la
-- construction des lots : chaque vague exclut toute personne ayant déjà une ligne de ce type.
--
-- EN PROD (feu vert de Nico), hors transaction — la table sert en permanence —, trois ordres SÉPARÉS :
--   create unique index concurrently email_logs_one_shot_unique_v2 on public.email_logs (user_id, email_type)
--     where email_type = any (array[…la liste ci-dessous…]);
--   drop index concurrently public.email_logs_one_shot_unique;
--   alter index public.email_logs_one_shot_unique_v2 rename to email_logs_one_shot_unique;
-- puis `npx supabase migration repair --linked --status applied 20261112120000`.
-- Retour arrière : supabase/rollbacks/20261112120000_email_logs_index_annonce_formules_cloud_INVERSE.sql.
-- Essayée sur une base JETABLE (Postgres embarqué) : preuve-index-annonce.mjs (ce dossier).
-- La forme ci-dessous est celle qu'une base neuve rejoue.

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
