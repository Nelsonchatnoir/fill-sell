-- 20261114_formule_13e274de_VERIFIER.sql — SELECT SEULEMENT (bloc F, 14/11/2026). À lire ~5 s après 20261114_formule_13e274de.mjs --jouer (le webhook).
-- Attendu :
--   (b) pro_cloud, essai gardé      : is_business f, is_pro t, cloud_formule pro_cloud, is_cloud f, essai 14/11 00:39 → 21/11 00:39,
--                                     cloud_periode_fin 21/11 00:39, etat {"etat":"essai"}, IP 78 attribuee_essai (inchangée)
--   (a) business_cloud, garder      : is_business t, cloud_formule business_cloud, le reste comme (b)
--   (a) business_cloud, finir       : is_business t, cloud_formule business_cloud, is_cloud t, cloud_periode_fin ≈ +1 mois,
--                                     etat {"etat":"paye"}, IP 78 attribuee_client (déclencheur profiles_cloud_pool → conversion)
--   inverse                         : is_business t, cloud_formule NULL, is_cloud f, cloud_periode_fin NULL, etat essai jusqu'au 21/11
select left(id::text, 8) as id8, is_premium, is_pro, is_business, is_cloud, cloud_canal, cloud_ref, cloud_formule,
       cloud_essai_debut at time zone 'Europe/Paris' as essai_debut, cloud_essai_fin at time zone 'Europe/Paris' as essai_fin,
       cloud_essai_arrete, cloud_periode_fin at time zone 'Europe/Paris' as periode_fin, cloud_arret_fin_periode, cloud_voie,
       public.cloud_etat(id) as etat
  from public.profiles
 where id = '13e274de-7af1-4368-8c31-afe214252ca2';

select id, commande, etat, left(user_id::text, 8) as id8, attribuee_le at time zone 'Europe/Paris' as attribuee_le,
       liberee_le at time zone 'Europe/Paris' as liberee_le, repos_fin at time zone 'Europe/Paris' as repos_fin
  from public.cloud_ips
 where commande = '88422230';

select id, kind, delta, included_after, metadata, created_at at time zone 'Europe/Paris' as le
  from public.coin_ledger
 where user_id = '13e274de-7af1-4368-8c31-afe214252ca2'
 order by id;
