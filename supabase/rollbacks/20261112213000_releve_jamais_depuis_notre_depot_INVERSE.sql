-- INVERSE de supabase/migrations/20261112213000_releve_jamais_depuis_notre_depot.sql (12/11/2026) : les définitions de PROD lues le 12/11 vers 22:00
-- (pg_get_functiondef, lecture seule), à l'octet — fiche_completer_depuis_annonce (md5 041d772227b9a4a15465f7c4c7724f93)
-- et inventaire_attributs_avant_update (md5 0f714c6870080895bed1d0e9ee4035ca) —, puis annonce_vient_de_notre_depot retirée.
-- Droits inchangés (CREATE OR REPLACE les garde). Aucune ligne à remettre : la migration n'en écrit aucune.
-- ⚠️ À jouer AVANT tout inverse, si la réparation de la fiche 1793630721658 a été passée : son inverse (qui remet les valeurs
--    du relevé) n'a pas besoin de la migration.
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261112213000_releve_jamais_depuis_notre_depot_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261112213000
BEGIN;
SET LOCAL lock_timeout = '5s';

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
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id;
  IF a.id IS NULL OR a.inventaire_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'non_rattachee'); END IF;
  SELECT * INTO i FROM inventaire WHERE id = a.inventaire_id AND user_id = a.user_id FOR UPDATE;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'raison', 'fiche_absente_ou_fusionnee'); END IF;
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
BEGIN
  IF NEW.attributs IS DISTINCT FROM OLD.attributs THEN
    NEW.attributs := public.inventaire_attributs_fusion(OLD.attributs, NEW.attributs);
  END IF;
  RETURN NEW;
END;
$function$
;

DROP FUNCTION IF EXISTS public.annonce_vient_de_notre_depot(bigint, uuid, text, text, uuid);

COMMIT;
