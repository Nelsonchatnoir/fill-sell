-- ═══════════════════════════════════════════════════════════════════════════
-- SUPPRIMER LA FICHE, LAISSER LES ANNONCES EN LIGNE (2026-09-18, point C)
-- ═══════════════════════════════════════════════════════════════════════════
-- Demande de Nico. Le défaut NE CHANGE PAS : supprimer un article retire ses
-- annonces partout. Ceci est un SECOND choix, explicite, jamais présélectionné.
--
-- 🚨 LE DANGER, ET COMMENT IL EST FERMÉ.
-- Ce geste crée volontairement des annonces en ligne sans article dans le
-- stock — exactement l'état des 50 annonces orphelines du 16/09, celles qui
-- produisent des doubles ventes. La différence tient en une phrase :
--   LÀ, L'ANNONCE ÉTAIT UN JOB ORPHELIN (inventaire_id passé à NULL par la FK
--   ON DELETE SET NULL) QUE PLUS AUCUN ÉCRAN NE MONTRAIT.
--   ICI, ELLE DEVIENT UNE LIGNE `annonces_plateforme` SANS inventaire_id —
--   c'est-à-dire précisément ce que l'écran « Annonces à rattacher » affiche.
-- On ne compte donc PAS sur le prochain relevé pour la faire réapparaître :
-- la ligne est écrite AU MOMENT de la suppression, et l'annonce est visible
-- dans la seconde qui suit, avec ses trois gestes (Choisir l'article,
-- Importer comme nouvel article, Ignorer).
-- Le relevé suivant la retrouvera par son listing_id (clé unique
-- user_id + platform + listing_id) et la rafraîchira au lieu d'en créer une
-- deuxième.
--
-- CE QU'ON FAIT DES JOBS. Les dépôts publiés passent en 'cancelled' avec un
-- motif explicite. Ce n'est pas une perte : le job ne représentait plus rien
-- (son article n'existe plus), et tout ce qui compte — plateforme, URL,
-- identifiant, titre, prix — est recopié sur la ligne annonces_plateforme,
-- qui est la seule représentation restante et la seule qui soit VISIBLE.
-- Laisser des jobs 'published' sans inventaire_id, c'est le bug du 16/09 :
-- le retrait eBay par API meurt, et le veilleur croit surveiller un article.
--
-- ⛔ AUCUN JOB DE RETRAIT N'EST ARMÉ. C'est tout l'objet du geste.
CREATE OR REPLACE FUNCTION public.inventaire_supprimer_sans_retrait(p_inventaire bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  i inventaire%ROWTYPE;
  j record;
  v_lid text;
  n_annonces integer := 0;
  n_jobs integer := 0;
  v_pf jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO i FROM inventaire WHERE id = p_inventaire AND user_id = v_user FOR UPDATE;
  IF i.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'article_introuvable'); END IF;

  -- 1. CHAQUE ANNONCE EN LIGNE DEVIENT UNE LIGNE VISIBLE, AVANT toute
  --    suppression. Si l'upsert échouait, on veut que ce soit ICI — l'article
  --    est encore là, rien n'est perdu.
  FOR j IN
    SELECT platform, listing_url, platform_listing_id, title, price
    FROM cross_post_jobs
    WHERE user_id = v_user AND inventaire_id = p_inventaire
      AND action IN ('publish', 'republish') AND status = 'published'
      AND (NULLIF(trim(COALESCE(platform_listing_id, '')), '') IS NOT NULL
           OR NULLIF(trim(COALESCE(listing_url, '')), '') IS NOT NULL)
    ORDER BY COALESCE(published_at, created_at) DESC
  LOOP
    -- `listing_id` est NOT NULL et porte la clé d'unicité. L'identifiant de
    -- plateforme quand on l'a ; sinon l'URL, qui est unique elle aussi. ⚠️ Dans
    -- ce second cas le relevé suivant, qui lira le vrai identifiant, créera une
    -- ligne de plus : un doublon dans l'écran de rattachement, jamais une
    -- annonce perdue — et c'est bien l'ordre de préférence qu'on s'est donné.
    v_lid := COALESCE(NULLIF(trim(COALESCE(j.platform_listing_id, '')), ''), trim(j.listing_url));
    INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, prix,
                                     photo_url, statut_plateforme, inventaire_id, job_id,
                                     source_rapprochement, vu_le, updated_at)
    VALUES (v_user, j.platform, v_lid, NULLIF(trim(COALESCE(j.listing_url, '')), ''),
            COALESCE(NULLIF(trim(COALESCE(j.title, '')), ''), i.titre), COALESCE(j.price, i.prix_vente),
            CASE WHEN jsonb_typeof(i.photos) = 'array' AND jsonb_array_length(i.photos) > 0
                 THEN i.photos ->> 0 ELSE NULL END,
            'en_ligne', NULL, NULL, NULL, now(), now())
    ON CONFLICT (user_id, platform, listing_id) DO UPDATE
      SET inventaire_id = NULL, job_id = NULL, source_rapprochement = NULL,
          proposition = NULL, disparu_le = NULL, ignoree_le = NULL,
          statut_plateforme = 'en_ligne', updated_at = now();
    n_annonces := n_annonces + 1;
  END LOOP;

  -- 2. Les jobs de dépôt sont clos, avec leur motif. Un job 'published' sans
  --    article, c'est le bug du 16/09 — on ne le refabrique pas.
  FOR j IN
    SELECT id, platform_fields FROM cross_post_jobs
    WHERE user_id = v_user AND inventaire_id = p_inventaire
      AND status IN ('published', 'pending', 'processing', 'needs_user', 'failed')
  LOOP
    v_pf := COALESCE(j.platform_fields, '{}'::jsonb)
            || jsonb_build_object('fiche_supprimee_le', now(), 'annonces_laissees_en_ligne', true);
    UPDATE cross_post_jobs
       SET status = 'cancelled', platform_fields = v_pf,
           error = 'Fiche supprimée du stock, annonce laissée en ligne — aucun retrait demandé'
     WHERE id = j.id;
    n_jobs := n_jobs + 1;
  END LOOP;

  -- 3. Les ventes gardent tous leurs montants, elles perdent seulement le lien
  --    (la FK ventes_inventaire_id_fkey est en NO ACTION : sans ça, le DELETE
  --    ci-dessous serait refusé et l'article « supprimé » reviendrait).
  UPDATE ventes SET inventaire_id = NULL WHERE inventaire_id = p_inventaire AND user_id = v_user;

  DELETE FROM inventaire WHERE id = p_inventaire AND user_id = v_user;
  RETURN jsonb_build_object('ok', true, 'annonces_laissees', n_annonces, 'jobs_clos', n_jobs);
END;
$$;
REVOKE ALL ON FUNCTION public.inventaire_supprimer_sans_retrait(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventaire_supprimer_sans_retrait(bigint) TO authenticated, service_role;
