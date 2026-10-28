-- (28/10 soir) Réparation : une annonce Beebs jugée « jamais mise en ligne » est EN LIGNE et ACHETABLE alors que
-- l'article est VENDU (risque de double vente). Rapport docs/enquetes/deblocage-2810/RAPPORT.md, point 8.
--   louis-seller, fiche 1792501756264003 « Polly Pocket Coffret Sac à Surprises Ananas (Safari Tropical) », vendue sur
--   Leboncoin (vente 71290f88, fiche « vendu », quantité 0). Dépôt Beebs 4cdadbc1 du 20/10 22:51, annonce 34206489,
--   jugé « ni en ligne ni en vérification » (règle de 72 h, 22-24/10) → failed → aucun retrait armé à la vente.
--   CONSTAT NAVIGATEUR (28/10 ~22:05, page publique https://www.beebs.app/fr/p/34206489) : HTTP 200, « Ajouter au
--   panier », 10,00 €, « Ajouté le 20/10/2026 », vendeur « Eva T. » — le même vendeur que 34200633 et 34200635, relevées
--   sur ce compte le 28/10 13:11. Le relevé de 13:11 (256 annonces) ne la contient pas.
-- Geste : la ligne repasse « published » avec le constat ; la règle serveur de la vente (publie_apres_vente_serveur)
-- arme ALORS le retrait Beebs de CETTE annonce (essai en transaction annulée : retrait pending sur 34206489). L'extension
-- de louis-seller (0.6.149, vue 22:00) le fait ; « Vendu via une autre plateforme ». Aucun mail, aucun quota.
-- Gardes : la ligne est bien failed, sur 34206489, fiche vendue ; exactement UN retrait Beebs naît, sur 34206489.
-- Inverse : scripts/reparations/20261028_beebs_polly_en_ligne_vendue_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE public._backup_2810_beebs_polly AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c
   WHERE c.id = '4cdadbc1-886e-4af1-a40c-37bfa2f805ff';
ALTER TABLE public._backup_2810_beebs_polly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2810_beebs_polly FROM PUBLIC, anon, authenticated;

DO $$
DECLARE n integer; d record;
BEGIN
  IF (SELECT count(*) FROM public._backup_2810_beebs_polly WHERE status = 'failed' AND platform = 'beebs'
        AND platform_listing_id = '34206489' AND inventaire_id = 1792501756264003) <> 1 THEN
    RAISE EXCEPTION 'dépôt 4cdadbc1 : failed / beebs / 34206489 attendu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = 1792501756264003 AND statut = 'vendu') THEN
    RAISE EXCEPTION 'fiche 1792501756264003 : vendue attendue';
  END IF;
  UPDATE public.cross_post_jobs c SET
    status = 'published', error = NULL,
    platform_fields = c.platform_fields || jsonb_build_object(
      'erreurs_archivees', COALESCE(c.platform_fields -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'le', now(), 'statut', c.status, 'erreur', c.error, 'par', 'réparation 28/10 (annonce constatée en ligne au navigateur)')),
      'constat_en_ligne_2810', jsonb_build_object(
        'le', now(), 'url', 'https://www.beebs.app/fr/p/34206489', 'http', 200, 'achetable', true,
        'vendeur', 'Eva T. (même vendeur que 34200633, 34200635)', 'par', 'navigateur, terminal principal'))
   WHERE c.id = '4cdadbc1-886e-4af1-a40c-37bfa2f805ff' AND c.status = 'failed';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'mise à jour : 1 ligne attendue, % faite(s)', n; END IF;
  SELECT count(*) AS n, min(platform_listing_id) AS pl INTO d FROM public.cross_post_jobs
   WHERE inventaire_id = 1792501756264003 AND platform = 'beebs' AND action = 'delete' AND status = 'pending';
  IF d.n <> 1 OR d.pl <> '34206489' THEN
    RAISE EXCEPTION 'retrait Beebs : un seul, sur 34206489, attendu (% / %)', d.n, d.pl;
  END IF;
  RAISE NOTICE 'retrait Beebs armé sur 34206489';
END $$;
COMMIT;
