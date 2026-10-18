-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — DEPOP : LES DÉPÔTS PUBLIÉS SANS IDENTIFIANT REÇOIVENT LE SLUG DE LEUR PROPRE LIEN
-- ═══════════════════════════════════════════════════════════════════════════
-- La lecture du slug Depop refusait le « _ » du pseudo du vendeur
-- (/products/([A-Za-z0-9]+-…), update-job-status, seule source de
-- platform_listing_id Depop) : 34 dépôts Depop publiés sont restés sans
-- platform_listing_id (compte thibault.andrieux a3002ab6, compté le 18/10 :
-- 34 lignes, 34 slugs distincts, 0 slug porté par un autre article au relevé
-- ni par un autre job, 33 vus au relevé annonces_plateforme). Leur retrait
-- tombait en « aucun identifiant d'annonce » (81188384, annonce en ligne
-- alors que l'article est vendu sur Vinted).
-- LA RÈGLE (la même que le code corrigé) : le slug se lit dans le PROPRE lien
-- du job ([A-Za-z0-9_]+ en tête). AUCUN rapprochement : ni titre, ni autre job,
-- ni relevé — le lien du job lui-même, rien d'autre.
-- 2. Les retraits Depop en file (pending, needs_user) sans identifiant reçoivent
--    de même le slug de leur PROPRE lien (le retrait 81188384 aujourd'hui) : il
--    devient exécutable par toute version de l'extension, sans attendre le
--    déploiement de get-pending-jobs.
-- Déclencheurs sur platform_listing_id relus le 18/10 : lien_jamais_croise
-- (refuse un identifiant porté par un autre article — 0 cas compté),
-- lien_suit_identifiant (lien et identifiant d'accord : rien), retrait_rejuge
-- (le dépôt 1661efb0 a un retrait en file : sa cible reste « intacte », le
-- dépôt la porte). Aucun mail, aucune notification sur cette colonne.
-- Sauvegarde : _backup_1810_depop_slug (id, platform_listing_id d'avant, quoi).
-- Inverse : scripts/reparations/20261018_depop_identifiants_slug_INVERSE.sql
-- Application (feu vert de Nico) : npx supabase db query --linked -f scripts/reparations/20261018_depop_identifiants_slug.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $garde$
DECLARE
  v_depots integer;
  v_comptes integer;
  v_conflits integer;
BEGIN
  IF to_regclass('public._backup_1810_depop_slug') IS NOT NULL THEN
    RAISE EXCEPTION 'sauvegarde déjà présente : la réparation a déjà tourné, rien n''est fait';
  END IF;
  SELECT count(*), count(DISTINCT j.user_id) INTO v_depots, v_comptes
    FROM public.cross_post_jobs j
   WHERE j.platform = 'depop' AND j.action IN ('publish', 'republish') AND j.status = 'published'
     AND nullif(btrim(j.platform_listing_id), '') IS NULL
     AND substring(j.listing_url FROM '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)') IS NOT NULL;
  -- Un slug déjà porté par un AUTRE article (job publié ou relevé vivant) : on ne pose rien.
  SELECT count(*) INTO v_conflits
    FROM public.cross_post_jobs j
   WHERE j.platform = 'depop' AND j.action IN ('publish', 'republish') AND j.status = 'published'
     AND nullif(btrim(j.platform_listing_id), '') IS NULL
     AND (EXISTS (SELECT 1 FROM public.cross_post_jobs o
                   WHERE o.user_id = j.user_id AND o.platform = 'depop' AND o.id <> j.id AND o.status = 'published'
                     AND o.inventaire_id IS DISTINCT FROM j.inventaire_id
                     AND btrim(o.platform_listing_id) = substring(j.listing_url FROM '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)'))
       OR EXISTS (SELECT 1 FROM public.annonces_plateforme a
                   WHERE a.user_id = j.user_id AND a.platform = 'depop'
                     AND a.listing_id = substring(j.listing_url FROM '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)')
                     AND a.inventaire_id IS NOT NULL AND a.inventaire_id IS DISTINCT FROM j.inventaire_id
                     AND a.disparu_le IS NULL AND a.retiree_le IS NULL));
  RAISE NOTICE 'dépôts Depop publiés sans identifiant, slug lisible : % (comptes : %), conflits : %', v_depots, v_comptes, v_conflits;
  IF v_depots > 40 OR v_comptes > 1 OR v_conflits > 0 THEN
    RAISE EXCEPTION 'périmètre différent du comptage du 18/10 (34 dépôts, 1 compte, 0 conflit) : % / % / % — rien n''est fait', v_depots, v_comptes, v_conflits;
  END IF;
END
$garde$;

CREATE TABLE public._backup_1810_depop_slug AS
  SELECT j.id, j.platform_listing_id AS avant, 'depot'::text AS quoi,
         substring(j.listing_url FROM '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)') AS slug
    FROM public.cross_post_jobs j
   WHERE j.platform = 'depop' AND j.action IN ('publish', 'republish') AND j.status = 'published'
     AND nullif(btrim(j.platform_listing_id), '') IS NULL
     AND substring(j.listing_url FROM '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)') IS NOT NULL
  UNION ALL
  SELECT j.id, j.platform_listing_id, 'retrait',
         substring(j.listing_url FROM '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)')
    FROM public.cross_post_jobs j
   WHERE j.platform = 'depop' AND j.action = 'delete' AND j.status IN ('pending', 'needs_user')
     AND nullif(btrim(j.platform_listing_id), '') IS NULL
     AND substring(j.listing_url FROM '/products/([A-Za-z0-9_]+-[A-Za-z0-9-]*[A-Za-z0-9])(?:[/?#]|$)') IS NOT NULL;

UPDATE public.cross_post_jobs j SET platform_listing_id = b.slug
  FROM public._backup_1810_depop_slug b
 WHERE j.id = b.id AND nullif(btrim(j.platform_listing_id), '') IS NULL;

-- Vérification : chaque ligne porte le slug de SON lien, aucun lien_refuse posé par le déclencheur.
SELECT b.quoi, count(*) AS lignes,
       count(*) FILTER (WHERE j.platform_listing_id = b.slug) AS slug_pose,
       count(*) FILTER (WHERE j.platform_fields ? 'lien_refuse') AS refus_declencheur
  FROM public._backup_1810_depop_slug b JOIN public.cross_post_jobs j ON j.id = b.id
 GROUP BY b.quoi ORDER BY b.quoi;
COMMIT;
