-- (06/11, décision 5 de Nico sur docs/cloud/ESSAI-AX42.md, script (c)) EN CAS D'ABANDON OU DE FIN DE L'ESSAI : cloud-3
-- passe « retire » dans cloud_serveurs — la base ne lui attribue plus jamais aucun compte (cloud_serveur_choisir), et son
-- battement ne le remet pas « actif » (cloud_serveur_battre garde « retire »).
-- Ce que fait le script (rien d'autre) : sauvegarde public._backup_0611_essai_ax42_retrait (la ligne d'avant), puis
-- cloud_serveurs.etat = 'retire' pour cloud-3 seulement.
-- ⛔ ORDRE (ESSAI-AX42.md § 9) : charge retirée et relevé arrêté ; Nico revenu sur cloud-2 (INVERSE de la bascule) ;
-- `docker compose down` sur cloud-3 ; PUIS ce script ; puis cloud_places_libres() relu ; DNS cloud-3 supprimé ;
-- résiliation dans Robot par Nico seul.
-- Gardes : rien n'est écrit si la sauvegarde existe, si la ligne cloud-3 manque, ou si un compte est encore attribué à cloud-3.
-- Lancement : npx supabase db query --linked --yes -f scripts/reparations/20261106_cloud_essai_ax42_retrait_cloud3.sql
-- Inverse : 20261106_cloud_essai_ax42_retrait_cloud3_INVERSE.sql.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0611_essai_ax42_retrait') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0611_essai_ax42_retrait existe déjà : script déjà passé, rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-3' AND etat <> 'retire') THEN
    RAISE EXCEPTION 'aucune ligne cloud-3 à retirer : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cloud_postes WHERE serveur = 'cloud-3') THEN
    RAISE EXCEPTION 'un compte est encore attribué à cloud-3 (cloud_postes) : le ramener d''abord (INVERSE de la bascule)';
  END IF;
END $$;

CREATE TABLE public._backup_0611_essai_ax42_retrait AS
  SELECT now() AS le, to_jsonb(s.*) AS ligne FROM public.cloud_serveurs s WHERE s.nom = 'cloud-3';
ALTER TABLE public._backup_0611_essai_ax42_retrait ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0611_essai_ax42_retrait FROM PUBLIC, anon, authenticated;

UPDATE public.cloud_serveurs SET etat = 'retire' WHERE nom = 'cloud-3' AND etat <> 'retire';

SELECT s.nom, s.etat, s.vu_le, b.ligne ->> 'etat' AS avant, public.cloud_places_libres() AS places_libres
  FROM public.cloud_serveurs s JOIN public._backup_0611_essai_ax42_retrait b ON b.ligne ->> 'nom' = s.nom;
COMMIT;
