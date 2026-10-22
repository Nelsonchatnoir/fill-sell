-- INVERSE de 20261022_leboncoin_achats_en_cours_existants.sql : chaque vente créée par la réparation repasse par
-- le chemin d'un ACHAT ANNULÉ (vente_transaction_annulee_leboncoin : vente retirée et tracée, fiche au stock,
-- retraits encore en file arrêtés, copies déjà retirées remises en vente), puis une preuve restée sans vente est
-- levée. Aucun mail (aucune note n'est créée par ce chemin).
BEGIN;
DO $$ DECLARE b record; v bigint; r jsonb; BEGIN
  FOR b IN SELECT * FROM public._backup_2210_lbc_achats WHERE resultat #>> '{regle,issue}' = 'prouvee' LOOP
    SELECT x.id INTO v FROM ventes x WHERE x.user_id = b.user_id AND x.plateforme_code = 'leboncoin' AND x.annonce_id = b.listing_id
     ORDER BY x.created_at DESC LIMIT 1;
    IF v IS NOT NULL THEN
      r := public.vente_transaction_annulee_leboncoin(v, 'inverse_rattrapage_2210');
      RAISE NOTICE 'annonce % : %', b.listing_id, r;
    ELSE
      PERFORM public.signal_vente_lever(b.job, 'inverse_rattrapage_2210', jsonb_build_object('annonce', b.annonce));
    END IF;
  END LOOP;
END $$;
COMMIT;
