-- (01/11, demande de Nico : « l'essai de 48 h tourne sur le vrai produit, sur mon compte seul ») LA MISE EN PLACE :
--   1. IP DÉDIÉE (comme l'essai qui a passé : 81.181.239.136, commande IPRoyal 87004978, jusqu'au 29/11) : la rotation
--      du pool est coupée (coin_config.cloud_ip_rotation = 0 ; le compte de Nico est le seul servi par le Cloud),
--      l'IP 81.181.239.136 est réservée à Nico puis attribuée par la fonction du pool (cloud_compte_synchroniser) ;
--   2. LE DRAPEAU CLOUD de son compte (profiles.cloud_voie, migration 20261101180000) : le Cloud exécute ses tâches
--      Vinted, Leboncoin, Beebs et Depop, son ordinateur n'en reçoit plus (get-pending-jobs).
-- Prérequis : l'IP 81.181.239.136 est ENTRÉE au pool (outils/ip.mjs ajouter 87004978, puis son contrôle d'entrée
-- → « disponible »). Le script s'arrête sinon, sans rien changer.
-- Sauvegarde : public._backup_0111_cloud_essai48h. Inverse : 20261101_cloud_essai48h_nico_INVERSE.sql
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE host(ip) = '81.181.239.136' AND etat = 'disponible') THEN
    RAISE EXCEPTION 'IP 81.181.239.136 absente du pool ou pas encore disponible : rien n''est changé';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public._backup_0111_cloud_essai48h AS
  SELECT now() AS le,
         (SELECT value FROM public.coin_config WHERE key = 'cloud_ip_rotation') AS rotation,
         (SELECT cloud_voie FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS cloud_voie,
         (SELECT jsonb_agg(jsonb_build_object('id', id, 'ip', host(ip), 'etat', etat, 'user_id', user_id, 'reserve_pour', reserve_pour))
            FROM public.cloud_ips) AS ips;
ALTER TABLE public._backup_0111_cloud_essai48h ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0111_cloud_essai48h FROM PUBLIC, anon, authenticated;

UPDATE public.coin_config SET value = 0 WHERE key = 'cloud_ip_rotation';
UPDATE public.cloud_ips SET reserve_pour = 'f44b5917-bccc-4431-ba41-f40571a2ed18', reserve_jusqu_au = now() + interval '1 hour', maj_le = now()
 WHERE host(ip) = '81.181.239.136' AND etat = 'disponible';
SELECT public.cloud_compte_synchroniser('f44b5917-bccc-4431-ba41-f40571a2ed18') AS attribution;
UPDATE public.profiles SET cloud_voie = true WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

-- Relu : l'IP du compte DOIT être 81.181.239.136, sinon tout est annulé.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND host(ip) = '81.181.239.136') THEN
    RAISE EXCEPTION 'le compte n''a pas reçu 81.181.239.136 : tout est annulé';
  END IF;
END $$;
SELECT p.cloud_voie, public.cloud_etat(p.id) ->> 'etat' AS etat, host(i.ip) AS ip, i.etat AS etat_ip,
       (SELECT value FROM public.coin_config WHERE key = 'cloud_ip_rotation') AS rotation,
       (SELECT count(*) FROM public.profiles WHERE cloud_voie) AS comptes_cloud_voie
  FROM public.profiles p LEFT JOIN public.cloud_ips i ON i.user_id = p.id
 WHERE p.id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
