-- (06/11 soir, point 1 de Nico) ESSAI TESTFLIGHT DU BINAIRE 2.9.163 — PHASE A « FERMÉ » : le compte de Nico perd
-- son drapeau de témoin Cloud (profiles.beta_flags.cloud) le temps de prouver, sur une installation neuve, qu'avec
-- l'interrupteur serveur fermé (coin_config.cloud_offre_ouverte absent) on ne voit RIEN du Cloud.
-- Ce que le script fait (rien d'autre) : sauvegarde public._backup_0611_temoin_cloud_nico (beta_flags d'avant), puis
-- beta_flags - 'cloud' pour CE compte. Son Cloud continue de tourner côté serveur (aucune fonction serveur ne lit ce
-- drapeau, hors la garde du paiement Stripe) : seuls les écrans Cloud de l'app disparaissent pendant l'essai.
-- PHASE B « OUVERT POUR LUI SEUL » = l'INVERSE : 20261106_essai_testflight_temoin_cloud_nico_ferme_INVERSE.sql.
-- Gardes : rien n'est écrit si la sauvegarde existe déjà ou si le drapeau n'est pas vrai.
-- Lancement (au signal de Nico, iPhone en main) :
--   npx supabase db query --linked --yes -f scripts/reparations/20261106_essai_testflight_temoin_cloud_nico_ferme.sql
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0611_temoin_cloud_nico') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0611_temoin_cloud_nico existe déjà : phase A déjà passée, rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND beta_flags->>'cloud' = 'true') THEN
    RAISE EXCEPTION 'le compte de Nico n''est pas témoin Cloud : rien n''est écrit';
  END IF;
END $$;

CREATE TABLE public._backup_0611_temoin_cloud_nico AS
  SELECT p.id, p.beta_flags AS avant, now() AS le FROM public.profiles p WHERE p.id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
ALTER TABLE public._backup_0611_temoin_cloud_nico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0611_temoin_cloud_nico FROM PUBLIC, anon, authenticated;

UPDATE public.profiles SET beta_flags = beta_flags - 'cloud'
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND beta_flags->>'cloud' = 'true';

SELECT p.beta_flags ? 'cloud' AS temoin_encore, b.avant ->> 'cloud' AS temoin_avant,
       (SELECT value FROM public.coin_config WHERE key = 'cloud_offre_ouverte') AS interrupteur_global
  FROM public.profiles p JOIN public._backup_0611_temoin_cloud_nico b ON b.id = p.id;
COMMIT;
