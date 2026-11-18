-- 20261118_ebay_vendeur_renomme_f5fab0e0.sql — (18/11/2026, point 7 de Nico) LES 5 ANNONCES eBAY DU COMPTE f5fab0e0
-- SUIVENT SON PSEUDO RENOMMÉ (ancien pseudo → nouveau pseudo, même compte eBay). Les deux pseudos sont LUS en base (la
-- sauvegarde, ebay_accounts), jamais recopiés ici (règle « données de clients »).
-- Ordre : 1) 20261118_ebay_vendeur_renomme_f5fab0e0_SAUVEGARDE.sql (sauvegarde des 5 lignes) ; 2) ce script ;
-- inverse : 20261118_ebay_vendeur_renomme_f5fab0e0_INVERSE.sql.
-- Contexte et preuve : rapport du point 7 (18/11) ; même règle que ebay-oauth-callback (renommerVendeurAnnoncesEbay,
-- _shared/ebay-reconnexion.js) pour les reconnexions à venir.
-- Ce qui change : la colonne vendeur de ces 5 lignes ebay_vendeurs_annonces, et rien d'autre (ni source, ni vu_le,
-- aucune annonce, aucun job, aucun autre compte).
-- Gardes (rien ne bouge sinon, transaction annulée) :
--   · la sauvegarde contient les 5 lignes ;
--   · le compte relié porte un pseudo différent de l'ancien, non révoqué, et son EIAS est celui noté le 16/11 à 13:08
--     (comptes_plateformes) : le même compte que celui qui a publié les 5 annonces ;
--   · les 5 lignes sauvegardées portent le même ancien pseudo, et chacune le porte encore ;
--   · chaque annonce est bien une publication eBay de ce compte FillSell (cross_post_jobs).
BEGIN;
DO $$
DECLARE
  v_user uuid := 'f5fab0e0-253b-4511-b52f-bf249237414d';
  v_ancien text;
  v_nouveau text;
  v_ids text[] := ARRAY['840134586409', '840134586720', '840134587088', '840134589245', '840134589315'];
  v_compte record;
  v_n int;
  v_id text;
BEGIN
  SELECT count(*) INTO v_n FROM public._backup_1811_ebay_vendeur_renomme WHERE listing_id = ANY (v_ids);
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'sauvegarde incomplète (% ligne(s) sur 5) : jouer d''abord le script _SAUVEGARDE — rien fait', v_n;
  END IF;
  SELECT min(vendeur), count(DISTINCT vendeur) INTO v_ancien, v_n FROM public._backup_1811_ebay_vendeur_renomme WHERE listing_id = ANY (v_ids);
  IF v_n <> 1 OR v_ancien IS NULL THEN
    RAISE EXCEPTION 'les 5 lignes sauvegardées ne portent pas un seul et même pseudo (%) — rien fait', v_n;
  END IF;
  SELECT a.ebay_user_id INTO v_nouveau FROM public.ebay_accounts a WHERE a.user_id = v_user;
  -- Même compte : une seule ligne eBay dans comptes_plateformes pour ce compte FillSell (écrite le 16/11 à 13:08 sous
  -- l'ancien pseudo), et son EIAS est celui de la connexion d'aujourd'hui.
  SELECT a.ebay_user_id, a.revoked_at,
         (a.ebay_eias_token IS NOT NULL
          AND (SELECT count(*) FROM public.comptes_plateformes c WHERE c.user_id = v_user AND c.plateforme = 'ebay') = 1
          AND EXISTS (SELECT 1 FROM public.comptes_plateformes c
                       WHERE c.user_id = v_user AND c.plateforme = 'ebay' AND c.compte = a.ebay_eias_token)) AS meme_eias
    INTO v_compte
    FROM public.ebay_accounts a WHERE a.user_id = v_user;
  IF NOT FOUND OR v_nouveau IS NULL OR v_nouveau = v_ancien OR v_compte.ebay_user_id IS DISTINCT FROM v_nouveau OR v_compte.revoked_at IS NOT NULL OR v_compte.meme_eias IS NOT TRUE THEN
    RAISE EXCEPTION 'compte différent de l''audit (pseudo %, révoqué %, même EIAS %) : rien fait',
      v_compte.ebay_user_id, v_compte.revoked_at, v_compte.meme_eias;
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM 1 FROM public.ebay_vendeurs_annonces v WHERE v.listing_id = v_id AND v.vendeur = v_ancien FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'annonce % : ne porte plus « % » — rien fait', v_id, v_ancien;
    END IF;
    PERFORM 1 FROM public.cross_post_jobs j WHERE j.user_id = v_user AND j.platform = 'ebay' AND j.platform_listing_id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'annonce % : aucune publication eBay de ce compte — rien fait', v_id;
    END IF;
  END LOOP;
  UPDATE public.ebay_vendeurs_annonces SET vendeur = v_nouveau
   WHERE listing_id = ANY (v_ids) AND vendeur = v_ancien;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '% ligne(s) modifiée(s) au lieu de 5 — transaction annulée', v_n;
  END IF;
  RAISE NOTICE '5 annonce(s) notée(s) sous le pseudo du compte relié (ancien pseudo remplacé)';
END $$;
COMMIT;
SELECT v.listing_id, v.vendeur, v.source, to_char(v.vu_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI:SS') AS vu_le_paris
  FROM public.ebay_vendeurs_annonces v
 WHERE v.listing_id IN ('840134586409', '840134586720', '840134587088', '840134589245', '840134589315')
 ORDER BY v.listing_id;
-- Attendu : 5 lignes, vendeur = le pseudo de ebay_accounts du compte, source et vu_le inchangés.
