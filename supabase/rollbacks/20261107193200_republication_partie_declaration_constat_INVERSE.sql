-- INVERSE de 20261107193200_republication_partie_declaration_constat : la définition de PROD du 07/11 soir, mot pour mot
-- (pg_get_functiondef, sans CR ; md5 1d076c65d9b0a9383f85d730e81d230c), droits relus en prod. Aucune donnée à rendre.
CREATE OR REPLACE FUNCTION public.republication_annonce_partie(p_user uuid, p_inventaire_id bigint, p_platform text, p_listing_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (05/11, garde-fou de Nico) UN SEUL JUGE, celui des relevés : decisionIntrouvable (_shared/introuvable-a-confirmer.js),
  -- appliqué par handler-watch aux republications en pause et aux annonces publiées (_shared/annonce-publiee-disparue.js,
  -- 7c48b8c), et les règles « deux relevés complets par boutique » (Vinted) et « deux relevés probants » (republication
  -- retenue « cible absente », Leboncoin / Depop) de get-pending-jobs. Cette fonction ne juge RIEN : elle
  -- lit les verdicts qu'ils ont écrits (annonce_disparue), sur CET identifiant exact.
  --   'annonce_vendue' : vente prouvée — le relevé a lu la vente (transaction_plateforme 'sold'), la page a été lue
  --                      « vendue » (sale_signal 'sold' du dépôt publié : preuve positive, jamais un doute), ou le juge a
  --                      clos l'annonce vendue ;
  --   'annonce_partie' : absence CONFIRMÉE — le juge a clos l'annonce (absente de deux relevés complets depuis sa dernière
  --                      vue, ou relevée fermée) et aucun relevé ne l'a revue depuis (un relevé qui la revoit lève la garde).
  -- Jamais sur : un doute (sale_signal 'unavailable'), une lecture seule (sonde publique, 403, erreur réseau, 404 Beebs
  -- « en vérification »), une pause, une annonce Vinted masquée ou en brouillon (« hidden », « draft » : 7c48b8c).
  -- NULL : rien ne prouve que l'annonce est partie (identifiant inconnu compris).
  -- Garde de cohérence : scripts/annonce-partie-un-seul-juge-selftest.mjs (les auteurs nommés ici écrivent bien ces
  -- verdicts ; aucun autre auteur n'est lu).
  WITH lid AS (SELECT NULLIF(btrim(COALESCE(p_listing_id, '')), '') AS id),
  verdicts AS (
    SELECT x.platform_fields -> 'annonce_disparue' AS v, x.created_at
      FROM cross_post_jobs x, lid
     WHERE x.user_id = p_user AND x.inventaire_id = p_inventaire_id AND x.platform = p_platform
       AND NULLIF(trim(x.platform_listing_id), '') = lid.id
       AND jsonb_typeof(x.platform_fields -> 'annonce_disparue') = 'object'
       AND (COALESCE(x.platform_fields #>> '{annonce_disparue,pose_par}', '') LIKE 'handler-watch (%'
            OR COALESCE(x.platform_fields #>> '{annonce_disparue,par}', '') IN ('deux_releves_complets_par_boutique', 'deux_releves_probants'))
       AND COALESCE(x.platform_fields #>> '{annonce_disparue,motif}', '') !~ '« (hidden|draft) »'
  )
  SELECT CASE
    WHEN (SELECT id FROM lid) IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM annonces_plateforme a, lid
       WHERE a.user_id = p_user AND a.platform = p_platform AND a.listing_id = lid.id
         AND a.transaction_plateforme = 'sold')
      OR EXISTS (
      SELECT 1 FROM cross_post_jobs x, lid
       WHERE x.user_id = p_user AND x.inventaire_id = p_inventaire_id AND x.platform = p_platform
         AND NULLIF(trim(x.platform_listing_id), '') = lid.id
         AND x.status = 'published' AND x.platform_fields ->> 'sale_signal' = 'sold')
      OR EXISTS (
      SELECT 1 FROM verdicts d
       WHERE COALESCE(d.v ->> 'vendue', '') = 'true' OR COALESCE(d.v ->> 'motif', '') ~* '(vendue|sold)')
    THEN 'annonce_vendue'
    WHEN EXISTS (
      SELECT 1 FROM verdicts d
       WHERE NOT EXISTS (
         SELECT 1 FROM annonces_plateforme a, lid
          WHERE a.user_id = p_user AND a.platform = p_platform AND a.listing_id = lid.id
            AND a.vu_le > COALESCE(public._ts_ou_null(d.v ->> 'at'), public._ts_ou_null(d.v ->> 'le'), d.created_at)))
    THEN 'annonce_partie'
    ELSE NULL
  END
$function$;
REVOKE ALL ON FUNCTION public.republication_annonce_partie(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republication_annonce_partie(uuid, bigint, text, text) TO service_role;
