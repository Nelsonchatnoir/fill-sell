-- PREUVE (LECTURE SEULE) de 20261111_retrait_leboncoin_comptes_relies.sql — à jouer avant, puis après l'exécution des
-- retraits par l'extension : npx supabase db query --linked --read-only -f <ce fichier>
-- Les annonces sont désignées par leurs dépôts (ad4e2895, 21a23488) et leurs annonces relevées (0607c980, bffc6551) ;
-- leurs numéros sont lus dans ces lignes.
-- Attendu APRÈS : deux retraits « deleted » (trace de confirmation), les deux annonces retiree_le / disparu_le posées
-- (retrait_job_id = le retrait), les dépôts ad4e2895 / 21a23488 clos (« retrait ciblé depuis l'app — pas une vente »),
-- les deux jumelles marquées (jumelles_retirees_partout), et un relevé Leboncoin COMPLET du compte relié commencé APRÈS le
-- retrait (lues = annoncées) qui ne les revoit plus (vu_le figé avant son début). ⚠ La boutique Leboncoin est partagée
-- entre les deux comptes : le relevé de l'autre compte rafraîchit aussi vu_le — c'est vu_le figé + retiree_le qui font preuve.

-- 1. Les retraits (les deux comptes, ces deux annonces).
SELECT 'retrait' AS quoi, d.id, d.user_id, d.inventaire_id, d.status,
       (d.created_at AT TIME ZONE 'Europe/Paris') AS cree_paris, (d.last_checked_at AT TIME ZONE 'Europe/Paris') AS vu_paris,
       d.platform_fields #>> '{arme_par,chemin}' AS chemin, left(d.error, 120) AS erreur,
       left(COALESCE(d.platform_fields ->> 'delete_trace', d.platform_fields ->> 'delete_confirmed_by', ''), 160) AS trace
  FROM public.cross_post_jobs d
  JOIN public.cross_post_jobs j ON j.id IN ('ad4e2895-c5e3-40e9-8bf0-5f1b10199479', '21a23488-a389-49a2-b228-5fc416d82c93')
 WHERE d.user_id IN ('faf5021a-479a-4bb3-b3ec-c296770739b7', '447d920c-976a-4d8f-aff4-a2998050358c')
   AND d.platform = 'leboncoin' AND d.action = 'delete'
   AND public.listing_designe(btrim(j.platform_listing_id), d.listing_url, d.platform_listing_id)
 ORDER BY d.created_at;

-- 2. Les deux dépôts et les deux annonces relevées.
SELECT 'depot' AS quoi, j.id, j.inventaire_id, j.status, left(j.error, 120) AS erreur,
       j.platform_fields -> 'retrait_arme' AS retrait_arme
  FROM public.cross_post_jobs j
 WHERE j.id IN ('ad4e2895-c5e3-40e9-8bf0-5f1b10199479', '21a23488-a389-49a2-b228-5fc416d82c93');
SELECT 'annonce' AS quoi, a.id, a.job_id, a.statut_plateforme, (a.vu_le AT TIME ZONE 'Europe/Paris') AS vu_paris,
       (a.disparu_le AT TIME ZONE 'Europe/Paris') AS disparu_paris, (a.retiree_le AT TIME ZONE 'Europe/Paris') AS retiree_paris,
       a.retrait_job_id, a.run_id
  FROM public.annonces_plateforme a
 WHERE a.id IN ('0607c980-29ee-40f9-93df-e79c10650c6a', 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad');

-- 3. Les relevés Leboncoin complets du compte relié commencés après le dernier retrait fait (3 au plus).
SELECT 'releve' AS quoi, r.id, (r.started_at AT TIME ZONE 'Europe/Paris') AS debut_paris,
       (r.finished_at AT TIME ZONE 'Europe/Paris') AS fin_paris, r.items_vus, r.total_entries, left(r.erreur, 80) AS erreur
  FROM public.vinted_sync_runs r
 WHERE r.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND r.kind = 'annonces' AND r.platform = 'leboncoin'
   AND r.status = 'done'
   AND r.started_at > COALESCE((SELECT max(a.retiree_le) FROM public.annonces_plateforme a
                                 WHERE a.id IN ('0607c980-29ee-40f9-93df-e79c10650c6a', 'bffc6551-e8f7-4769-a6e9-f4618b1fdfad')), now())
 ORDER BY r.started_at
 LIMIT 3;

-- 4. Ce que la règle a fait sur les deux jumelles (journal et marque du compte relié) et ce qui attend encore pour elles.
SELECT 'journal' AS quoi, u.feature, (u.created_at AT TIME ZONE 'Europe/Paris') AS le_paris, u.metadata
  FROM public.usage_logs u
 WHERE u.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
   AND u.feature IN ('retrait_annonces', 'retrait_refuse_compte_relie', 'retrait_partout_compte_relie')
   AND u.metadata ->> 'article_id' IN ('1792340705460616', '1792340705460686')
   AND u.created_at > '2026-11-11 00:00:00+01'
 ORDER BY u.created_at;
SELECT 'marque' AS quoi, m.inventaire_id, (m.le AT TIME ZONE 'Europe/Paris') AS le_paris, m.de_fiche, m.plateformes
  FROM public.jumelles_retirees_partout m
 WHERE m.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND m.inventaire_id IN (1792340705460616, 1792340705460686);
SELECT 'en_file' AS quoi, j.id, j.inventaire_id, j.platform, j.action, j.status
  FROM public.cross_post_jobs j
 WHERE j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.inventaire_id IN (1792340705460616, 1792340705460686)
   AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status IN ('pending', 'processing', 'needs_user', 'failed');
