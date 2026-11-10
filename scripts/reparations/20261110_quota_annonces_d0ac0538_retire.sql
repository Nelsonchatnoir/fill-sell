-- (10/11/2026, ordre de Nico) Retirer la surcharge de quota posée à la main pour la cliente d0ac0538
-- (Free, essai Cloud) : quotas_par_compte.quota_annonces = 10, pose_par « claude (ordre de
-- Nico) », posée le 10/11 à 17:28 (Paris). Elle compensait un DÉCOMPTE FAUX — ses 5 passes légères d'imports Vinted
-- (titre et description du vendeur) comptées comme 5 annonces. Corrigé à la racine pour tous les comptes par la
-- migration 20261110170000_annonces_texte_vendeur_hors_quota : elle retrouve son quota normal de 5, décompte juste.
-- À passer APRÈS la migration. Garde : le décompte corrigé doit valoir 0 (sinon rien n'est écrit).
-- Inverse : 20261110_quota_annonces_d0ac0538_retire_INVERSE.sql (sauvegarde _backup_1011_quota_d0ac0538).
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_1011_quota_d0ac0538') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_1011_quota_d0ac0538 AS
SELECT now() AS le, q.* FROM public.quotas_par_compte q
 WHERE q.user_id = 'd0ac0538-0dbc-4bea-8c57-1c412a07d2c4' AND q.quota_annonces = 10 AND q.pose_par = 'claude (ordre de Nico)';
ALTER TABLE public._backup_1011_quota_d0ac0538 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1011_quota_d0ac0538 FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; c int; BEGIN
  IF (SELECT count(*) FROM public._backup_1011_quota_d0ac0538) <> 1 THEN RAISE EXCEPTION 'la ligne a bougé : rien n''est écrit'; END IF;
  c := public.quota_annonces_consommees('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4', public.debut_cycle_quotas('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4'));
  IF c <> 0 THEN RAISE EXCEPTION 'décompte corrigé attendu 0, lu % (migration passée ?) : rien n''est écrit', c; END IF;
  DELETE FROM public.quotas_par_compte q USING public._backup_1011_quota_d0ac0538 b
   WHERE q.user_id = b.user_id AND q.quota_annonces = 10 AND q.pose_par = 'claude (ordre de Nico)';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 ligne, % touchées : rien n''est écrit', n; END IF;
  IF public.jauge_annonces_plafond('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4', 'free') <> 5 THEN RAISE EXCEPTION 'plafond attendu 5 : rien n''est écrit'; END IF;
END $ecrit$;
SELECT public.jauge_annonces_plafond('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4', 'free') AS plafond,
       public.quota_annonces_consommees('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4', public.debut_cycle_quotas('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4')) AS consommees;
COMMIT;
