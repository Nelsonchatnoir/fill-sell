-- (10/11/2026, ordre de Nico) Rendre à la cliente d0ac0538 (van.nessa.calvo@gmail.com, essai Cloud, Free) les annonces
-- consommées par son lot NON ENVOYÉ de 12:00 (Paris) : 5 générations (12:00:46 → 12:01:44, articles …910022, …910020,
-- …910021, …906005, …906007) + la régénération de …906005 à 12:05:33 (gratuite tant que la première compte ; elle
-- est sortie avec, sinon elle se mettrait à compter). Le lot de 12:07 n'a rien consommé (aucune ligne generate_listing).
-- Cause : le lot quitté sans envoi (rapport docs/enquetes/lot-sans-envoi-cloud-1011/RAPPORT.md ; règle corrigée 7901654).
-- Le décompte (quota_annonces_consommees) lit usage_logs.feature = 'generate_listing' du cycle : ces 6 lignes passent en
-- 'generate_listing_rendue' (coût, métadonnées et dates CONSERVÉS ; marque metadata.rendue). Aucun plafond, aucune
-- règle, aucun autre compte touchés. Attendu : 5 consommées → 0 (5 restantes sur 5 jusqu'au 10/12).
-- Inverse : 20261110_annonces_rendues_d0ac0538_INVERSE.sql (sauvegarde _backup_1011_annonces_rendues_d0ac0538).
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_1011_annonces_rendues_d0ac0538') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
END $garde$;
CREATE TABLE public._backup_1011_annonces_rendues_d0ac0538 AS
SELECT now() AS le, u.id, u.user_id, u.feature, u.metadata FROM public.usage_logs u
 WHERE u.user_id = 'd0ac0538-0dbc-4bea-8c57-1c412a07d2c4' AND u.feature = 'generate_listing'
   AND u.id IN ('9e73beb6-2f65-4144-b7ba-0338428db630', '59e17858-fa69-4e38-ab79-441ee736b0bf', '4becdbe0-931b-4320-83f0-91abcbb6a38d',
                '9183d3ba-4e83-4da1-8c38-b2bcd4a4d669', '365f1c25-e3d1-4243-a5f6-990e88b5640a', 'cf45d635-d9d6-4fa4-bf08-ae2fcbe36b84');
ALTER TABLE public._backup_1011_annonces_rendues_d0ac0538 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1011_annonces_rendues_d0ac0538 FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; c int; BEGIN
  IF (SELECT count(*) FROM public._backup_1011_annonces_rendues_d0ac0538) <> 6 THEN RAISE EXCEPTION 'les 6 lignes ont bougé : rien n''est écrit'; END IF;
  UPDATE public.usage_logs u SET feature = 'generate_listing_rendue',
    metadata = u.metadata || jsonb_build_object('rendue', jsonb_build_object('le', now(),
      'par', 'scripts/reparations/20261110_annonces_rendues_d0ac0538.sql',
      'motif', 'lot de 12:00 préparé puis quitté sans envoi (défaut du lot, ordre de Nico du 10/11)'))
   FROM public._backup_1011_annonces_rendues_d0ac0538 b
   WHERE u.id = b.id AND u.feature = 'generate_listing';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 6 THEN RAISE EXCEPTION 'attendu 6 lignes, % touchées : rien n''est écrit', n; END IF;
  c := public.quota_annonces_consommees('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4', public.debut_cycle_quotas('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4'));
  IF c <> 0 THEN RAISE EXCEPTION 'décompte attendu 0, lu % : rien n''est écrit', c; END IF;
END $ecrit$;
SELECT public.quota_annonces_consommees('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4', public.debut_cycle_quotas('d0ac0538-0dbc-4bea-8c57-1c412a07d2c4')) AS consommees_apres,
       (SELECT count(*) FROM public._backup_1011_annonces_rendues_d0ac0538) AS lignes_sauvegardees;
COMMIT;
