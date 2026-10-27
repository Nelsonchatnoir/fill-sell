-- (27/10, décision de Nico : « on garde la vente 290670 (25/10, 9,90 €, fiche d'origine) ; la vente 315890 (27/10, fiche
-- en double) est le doublon, à résorber par la règle, rien sur Leboncoin ») — rapport docs/enquetes/doublons-identifiant-2710.
-- XEWER (de63ca45), Kirby Star Allies, Leboncoin 3295236977 : le dépôt FillSell 3b92d5ca (fiche 1792945124235) l'a vendu,
-- vente 290670. Le relevé du 26/10 08:29 a créé la fiche 1792999747010 pour cette même annonce (bug corrigé par
-- 20261027120000), et la transaction « Vendu » lue le 27/10 06:59 y a écrit la vente 315890 : la même vente, deux fois.
-- La résorption de la règle (fiche_releve_doublon_resorber) refuse une fiche qui porte une vente ; la vente étant tranchée
-- doublon par Nico :
--   1. la vente 315890 est retirée (sauvegardée ; aucun mail ni push n'était parti pour elle, aucune référence) ;
--   2. l'annonce rejoint la fiche de son dépôt PAR LA RÈGLE (annonce_rattacher_par_identifiant → 1792945124235, dépôt
--      3b92d5ca vendu, aucun job neuf) ;
--   3. la fiche née du relevé est absorbée comme le fait la règle (fusionne_dans → 1792945124235, inventaire_fusions) ;
--      son statut ne change pas (aucun déclencheur de vente ni de remise en vente) ; son job de suivi a60df291 garde son
--      statut, marqué détaché.
-- Rien sur Leboncoin (aucun job de retrait ni de dépôt), aucun quota, aucun mail. Gardes : chaque ligne dans l'état relu
-- le 27/10 à 10:2x, sinon tout est annulé. Inverse : 20261027_xewer_vente_en_double_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
CREATE TABLE public._backup_2710_xewer_vente AS SELECT now() AS sauvegarde_le, v.* FROM public.ventes v WHERE v.id = 315890;
CREATE TABLE public._backup_2710_xewer_lignes AS
  SELECT now() AS sauvegarde_le, 'annonce' AS quoi, a.id::text AS id, to_jsonb(a) AS ligne FROM public.annonces_plateforme a WHERE a.id = '881172df-2306-4a92-b959-631516deb340'
  UNION ALL SELECT now(), 'fiche', i.id::text, to_jsonb(i) FROM public.inventaire i WHERE i.id = 1792999747010
  UNION ALL SELECT now(), 'job', c.id::text, to_jsonb(c) FROM public.cross_post_jobs c WHERE c.id = 'a60df291-ebb2-4cb1-aece-496a2fa4c432';
ALTER TABLE public._backup_2710_xewer_vente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_2710_xewer_lignes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2710_xewer_vente, public._backup_2710_xewer_lignes FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_user uuid := 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e';
  v_ann uuid := '881172df-2306-4a92-b959-631516deb340';
  v_garde bigint := 1792945124235; v_dbl bigint := 1792999747010;
  v_depot uuid := '3b92d5ca-a96a-4d53-929a-727cb3226080'; v_suivi uuid := 'a60df291-ebb2-4cb1-aece-496a2fa4c432';
  m integer; r jsonb;
BEGIN
  IF to_regprocedure('public.annonce_rattacher_par_identifiant(uuid,text)') IS NULL THEN RAISE EXCEPTION 'migration 20261027120000 absente'; END IF;
  -- Gardes : l'état relu le 27/10.
  IF (SELECT count(*) FROM public._backup_2710_xewer_vente) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.ventes WHERE id = 315890 AND user_id = v_user AND inventaire_id = v_dbl AND annonce_id = '3295236977' AND plateforme = 'Leboncoin')
     OR NOT EXISTS (SELECT 1 FROM public.ventes WHERE id = 290670 AND user_id = v_user AND inventaire_id = v_garde AND plateforme = 'Leboncoin')
     OR (SELECT count(*) FROM public.ventes WHERE inventaire_id = v_dbl) <> 1
     OR EXISTS (SELECT 1 FROM public.push_ventes WHERE vente_id = 315890)
     OR EXISTS (SELECT 1 FROM public.ventes_supprimees WHERE vente_id = 315890)
     OR NOT EXISTS (SELECT 1 FROM public.annonces_plateforme WHERE id = v_ann AND user_id = v_user AND inventaire_id = v_dbl AND listing_id = '3295236977')
     OR NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = v_dbl AND user_id = v_user AND origine = 'releve_leboncoin' AND fusionne_dans IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.cross_post_jobs WHERE id = v_depot AND inventaire_id = v_garde AND status = 'sold' AND platform_listing_id = '3295236977')
     OR (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id = v_dbl) <> 1
     OR (SELECT count(*) FROM public.annonces_plateforme WHERE inventaire_id = v_dbl) <> 1 THEN
    RAISE EXCEPTION 'XEWER : l''état n''est plus celui relu le 27/10 — rien n''est fait';
  END IF;

  -- 1. La vente en double (décision de Nico). Supprimée par le rôle postgres : ventes_suppression_trace ne rejoue pas.
  DELETE FROM public.ventes WHERE id = 315890;
  GET DIAGNOSTICS m = ROW_COUNT; IF m <> 1 THEN RAISE EXCEPTION 'vente 315890 : % ligne(s)', m; END IF;

  -- 2. L'annonce rejoint la fiche de son dépôt par la règle.
  UPDATE public.cross_post_jobs SET platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object('detache_le', now(),
           'doublon_identifiant', jsonb_build_object('le', now(), 'annonce_id', v_ann, 'depot', v_depot, 'fiche_depot', v_garde,
             'vente_retiree', 315890, 'decision', 'Nico 27/10'))
   WHERE id = v_suivi;
  UPDATE public.annonces_plateforme SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL, updated_at = now() WHERE id = v_ann;
  r := public.annonce_rattacher_par_identifiant(v_ann, 'reparation');
  IF r IS NULL OR (r ->> 'inventaire_id')::bigint <> v_garde OR (r ->> 'job_id')::uuid <> v_depot THEN
    RAISE EXCEPTION 'XEWER : la règle n''a pas rattaché l''annonce à la fiche de son dépôt (%)', r;
  END IF;

  -- 3. La fiche née du relevé est absorbée (comme fiche_releve_doublon_resorber), statut inchangé.
  UPDATE public.inventaire SET fusionne_dans = v_garde, fusionne_le = now() WHERE id = v_dbl AND fusionne_dans IS NULL;
  INSERT INTO public.inventaire_fusions (user_id, garde, absorbe, deplacements, champs_repris, par)
  VALUES (v_user, v_garde, v_dbl, jsonb_build_object('annonces_plateforme', jsonb_build_array(v_ann), 'ventes_retirees', jsonb_build_array(315890)),
          '{}'::jsonb, 'regle:identifiant_avant_fiche (vente en double, décision de Nico 27/10)');
  RAISE NOTICE 'XEWER : vente 315890 retirée, annonce 3295236977 sur 1792945124235 (dépôt 3b92d5ca), fiche 1792999747010 absorbée';
END $$;
COMMIT;
