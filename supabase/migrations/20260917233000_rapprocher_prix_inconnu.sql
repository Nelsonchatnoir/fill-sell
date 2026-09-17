-- ── Rattachement : un prix INCONNU n'est jamais une preuve (2026-09-17 soir) ──
-- Premier relevé réel (nicolas.svobodny) : le relevé eBay lisait un prix
-- faux sur 6 annonces sur 6 (identifiant collé au prix par textContent), ce qui
-- interdisait tout rattachement « certain ». Le lecteur est corrigé côté
-- extension (un prix illisible reste NULL, jamais un nombre au hasard). Côté
-- moteur, la bande « certain » exigeait « titre exact + prix égal » — mais un
-- prix NULL, d'un côté ou de l'autre, passait pour ÉGAL. Désormais :
--   · certain  = titre exact, un seul candidat, aucun homonyme, ET les DEUX
--                prix connus et égaux ;
--   · un prix manquant (relevé illisible, ou article sans prix de vente)
--                → 'propose', motif 'prix_inconnu', score 0.6 : le titre seul
--                est la bande incertaine, c'est l'utilisateur qui confirme.
-- Rien d'autre ne change (bandes job / propose / aucune, candidats, homonymes).
CREATE OR REPLACE FUNCTION public.rapprocher_classer(
  p_user uuid, p_platform text, p_listing_id text, p_url text, p_titre text, p_prix numeric, p_vus text[]
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t      text := titre_norm(p_titre);
  v_job    record;
  v_cands  jsonb := '[]'::jsonb;
  v_c      record;
  v_n      integer := 0;
  v_best   jsonb := NULL;
  v_prix_connu boolean;
  v_prix_ok boolean;
  v_homonymes integer;
  v_motif  text;
BEGIN
  -- A. L'identifiant est celui d'un dépôt FillSell : certain, sans question.
  SELECT j.id, j.inventaire_id INTO v_job FROM cross_post_jobs j
  WHERE j.user_id = p_user AND j.platform = p_platform
    AND j.action IN ('publish', 'republish') AND j.status = 'published'
    AND (j.platform_listing_id = p_listing_id
         OR (p_listing_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || p_listing_id || '([^0-9]|$)'))
         OR (p_listing_id !~ '^\d+$' AND position(p_listing_id in COALESCE(j.listing_url, '')) > 0))
  ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
  IF v_job.id IS NOT NULL THEN
    RETURN jsonb_build_object('bande', 'job', 'inventaire_id', v_job.inventaire_id, 'job_id', v_job.id, 'score', 1, 'motif', 'identifiant');
  END IF;
  IF v_t = '' THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'sans_titre'); END IF;

  -- B1. Dépôts FillSell au même titre dont l'annonce n'est PLUS dans le relevé
  --     (remplacée) — les plus probables d'abord : ceux que le veilleur a déjà
  --     marqués « plus en ligne ».
  FOR v_c IN
    SELECT j.id AS job_id, j.inventaire_id, j.price AS prix, j.title AS titre,
           (j.platform_fields ? 'unavailable_since') AS deja_disparu
    FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.platform = p_platform
      AND j.action IN ('publish', 'republish') AND j.status = 'published'
      AND titre_norm(j.title) = v_t
      AND NOT (COALESCE(j.platform_listing_id, '') = ANY (p_vus))
      AND NOT EXISTS (SELECT 1 FROM unnest(p_vus) v WHERE v <> '' AND (
            (v ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v || '([^0-9]|$)'))
            OR (v !~ '^\d+$' AND position(v in COALESCE(j.listing_url, '')) > 0)))
      AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.job_id = j.id AND ap.disparu_le IS NULL)
    ORDER BY (j.platform_fields ? 'unavailable_since') DESC, COALESCE(j.published_at, j.created_at) DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'job', 'job_id', v_c.job_id, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre, 'deja_disparu', v_c.deja_disparu);
  END LOOP;
  -- B2. Articles du stock au même titre, SANS dépôt sur cette plateforme
  --     (même article présent ailleurs, déposé à la main ici).
  FOR v_c IN
    SELECT i.id AS inventaire_id, i.prix_vente AS prix, i.titre
    FROM inventaire i
    WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL
      AND titre_norm(i.titre) = v_t
      AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = p_platform
                        AND j.action IN ('publish', 'republish') AND j.status = 'published')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cands) c WHERE (c ->> 'inventaire_id')::bigint = i.id)
    ORDER BY i.created_at DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'inventaire', 'job_id', NULL, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre);
  END LOOP;
  IF v_n = 0 THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat'); END IF;

  v_best := v_cands -> 0;
  -- Les DEUX prix connus, et égaux : c'est la seule égalité qui prouve.
  v_prix_connu := p_prix IS NOT NULL AND (v_best ->> 'prix') IS NOT NULL;
  v_prix_ok := v_prix_connu AND abs(p_prix - (v_best ->> 'prix')::numeric) < 0.01;
  SELECT count(*) INTO v_homonymes FROM inventaire i
  WHERE i.user_id = p_user AND i.statut = 'stock' AND titre_norm(i.titre) = v_t;
  v_motif := CASE
    WHEN v_n > 1 THEN 'plusieurs_candidats'
    WHEN v_homonymes > 1 THEN 'homonymes'
    WHEN NOT v_prix_connu THEN 'prix_inconnu'
    WHEN NOT v_prix_ok THEN 'prix_different'
    ELSE 'titre_exact' END;
  IF v_n = 1 AND v_prix_ok AND v_homonymes <= 1 THEN
    RETURN jsonb_build_object('bande', 'certain', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid, 'score', 0.95, 'motif', v_motif, 'candidats', v_cands);
  END IF;
  RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'score', CASE WHEN v_prix_ok THEN 0.7 WHEN NOT v_prix_connu THEN 0.6 ELSE 0.5 END,
                            'motif', v_motif, 'candidats', v_cands);
END;
$$;
REVOKE ALL ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_classer(uuid, text, text, text, text, numeric, text[]) TO service_role;
