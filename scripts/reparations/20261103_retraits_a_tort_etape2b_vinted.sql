-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2b — Vinted (JEAN-LUC, point 2) : les 3 annonces retirées à tort SANS catégorie en base (créées hors FillSell),
-- remises en ligne depuis la FICHE avec la catégorie CHOISIE PAR NICO (03/11 soir) :
--   balance Terraillon (9332690165) → Maison > Outils de cuisine > Balances de cuisine (3518) ;
--   boîte à café (9613571304), boîte à café marron (9613595410) → Maison > Décoration > Rangement et organisation > Boîtes (1963).
-- État, marque, couleur, matière : ceux de la fiche (relevés Vinted et Leboncoin). Hors quota ; une à la fois, 20 min
-- d'écart, après la serviette (étape 2). Mêmes gardes que l'étape 2. Inverse : …_etape2_INVERSE.sql (même marqueur).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMPORARY TABLE _remises (rang int PRIMARY KEY, fiche bigint NOT NULL, ancien_numero text NOT NULL, ancien_depot uuid NOT NULL,
  chemin jsonb NOT NULL, delai_min int NOT NULL) ON COMMIT DROP;
INSERT INTO _remises VALUES
  (1, 1793643690709003, '9332690165', '79e45caf-c1c3-4385-87eb-06cca888108a', '["Maison", "Outils de cuisine", "Balances de cuisine"]', 15),
  (2, 1793643689693007, '9613571304', 'f0614e7e-2587-460e-94e8-0a39e227a2bd', '["Maison", "Décoration", "Rangement et organisation", "Boîtes"]', 35),
  (3, 1793643689693006, '9613595410', '87a0083e-511d-41d3-8d3b-4164e69a68d8', '["Maison", "Décoration", "Rangement et organisation", "Boîtes"]', 55);

DO $$
DECLARE r record; i public.inventaire%ROWTYPE; v_ph jsonb; v_pf jsonb; v_le timestamptz; v_id uuid; v_marque text; v_couleur text; n int := 0;
BEGIN
  FOR r IN SELECT * FROM _remises ORDER BY rang LOOP
    SELECT * INTO i FROM public.inventaire WHERE id = r.fiche AND user_id = '9256e3ae-48e4-4a3a-be66-65fd2e28b418' FOR UPDATE;
    IF i.id IS NULL OR i.statut IS DISTINCT FROM 'stock' OR COALESCE(i.quantite, 1) < 1 OR i.fusionne_dans IS NOT NULL THEN
      RAISE EXCEPTION 'remise % : fiche % pas au stock', r.rang, r.fiche;
    END IF;
    IF EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.inventaire_id = r.fiche AND c.platform = 'vinted'
                AND (c.status IN ('pending', 'processing', 'needs_user')
                     OR (c.status = 'published' AND COALESCE(c.action, 'publish') IN ('publish', 'republish')))) THEN
      RAISE EXCEPTION 'remise % : une tâche Vinted active ou publiée sur la fiche %', r.rang, r.fiche;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs d WHERE d.platform_fields #>> '{arme_par,depot}' = r.ancien_depot::text
                    AND d.action = 'delete' AND d.status = 'deleted' AND d.platform = 'vinted') THEN
      RAISE EXCEPTION 'remise % : retrait Vinted fait du dépôt % introuvable', r.rang, r.ancien_depot;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('type', 'original', 'url', p) ORDER BY o), '[]'::jsonb) INTO v_ph
      FROM jsonb_array_elements_text(COALESCE(i.photos, '[]'::jsonb)) WITH ORDINALITY t(p, o) WHERE p ~ '^https?://';
    IF jsonb_array_length(v_ph) = 0 THEN RAISE EXCEPTION 'remise % : fiche % sans photo', r.rang, r.fiche; END IF;
    v_marque := COALESCE(NULLIF(btrim(i.marque), ''), NULLIF(btrim(i.attributs #>> '{marque,v}'), ''), 'Sans marque');
    v_couleur := NULLIF(btrim(i.attributs #>> '{couleur,v}'), '');
    v_le := now() + make_interval(mins => r.delai_min);
    v_pf := jsonb_build_object('categoryPath', r.chemin, 'categorie', 'Maison', 'categorie_source', 'choix_humain',
        'etat', COALESCE(NULLIF(btrim(i.attributs #>> '{etat,v}'), ''), 'Neuf avec étiquette'), 'marque', v_marque,
        'vinted_account_id', i.vinted_account_id, 'hors_quota', true, 'next_action_after', v_le,
        'remise_en_ligne_0311', jsonb_build_object('le', now(), 'ancien_numero', r.ancien_numero, 'ancien_depot', r.ancien_depot,
          'categorie_choisie_par', 'Nico (03/11 soir)', 'motif', 'vente Leboncoin comptée deux fois (03/11 18:15) — copie Vinted retirée à tort',
          'par', 'scripts/reparations/20261103_retraits_a_tort_etape2b_vinted.sql'))
      || CASE WHEN v_couleur IS NOT NULL THEN jsonb_build_object('couleur', v_couleur, 'colors', jsonb_build_array(v_couleur)) ELSE '{}'::jsonb END
      || CASE WHEN i.attributs #>> '{matiere,v}' IS NOT NULL THEN jsonb_build_object('matiere', i.attributs #>> '{matiere,v}') ELSE '{}'::jsonb END;
    INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, description, price, photos, platform_fields)
    VALUES (i.user_id, r.fiche, 'vinted', 'publish', 'pending', 'original', i.titre, i.description, i.prix_vente, v_ph, v_pf)
    RETURNING id INTO v_id;
    INSERT INTO public.usage_logs (user_id, feature, metadata) VALUES (i.user_id, 'remise_en_ligne_retrait_a_tort',
      jsonb_build_object('job', v_id, 'platform', 'vinted', 'forme', 'publish', 'inventaire_id', r.fiche::text,
                         'ancien_numero', r.ancien_numero, 'a_partir_de', v_le, 'categorie', r.chemin));
    n := n + 1;
  END LOOP;
  IF n <> 3 THEN RAISE EXCEPTION '3 remises attendues, % créée(s)', n; END IF;
END $$;

SELECT c.inventaire_id, left(c.title, 40) AS titre, c.platform_fields -> 'categoryPath' AS categorie, c.platform_fields ->> 'etat' AS etat,
       c.platform_fields ->> 'marque' AS marque, to_char((c.platform_fields ->> 'next_action_after')::timestamptz AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS a_partir_de
  FROM public.cross_post_jobs c WHERE c.platform = 'vinted' AND c.platform_fields #>> '{remise_en_ligne_0311,categorie_choisie_par}' IS NOT NULL;
COMMIT;
