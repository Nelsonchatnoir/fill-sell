-- (30/10, lot D) FillSell Cloud — compte de NICO SEUL (f44b5917…), décision de Nico : « tout est visible UNIQUEMENT
-- sur mon compte (drapeau par compte) » et « tests uniquement sur mon compte ».
--   1. le drapeau par compte : beta_flags.cloud = true (l'app lit ce drapeau ; aucun identifiant écrit en dur) ;
--   2. l'option OFFERTE le temps du test (aucun paiement), comme le 05/10 : en rotation d'IP (coin_config
--      cloud_ip_rotation = 1, migration 20261030130000), l'orchestrateur (COMPTES_AUTORISES = Nico seul) allume son
--      navigateur, sortie par une IP française du pool (94.194.94.233, jusqu'au 04/11 13:57).
-- Sauvegarde (relue le 30/10 vers 11:00 Paris) : is_cloud NULL, cloud_canal NULL, cloud_essai_debut NULL,
-- beta_flags {"depop":true,"keepalive":true,"nouveau_stepper":true,"messages_bordereaux":true}.
-- Inverse : 20261030_cloud_nico_temoin_offert_INVERSE.sql (purge par l'orchestrateur : profil, coffre, session).
BEGIN;
UPDATE public.profiles
   SET beta_flags = COALESCE(beta_flags, '{}'::jsonb) || '{"cloud": true}'::jsonb,
       is_cloud = true, cloud_canal = 'offert'
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   AND is_cloud IS NULL AND cloud_canal IS NULL;
SELECT is_cloud, cloud_canal, beta_flags ->> 'cloud' AS temoin, public.cloud_etat(id) ->> 'etat' AS etat
  FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
