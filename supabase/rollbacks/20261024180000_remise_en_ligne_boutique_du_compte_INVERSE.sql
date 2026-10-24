-- INVERSE de 20261024180000 : rapprochement_v3_remise_possible tel qu'il était EN PROD le 24/10 jusqu'à 12:18 (heure de Paris)
-- (md5 4dd0fb28adcdad06c94c0649757ff7ac, le corps posé par 20261024170000), sans la garde « la boutique du compte ».
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE OR REPLACE FUNCTION public.rapprochement_v3_remise_possible(p_user uuid, p_ancienne bigint, p_nouvelle bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m inventaire%ROWTYPE; n inventaire%ROWTYPE;
BEGIN
  SELECT * INTO m FROM inventaire WHERE id = p_ancienne AND user_id = p_user;
  SELECT * INTO n FROM inventaire WHERE id = p_nouvelle AND user_id = p_user;
  IF m.id IS NULL OR n.id IS NULL OR m.id = n.id OR m.fusionne_dans IS NOT NULL OR n.fusionne_dans IS NOT NULL THEN
    RETURN 'introuvable';
  END IF;
  -- une décision de la personne sur la paire est définitive (réponse, fusion défaite)
  IF EXISTS (SELECT 1 FROM inventaire_doublons q WHERE q.user_id = p_user AND q.decide_par = 'utilisateur'
               AND least(q.garde, q.absorbe) = least(m.id, n.id) AND greatest(q.garde, q.absorbe) = greatest(m.id, n.id))
     OR EXISTS (SELECT 1 FROM inventaire_fusions f WHERE f.user_id = p_user AND f.defait_le IS NOT NULL
                  AND least(f.garde, f.absorbe) = least(m.id, n.id) AND greatest(f.garde, f.absorbe) = greatest(m.id, n.id)) THEN
    RETURN 'paire_tranchee';
  END IF;
  IF NULLIF(btrim(COALESCE(m.vinted_item_id, '')), '') IS NULL OR NULLIF(btrim(COALESCE(n.vinted_item_id, '')), '') IS NULL
     OR btrim(m.vinted_item_id) = btrim(n.vinted_item_id) THEN
    RETURN 'pas_vinted';
  END IF;
  IF COALESCE(m.vinted_account_id, '') <> COALESCE(n.vinted_account_id, '') THEN RETURN 'boutiques_differentes'; END IF;
  IF m.statut IS DISTINCT FROM 'stock' OR COALESCE(m.vinted_status, '') = 'sold'
     OR n.statut IS DISTINCT FROM 'stock' AND (n.statut = 'vendu' OR COALESCE(n.vinted_status, '') = 'sold') THEN
    RETURN 'ancienne_vendue';
  END IF;
  -- (24/10, feu vert de Nico) AUCUNE VENTE EN COURS TOUCHÉE : une commande, une preuve de vente qui attend son
  -- enregistrement, un achat en cours Leboncoin, sur l'une ou l'autre fiche — rien n'est fait (ni fusion, ni question).
  IF EXISTS (SELECT 1 FROM plateforme_commandes pc WHERE pc.inventaire_id IN (m.id, n.id))
     OR EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id IN (m.id, n.id)
                  AND j.status = 'published' AND j.platform_fields ->> 'sale_signal' = 'sold')
     OR EXISTS (SELECT 1 FROM annonces_plateforme a WHERE a.inventaire_id IN (m.id, n.id) AND a.platform = 'leboncoin'
                  AND public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture) IN ('pending', 'sold')) THEN
    RETURN 'vente_en_cours';
  END IF;
  IF n.statut IS DISTINCT FROM 'stock' OR COALESCE(n.vinted_status, '') <> 'active' OR n.disparu_le IS NOT NULL THEN
    RETURN 'nouvelle_pas_en_ligne';
  END IF;
  -- jamais en ligne ensemble, l'ancienne a quitté le dressing sans y être vue vendue
  IF NOT vinted_remise_en_ligne(m.id, n.id) THEN RETURN 'pas_une_remise_en_ligne'; END IF;
  -- ce qui demande la personne : la question, jamais la fusion
  IF COALESCE(m.quantite, 1) > 1 OR COALESCE(n.quantite, 1) > 1 THEN RETURN 'quantite'; END IF;
  IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = p_user AND j.inventaire_id IN (m.id, n.id)
               AND j.status IN ('pending', 'processing', 'needs_user')) THEN
    RETURN 'job_en_vol';
  END IF;
  IF n.prix_achat IS NOT NULL OR COALESCE(n.prix_achat_inconnu, false)
     OR n.prix_vente_change_par = 'app' OR n.poids_change_par = 'app'
     OR EXISTS (SELECT 1 FROM ventes x WHERE x.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM fiches_annonce fa WHERE fa.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM push_ventes pv WHERE pv.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM remises_en_vente rv WHERE rv.inventaire_id = n.id)
     OR EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(n.attributs) = 'object' THEN n.attributs ELSE '{}'::jsonb END) e
                 WHERE jsonb_typeof(e.value) = 'object' AND e.value ->> 'source' = 'manuel') THEN
    RETURN 'nouvelle_touchee';
  END IF;
  -- jamais deux annonces vivantes d'une même autre plateforme sur un article
  IF EXISTS (SELECT 1 FROM annonces_plateforme x JOIN annonces_plateforme y ON y.platform = x.platform
              WHERE x.inventaire_id = m.id AND y.inventaire_id = n.id AND x.disparu_le IS NULL AND y.disparu_le IS NULL)
     OR EXISTS (SELECT 1 FROM cross_post_jobs x JOIN cross_post_jobs y ON y.platform = x.platform
                 WHERE x.inventaire_id = m.id AND y.inventaire_id = n.id AND x.platform <> 'vinted'
                   AND x.status = 'published' AND y.status = 'published'
                   AND x.action IN ('publish', 'republish') AND y.action IN ('publish', 'republish')) THEN
    RETURN 'deux_exemplaires';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.rapprochement_v3_remise_possible(uuid, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprochement_v3_remise_possible(uuid, bigint, bigint) TO service_role;
COMMIT;
