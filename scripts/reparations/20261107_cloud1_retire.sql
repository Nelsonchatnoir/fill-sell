-- (07/11, décision 8 de Nico : « cloud-1 : à supprimer ») cloud-1 passe « retire » dans cloud_serveurs — la base ne lui
-- attribue plus jamais aucun compte (cloud_serveur_choisir le tient pour mort), ses places ne comptent plus
-- (cloud_places_libres ne lit que « actif »), cloud_serveur_moi ne donne plus son domaine, et un battement éventuel ne le
-- remet pas « actif » (cloud_serveur_battre garde « retire »).
-- État relu en prod le 07/11 vers 10:35 : cloud-1 « actif », capacité 7, 0 compte, 0 ouvert, dernier battement
-- 06/11 19:27:35 (orchestrateur ARRÊTÉ depuis 19:27:43) ; aucun cloud_postes sur cloud-1 (ni serveur, ni serveur_origine) ;
-- aucune fonction ne nomme « cloud-1 ». Les IP du pool (cloud_ips) n'ont pas de colonne de serveur : elles restent.
-- Ce que fait le script (rien d'autre) : sauvegarde public._backup_0711_cloud1_serveur (la ligne d'avant), puis
-- cloud_serveurs.etat = 'retire' pour cloud-1 seulement.
-- Gardes : rien n'est écrit si la sauvegarde existe, si la ligne cloud-1 manque ou est déjà « retire », si un compte y est
-- encore attribué (serveur ou serveur_origine), ou s'il a battu dans les 15 dernières minutes (orchestrateur relancé).
-- Lancement : npx supabase db query --linked --yes -f scripts/reparations/20261107_cloud1_retire.sql
-- Inverse : scripts/reparations/20261107_cloud1_retire_INVERSE.sql (inutile une fois le serveur supprimé chez Hetzner).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0711_cloud1_serveur') IS NOT NULL THEN
    RAISE EXCEPTION 'la sauvegarde _backup_0711_cloud1_serveur existe déjà : script déjà passé, rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-1' AND etat <> 'retire') THEN
    RAISE EXCEPTION 'aucune ligne cloud-1 à retirer : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cloud_postes WHERE serveur = 'cloud-1' OR serveur_origine = 'cloud-1') THEN
    RAISE EXCEPTION 'un compte est encore attribué à cloud-1 (cloud_postes.serveur ou serveur_origine) : rien n''est écrit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-1' AND vu_le > now() - interval '15 minutes') THEN
    RAISE EXCEPTION 'cloud-1 a battu dans les 15 dernières minutes (orchestrateur relancé ?) : rien n''est écrit';
  END IF;
END $$;

CREATE TABLE public._backup_0711_cloud1_serveur AS
  SELECT now() AS le, to_jsonb(s.*) AS ligne FROM public.cloud_serveurs s WHERE s.nom = 'cloud-1';
ALTER TABLE public._backup_0711_cloud1_serveur ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_0711_cloud1_serveur FROM PUBLIC, anon, authenticated;

UPDATE public.cloud_serveurs SET etat = 'retire' WHERE nom = 'cloud-1' AND etat <> 'retire';

SELECT s.nom, s.etat, s.vu_le, b.ligne ->> 'etat' AS avant, public.cloud_places_libres() AS places_libres
  FROM public.cloud_serveurs s JOIN public._backup_0711_cloud1_serveur b ON b.ligne ->> 'nom' = s.nom;
COMMIT;
