-- INVERSE de 20261107_cloud1_retire.sql : cloud-1 reprend l'état qu'il avait avant le retrait (« actif ») ; il ne sera
-- choisi pour un compte que s'il bat de nouveau, apte (vu il y a moins de 5 min) — sans objet une fois le serveur
-- supprimé chez Hetzner.
-- Gardes : sauvegarde présente, ligne cloud-1 « retire ».
-- Lancement : npx supabase db query --linked --yes -f scripts/reparations/20261107_cloud1_retire_INVERSE.sql
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0711_cloud1_serveur') IS NULL
     OR (SELECT count(*) FROM public._backup_0711_cloud1_serveur WHERE ligne ->> 'nom' = 'cloud-1') <> 1 THEN
    RAISE EXCEPTION 'sauvegarde _backup_0711_cloud1_serveur absente ou incomplète : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-1' AND etat = 'retire') THEN
    RAISE EXCEPTION 'cloud-1 n''est pas « retire » : rien à défaire';
  END IF;
END $$;

UPDATE public.cloud_serveurs s SET etat = b.ligne ->> 'etat'
  FROM public._backup_0711_cloud1_serveur b
 WHERE s.nom = 'cloud-1' AND b.ligne ->> 'nom' = 'cloud-1' AND s.etat = 'retire';

SELECT s.nom, s.etat, s.vu_le, public.cloud_places_libres() AS places_libres FROM public.cloud_serveurs s WHERE s.nom = 'cloud-1';
COMMIT;
