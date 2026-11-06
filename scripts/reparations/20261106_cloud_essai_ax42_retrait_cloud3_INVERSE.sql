-- INVERSE de 20261106_cloud_essai_ax42_retrait_cloud3.sql : cloud-3 reprend l'état qu'il avait avant le retrait (« actif »
-- en général) ; il ne sera choisi pour un compte que s'il bat de nouveau (vu il y a moins de 5 min).
-- Gardes : sauvegarde présente, ligne cloud-3 « retire ».
-- Lancement : npx supabase db query --linked --yes -f scripts/reparations/20261106_cloud_essai_ax42_retrait_cloud3_INVERSE.sql
BEGIN;
DO $$
BEGIN
  IF to_regclass('public._backup_0611_essai_ax42_retrait') IS NULL
     OR (SELECT count(*) FROM public._backup_0611_essai_ax42_retrait WHERE ligne ->> 'nom' = 'cloud-3') <> 1 THEN
    RAISE EXCEPTION 'sauvegarde _backup_0611_essai_ax42_retrait absente ou incomplète : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cloud_serveurs WHERE nom = 'cloud-3' AND etat = 'retire') THEN
    RAISE EXCEPTION 'cloud-3 n''est pas « retire » : rien à défaire';
  END IF;
END $$;

UPDATE public.cloud_serveurs s SET etat = b.ligne ->> 'etat'
  FROM public._backup_0611_essai_ax42_retrait b
 WHERE s.nom = 'cloud-3' AND b.ligne ->> 'nom' = 'cloud-3' AND s.etat = 'retire';

SELECT s.nom, s.etat, s.vu_le, public.cloud_places_libres() AS places_libres FROM public.cloud_serveurs s WHERE s.nom = 'cloud-3';
COMMIT;
