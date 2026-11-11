-- PREUVE (LECTURE SEULE) de la migration 20261111230000_essai_cloud_seul_droits_pro (11/11/2026, décision 1 de Nico) —
-- à jouer AVANT puis APRÈS, en postgres : npx supabase db query --linked -f scripts/reparations/20261111_essai_cloud_droits_pro_PREUVE.sql
-- (ou MCP execute_sql). ⚠ PAS `--read-only` : son rôle n'a pas EXECUTE sur palier_de (« permission denied », essayé le
-- 11/11 23:10). Le fichier ne contient que des SELECT.
-- AVANT relevé le 11/11/2026 vers 23:10 (MCP) : d607ba20 / d0ac0538 / b695d990 = free, au_moins_pro faux, bordereaux faux,
--   5 / 50 / 30, drapeaux faux, Cloud stripe, essai jusqu'au 15/11 15:16 / 17/11 11:46 / 17/11 11:52, cloud_etat essai,
--   cloud_voie vrai, remise_le 08/12 01:00 / 10/12 01:00 / 09/12 01:00, cycle 08/11 15:13 / 10/11 11:44 / 09/11 12:29,
--   grand livre 24 h : 0 ; témoin f44b5917 = pro (offert), 120 / 1 200 / illimitées.
-- Comptes désignés par leur id8, lus par la clé primaire (intervalle de l'id8). Heure de Paris.
-- Attendu AVANT : les trois « free », 5 annonces / 50 publications / 30 remontées, auto refusée (au_moins_pro faux).
-- Attendu APRÈS : les trois « pro » (droits Pro jusqu'à la fin de LEUR essai), 120 annonces / 1 200 publications /
--   remontées illimitées (NULL), au_moins_pro vrai, bordereaux vrai ; RIEN d'autre ne change : drapeaux is_premium /
--   is_pro / is_business / is_comped toujours faux, colonnes Cloud identiques, cloud_etat « essai », remise_le et début
--   de cycle identiques (aucun crédit, aucune ligne au grand livre) ; et un compte « témoin » sans essai reste ce qu'il est.
-- Après la fin d'un essai (15/11 15:16, 17/11 11:46, 17/11 11:52) : ce compte redevient « free » de lui-même.
WITH c(id8) AS (VALUES ('d607ba20'), ('d0ac0538'), ('b695d990'), ('f44b5917'))
SELECT c.id8,
       public.palier_de(p.id) AS palier,
       public.palier_au_moins(p.id, 'pro') AS au_moins_pro,
       public.bordereaux_ouverts_pour(p.id, 'vinted') AS bordereaux,
       public.jauge_annonces_plafond(p.id, public.palier_de(p.id)) AS annonces,
       public.jauge_publications_plafond(public.palier_de(p.id)) AS publications,
       public.quota_remontees_plafond(public.palier_de(p.id)) AS remontees,
       p.is_premium, p.is_pro, p.is_business, p.is_comped, p.is_cloud, p.cloud_canal, p.cloud_essai_arrete,
       to_char(p.cloud_essai_debut AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS essai_debut,
       to_char(p.cloud_essai_fin AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS essai_fin,
       public.cloud_etat(p.id, now()) ->> 'etat' AS cloud_etat, p.cloud_voie,
       to_char((SELECT w.next_grant_at FROM public.coin_wallets w WHERE w.user_id = p.id) AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS remise_le,
       to_char(public.debut_cycle_quotas(p.id) AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') AS cycle_debut,
       (SELECT count(*) FROM public.coin_ledger l WHERE l.user_id = p.id AND l.created_at > now() - interval '1 day') AS grand_livre_24h
  FROM c
  JOIN LATERAL (SELECT * FROM public.profiles pp
                 WHERE pp.id >= (c.id8 || '-0000-0000-0000-000000000000')::uuid
                   AND pp.id <= (c.id8 || '-ffff-ffff-ffff-ffffffffffff')::uuid LIMIT 2) p ON true
 ORDER BY c.id8;

-- Les quatre fonctions : APRÈS, leur md5 n'est plus celui de prod du 11/11 22:53 (palier_de 52173f13…, quotas_etat
-- 8c182788…, generate 00d31c6c…, lens f20a6128…), leurs droits sont les mêmes. Après l'INVERSE : de nouveau ces md5.
SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl::text AS droits,
       pg_get_functiondef(p.oid) LIKE '%décision 1 de Nico%' AS migree
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('palier_de', 'quotas_etat', 'spend_coins_for_generate', 'spend_coins_for_lens')
 ORDER BY 1;
