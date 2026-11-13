-- Définition de PROD relue le 13/11/2026 (pg_get_functiondef, lecture seule) — décor du banc 20261113180000, jamais appliquée.
CREATE OR REPLACE FUNCTION public.releve_poser_question(p_user uuid, p_existante bigint, p_nouvelle bigint, p_motif text, p_preuves jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- (2026-09-27, audit synchro) La question « Est-ce le même article ? » entre
-- une fiche existante (gardée si « oui ») et la fiche que le relevé vient de
-- créer. Jamais un rattachement : l'écran Doublons la pose, la personne
-- tranche (inventaire_doublon_decider). Une paire déjà tranchée (refusée,
-- défaite, fusionnée) n'est jamais reposée : l'index unique de la paire le
-- garantit (ON CONFLICT DO NOTHING).
DECLARE
  v_t1 text; v_t2 text;
BEGIN
  IF p_user IS NULL OR p_existante IS NULL OR p_nouvelle IS NULL OR p_existante = p_nouvelle THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_existante AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM inventaire WHERE id = p_nouvelle AND user_id = p_user AND fusionne_dans IS NULL) THEN RETURN false; END IF;
  -- ⛔ (05/11, Nico — assopmfrance, écussons ronds sur fond blanc : Albator ≠ UJ2 à 9, un écusson sans rapport à 8)
  -- « Même article ? » n'est JAMAIS posée sur une photo seulement PROCHE quand un des deux titres est en série chez le
  -- compte (titre_en_serie : ≥ 3 annonces d'une plateforme, ou 3 fiches Vinted, au même titre normalisé) : la photo
  -- proche n'en départage pas les pièces, le titre non plus — aucune autre preuve. L'article reste un article à part
  -- (deux exemplaires). Les photos quasi identiques, multiples, identiques : inchangées. Trace : usage_logs (1 par paire et par jour).
  IF p_motif = 'photo_proche' THEN
    SELECT titre INTO v_t1 FROM inventaire WHERE id = p_existante;
    SELECT titre INTO v_t2 FROM inventaire WHERE id = p_nouvelle;
    IF titre_en_serie(p_user, v_t1) OR titre_en_serie(p_user, v_t2) THEN
      IF NOT EXISTS (SELECT 1 FROM usage_logs l WHERE l.user_id = p_user AND l.feature = 'question_photo_proche_ecartee'
                        AND l.created_at > now() - interval '1 day'
                        AND l.metadata ->> 'paire' = least(p_existante, p_nouvelle)::text || '-' || greatest(p_existante, p_nouvelle)::text) THEN
        INSERT INTO usage_logs (user_id, feature, metadata)
        VALUES (p_user, 'question_photo_proche_ecartee', jsonb_build_object(
          'paire', least(p_existante, p_nouvelle)::text || '-' || greatest(p_existante, p_nouvelle)::text,
          'existante', p_existante::text, 'nouvelle', p_nouvelle::text, 'motif', p_motif, 'raison', 'titre_en_serie',
          'photo', p_preuves -> 'photo', 'titres', jsonb_build_array(v_t1, v_t2)));
      END IF;
      RETURN false;
    END IF;
  END IF;
  INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
  VALUES (p_user, p_existante, p_nouvelle, 'probable', 'proposee', COALESCE(p_motif, 'releve'), COALESCE(p_preuves, '{}'::jsonb), 'releve')
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$function$
;
