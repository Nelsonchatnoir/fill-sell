-- ════════════════════════════════════════════════════════════════════════════
-- UN RELEVÉ AUTOMATIQUE A UNE CADENCE PLANCHER (08/10/2026, matin)
-- ════════════════════════════════════════════════════════════════════════════
-- LES CAS (7 derniers jours, vinted_sync_runs) :
--   · 44310spgl (dbca7f39), Opla, déclencheur « veilleur » : 166 relevés de
--     ~992 annonces en 7 jours, jusqu'à 30 par heure ; 22 entre 00:09 et 02:10
--     cette nuit, chacun lancé ~30 s après la fin du précédent ;
--   · choupette06 (5f704c61), Beebs, « veilleur » : 14 relevés de 16 annonces
--     entre 07/10 22:53 et 08/10 03:08 (jusqu'à 7 par heure) ;
--   · voirememe, Leboncoin, « veilleur » : ~11 par jour, chaque jour ;
--     jocabroc8, xxewwer, josephinecerni, misscat801, recrutementgroupezk704 :
--     3 à 6 par jour.
-- LA CAUSE (extension, toutes versions servies — 0.6.100, 0.6.102, 0.6.103) :
-- à chaque ronde du veilleur (quelques minutes), UNE annonce lue
-- « indisponible » sur Leboncoin, Beebs, eBay ou Opla demande un relevé complet
-- de « Mes annonces » de la plateforme (demanderRelevePourRattachement), sans
-- aucun délai depuis le relevé précédent. Chez 44310spgl, 120 annonces Opla
-- sont lues « indisponibles » alors que chaque relevé les retrouve toutes en
-- ligne (disparues 0) : un relevé à chaque ronde. Le cron de l'extension a son
-- délai (20 h), mais ne compte que les relevés « done/incomplete » : une
-- plateforme absente ou en échec est relue à chaque alarme.
-- Risque : l'anti-robot de la plateforme, sur le compte de la personne.
--
-- LA RÈGLE : un relevé AUTOMATIQUE d'annonces (veilleur, cron) n'est pas créé
-- si un relevé de la même plateforme, pour le même compte, a commencé il y a
-- moins de coin_config.releve_auto_plancher_min minutes (360 = 6 h), quel qu'en
-- soit le déclencheur ou l'issue (geste, veille, absente, en échec). Refus
-- silencieux (RETURN NULL, comme garde_pause_releves_compte) : l'extension lit
-- « run non créé » et ne touche pas la plateforme (le run est créé AVANT toute
-- lecture : lancerRelevePlateforme). Chaque refus est compté dans
-- releves_auto_refuses (ops-digest).
-- JAMAIS TOUCHÉS : les gestes (bouton, bouton_distant, app et leurs
-- « :redemande » : « Synchroniser » part toujours), les relevés demandés par
-- le serveur (serveur:retrait_*, serveur:verif_redepot, serveur:quotidien_api
-- — retraits et ventes), le dressing Vinted (garde_cadence_sync_runs : 20 h
-- pour le cron, 15 min sinon), les relevés eBay par l'API.
-- Retard accepté : une alerte « plus en ligne » qu'un relevé démentirait
-- attend au plus 6 h ce relevé (elle exige déjà deux lectures espacées d'un
-- cycle) ; les ventes ont leurs propres chemins (veille des commandes, page de
-- l'annonce, API eBay).
-- Mesure : une lecture indexée (vinted_sync_runs_user_date) par tentative de
-- relevé automatique ; un refus = une ligne mise à jour au lieu d'un relevé
-- complet (liste + 16 fiches capturées + rapprochement du compte).
-- Réglage : UPDATE coin_config SET value = <minutes> WHERE key =
-- 'releve_auto_plancher_min' (journalisé par coin_config_trace) ; 0 = coupé.
-- Inverse : supabase/rollbacks/20261008101000_releve_auto_plancher_INVERSE.sql
BEGIN;

INSERT INTO public.coin_config (key, value, updated_at)
VALUES ('releve_auto_plancher_min', 360, now())
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.releves_auto_refuses (
  user_id           uuid NOT NULL,
  platform          text NOT NULL,
  declencheur       text NOT NULL,
  jour              date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Paris')::date),
  n                 integer NOT NULL DEFAULT 0,
  premier_le        timestamptz NOT NULL DEFAULT now(),
  dernier_le        timestamptz NOT NULL DEFAULT now(),
  dernier_releve_le timestamptz,
  PRIMARY KEY (user_id, platform, declencheur, jour)
);
COMMENT ON TABLE public.releves_auto_refuses IS
  'Relevés automatiques (veilleur, cron) refusés par garde_releve_auto_plancher : un relevé de la même plateforme a commencé il y a moins de releve_auto_plancher_min minutes. Une ligne par compte, plateforme, déclencheur et jour (08/10).';
ALTER TABLE public.releves_auto_refuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.releves_auto_refuses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.releves_auto_refuses TO service_role;

CREATE OR REPLACE FUNCTION public.garde_releve_auto_plancher()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_min integer;
  v_dernier timestamptz;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'annonces'
     OR COALESCE(NEW.declencheur, '') NOT IN ('veilleur', 'cron')
     OR NEW.status NOT IN ('queued', 'running') THEN
    RETURN NEW;
  END IF;
  SELECT value INTO v_min FROM coin_config WHERE key = 'releve_auto_plancher_min';
  IF COALESCE(v_min, 0) <= 0 THEN RETURN NEW; END IF;
  SELECT max(s.started_at) INTO v_dernier
    FROM vinted_sync_runs s
   WHERE s.user_id = NEW.user_id
     AND s.started_at > now() - make_interval(mins => v_min)
     AND s.kind = 'annonces'
     AND s.platform IS NOT DISTINCT FROM NEW.platform
     AND s.status NOT IN ('expired', 'cancelled');
  IF v_dernier IS NULL THEN RETURN NEW; END IF;
  INSERT INTO releves_auto_refuses AS x (user_id, platform, declencheur, n, dernier_releve_le)
  VALUES (NEW.user_id, COALESCE(NEW.platform, '?'), NEW.declencheur, 1, v_dernier)
  ON CONFLICT (user_id, platform, declencheur, jour) DO UPDATE
     SET n = x.n + 1, dernier_le = now(), dernier_releve_le = EXCLUDED.dernier_releve_le;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.garde_releve_auto_plancher() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS garde_releve_auto_plancher ON public.vinted_sync_runs;
CREATE TRIGGER garde_releve_auto_plancher
  BEFORE INSERT ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_releve_auto_plancher();

COMMIT;
