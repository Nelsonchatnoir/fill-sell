-- 20/10 soir — Louis (louis-seller, Business, relié à louis@) : 55 dépôts Leboncoin du 19/10 passés en ÉCHEC le 20/10
-- (06:14, 15:11, 16:37) avec le motif « refusée par sa modération ». Le motif était faux pour 54 d'entre eux : leur
-- fiche est coupée en deux depuis le 18/10 (fiches_liees_comptes), sa JUMELLE chez louis@ est EN LIGNE sur le MÊME
-- compte Leboncoin — Leboncoin a refusé le doublon. Le 55e n'a pas de jumelle en ligne : il reste en échec.
-- La RÈGLE (migration 20261020210000 + 20261020220000, appliquées AVANT ce script) : la fiche jumelle occupe la
-- plateforme — aucun nouveau dépôt, aucune relance, et un dépôt refusé pour ce motif est clos sans rouge
-- (« déjà en ligne via ton compte relié, rien à refaire »), comme les 71 encore en attente le seront au relevé.
-- Ce script donne aux 54 le verdict de la règle : 'cancelled' + le vrai motif. Réservation déjà réglée (aucune
-- unité rendue deux fois), aucune vente, aucun retrait, aucun mail ; RIEN n'est republié.
-- Ordre de Nico (20/10 soir) : « les 54 échecs ne doivent pas être republiés » ; réparation après sauvegarde.
-- Sauvegarde _backup_2010_louis_seller_lbc_echecs ; inverse : 20261020_louis_seller_lbc_doublons_relie_INVERSE.sql.
begin;
create temp table _j as
  select j.id, j.status, j.error, j.platform_fields, o.listing_id as annonce_jumelle
    from cross_post_jobs j
    cross join lateral (select o.listing_id from public.jumelle_occupe_plateformes(j.user_id, j.inventaire_id) o
                         where o.platform = 'leboncoin' and o.statut = 'en_ligne' limit 1) o
   where j.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and j.platform = 'leboncoin'
     and j.action = 'publish' and j.status = 'failed'
     and j.platform_fields #>> '{depot_jamais_en_ligne,issue}' = 'refus_moderation_probable'
     and j.created_at >= '2026-10-18 22:00+00' and j.created_at < '2026-10-20 22:00+00'
     and o.listing_id is not null
     and o.listing_id <> all (array_remove(array[nullif(btrim(j.platform_listing_id), ''),
                                                 nullif(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), '')], null));
do $g$ begin
  -- 54 au 20/10 ≈ 22:45 ; davantage si un relevé a jugé d'autres dépôts entre-temps (même motif, même règle).
  if (select count(*) from _j) < 54 then raise exception 'attendu au moins 54 échecs à jumelle en ligne, trouvé % — réparation arrêtée', (select count(*) from _j); end if;
  if to_regprocedure('public.cross_post_jobs_refus_relance_jumelle_en_ligne()') is null then raise exception 'la règle 20261020210000 n''est pas appliquée — réparation arrêtée'; end if;
end $g$;
create table public._backup_2010_louis_seller_lbc_echecs as
  select j.id, j.status, j.error, j.platform_fields, j.reservation_settled_at, now() as sauve_le
    from cross_post_jobs j where j.id in (select id from _j);
update cross_post_jobs j set
  status = 'cancelled',
  error = 'Ce dépôt n''a pas été mis en ligne par Leboncoin : ton article y est DÉJÀ en ligne sous l''annonce '
          || x.annonce_jumelle || ', publiée par ton compte FillSell relié — Leboncoin refuse les doublons. Rien à refaire, rien n''est vendu.',
  platform_fields = jsonb_set(j.platform_fields, '{depot_jamais_en_ligne}',
      (j.platform_fields -> 'depot_jamais_en_ligne') || jsonb_build_object(
        'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', x.annonce_jumelle,
        'reclasse', jsonb_build_object('le', now(), 'par', 'reparation_2010_louis', 'avant', 'refus_moderation_probable')))
  from _j x
 where j.id = x.id and j.status = 'failed';
select (select count(*) from _backup_2010_louis_seller_lbc_echecs) sauvegardes,
       (select count(*) from cross_post_jobs where id in (select id from _j) and status = 'cancelled'
          and platform_fields #>> '{depot_jamais_en_ligne,issue}' = 'en_ligne_par_compte_relie') reclasses,
       (select count(*) from cross_post_jobs j join _backup_2010_louis_seller_lbc_echecs b on b.id = j.id
         where j.reservation_settled_at is distinct from b.reservation_settled_at) reservations_touchees,
       (select count(*) from cross_post_jobs where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and platform = 'leboncoin'
          and status = 'failed' and created_at >= '2026-10-18 22:00+00') echecs_restants,
       (select count(*) from cross_post_jobs where user_id in ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
          and created_at >= now()) jobs_crees,
       (select count(*) from coin_ledger where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and created_at >= now()) mouvements_unites;
commit;
