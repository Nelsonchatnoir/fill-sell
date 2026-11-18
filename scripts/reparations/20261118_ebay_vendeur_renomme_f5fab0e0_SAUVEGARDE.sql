-- 20261118_ebay_vendeur_renomme_f5fab0e0_SAUVEGARDE.sql — (18/11/2026, point 7 de Nico) À JOUER EN PREMIER, avant
-- 20261118_ebay_vendeur_renomme_f5fab0e0.sql. Sauvegarde les 5 lignes ebay_vendeurs_annonces du compte f5fab0e0
-- (compte au Cloud, inscrit le 16/11 13:04) telles qu'elles sont, puis les montre. N'écrit RIEN d'autre que la
-- sauvegarde. Idempotente : rejouée, elle n'ajoute pas de doublon.
--
-- Le cas : relié le 16/11 à 13:08 sous le pseudo eBay généré à l'inscription (l'ANCIEN pseudo), 5 annonces publiées par
-- l'API à 14:16-14:18, notées sous ce pseudo ; pseudo personnalisé chez eBay avant 15:07 (Browse lit le NOUVEAU pseudo),
-- accès retiré par eBay (invalid_grant 15:06:07), reconnecté à 15:52:42 — MÊME compte (même EIAS : la ligne
-- comptes_plateformes de 13:08 porte l'EIAS d'aujourd'hui). Tant que ces 5 annonces restent notées sous l'ancien
-- pseudo, un retrait (vente ailleurs) les croit « sur un autre compte » (ebay-api-worker annonceDUnAutreCompte) et
-- ne les retire pas : risque de double vente. La règle (ebay-oauth-callback + _shared/ebay-reconnexion.js) fait ce
-- renommage elle-même aux reconnexions à venir ; ce script répare le seul cas d'avant elle.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1811_ebay_vendeur_renomme AS
  SELECT now() AS sauve_le, v.* FROM public.ebay_vendeurs_annonces v WHERE false;
ALTER TABLE public._backup_1811_ebay_vendeur_renomme ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1811_ebay_vendeur_renomme FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public._backup_1811_ebay_vendeur_renomme TO service_role;
INSERT INTO public._backup_1811_ebay_vendeur_renomme
  SELECT now(), v.*
    FROM public.ebay_vendeurs_annonces v
   WHERE v.listing_id IN ('840134586409', '840134586720', '840134587088', '840134589245', '840134589315')
     AND NOT EXISTS (SELECT 1 FROM public._backup_1811_ebay_vendeur_renomme b WHERE b.listing_id = v.listing_id);
COMMIT;
SELECT b.listing_id, b.vendeur, b.source, to_char(b.vu_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI:SS') AS vu_le_paris,
       to_char(b.sauve_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI:SS') AS sauve_le_paris
  FROM public._backup_1811_ebay_vendeur_renomme b ORDER BY b.listing_id;
-- Attendu : 5 lignes, vendeur = l'ancien pseudo (le même sur les 5), source publication_api, vues le 16/11 entre 14:16:15 et 14:18:15.
