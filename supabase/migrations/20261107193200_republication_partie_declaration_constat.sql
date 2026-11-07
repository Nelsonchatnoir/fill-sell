-- 20261107193200 — Une annonce que la PERSONNE a déclarée retirée, ou que DEUX RELEVÉS PROBANTS ne voient plus, ne se
-- republie pas (07/11 soir, rouges famille 1 — ayoubd72 90d11dae)
--
-- Constat vérifié en lecture le 07/11 soir (prod) : republication_annonce_partie (le seul juge que lit
-- spend_coins_and_republish avant tout décompte, branche Leboncoin / Beebs / Depop / Opla) ne lit que les verdicts
-- annonce_disparue. Elle ignore :
--   · la déclaration « je l'ai retirée moi-même » (src/App.jsx dismissUnavailable : le job passe « cancelled » avec ce texte,
--     la fiche n'est pas touchée) — 2 985 jobs la portent (Vinted 1 610, Leboncoin 804, Beebs 280, Opla 216, eBay 74) ;
--   · le constat absence_releves de constater_absences_releve (deux relevés probants distincts, disparu_le posé) — cas
--     84bd972d : annonce 3296483096 absente des relevés c2e027f5 et ff2ebb52 (constat du 30/10 09:48), republication créée
--     quand même le 03/11 à 23:32, restée en pause depuis.
-- Mesure (lecture, 07/11 soir, règle telle qu'écrite ici) : 627 fiches Leboncoin de plus seraient refusées si on demandait
-- leur republication — 624 par le constat (46 comptes, dont 90d11dae 3296483096 ; 15 autres l'étaient déjà par un verdict),
-- 3 par la déclaration seule (3 comptes) ; AUCUNE dont l'annonce relevée ait été revue après le repère (par construction),
-- 536 des 624 avec un relevé complet postérieur qui ne la voit pas ; les 3 déclarées : vues pour la dernière fois les
-- 24/09, 25/09, 09/10, avant la déclaration. Sur 30 jours, au plus 29 republications auraient été refusées à la source
-- (borne haute : vu_le ne garde que la dernière vue) : 20 closes « n'est plus en ligne sur Leboncoin », 3 annulées par la
-- personne, 1 close « deux relevés complets », 2 en pause (dont 84bd972d), 3 Opla (sortie le 10/10 ; revues après coup).
-- CPU (EXPLAIN ANALYZE, prod, 3 passages) : plus gros compte Leboncoin 13–17 ms au lieu de 1,3 ms ; 2,5 ms pour un autre
-- gros compte ; le constat se lit par l'index de la fiche (240 ms sur tout l'historique du compte : écarté).
--
-- LA RÈGLE (tous comptes) : republication_annonce_partie rend 'annonce_partie' aussi quand un job du compte qui désigne CE
-- numéro porte la déclaration (les deux libellés du déclencheur cross_post_jobs_declaration_retiree_ferme_retraits), ou
-- qu'un dépôt de CETTE fiche porte le constat absence_releves de CE numéro, et qu'aucun relevé ne l'a revue depuis (vu_le ≥ repère). Elle ne juge toujours
-- rien : elle lit deux constats de plus. Tout le reste (vente prouvée d'abord, verdicts du juge, un relevé qui revoit
-- l'annonce lève la garde, NULL sans numéro) : les lignes d'avant, inchangées. spend_coins_and_republish n'est pas touchée
-- (même refus « annonce_introuvable », motif « annonce_partie », rien décompté). Vinted n'est pas concerné (sa branche ne
-- lit pas cette fonction ; les 8 Vinted « introuvables » de 90d11dae relèvent du juge des relevés).
-- Définition réécrite depuis pg_get_functiondef EN PRODUCTION (07/11 soir, md5 1d076c65d9b0a9383f85d730e81d230c) : chaque
-- ligne gardée, trois insertions ; inverse : supabase/rollbacks/20261107193200_republication_partie_declaration_constat_INVERSE.sql ;
-- preuve (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-republication-partie-declaration-constat.mjs
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite, après le feu vert.

-- ── Garde : la prod est celle lue le 07/11 soir (ou cette migration est déjà passée) ──
DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.republication_annonce_partie(uuid,bigint,text,text)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> '1d076c65d9b0a9383f85d730e81d230c' AND position('constats AS (' IN v_d) = 0 THEN
    RAISE EXCEPTION 'republication_annonce_partie a changé en prod depuis le 07/11 soir : repartir de pg_get_functiondef';
  END IF;
  -- Les deux auteurs lus, inchangés depuis la lecture : le constat (absence_releves) et le libellé de la déclaration.
  SELECT replace(pg_get_functiondef('public.constater_absences_releve(uuid)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> 'd36984b5c0fc70a5251059b5703f0404' THEN
    RAISE EXCEPTION 'constater_absences_releve a changé en prod depuis le 07/11 soir : relire la preuve de absence_releves';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cross_post_jobs_declaration_retiree_ferme_retraits'
                   AND position('Réponse dans l''''app : « je l''''ai retirée moi-même » — pas une vente' IN pg_get_triggerdef(oid)) > 0
                   AND position('Annonce retirée par le vendeur (confirmé dans l''''app)' IN pg_get_triggerdef(oid)) > 0) THEN
    RAISE EXCEPTION 'le libellé de la déclaration « je l''ai retirée moi-même » a changé : relire src/App.jsx et le déclencheur';
  END IF;
END
$garde$;

-- ── republication_annonce_partie : définition de PROD du 07/11 soir, chaque ligne gardée ──
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
$function$;
REVOKE ALL ON FUNCTION public.republication_annonce_partie(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.republication_annonce_partie(uuid, bigint, text, text) TO service_role;
