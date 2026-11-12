-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261112213000_releve_jamais_depuis_notre_depot — UN RELEVÉ NE COMPLÈTE JAMAIS UNE FICHE À PARTIR DE NOTRE PROPRE DÉPÔT
-- (12/11, décision de Nico — étape 2 du lot « zéro problème », point 1a). NON APPLIQUÉE : feu vert de Nico requis.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CAUSE PROUVÉE (lecture seule, 12/11) : fiche 1793630721658 (compte c7c382b7, legging « EU 140cm » lu sur l'étiquette) :
-- attributs.taille = « Naissance - 0 mois (45-50 cm) » et attributs.marque = « Autre », source releve_beebs,
-- at 2026-11-12T20:10:40.921Z (21:10:40 à Paris) — la copie de NOTRE dépôt Beebs 8c447bfa (publié 20:23:27), relue.
-- Le chemin : le relevé de l'extension (background.js, reporterCaptureSurArticle : PATCH inventaire.attributs, horodatage
-- JavaScript « …921Z ») arbitré par le déclencheur inventaire_attributs_avant_update → inventaire_attributs_fusion
-- (releve_* rang 3) ; AUCUNE ligne d'inventaire_journal sur la fiche — fiche_completer_depuis_annonce journalise chaque
-- complément, et sa garde valeur_attribut_saine refuse « Autre » : ce n'est pas elle qui a écrit ici. Elle complète
-- pourtant, elle aussi, depuis nos dépôts (journal, 30 jours au 12/11 : 3 025 compléments depuis une annonce désignée
-- par un dépôt FillSell de la fiche, dont 1 830 « type », 239 « attributs.age », 33 « attributs.taille »). Les deux
-- chemins sont donc corrigés ici, à la base :
--   1. annonce_vient_de_notre_depot(fiche, compte, plateforme[, listing, job]) — NOUVELLE, SQL pur, STABLE, SECURITY
--      INVOKER : une tâche publish/republish de la fiche sur la plateforme, hors suivi de relevé et hors détachée, qui a
--      déposé (publiée, vendue, ou un identifiant d'annonce) ; l'annonce désignée par son job_id ou son identifiant.
--   2. fiche_completer_depuis_annonce — réécrite DEPUIS LA PROD (pg_get_functiondef, md5 041d772227b9a4a15465f7c4c7724f93) :
--      (a) annonce de notre dépôt → aucun complément (« raison » : depot_fillsell) ;
--      (b) attributs_visibles.taille / pointure (l'étiquette lue par Lens) comptent comme une taille renseignée.
--      SECURITY DEFINER, search_path, propriétaire et droits (postgres, service_role) inchangés (CREATE OR REPLACE).
--   3. inventaire_attributs_avant_update (déclencheur inventaire_attributs_fusion_trg, BEFORE UPDATE OF attributs) —
--      réécrit DEPUIS LA PROD (md5 0f714c6870080895bed1d0e9ee4035ca) : une proposition releve_<plateforme> (taille,
--      pointure, état, couleur, matière, marque, âge) NOUVELLE ou CHANGÉE est écartée quand la fiche a un dépôt FillSell
--      sur cette plateforme ; le reste de l'arbitrage (inventaire_attributs_fusion, INCHANGÉE) est le même.
--      Mesuré (état au 12/11, fiches déposées par FillSell depuis 30 jours sur Leboncoin/Beebs/eBay/Depop) : 3 248
--      attributs releve_<même plateforme> portés par ces fiches (taille 637, état 588, marque 728, matière 633,
--      couleur 387, âge 275) — la relecture de nos propres dépôts que la règle arrête désormais.
-- ⛔ AUCUNE LIGNE N'EST RÉÉCRITE : les attributs déjà posés restent (la fiche 1793630721658 : script séparé
--    scripts/reparations/20261112_c7c382b7_fiche_legging.sql, après cette migration).
-- ⛔ Inchangés : les relevés d'une annonce que la personne a déposée elle-même (fiche née du relevé, annonce sans dépôt
--    FillSell), la synchro Vinted (vinted_liste / vinted_detail : source de la republication Vinted), les saisies.
-- Coût : un EXISTS indexé (cross_post_jobs_inventaire) par attribut releve_* nouveau ou changé — aucun pour les autres
-- mises à jour de la fiche.
-- Banc : scripts/essais/20261112213000_banc.mjs (Postgres jetable : avant / après / inverse identique).
-- Sauvegarde : scripts/reparations/20261112_releve_jamais_depuis_notre_depot_SAUVEGARDE.sql. Inverse : supabase/rollbacks/20261112213000_releve_jamais_depuis_notre_depot_INVERSE.sql.
-- À jouer (feu vert de Nico) : SAUVEGARDE, puis npx supabase db query --linked -f supabase/migrations/20261112213000_releve_jamais_depuis_notre_depot.sql
--   puis npx supabase migration repair --linked --status applied 20261112213000  (version à relire contre « migration list »).
BEGIN;

DO $garde$
BEGIN
  IF md5(replace(pg_get_functiondef('public.fiche_completer_depuis_annonce(uuid)'::regprocedure), chr(13), '')) <> '041d772227b9a4a15465f7c4c7724f93' THEN
    RAISE EXCEPTION 'fiche_completer_depuis_annonce a changé en prod depuis sa lecture du 12/11 : régénérer 20261112213000 depuis pg_get_functiondef';
  END IF;
  IF md5(replace(pg_get_functiondef('public.inventaire_attributs_avant_update()'::regprocedure), chr(13), '')) <> '0f714c6870080895bed1d0e9ee4035ca' THEN
    RAISE EXCEPTION 'inventaire_attributs_avant_update a changé en prod depuis sa lecture du 12/11 : régénérer 20261112213000 depuis pg_get_functiondef';
  END IF;
END
$garde$;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.annonce_vient_de_notre_depot(p_inventaire bigint, p_user uuid, p_platform text,
  p_listing_id text DEFAULT NULL, p_job_id uuid DEFAULT NULL)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- (12/11, point 1a) Une annonce de la plateforme p_platform vient-elle d'un DÉPÔT FillSell de CETTE fiche ?
  -- Un dépôt = une tâche publish / republish de la fiche sur la plateforme, qui n'est pas le suivi d'un relevé
  -- (platform_fields.source = 'releve'), ni détachée (detache_le) — même définition que fiche_releve_doublon_resorber —,
  -- et qui a déposé : publiée, vendue, ou porteuse d'un identifiant d'annonce. L'annonce est désignée par la tâche qui
  -- l'a rattachée (annonces_plateforme.job_id) ou par son identifiant (listing_designe) ; sans annonce désignée (le
  -- relevé de l'extension n'écrit que la fiche), tout dépôt de la fiche sur cette plateforme compte.
  -- SECURITY INVOKER : un client ne voit que SES tâches (RLS « Users manage own cross_post_jobs »).
  SELECT EXISTS (
    SELECT 1 FROM cross_post_jobs j
     WHERE j.inventaire_id = p_inventaire AND j.user_id = p_user AND j.platform = p_platform
       AND j.action IN ('publish', 'republish')
       AND COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
       AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ? 'detache_le')
       AND (
         (p_job_id IS NOT NULL AND j.id = p_job_id)
         OR ((j.status IN ('published', 'sold') OR NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL)
             AND (p_listing_id IS NULL OR listing_designe(p_listing_id, j.listing_url, j.platform_listing_id)))
       )
  );
$function$;

REVOKE ALL ON FUNCTION public.annonce_vient_de_notre_depot(bigint, uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annonce_vient_de_notre_depot(bigint, uuid, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fiche_completer_depuis_annonce(p_annonce_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  i inventaire%ROWTYPE;
  d jsonb;
  v_source text;
  v_desc text; v_marque text; v_type text; v_prix numeric; v_poids integer;
  v_attr jsonb := '{}'::jsonb;
  k text;
  v_champs text[] := ARRAY[]::text[];
  v_detail jsonb;
  v_visibles jsonb;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id;
  IF a.id IS NULL OR a.inventaire_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'non_rattachee'); END IF;
  SELECT * INTO i FROM inventaire WHERE id = a.inventaire_id AND user_id = a.user_id FOR UPDATE;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'fiche_absente_ou_fusionnee'); END IF;
  -- (12/11, décision de Nico — point 1a) UN RELEVÉ NE COMPLÈTE JAMAIS UNE FICHE DEPUIS NOTRE PROPRE DÉPÔT : une annonce
  -- que FillSell a déposée depuis CETTE fiche ne porte que ce que nous y avons mis (une copie rédigée, une traduction de
  -- la fiche) — jamais une preuve. Fiche 1793630721658 (compte c7c382b7) : la copie Beebs « Naissance » d'un legging
  -- 140 cm, relue le 12/11, devenait la taille de la fiche.
  IF public.annonce_vient_de_notre_depot(i.id, a.user_id, a.platform, a.listing_id, a.job_id) THEN
    RETURN jsonb_build_object('ok', true, 'champs', '[]'::jsonb, 'raison', 'depot_fillsell');
  END IF;
  -- (12/11) La taille de l'étiquette lue (attributs_visibles.taille / pointure) est une taille de la fiche : renseignée.
  v_visibles := CASE WHEN jsonb_typeof(i.attributs -> 'attributs_visibles' -> 'v') = 'object' THEN i.attributs -> 'attributs_visibles' -> 'v'
                     WHEN jsonb_typeof(i.attributs -> 'attributs_visibles') = 'object' THEN i.attributs -> 'attributs_visibles'
                     ELSE '{}'::jsonb END;
  d := public.annonce_donnees(a.platform, a.capture, a.donnees_index);
  v_source := 'releve_' || a.platform;
  v_detail := jsonb_build_object('annonce_id', a.id, 'listing_id', a.listing_id, 'platform', a.platform);

  IF NULLIF(btrim(i.description), '') IS NULL AND length(COALESCE(d ->> 'description', '')) BETWEEN 1 AND 10000 THEN
    v_desc := d ->> 'description'; v_champs := array_append(v_champs, 'description');
  END IF;
  IF NULLIF(btrim(i.marque), '') IS NULL AND public.valeur_attribut_saine(d ->> 'marque') THEN
    v_marque := btrim(d ->> 'marque'); v_champs := array_append(v_champs, 'marque');
  END IF;
  IF i.type IS NULL THEN
    v_type := public.type_fillsell_depuis_categorie(a.platform, d ->> 'categorie');
    IF v_type IS NOT NULL THEN v_champs := array_append(v_champs, 'type'); END IF;
  END IF;
  IF i.prix_vente IS NULL AND COALESCE(i.statut, '') <> 'vendu' AND a.prix > 0 THEN
    v_prix := a.prix; v_champs := array_append(v_champs, 'prix_vente');
  END IF;
  IF i.poids_g IS NULL AND (d ->> 'poids_g') IS NOT NULL THEN
    v_poids := (d ->> 'poids_g')::integer; v_champs := array_append(v_champs, 'poids_g');
  END IF;
  FOREACH k IN ARRAY ARRAY['etat', 'taille', 'couleur', 'matiere', 'age'] LOOP
    CONTINUE WHEN k = 'taille' AND (NULLIF(btrim(v_visibles ->> 'taille'), '') IS NOT NULL OR NULLIF(btrim(v_visibles ->> 'pointure'), '') IS NOT NULL);
    IF NULLIF(btrim(i.attributs -> k ->> 'v'), '') IS NULL AND public.valeur_attribut_saine(d ->> k) THEN
      v_attr := v_attr || jsonb_build_object(k, jsonb_build_object('v', btrim(d ->> k), 'source', v_source, 'at', now()));
      v_champs := array_append(v_champs, 'attributs.' || k);
    END IF;
  END LOOP;

  IF cardinality(v_champs) = 0 THEN RETURN jsonb_build_object('ok', true, 'champs', '[]'::jsonb); END IF;

  PERFORM set_config('fillsell.source_changement', 'releve:' || a.platform, true);
  UPDATE inventaire SET
    description = COALESCE(v_desc, description),
    marque      = COALESCE(v_marque, marque),
    type        = COALESCE(v_type, type),
    prix_vente  = COALESCE(v_prix, prix_vente),
    poids_g     = COALESCE(v_poids, poids_g),
    attributs   = CASE WHEN v_attr = '{}'::jsonb THEN attributs ELSE COALESCE(attributs, '{}'::jsonb) || v_attr END
  WHERE id = i.id;
  PERFORM set_config('fillsell.source_changement', '', true);

  IF v_desc IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'description', NULL, left(v_desc, 120), v_source, 'champ_vide_complete', v_detail); END IF;
  IF v_marque IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'marque', NULL, v_marque, v_source, 'champ_vide_complete', v_detail); END IF;
  IF v_type IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'type', NULL, v_type, v_source, 'champ_vide_complete', v_detail || jsonb_build_object('categorie', d ->> 'categorie')); END IF;
  IF v_prix IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'prix_vente', NULL, v_prix::text, v_source, 'champ_vide_complete', v_detail); END IF;
  IF v_poids IS NOT NULL THEN PERFORM journaliser_fiche(a.user_id, i.id, 'poids_g', NULL, v_poids::text, v_source, 'champ_vide_complete', v_detail); END IF;
  FOR k IN SELECT jsonb_object_keys(v_attr) LOOP
    PERFORM journaliser_fiche(a.user_id, i.id, 'attributs.' || k, NULL, v_attr -> k ->> 'v', v_source, 'champ_vide_complete', v_detail);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'champs', to_jsonb(v_champs));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.inventaire_attributs_avant_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_nouveaux jsonb;
  v_cle text;
  v_val jsonb;
BEGIN
  IF NEW.attributs IS DISTINCT FROM OLD.attributs THEN
    v_nouveaux := NEW.attributs;
    -- (12/11, décision de Nico — point 1a) UN RELEVÉ NE COMPLÈTE NI NE RÉÉCRIT JAMAIS UNE FICHE DEPUIS NOTRE PROPRE
    -- DÉPÔT. Le relevé de l'extension (reporterCaptureSurArticle) propose les attributs lus sur l'annonce (source
    -- releve_<plateforme>) ; quand cette plateforme porte un dépôt FillSell de CETTE fiche, ce qu'il lit est ce que nous
    -- y avons mis : la proposition est écartée AVANT l'arbitrage par le rang, l'attribut de la fiche reste ce qu'il était.
    -- Fiche 1793630721658 (compte c7c382b7), 12/11 21:10 : « Naissance - 0 mois (45-50 cm) » et la marque « Autre » de
    -- notre dépôt Beebs 8c447bfa sont devenues la taille et la marque de la fiche — sans une ligne d'inventaire_journal.
    -- Tous les autres attributs, et toute autre source (manuel, capture, vinted_*, lens), passent comme avant.
    IF jsonb_typeof(v_nouveaux) = 'object' THEN
      FOR v_cle, v_val IN SELECT e.key, e.value FROM jsonb_each(NEW.attributs) e LOOP
        CONTINUE WHEN v_cle NOT IN ('taille', 'pointure', 'etat', 'couleur', 'matiere', 'marque', 'age');
        CONTINUE WHEN jsonb_typeof(v_val) IS DISTINCT FROM 'object' OR COALESCE(v_val ->> 'source', '') NOT LIKE 'releve\_%';
        CONTINUE WHEN v_val IS NOT DISTINCT FROM (OLD.attributs -> v_cle);
        IF public.annonce_vient_de_notre_depot(NEW.id, NEW.user_id, substr(v_val ->> 'source', 8)) THEN
          v_nouveaux := v_nouveaux - v_cle;
        END IF;
      END LOOP;
    END IF;
    NEW.attributs := public.inventaire_attributs_fusion(OLD.attributs, v_nouveaux);
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
