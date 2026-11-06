-- (06/11, décision 2 de Nico sur docs/cloud/ESSAI-AX42.md) LE COMPTE CLOUD DE NICO PASSE DE cloud-2 À cloud-3 (AX42,
-- Radeon 780M) dès que cloud-3 a passé ses contrôles (A10 pare-feu, A11 Chrome par la Radeon, A12 battement) : Nico teste
-- lui-même. PAS Ornella. cloud-2 garde les comptes de relecture comme référence.
-- Ce que fait le script (rien d'autre) :
--   · sauvegarde : public._backup_0611_essai_ax42_nico (la ligne cloud_postes de Nico d'avant) ;
--   · cloud_postes : serveur cloud-3, poste « eteint », PROFIL NEUF sur le disque de cloud-3 (celui de cloud-2 reste
--     INTACT sur son disque : c'est le secours, et l'INVERSE le rouvre) ;
--   · le COFFRE N'EST PAS TOUCHÉ (cloud-3 restaure les cookies du coffre dans son profil neuf) ; l'IP ne change pas (42 ;
--     la 39 reste réservée à Nico) ; aucun cloud_ip_liberer.
-- ⛔ ORDRE (ESSAI-AX42.md § 8 ; sinon deux machines tiendraient la même session) :
--   1. lectures : aucune tâche « processing » de Nico, cloud-3 bat, poste de Nico sur cloud-2 ;
--   2. cloud-3 : Nico AJOUTÉ à COMPTES_AUTORISES (copie .env.avant-bascule-ax42, recréation) — sans effet tant que la base
--      le donne à cloud-2 ;
--   3. cloud-2 LÂCHE : COMPTES_AUTORISES sans Nico (les comptes de relecture restent : jamais vide), copie
--      .env.avant-bascule-ax42, recréation ; attendre « poste eteint » (vidange : la tâche en cours va au bout) ;
--   4. CE SCRIPT, dans les 10 minutes (au-delà de 15 min sans serveur vivant, la base le donnerait au plus libre, cloud-1
--      compris, qui ne sert personne) ;
--   5. cloud-3 REPREND seul (navigateur ouvert en 1-2 min : journal « poste_ouvert »).
-- Gardes : rien n'est écrit si la sauvegarde existe déjà, si cloud-3 ne bat pas depuis moins de 5 min, si le poste de Nico
-- n'est pas « eteint » sur cloud-2, si une tâche de Nico est « processing », ou si l'IP 42 n'est plus la sienne.
-- Lancement : npx supabase db query --linked --yes -f scripts/reparations/20261106_cloud_essai_ax42_bascule_nico.sql
-- Inverse : 20261106_cloud_essai_ax42_bascule_nico_INVERSE.sql (cloud-3 LÂCHE avant ; cloud-2 reprend APRÈS).
BEGIN;
DO $$
DECLARE v_u uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
BEGIN
  IF to_regclass('public._backup_0611_essai_ax42_nico') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0611_essai_ax42_nico existe déjà : bascule déjà faite, rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-3' AND domaine = 'cloud-3.fillsell.app'
                    AND etat = 'actif' AND vu_le > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'cloud-3 ne bat pas (ou pas sous cloud-3.fillsell.app) : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_postes WHERE user_id = v_u AND serveur = 'cloud-2' AND etat = 'eteint') THEN
    RAISE EXCEPTION 'le poste de Nico n''est pas éteint sur cloud-2 : cloud-2 le sert encore (étape 3 d''abord)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE user_id = v_u AND status = 'processing') THEN
    RAISE EXCEPTION 'une tâche de Nico est en cours (processing) : attendre qu''elle finisse';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_ips WHERE id = 42 AND etat = 'attribuee_client' AND user_id = v_u) THEN
    RAISE EXCEPTION 'l''IP 42 n''est plus attribuée à Nico : état à relire avant toute bascule';
  END IF;
END $$;

CREATE TABLE public._backup_0611_essai_ax42_nico AS
  SELECT now() AS le, to_jsonb(p.*) AS ligne FROM public.cloud_postes p WHERE p.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
ALTER TABLE public._backup_0611_essai_ax42_nico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0611_essai_ax42_nico FROM PUBLIC, anon, authenticated;

-- Le poste : cloud-3, profil neuf (même forme que navigateur.js nouveauProfilId), l'ancienne erreur retirée des détails.
-- « ouvert_sur » reste : cloud-3 voit le changement de machine et repart sans les pauses de messagerie de cloud-2.
UPDATE public.cloud_postes
   SET serveur = 'cloud-3', etat = 'eteint', conteneur = NULL, derniere_erreur = NULL, maj_le = now(),
       details = (details - 'erreur' - 'raison' - 'conteneur')
                 || jsonb_build_object('serveur', 'cloud-3',
                                       'profil', 'p-f44b5917-' || left(md5(random()::text || clock_timestamp()::text), 12),
                                       'essai_ax42', jsonb_build_object('bascule_le', now(), 'profil_cloud_2', details ->> 'profil'))
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND serveur = 'cloud-2' AND etat = 'eteint';

SELECT p.serveur, p.etat, p.details ->> 'profil' AS profil, p.details -> 'essai_ax42' AS essai,
       (SELECT count(*) FROM public._backup_0611_essai_ax42_nico) AS sauvegardees,
       (SELECT string_agg(plateforme || ':' || connecte, ',' ORDER BY plateforme) FROM public.cloud_coffre WHERE user_id = p.user_id) AS coffre_inchange,
       (SELECT string_agg(id::text, ',') FROM public.cloud_ips WHERE user_id = p.user_id) AS ip
  FROM public.cloud_postes p WHERE p.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
