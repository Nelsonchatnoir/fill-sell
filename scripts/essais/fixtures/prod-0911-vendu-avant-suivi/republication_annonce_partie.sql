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
  -- (07/11 soir, famille 1) Deux autres constats CONFIRMÉS sont lus, eux aussi sans rien juger : la déclaration de la
  -- personne (« je l'ai retirée moi-même ») et le constat de deux relevés probants (absence_releves) — voir « constats ».
  WITH lid AS (SELECT NULLIF(btrim(COALESCE(p_listing_id, '')), '') AS id),
  -- ⛔ (07/11 soir, rouges famille 1 — ayoubd72 90d11dae, Leboncoin 3296483096 : republication 84bd972d créée le 03/11
  -- 23:32 sur une annonce absente de deux relevés probants depuis le 30/10) DEUX CONSTATS DÉJÀ CONFIRMÉS, sur CE numéro
  -- (tout job du compte, sur cette plateforme, qui le désigne — le numéro d'une plateforme est unique pour un compte) :
  --   · la DÉCLARATION de la personne : « je l'ai retirée moi-même » (dismissUnavailable de l'app, src/App.jsx : job clos
  --     « cancelled » avec ce texte exact, aucune fiche touchée) — les deux libellés que lit aussi le déclencheur
  --     cross_post_jobs_declaration_retiree_ferme_retraits ; repère : le dernier moment connu du job AVANT la déclaration
  --     (dernière lecture, publication, vue en ligne) — prudent : un relevé qui l'a vue entre ce repère et la déclaration
  --     lève aussi la garde ;
  --   · le constat de DEUX RELEVÉS PROBANTS (constater_absences_releve : absence_releves.listing_id = ce numéro — deux
  --     cycles complets distincts, releve_preuve_absence, posé avec disparu_le) sur un dépôt de CETTE fiche (le constat
  --     est posé sur les dépôts de la fiche de l'annonce ; une fusion les y amène ; une republication le recopie) — par
  --     l'index de la fiche : jamais tout l'historique du compte (240 ms mesurés sur le plus gros compte) ; repère : la
  --     date du constat.
  -- Un relevé qui revoit l'annonce depuis le repère (vu_le ≥ repère) lève la garde. Jamais un doute seul : la question
  -- « vendue ? » ouverte sans constat ne compte pas ; jamais une lecture seule ; jamais Vinted (son chemin ne lit pas
  -- cette fonction). Rang : après la vente prouvée (« annonce_vendue » d'abord), comme le verdict du juge.
  constats AS (
    SELECT GREATEST(x.last_checked_at, x.published_at, x.created_at, x.vu_en_ligne_le) AS depuis
      FROM cross_post_jobs x, lid
     WHERE x.user_id = p_user AND x.platform = p_platform
       AND public.listing_designe(lid.id, x.listing_url, x.platform_listing_id)
       AND x.status = 'cancelled'
       AND x.error IN ('Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente',
                       'Annonce retirée par le vendeur (confirmé dans l''app)')
    UNION ALL
    SELECT public._ts_ou_null(x.platform_fields #>> '{absence_releves,le}')
      FROM cross_post_jobs x, lid
     WHERE x.user_id = p_user AND x.inventaire_id = p_inventaire_id AND x.platform = p_platform
       AND jsonb_typeof(x.platform_fields -> 'absence_releves') = 'object'
       AND btrim(COALESCE(x.platform_fields #>> '{absence_releves,listing_id}', '')) = lid.id
       AND btrim(COALESCE(x.platform_fields #>> '{absence_releves,premier}', '')) <> ''
       AND btrim(COALESCE(x.platform_fields #>> '{absence_releves,second}', '')) <> ''
  ),
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
         AND a.transaction_plateforme = 'sold'
         -- (08/11, Jess 3178619102) Le badge « Vendu » qu'une annonce Leboncoin portait DÈS SA PREMIÈRE LECTURE, et toujours
         -- vue en ligne, est une vente d'avant le suivi (règle du 03/11 soir, leboncoin_vendu_avant_suivi : jamais une vente,
         -- jamais un retrait de copie) — elle n'interdit pas non plus la republication.
         AND NOT (a.platform = 'leboncoin' AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL
                  AND public.leboncoin_vendu_avant_suivi(a.user_id, a.listing_id)))
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
    -- (07/11 soir) la personne l'a déclarée retirée, ou deux relevés probants ne l'ont plus vue (constats ci-dessus), et
    -- aucun relevé ne l'a revue depuis le repère du constat.
    WHEN EXISTS (
      SELECT 1 FROM constats c
       WHERE c.depuis IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM annonces_plateforme a, lid
          WHERE a.user_id = p_user AND a.platform = p_platform AND a.listing_id = lid.id
            AND a.vu_le >= c.depuis))
    THEN 'annonce_partie'
    ELSE NULL
  END
$function$
;
