-- INVERSE de 20261106_cloud_essai_ax42_bascule_nico.sql : le compte Cloud de Nico revient de cloud-3 sur cloud-2, sur SON
-- profil d'avant (resté intact sur le disque de cloud-2), détails d'avant. Le coffre n'est pas touché (il n'a pas été
-- touché à l'aller) ; l'IP reste la 42. Au retour, une plateforme peut demander une reconnexion : jamais une purge.
-- ⛔ ORDRE (miroir exact de l'aller, ESSAI-AX42.md § 8) :
--   1. cloud-3 LÂCHE : Nico retiré de COMPTES_AUTORISES (jamais vide : compte fictif 00000000-… s'il n'y reste personne),
--      recréation ; attendre « poste eteint » (coffre sauvegardé par cloud-3) ;
--   2. CE SCRIPT, dans les 10 minutes ;
--   3. cloud-2 REPREND : Nico remis dans COMPTES_AUTORISES (cp .env.avant-bascule-ax42 .env), recréation.
-- Gardes : sauvegarde présente, poste de Nico « eteint » sur cloud-3, cloud-2 bat depuis moins de 5 min.
-- Lancement : npx supabase db query --linked --yes -f scripts/reparations/20261106_cloud_essai_ax42_bascule_nico_INVERSE.sql
BEGIN;
DO $$
DECLARE v_u uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
BEGIN
  IF to_regclass('public._backup_0611_essai_ax42_nico') IS NULL
     OR (SELECT count(*) FROM public._backup_0611_essai_ax42_nico WHERE ligne ->> 'serveur' = 'cloud-2') <> 1 THEN
    RAISE EXCEPTION 'sauvegarde _backup_0611_essai_ax42_nico absente ou incomplète : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_postes WHERE user_id = v_u AND serveur = 'cloud-3' AND etat = 'eteint') THEN
    RAISE EXCEPTION 'le poste de Nico n''est pas éteint sur cloud-3 : cloud-3 le sert encore (étape 1 d''abord)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-2' AND etat = 'actif' AND vu_le > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'cloud-2 ne bat pas : rien n''est écrit';
  END IF;
END $$;

-- Le poste : cloud-2, son profil et ses détails d'avant ; la dernière ouverture (cloud-3) reste notée, pour que cloud-2
-- voie le changement de machine et reparte sans les pauses nées sur cloud-3 (postes.js, pausesMessagerie.js).
UPDATE public.cloud_postes p
   SET serveur = 'cloud-2', etat = 'eteint', conteneur = b.ligne ->> 'conteneur', derniere_erreur = NULL, maj_le = now(),
       details = (b.ligne -> 'details')
                 || jsonb_build_object('essai_ax42', jsonb_build_object('bascule_le', p.details -> 'essai_ax42' -> 'bascule_le',
                                                                       'profil_cloud_3', p.details ->> 'profil', 'retour_le', now()))
                 || CASE WHEN p.details ? 'ouvert_sur' THEN jsonb_build_object('ouvert_sur', p.details -> 'ouvert_sur') ELSE '{}'::jsonb END
  FROM public._backup_0611_essai_ax42_nico b
 WHERE p.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND p.serveur = 'cloud-3' AND p.etat = 'eteint';

SELECT p.serveur, p.etat, p.details ->> 'profil' AS profil, p.details -> 'essai_ax42' AS essai,
       (SELECT b.ligne -> 'details' ->> 'profil' FROM public._backup_0611_essai_ax42_nico b) AS profil_d_avant,
       (SELECT string_agg(id::text, ',') FROM public.cloud_ips WHERE user_id = p.user_id) AS ip
  FROM public.cloud_postes p WHERE p.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
