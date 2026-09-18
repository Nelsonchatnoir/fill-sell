-- ═══════════════════════════════════════════════════════════════════════════
-- ALERTES VINTED « PLUS EN LIGNE » : LEVER CELLES QUI ONT ÉTÉ DÉMENTIES
-- (2026-09-18, point 3 — LIVRÉE FERMÉE, aucune passe de masse)
-- ═══════════════════════════════════════════════════════════════════════════
-- L'INFORMATION EXISTE DÉJÀ EN BASE, et voici où. La synchro du dressing
-- n'écrit `inventaire.last_synced_at` QUE pour les annonces qu'elle a
-- réellement vues (background.js : `patchLeger` et l'upsert plein, tous deux
-- par annonce observée), et elle remet `disparu_le = null` du même geste.
-- Donc « cette annonce a été revue EN LIGNE après l'alerte » se lit :
--     inventaire.last_synced_at > (platform_fields->>'unavailable_since')
-- et rien d'autre n'a besoin d'être relevé.
--
-- 🚨 MAIS CETTE SEULE CONDITION LÈVERAIT 184 VRAIES VENTES. Mesuré le 18/09 :
--    232 jobs portent `sale_signal = 'sold'` ET un article `vinted_status =
--    'sold'` ; 184 d'entre eux ont un `last_synced_at` POSTÉRIEUR à l'alerte —
--    la synchro les a bien revus, mais revus VENDUS. Lever là, c'est laisser
--    les copies en ligne sur les autres plateformes : la double vente exacte
--    qu'on veut éviter. D'où les quatre gardes ci-dessous, toutes obligatoires.
--
-- LES CINQ CONDITIONS, toutes exigées ensemble :
--   1. `sale_signal` est différent de 'sold' — aucun soupçon de vente ;
--   2. `inventaire.vinted_status = 'active'` — vu VIVANT, pas vendu, pas
--      réservé, pas masqué, pas fermé ;
--   3. `inventaire.disparu_le IS NULL` — la synchro ne le compte pas disparu ;
--   4. `last_synced_at > unavailable_since` — revu APRÈS l'alerte ;
--   5. `inventaire.vinted_item_id = job.platform_listing_id` — c'est LA MÊME
--      annonce, pas une republication qui aurait remplacé celle du job.
-- Une alerte seulement `unavailable_pending_since` (non confirmée) n'est pas
-- touchée : il n'y a pas encore d'alerte à lever.
--
-- LE PIRE SCÉNARIO ACCEPTABLE est une alerte qui reste affichée à tort ;
-- jamais une alerte levée à tort. Chaque garde va donc dans ce sens : au
-- moindre doute, on ne lève pas.
--
-- ⛔ LIVRÉE FERMÉE. `coin_config.alerte_vinted_revue_ouverte` = 0.
--    Interrupteur à 0 (ou absent, ou illisible) ⇒ la fonction tourne À BLANC :
--    elle COMPTE et rend le détail, elle n'écrit RIEN. C'est la forme la plus
--    utile : la même requête sert de mesure aujourd'hui et de geste le jour
--    où Nico tranche, sans redéploiement et sans code en double.
--    Pour agir : update coin_config set value = 1 where key = 'alerte_vinted_revue_ouverte';
--
-- ⛔ Le relevé multiplateforme et sa garde `v_pf NOT IN (...)` ne sont PAS
--    touchés : la voie 1 (faire écrire le dressing dans annonces_plateforme)
--    passe par l'extension, donc par un paquet, et la 0.6.43 est déjà en
--    attente. Cette fonction est purement serveur.
INSERT INTO coin_config (key, value) VALUES ('alerte_vinted_revue_ouverte', 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.alerte_vinted_lever_revues(
  p_user uuid DEFAULT NULL, p_limite integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ouvert boolean;
  v_ids uuid[];
  v_detail jsonb;
  n_levees integer := 0;
BEGIN
  v_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'alerte_vinted_revue_ouverte'), 0) = 1;

  -- Les jobs éligibles, selon les CINQ conditions. Une seule définition, lue
  -- deux fois (à blanc et en vrai) : elles ne peuvent pas diverger.
  SELECT COALESCE(array_agg(j.id), ARRAY[]::uuid[]),
         COALESCE(jsonb_agg(jsonb_build_object(
           'job_id', j.id, 'user_id', j.user_id, 'inventaire_id', i.id,
           'listing_id', j.platform_listing_id, 'titre', j.title,
           'alerte_depuis', j.platform_fields ->> 'unavailable_since',
           'revu_le', i.last_synced_at)), '[]'::jsonb)
    INTO v_ids, v_detail
  FROM cross_post_jobs j
  JOIN inventaire i ON i.id = j.inventaire_id
  WHERE j.platform = 'vinted' AND j.status = 'published'
    AND (p_user IS NULL OR j.user_id = p_user)
    AND j.platform_fields ? 'unavailable_since'
    AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'   -- 1
    AND i.vinted_status = 'active'                                    -- 2
    AND i.disparu_le IS NULL                                          -- 3
    AND i.last_synced_at > (j.platform_fields ->> 'unavailable_since')::timestamptz  -- 4
    AND i.vinted_item_id::text = j.platform_listing_id                -- 5
    -- ⚠️ p_limite est un PLAFOND D'ÉCRITURE, pas un filtre de mesure : laissé
    --    à NULL (le défaut), le compte à blanc rend le TOTAL réel. Un plafond
    --    qui s'appliquerait aussi à la mesure ferait croire qu'il y a moins
    --    d'éligibles qu'en vrai — exactement le genre de chiffre sur lequel
    --    on tranche de travers.
    AND (p_limite IS NULL OR j.id = ANY (
      SELECT j2.id FROM cross_post_jobs j2
      WHERE j2.platform = 'vinted' AND j2.status = 'published'
        AND (p_user IS NULL OR j2.user_id = p_user)
        AND j2.platform_fields ? 'unavailable_since'
      ORDER BY j2.created_at LIMIT p_limite));

  IF NOT v_ouvert THEN
    RETURN jsonb_build_object('ok', true, 'mode', 'a_blanc', 'ouvert', false,
                              'eligibles', COALESCE(array_length(v_ids, 1), 0),
                              'detail', v_detail,
                              'note', 'Interrupteur alerte_vinted_revue_ouverte a 0 : rien n a ete ecrit.');
  END IF;

  UPDATE cross_post_jobs
     SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since',
                                                    'sale_signal', 'detected_price',
                                                    'alerte_masquee_pour', 'alerte_masquee_le'])
                           || jsonb_build_object('revue_en_ligne_par_dressing',
                                jsonb_build_object('at', now(), 'par', 'alerte_vinted_lever_revues'))
   WHERE id = ANY (v_ids);
  GET DIAGNOSTICS n_levees = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'mode', 'applique', 'ouvert', true,
                            'levees', n_levees, 'detail', v_detail);
END;
$$;
REVOKE ALL ON FUNCTION public.alerte_vinted_lever_revues(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.alerte_vinted_lever_revues(uuid, integer) TO service_role;
