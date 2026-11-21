-- (21/11/2026, ordre de Nico) Retirer la surcharge de quota posée le 21/11 à 00:10 (Paris) pour 0c97dc8b
-- (essai Pro + Cloud) : quotas_par_compte.quota_annonces = 240, pose_par « claude 21/11 00:10, demandé par Nico ». Elle
-- compensait un DÉCOMPTE FAUX — les rédactions de son stock importé (vinted_sync, description d'origine non lue)
-- comptées comme des annonces (120/120 à 00:03). Corrigé à la racine pour tous les comptes par la migration
-- 20261121010000_stock_importe_hors_quota : elle retrouve son quota normal de Pro (120), décompte juste.
-- À passer APRÈS la migration. Gardes : la fonction n'est plus celle d'avant (md5 6e2f60f0…), le décompte corrigé
-- laisse ses annonces (< 120), le plafond retombe à 120 — sinon rien n'est écrit.
-- Inverse : 20261121_quota_annonces_0c97dc8b_retire_INVERSE.sql (sauvegarde _backup_2111_quota_0c97dc8b).
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_2111_quota_0c97dc8b') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
  IF md5(pg_get_functiondef('public.quota_annonces_consommees(uuid,timestamp with time zone)'::regprocedure)) = '6e2f60f0c9fd6d67797f182e81d84f86' THEN
    RAISE EXCEPTION 'migration 20261121010000 pas encore passée : rien n''est écrit';
  END IF;
END $garde$;
CREATE TABLE public._backup_2111_quota_0c97dc8b AS
SELECT now() AS le, q.* FROM public.quotas_par_compte q
 WHERE q.user_id = '0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b' AND q.quota_annonces = 240 AND q.pose_par = 'claude 21/11 00:10, demandé par Nico';
ALTER TABLE public._backup_2111_quota_0c97dc8b ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_quota_0c97dc8b FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; c int; BEGIN
  IF (SELECT count(*) FROM public._backup_2111_quota_0c97dc8b) <> 1 THEN RAISE EXCEPTION 'la ligne a bougé : rien n''est écrit'; END IF;
  c := public.quota_annonces_consommees('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b', public.debut_cycle_quotas('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b'));
  IF c >= 120 THEN RAISE EXCEPTION 'décompte corrigé % : il ne lui laisserait pas ses annonces — rien n''est écrit', c; END IF;
  DELETE FROM public.quotas_par_compte q USING public._backup_2111_quota_0c97dc8b b
   WHERE q.user_id = b.user_id AND q.quota_annonces = 240 AND q.pose_par = 'claude 21/11 00:10, demandé par Nico';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 ligne, % touchées : rien n''est écrit', n; END IF;
  IF public.jauge_annonces_plafond('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b', public.palier_de('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b')) <> 120 THEN
    RAISE EXCEPTION 'plafond Pro attendu 120 : rien n''est écrit';
  END IF;
END $ecrit$;
SELECT public.palier_de('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b') AS palier,
       public.jauge_annonces_plafond('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b', public.palier_de('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b')) AS plafond,
       public.quota_annonces_consommees('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b', public.debut_cycle_quotas('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b')) AS consommees;
COMMIT;
