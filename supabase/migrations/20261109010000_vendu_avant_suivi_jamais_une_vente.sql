-- 20261109010000 — Le badge « Vendu » Leboncoin d'avant le suivi n'est jamais une vente, quelle que soit la branche qui le lit
--
-- Constat (prod, 08-09/11, lecture seule) : assopmfrance (Pro) lance une remise en avant groupée (republier_lot) à 21:17 et
-- 21:19 ; la fiche 1793885648177 « Écusson pm 123 » est refusée sur Leboncoin (action_app_ratee « annonce_introuvable »).
-- Le serveur avait répondu reason 'annonce_introuvable' + motif 'annonce_vendue' (« cette annonce Leboncoin est vendue »),
-- motif que la trace de l'app ne gardait pas. L'annonce 3260078076, importée par le relevé du 05/11 14:30 (job cec1993a,
-- source releve), portait « Vendu » dès sa première lecture (leboncoin_vendu_avant_suivi = vrai), a été lue en ligne
-- jusqu'au relevé du 05/11 20:51, puis manque aux CINQ relevés complets suivants (06/11 18:15 et 18:53 — constat
-- absence_releves —, 07/11 08:49, 08/11 11:54, 08/11 21:22 : 199 lues sur 199). Le 20:09 du 08/11 est la veille de
-- l'extension (last_checked_at), qui ne l'a PAS lue en ligne (drapeau unavailable_since du 06/11 intact). Refuser était
-- juste ; dire « vendue » ne l'était pas : la vente date d'avant le suivi.
-- Même famille, ailleurs (refus À TORT) : 11 annonces Leboncoin importées, EN LIGNE, badge d'avant le suivi, refusées
-- « vendue » parce que la veille de l'extension avait posé sale_signal 'sold' sur leur dépôt (christopher.boyer30 ×6,
-- jordy.rouleau ×4, lupilou999 ×1 — 3004783150 relevée en ligne le 08/11 02:48). La règle du 08/11 (20261108142000, Jess)
-- n'écartait que la lecture du relevé.
--
-- LA RÈGLE (tous comptes) : avant_suivi = Leboncoin, leboncoin_vendu_avant_suivi, et l'annonce vue en ligne (08/11) OU née
-- hors FillSell. Ce badge ne compte plus ni dans la branche du relevé (transaction_plateforme) ni dans celle de la page
-- (sale_signal 'sold' du dépôt publié). Une vente lue pendant le suivi, les verdicts du juge et les constats : inchangés.
-- Vinted ne lit pas cette fonction ; Beebs, Depop : inchangés (avant_suivi est faux hors Leboncoin).
-- Définition réécrite depuis pg_get_functiondef EN PRODUCTION (09/11, md5 00b2218f3ded96d364f83b8f7d1aebae) : chaque ligne gardée, une CTE et deux
-- conditions ajoutées. Inverse : supabase/rollbacks/20261109010000_vendu_avant_suivi_jamais_une_vente_INVERSE.sql.
-- Preuve (Postgres jetable) : PREUVE_PG=embarque node scripts/essais/20261109010000_banc.mjs
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite, après le feu vert.

DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.republication_annonce_partie(uuid,bigint,text,text)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> '00b2218f3ded96d364f83b8f7d1aebae' AND position('(09/11, assopmfrance' IN v_d) = 0 THEN
    RAISE EXCEPTION 'republication_annonce_partie a changé en prod depuis le 09/11 : repartir de pg_get_functiondef';
  END IF;
  IF to_regprocedure('public.leboncoin_vendu_avant_suivi(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'leboncoin_vendu_avant_suivi(uuid,text) absente : la règle du 03/11 soir n''est pas en prod';
  END IF;
END
$garde$;

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
  ),
  -- ⛔ (09/11, assopmfrance « Écusson pm 123 » Leboncoin 3260078076 ; lupilou999 3004783150) LE BADGE « VENDU » D'AVANT LE
  -- SUIVI N'EST JAMAIS UNE VENTE, QUELLE QUE SOIT LA BRANCHE QUI LE LIT. Le 08/11 (Jess), seule la lecture du relevé
  -- (annonces_plateforme) d'une annonce vue en ligne l'écartait ; le MÊME badge lu par la veille de l'extension sur la page
  -- (« Article vendu » → sale_signal 'sold' du dépôt) restait une « vente » : 11 annonces importées EN LIGNE refusées à la
  -- republication (« cette annonce est vendue »). Et une annonce importée, badge d'avant le suivi, disparue ensuite, se
  -- disait « vendue » : rien ne date de vente — son absence se juge par les constats (« plus en ligne »).
  -- avant_suivi : Leboncoin, leboncoin_vendu_avant_suivi (« Vendu » dès la première lecture, jamais « aucune » ni
  -- « pending » depuis), ET l'annonce vue en ligne (règle du 08/11) OU née hors FillSell (un dépôt de la fiche la porte,
  -- né d'un relevé, et aucun dépôt de FillSell ne porte ce numéro — une annonce que FillSell a déposée n'existait pas
  -- avant lui : un « Vendu » lu dessus est une vente après sa mise en ligne). Une vente lue PENDANT le suivi (transition
  -- vue) reste « annonce_vendue » ; verdicts du juge et constats inchangés.
  avant_suivi AS (
    SELECT p_platform = 'leboncoin' AND public.leboncoin_vendu_avant_suivi(p_user, lid.id)
       AND (EXISTS (SELECT 1 FROM annonces_plateforme a
                     WHERE a.user_id = p_user AND a.platform = p_platform AND a.listing_id = lid.id
                       AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL)
            OR (EXISTS (SELECT 1 FROM cross_post_jobs x
                         WHERE x.user_id = p_user AND x.platform = p_platform
                           AND NULLIF(btrim(x.platform_listing_id), '') = lid.id
                           AND (x.platform_fields ->> 'source' = 'releve'
                                OR x.platform_fields #>> '{rattachement,import}' = 'true'))
                AND NOT EXISTS (SELECT 1 FROM cross_post_jobs x
                         WHERE x.user_id = p_user AND x.platform = p_platform
                           AND NULLIF(btrim(x.platform_listing_id), '') = lid.id
                           AND x.action IN ('publish', 'republish')
                           AND COALESCE(x.platform_fields ->> 'source', '') <> 'releve'
                           AND COALESCE(x.platform_fields #>> '{rattachement,import}', '') <> 'true'))) AS oui
      FROM lid
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
                  AND public.leboncoin_vendu_avant_suivi(a.user_id, a.listing_id))
         -- (09/11) … ni celui d'une annonce née hors FillSell, disparue depuis : son absence se juge par les constats.
         AND NOT COALESCE((SELECT s.oui FROM avant_suivi s), false))
      OR EXISTS (
      SELECT 1 FROM cross_post_jobs x, lid
       WHERE x.user_id = p_user AND x.inventaire_id = p_inventaire_id AND x.platform = p_platform
         AND NULLIF(trim(x.platform_listing_id), '') = lid.id
         AND x.status = 'published' AND x.platform_fields ->> 'sale_signal' = 'sold'
         -- (09/11) Le « Article vendu » lu sur la page par la veille de l'extension est le MÊME badge : d'avant le suivi,
         -- il ne prouve aucune vente.
         AND NOT COALESCE((SELECT s.oui FROM avant_suivi s), false))
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
