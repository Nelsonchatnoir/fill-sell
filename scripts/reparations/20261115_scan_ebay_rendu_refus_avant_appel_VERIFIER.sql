-- 20261115_scan_ebay_rendu_refus_avant_appel_VERIFIER.sql — SELECT SEULEMENT (15/11/2026, lot de Nico, point 2).
-- À lire après 20261115_scan_ebay_rendu_refus_avant_appel.sql (et, plus tard, après le déploiement d'ebay-api-worker).
--   npx supabase db query --linked --read-only -f scripts/reparations/20261115_scan_ebay_rendu_refus_avant_appel_VERIFIER.sql
-- Attendu juste après le script : (1) 10 lignes, chacune « lens_scan_maintenant » = rendu et « avant » = echec /
-- HTTP 429 identify_unavailable ; (2) 0 marqueur 429 restant ; (3) aucun marqueur « en_cours » de plus de 10 min.
-- Plus tard : une fiche rescannée par un job eBay montre son nouveau marqueur dans (1) (ok, echec, ou rendu si l'IA
-- refuse encore avant appel), daté après le script ; (4) liste les réservations rendues par le worker (règle du 15/11).

-- (1) Les 10 fiches : sauvegarde et état présent.
select left(b.user_id::text, 8) as compte, b.id as article, left(i.titre, 40) as titre, i.statut,
       to_char((b.lens_scan_avant ->> 'at')::timestamptz at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') as marqueur_avant_le,
       b.lens_scan_avant -> 'v' ->> 'statut' as avant_statut, b.lens_scan_avant -> 'v' ->> 'detail' as avant_detail,
       i.attributs -> 'lens_scan' -> 'v' ->> 'statut' as lens_scan_maintenant,
       to_char((i.attributs -> 'lens_scan' ->> 'at')::timestamptz at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') as marqueur_maintenant_le,
       to_char(b.sauve_le at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') as sauve_le
  from public._backup_1511_lens_scan_rendu b
  left join public.inventaire i on i.id = b.id
 order by (b.lens_scan_avant ->> 'at')::timestamptz, b.id;

-- (2) Dans toute la base : les marqueurs d'échec par détail (attendu : plus aucun « HTTP 429 identify_unavailable »).
select coalesce(substring(attributs -> 'lens_scan' -> 'v' ->> 'detail' from '^[^{:]{0,60}'), '∅') as detail_debut,
       attributs -> 'lens_scan' -> 'v' ->> 'statut' as statut, count(*) as n
  from public.inventaire
 where attributs ? 'lens_scan' and coalesce(attributs -> 'lens_scan' -> 'v' ->> 'statut', '') <> 'ok'
 group by 1, 2 order by 3 desc;

-- (3) Réservations restées « en_cours » plus de 10 min (attendu : aucune — un worker coupé en plein appel en laisse une).
select left(user_id::text, 8) as compte, id as article,
       to_char((attributs -> 'lens_scan' ->> 'at')::timestamptz at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') as reserve_le,
       left(attributs -> 'lens_scan' -> 'v' ->> 'job', 8) as job8
  from public.inventaire
 where attributs -> 'lens_scan' -> 'v' ->> 'statut' = 'en_cours'
   and (attributs -> 'lens_scan' ->> 'at')::timestamptz < now() - interval '10 minutes';

-- (4) Après le déploiement d'ebay-api-worker : les réservations rendues (refus avant appel), la plus récente d'abord.
select left(user_id::text, 8) as compte, id as article, left(titre, 40) as titre,
       attributs -> 'lens_scan' -> 'v' ->> 'raison' as raison, attributs -> 'lens_scan' -> 'v' ->> 'detail' as detail,
       to_char((attributs -> 'lens_scan' -> 'v' ->> 'rendu_le')::timestamptz at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') as rendu_le,
       left(attributs -> 'lens_scan' -> 'v' ->> 'job', 8) as job8
  from public.inventaire
 where attributs -> 'lens_scan' -> 'v' ->> 'statut' = 'rendu'
 order by (attributs -> 'lens_scan' -> 'v' ->> 'rendu_le')::timestamptz desc nulls last
 limit 50;
