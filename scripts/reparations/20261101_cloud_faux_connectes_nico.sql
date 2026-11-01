-- (01/11, 21:00 → 21:23, essai de Nico depuis l'app) LES FAUX « CONNECTÉ » REMIS À « NON CONNECTÉ » — compte de Nico seul.
-- Leboncoin (21:05:31, en pleine vérification du téléphone, fenêtre fermée avant la validation) et Depop (21:22:55, sur la
-- page d'erreur de Depop) se sont dits connectés sur le SEUL cookie (règle corrigée le même soir : connecté = compte lu par
-- le serveur, serveur-cloud/src/connexion.js). Aucun des deux n'a jamais été lu par le serveur (journal de l'orchestrateur,
-- profiles.extension_postes : leboncoin et depop « null » sur le poste Cloud).
-- Vinted RESTE connecté : compte lu par la sonde de l'extension Cloud (/api/v2/users/current → 200, compte 250623918,
-- 21:26:46 ; extension_postes du poste a958154e, build 2026-11-01T18:00:51Z+dd69fbb-cloud).
--   1. cloud_coffre : les lignes leboncoin et depop de Nico SORTENT du coffre (gardées chiffrées dans la sauvegarde) ;
--      sans ligne, la plateforme est « à connecter », hors du verrou du navigateur, jamais restaurée ; au démarrage suivant
--      du navigateur, sa demi-session part du profil (postes.js, purgerSessions — l'appareil DataDome reste) ;
--   2. cloud_connexions : les deux lignes Leboncoin « connectee » de 21:05 deviennent « abandonnee » (raison
--      non_verifiee_0111) — Depop n'y a aucune ligne (la contrainte ne connaît pas encore « depop »).
-- À passer orchestrateur ARRÊTÉ (docker compose stop orchestrateur) : sa sauvegarde de fermeture réécrirait sinon les lignes.
-- Sauvegarde : public._backup_0111_cloud_faux_connectes. Inverse : 20261101_cloud_faux_connectes_nico_INVERSE.sql
BEGIN;
CREATE TABLE public._backup_0111_cloud_faux_connectes AS
  SELECT now() AS le, 'cloud_coffre'::text AS source, to_jsonb(c.*) AS ligne
    FROM public.cloud_coffre c
   WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.plateforme IN ('leboncoin', 'depop')
  UNION ALL
  SELECT now(), 'cloud_connexions', to_jsonb(x.*)
    FROM public.cloud_connexions x
   WHERE x.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND x.plateforme = 'leboncoin' AND x.statut = 'connectee'
     AND x.ouverte_le >= '2026-11-01 21:00:00 Europe/Paris' AND x.ouverte_le < '2026-11-01 21:30:00 Europe/Paris';
ALTER TABLE public._backup_0111_cloud_faux_connectes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0111_cloud_faux_connectes FROM PUBLIC, anon, authenticated;

DO $$
DECLARE n_coffre int; n_cx int;
BEGIN
  SELECT count(*) FILTER (WHERE source = 'cloud_coffre'), count(*) FILTER (WHERE source = 'cloud_connexions')
    INTO n_coffre, n_cx FROM public._backup_0111_cloud_faux_connectes;
  IF n_coffre <> 2 OR n_cx <> 2 THEN
    RAISE EXCEPTION 'attendu 2 lignes du coffre (leboncoin, depop) et 2 connexions Leboncoin, lu % et % : rien n''est changé', n_coffre, n_cx;
  END IF;
END $$;

DELETE FROM public.cloud_coffre
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND plateforme IN ('leboncoin', 'depop');
UPDATE public.cloud_connexions SET statut = 'abandonnee', raison = 'non_verifiee_0111'
 WHERE id IN (SELECT (ligne ->> 'id')::uuid FROM public._backup_0111_cloud_faux_connectes WHERE source = 'cloud_connexions');

-- Relu : Vinted seul au coffre (avec la session FillSell), plus aucune connexion Leboncoin « connectee » ce soir.
SELECT (SELECT jsonb_agg(jsonb_build_object('plateforme', plateforme, 'connecte', connecte) ORDER BY plateforme)
          FROM public.cloud_coffre WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') AS coffre,
       (SELECT count(*) FROM public.cloud_connexions WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
           AND statut = 'connectee' AND plateforme = 'leboncoin') AS connexions_lbc_connectees,
       (SELECT count(*) FROM public._backup_0111_cloud_faux_connectes) AS sauvegardees;
COMMIT;
