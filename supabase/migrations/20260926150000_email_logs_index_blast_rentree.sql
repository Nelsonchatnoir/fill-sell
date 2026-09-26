-- ══════════════════════════════════════════════════════════════════════════════
-- BLAST DE RENTRÉE (FILLSELL50) : SON TYPE ENTRE DANS L'INDEX ONE-SHOT (2026-09-26)
-- ══════════════════════════════════════════════════════════════════════════════
-- Campagne « FillSell a complètement changé » + -50 % le premier mois, envoyée
-- au segment A (comptes sans extension, gratuits) par envoyer_mail_ponctuel.
-- Type : `blast_rentree_fillsell50_2609` — UN envoi par personne, à vie.
--
-- CLAUDE.md : un type one-shot absent de `email_logs_one_shot_unique` repart
-- en doublon sans que rien ne le signale (bug du welcome, 03/08). Il entre
-- donc dans l'index AVANT le premier envoi au parc.
--
-- ⚠️ CE QUE L'INDEX FAIT ICI, ET CE QU'IL NE FAIT PAS. `envoyer_mail_ponctuel`
-- appelle la porte en mode `journal` (ligne posée APRÈS l'envoi) : l'index ne
-- BLOQUE donc pas un second envoi, il le rend VISIBLE — 23505 dans
-- email_log_echecs, remonté par l'ops-digest de 8h50. Ce qui empêche le
-- doublon, c'est la construction des lots : chaque lot exclut toute personne
-- ayant déjà une ligne de ce type, et un lot ne part qu'une fois le précédent
-- terminé et relu.
--
-- Vérifié AVANT : 0 ligne de ce type en base (type neuf).
--
-- En prod, la bascule se fait CONCURRENTLY (hors transaction : la table sert
-- en permanence), en trois ordres séparés :
--   create unique index concurrently email_logs_one_shot_unique_v2 on … ;
--   drop index concurrently public.email_logs_one_shot_unique;
--   alter index public.email_logs_one_shot_unique_v2 rename to email_logs_one_shot_unique;
-- La forme ci-dessous est celle qu'une base neuve rejoue.

drop index if exists public.email_logs_one_shot_unique;

create unique index if not exists email_logs_one_shot_unique
  on public.email_logs (user_id, email_type)
  where email_type = any (array[
    'welcome', 'how_it_works', 'blast_relaunch_aout', 'blast_founder',
    'founder_plan', 'voice_conversion', 'blast_sync_dressing',
    'reactiv_1409_a', 'reactiv_1409_b', 'reactiv_1409_c', 'reactiv_1409_d',
    'extension_link_rattrapage', 'stock_pret_2309',
    'blast_rentree_fillsell50_2609'
  ]);
