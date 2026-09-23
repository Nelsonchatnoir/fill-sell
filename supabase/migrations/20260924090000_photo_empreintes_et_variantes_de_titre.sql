-- ═══════════════════════════════════════════════════════════════════════════
-- EMPREINTES DE PHOTOS + LA COULEUR ET LE NOMBRE EXCLUENT (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════════════
-- Chantier « comparer les photos pour rapprocher avec certitude » (Louis,
-- 23/09). Deux constats mesurés :
--   · les photos ne sont pas partagées entre plateformes (Beebs = cdn.beebs.app,
--     Vinted = images1.vinted.net) : comparer des URL ne dit rien ;
--   · les titres collent sur la couleur (« Rangement Blanc… » ↔ « … Bleu… » =
--     0,89 de recouvrement au faisceau) : faux jumeau, et l'import a proposé
--     comme « jumeau probable » un kit d'une autre couleur (titre_inclus).
--
-- CE QUE POSE CETTE MIGRATION :
--   1. la table `photo_empreintes` — le cache des empreintes d'images
--      calculées par la fonction edge `photo-empreinte` (dHash, pHash,
--      signature couleur ; _shared/empreinte-image.ts). Clé = l'URL. Rien de
--      personnel : une URL publique et trois chaînes de bits ;
--   2. `titre_couleurs`, `titre_nombres`, `titres_variantes_incompatibles` —
--      la règle « deux titres qui portent des couleurs (ou des nombres)
--      différentes désignent deux objets ». MIROIR EXACT de
--      src/utils/variantesTitre.js (mêmes listes, vérifiées à l'octet par
--      scripts/variantes-titre-selftest.mjs) ;
--   3. `rapprocher_classer` : le second tour (faisceau) ÉCARTE les candidats
--      incompatibles — UNE condition ajoutée, le reste copié de
--      pg_get_functiondef (md5 avant eb881db9419359de3a40d52dee070c1f) ;
--   4. `rapprocher_importer` : la garde du jumeau (titre_inclus) n'oppose plus
--      un kit d'une autre couleur — UNE condition ajoutée, le reste copié de
--      pg_get_functiondef (md5 avant 66ad9e3152e1a02ad5d239f44919f6d9).
-- Les lignes ajoutées portent le marqueur « -- AJOUT 2026-09-24 » :
-- scripts/migration-fidelite.mjs les retire et vérifie que le reste est
-- identique, à l'octet, au corps qui tourne en prod.
--
-- ⛔ NE S'APPLIQUE PAS PAR `db push` (CLAUDE.md). Une par une, après lecture
--    de pg_get_functiondef en prod, et relecture après.

-- ── 1. LE CACHE DES EMPREINTES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.photo_empreintes (
  url          text PRIMARY KEY,
  dhash        text NOT NULL,
  phash        text NOT NULL,
  couleur      text,
  largeur      integer,
  hauteur      integer,
  source       text,
  calculee_le  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.photo_empreintes IS
  'Empreintes perceptuelles d''images (dHash/pHash 64 bits, signature couleur 4×4) — calculées à la demande par la fonction edge photo-empreinte, clé = URL publique. Seuils : identique ≤ 5/8, proche ≤ 10 (mesure du 23/09).';
ALTER TABLE public.photo_empreintes ENABLE ROW LEVEL SECURITY;
-- Lecture par toute personne connectée (une URL publique et des bits, rien de
-- personnel) ; écriture par le service seulement (la fonction edge).
DROP POLICY IF EXISTS photo_empreintes_lecture ON public.photo_empreintes;
CREATE POLICY photo_empreintes_lecture ON public.photo_empreintes FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.photo_empreintes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_empreintes TO service_role;

-- ── 2. LA COULEUR ET LE NOMBRE ────────────────────────────────────────────
-- Les phrases de couleur d'un titre (« bleu », « vert pomme », « gris
-- anthracite »), dédoublonnées, triées. Une nuance qui suit une couleur est
-- absorbée dans la phrase (« vert pomme » ≠ « vert »).
CREATE OR REPLACE FUNCTION public.titre_couleurs(t text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  -- ⟦couleurs:début⟧
  v_couleurs text[] := ARRAY['blanc', 'noir', 'gris', 'bleu', 'vert', 'rouge', 'rose', 'jaune', 'orange', 'violet', 'marron', 'beige', 'turquoise', 'dore', 'argente', 'bordeaux', 'kaki', 'camel', 'creme', 'ecru', 'fuchsia', 'lilas', 'mauve', 'marine', 'anthracite', 'taupe', 'corail', 'ivoire', 'multicolore', 'transparent', 'chocolat', 'moutarde', 'saumon', 'prune', 'aubergine', 'menthe', 'olive', 'cuivre', 'bronze', 'lavande', 'peche', 'framboise', 'cerise', 'emeraude', 'sable', 'indigo', 'or'];
  -- ⟦couleurs:fin⟧
  -- ⟦nuances:début⟧
  v_nuances text[] := ARRAY['pomme', 'ciel', 'clair', 'claire', 'fonce', 'foncee', 'marine', 'roi', 'pale', 'anthracite', 'perle', 'nuit', 'canard', 'pastel', 'vif', 'vive', 'fluo', 'menthe', 'olive', 'sapin', 'kaki', 'bordeaux', 'corail', 'saumon', 'poudre', 'lavande', 'lilas', 'prune', 'cerise', 'brique', 'rouille', 'terracotta', 'moutarde', 'citron', 'dore', 'cuivre', 'chocolat', 'taupe', 'sable', 'beige', 'creme', 'ecru', 'ivoire', 'casse', 'nacre', 'turquoise', 'petrole', 'emeraude', 'or', 'argent', 'argente', 'framboise', 'peche', 'indigo', 'electrique', 'glacier', 'gris', 'bleu', 'vert', 'rose', 'rouge', 'jaune', 'orange', 'violet', 'noir', 'blanc'];
  -- ⟦nuances:fin⟧
  v_mots text[];
  v_out text[] := '{}';
  v_m text; v_s text;
  i integer;
BEGIN
  v_mots := string_to_array(titre_norm(t), ' ');
  IF v_mots IS NULL THEN RETURN '{}'::text[]; END IF;
  i := 1;
  WHILE i <= array_length(v_mots, 1) LOOP
    v_m := titre_couleur_forme(v_mots[i]);
    IF v_m = ANY (v_couleurs) THEN
      v_s := CASE WHEN i < array_length(v_mots, 1) THEN titre_couleur_forme(v_mots[i + 1]) ELSE NULL END;
      IF v_s IS NOT NULL AND v_s = ANY (v_nuances) AND v_s <> v_m AND v_s <> 'et' THEN
        v_out := array_append(v_out, v_m || ' ' || v_s);
        i := i + 1;
      ELSE
        v_out := array_append(v_out, v_m);
      END IF;
    END IF;
    i := i + 1;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT x FROM unnest(v_out) x ORDER BY x);
END;
$function$;

-- Féminins et pluriels → la forme de base (« blanche » → « blanc »).
CREATE OR REPLACE FUNCTION public.titre_couleur_forme(m text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- ⟦couleurs-formes:début⟧
  SELECT COALESCE((SELECT base FROM (VALUES
    ('blanche', 'blanc'), ('blanches', 'blanc'), ('blancs', 'blanc'), ('noire', 'noir'), ('noires', 'noir'), ('noirs', 'noir'),
    ('grise', 'gris'), ('grises', 'gris'), ('bleue', 'bleu'), ('bleues', 'bleu'), ('bleus', 'bleu'), ('verte', 'vert'), ('vertes', 'vert'), ('verts', 'vert'),
    ('rouges', 'rouge'), ('roses', 'rose'), ('jaunes', 'jaune'), ('violette', 'violet'), ('violettes', 'violet'), ('violets', 'violet'),
    ('marrons', 'marron'), ('beiges', 'beige'), ('doree', 'dore'), ('dorees', 'dore'), ('dores', 'dore'),
    ('argentee', 'argente'), ('argentees', 'argente'), ('argentes', 'argente'), ('argent', 'argente'), ('turquoises', 'turquoise')
  ) AS f(forme, base) WHERE f.forme = m), m);
  -- ⟦couleurs-formes:fin⟧
$function$;

-- Les nombres nus d'un titre (« 12 », « 1000 »), dédoublonnés, triés.
CREATE OR REPLACE FUNCTION public.titre_nombres(t text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(ARRAY(SELECT DISTINCT x FROM unnest(string_to_array(titre_norm(t), ' ')) x WHERE x ~ '^[0-9]+$' ORDER BY x), '{}'::text[]);
$function$;

-- Deux titres qui portent tous deux des couleurs, ou tous deux des nombres,
-- et pas les mêmes : deux objets. Un seul côté renseigné n'exclut rien.
CREATE OR REPLACE FUNCTION public.titres_variantes_incompatibles(a text, b text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  ca text[] := titre_couleurs(a); cb text[] := titre_couleurs(b);
  na text[]; nb text[];
BEGIN
  IF COALESCE(array_length(ca, 1), 0) > 0 AND COALESCE(array_length(cb, 1), 0) > 0 AND ca <> cb THEN RETURN true; END IF;
  na := titre_nombres(a); nb := titre_nombres(b);
  IF COALESCE(array_length(na, 1), 0) > 0 AND COALESCE(array_length(nb, 1), 0) > 0 AND na <> nb THEN RETURN true; END IF;
  RETURN false;
END;
$function$;

-- ── 3. rapprocher_classer : le faisceau écarte les variantes ──────────────
-- Copié de pg_get_functiondef (prod, 23/09, md5 eb881db9419359de3a40d52dee070c1f).
-- UNE ligne ajoutée (marqueur AJOUT 2026-09-24), rien d'autre.
CREATE OR REPLACE FUNCTION public.rapprocher_classer(p_user uuid, p_platform text, p_listing_id text, p_url text, p_titre text, p_prix numeric, p_vus text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t      text := titre_norm(p_titre);
  v_id     text := nullif(btrim(coalesce(p_listing_id, '')), '');
  v_job    record;
  v_cands  jsonb := '[]'::jsonb;
  v_c      record;
  v_n      integer := 0;
  v_best   jsonb := NULL;
  v_prix_connu boolean;
  v_prix_ok boolean;
  v_homonymes integer;
  v_motif  text;
  v_ja     text[];
  v_cf     jsonb := '[]'::jsonb;
  v_nf     integer := 0;
  v_identiques boolean := false;
  v_sortie jsonb;
BEGIN
  -- ⛔ UN IDENTIFIANT VIDE N'IDENTIFIE RIEN. Sans cette garde,
  --    `position('' in <url>) > 0` est vrai pour tous les jobs et la fonction
  --    rend « identifiant » sur le dernier job publié du compte (cf. en-tête).
  IF v_id IS NOT NULL THEN
    SELECT j.id, j.inventaire_id INTO v_job FROM cross_post_jobs j
    WHERE j.user_id = p_user AND j.platform = p_platform
      AND j.action IN ('publish', 'republish') AND j.status = 'published'
      AND (j.platform_listing_id = v_id
           OR (v_id ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v_id || '([^0-9]|$)'))
           OR (v_id !~ '^\d+$' AND position(v_id in COALESCE(j.listing_url, '')) > 0))
    ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1;
    IF v_job.id IS NOT NULL THEN
      RETURN jsonb_build_object('bande', 'job', 'inventaire_id', v_job.inventaire_id, 'job_id', v_job.id, 'score', 1, 'motif', 'identifiant');
    END IF;
  END IF;
  IF v_t = '' THEN RETURN jsonb_build_object('bande', 'aucune', 'motif', 'sans_titre'); END IF;

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
  FOR v_c IN
    SELECT i.id AS inventaire_id, i.prix_vente AS prix, i.titre, i.created_at
    FROM inventaire i
    WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL
      AND titre_norm(i.titre) = v_t
      AND NOT EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.inventaire_id = i.id AND j.platform = p_platform
                        AND j.action IN ('publish', 'republish') AND j.status = 'published')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_cands) c WHERE (c ->> 'inventaire_id')::bigint = i.id)
    ORDER BY i.created_at DESC
  LOOP
    v_n := v_n + 1;
    v_cands := v_cands || jsonb_build_object('type', 'inventaire', 'job_id', NULL, 'inventaire_id', v_c.inventaire_id,
                                             'prix', v_c.prix, 'titre', v_c.titre, 'created_at', v_c.created_at);
  END LOOP;

  IF v_n = 0 THEN
    v_ja := ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(v_t, ' ')) t WHERE length(t) >= 3);
    IF COALESCE(array_length(v_ja, 1), 0) = 0 THEN
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    FOR v_c IN
      SELECT q.* FROM (
        SELECT i.id AS inventaire_id, i.titre, i.prix_vente AS prix, jr.id AS job_remplace,
               (k.communs / NULLIF(k.largeur, 0)) AS recouvrement,
               (s.m <> '' AND position(s.m in v_t) > 0) AS marque_ok,
               (s.ta <> '' AND (' ' || v_t || ' ') LIKE ('% ' || s.ta || ' %')) AS taille_ok,
               (p_prix IS NOT NULL AND i.prix_vente IS NOT NULL
                  AND abs(p_prix - i.prix_vente) < 0.01) AS prix_exact,
               (p_prix IS NOT NULL AND i.prix_vente IS NOT NULL AND i.prix_vente > 0
                  AND abs(p_prix - i.prix_vente) / i.prix_vente <= 0.15) AS prix_proche
        FROM inventaire i
        CROSS JOIN LATERAL (
          SELECT
            ARRAY(SELECT DISTINCT t FROM unnest(string_to_array(titre_norm(i.titre), ' ')) t WHERE length(t) >= 3) AS jt,
            titre_norm(COALESCE(NULLIF(trim(i.marque), ''),
                                CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object'
                                     THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END)) AS m,
            titre_norm(CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object'
                            THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END) AS ta
        ) s
        CROSS JOIN LATERAL (
          SELECT (SELECT count(*) FROM unnest(s.jt) x WHERE x = ANY (v_ja))::numeric AS communs,
                 greatest(COALESCE(array_length(s.jt, 1), 0), COALESCE(array_length(v_ja, 1), 0))::numeric AS largeur
        ) k
        LEFT JOIN LATERAL (
          SELECT j.id FROM cross_post_jobs j
          WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = p_platform
            AND j.action IN ('publish', 'republish') AND j.status = 'published'
          ORDER BY COALESCE(j.published_at, j.created_at) DESC LIMIT 1
        ) jr ON true
        WHERE i.user_id = p_user AND i.statut = 'stock' AND i.disparu_le IS NULL AND i.fusionne_dans IS NULL
          AND NOT titres_variantes_incompatibles(p_titre, i.titre) -- AJOUT 2026-09-24 : la couleur et le nombre excluent
          AND NOT EXISTS (
            SELECT 1 FROM cross_post_jobs j
            WHERE j.user_id = p_user AND j.inventaire_id = i.id AND j.platform = p_platform
              AND j.action IN ('publish', 'republish') AND j.status = 'published'
              AND (COALESCE(j.platform_listing_id, '') = ANY (p_vus)
                   OR EXISTS (SELECT 1 FROM unnest(p_vus) v WHERE v <> '' AND (
                        (v ~ '^\d+$' AND COALESCE(j.listing_url, '') ~ ('(^|[^0-9])' || v || '([^0-9]|$)'))
                        OR (v !~ '^\d+$' AND position(v in COALESCE(j.listing_url, '')) > 0)))
                   OR EXISTS (SELECT 1 FROM annonces_plateforme ap2 WHERE ap2.job_id = j.id AND ap2.disparu_le IS NULL)))
          AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.inventaire_id = i.id AND ap.disparu_le IS NULL)
      ) q
      WHERE q.recouvrement >= 0.34
        AND (0.50 * q.recouvrement
             + CASE WHEN q.prix_exact THEN 0.20 WHEN q.prix_proche THEN 0.08 ELSE 0 END
             + CASE WHEN q.marque_ok THEN 0.15 ELSE 0 END
             + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) >= 0.45
      ORDER BY (0.50 * q.recouvrement
                + CASE WHEN q.prix_exact THEN 0.20 WHEN q.prix_proche THEN 0.08 ELSE 0 END
                + CASE WHEN q.marque_ok THEN 0.15 ELSE 0 END
                + CASE WHEN q.taille_ok THEN 0.07 ELSE 0 END) DESC,
               q.recouvrement DESC, q.inventaire_id DESC
      LIMIT 5
    LOOP
      v_nf := v_nf + 1;
      v_cf := v_cf || jsonb_build_object(
        'type', 'inventaire', 'job_id', v_c.job_remplace, 'inventaire_id', v_c.inventaire_id,
        'prix', v_c.prix, 'titre', v_c.titre,
        'score', round(least(0.85,
            0.50 * v_c.recouvrement
          + CASE WHEN v_c.prix_exact THEN 0.20 WHEN v_c.prix_proche THEN 0.08 ELSE 0 END
          + CASE WHEN v_c.marque_ok THEN 0.15 ELSE 0 END
          + CASE WHEN v_c.taille_ok THEN 0.07 ELSE 0 END), 2),
        'signaux', jsonb_build_object('recouvrement', round(v_c.recouvrement, 2),
                                      'prix', CASE WHEN v_c.prix_exact THEN 'exact' WHEN v_c.prix_proche THEN 'proche' ELSE 'non' END,
                                      'marque', v_c.marque_ok, 'taille', v_c.taille_ok,
                                      'remplace_annonce', v_c.job_remplace IS NOT NULL));
    END LOOP;
    IF v_nf = 0 THEN
      RETURN jsonb_build_object('bande', 'aucune', 'motif', 'aucun_candidat');
    END IF;
    v_best := v_cf -> 0;
    RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                              'score', (v_best ->> 'score')::numeric,
                              'motif', 'faisceau', 'candidats', v_cf,
                              'signaux', v_best -> 'signaux');
  END IF;

  IF v_n > 1 THEN
    SELECT count(*) = 0 INTO v_identiques
      FROM jsonb_array_elements(v_cands) c
     WHERE c ->> 'type' <> 'inventaire'
        OR (c ->> 'prix') IS DISTINCT FROM (v_cands -> 0 ->> 'prix');
    IF v_identiques THEN
      SELECT jsonb_agg(c ORDER BY (c ->> 'created_at')) INTO v_cands
        FROM jsonb_array_elements(v_cands) c;
    END IF;
  END IF;

  v_best := v_cands -> 0;
  v_prix_connu := p_prix IS NOT NULL AND (v_best ->> 'prix') IS NOT NULL;
  v_prix_ok := v_prix_connu AND abs(p_prix - (v_best ->> 'prix')::numeric) < 0.01;
  SELECT count(*) INTO v_homonymes FROM inventaire i
  WHERE i.user_id = p_user AND i.statut = 'stock' AND titre_norm(i.titre) = v_t;
  v_motif := CASE
    WHEN v_identiques THEN 'homonymes_tranches'
    WHEN v_n > 1 THEN 'plusieurs_candidats'
    WHEN v_homonymes > 1 THEN 'homonymes'
    WHEN NOT v_prix_connu THEN 'prix_inconnu'
    WHEN NOT v_prix_ok THEN 'prix_different'
    ELSE 'titre_exact' END;
  IF v_n = 1 AND v_prix_ok AND v_homonymes <= 1 THEN
    RETURN jsonb_build_object('bande', 'certain', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                              'job_id', NULLIF(v_best ->> 'job_id', '')::uuid, 'score', 0.95, 'motif', v_motif, 'candidats', v_cands);
  END IF;
  SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) INTO v_sortie
    FROM (SELECT c FROM jsonb_array_elements(v_cands) c LIMIT 8) s;
  RETURN jsonb_build_object('bande', 'propose', 'inventaire_id', (v_best ->> 'inventaire_id')::bigint,
                            'job_id', NULLIF(v_best ->> 'job_id', '')::uuid,
                            'score', CASE WHEN v_prix_ok THEN 0.7 WHEN NOT v_prix_connu THEN 0.6 ELSE 0.5 END,
                            'motif', v_motif, 'candidats', v_sortie, 'candidats_total', v_n,
                            'choix_arbitraire', CASE WHEN v_identiques THEN
                              jsonb_build_object('regle', 'la plus ancienne', 'total', v_n) ELSE NULL END);
END;
$function$;

-- ── 4. rapprocher_importer : la garde du jumeau n'oppose plus une variante ──
-- Copié de pg_get_functiondef (prod, 23/09, md5 66ad9e3152e1a02ad5d239f44919f6d9).
-- UNE ligne ajoutée (marqueur AJOUT 2026-09-24), rien d'autre.
CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;

  -- ── LA GARDE DU JUMEAU (2026-09-20) ──────────────────────────────────────
  -- Le relevé du 19/09 a créé trois lignes d'inventaire neuves pour trois
  -- articles déjà présents : le faisceau compare les titres MOT À MOT, et un
  -- préfixe de référence (« FIG001 - Jeux/Jouets - ») fait tomber le
  -- recouvrement sous la barre. L'annonce finit dans la bande « aucune »,
  -- seule bande où l'import automatique crée sans demander.
  -- On ajoute l'inclusion d'un titre dans l'autre, aux frontières de mots,
  -- les deux normalisés à plus de 12 caractères. Mesuré sur 200 annonces non
  -- rattachées tirées au hasard : 3 gagnent un candidat, et les trois sont
  -- justes ; 108 avaient déjà un titre exact (inchangées) ; 89 ne bougent pas.
  -- ⛔ ON PRÉVIENT, ON N'INTERDIT PAS : au lieu de créer, on POSE la
  --    proposition sur l'annonce (motif `titre_inclus`) — l'écran de
  --    rattachement affiche « C'est peut-être… » avec son bouton.
  -- ⛔ Le geste MANUEL n'est pas touché ici (p_par = 'utilisateur').
  -- ⛔ Le refus est tracé UNE FOIS (decision 'refus_jumeau') : sans trace,
  --    « pourquoi celle-ci n'est pas entrée ? » redevient une reconstitution.
  -- ⛔ Le titre de SECOURS (« Annonce vinted ») ne reconnaît rien : on part du
  --    titre RÉEL, ou on ne cherche pas.
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));
  IF p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre) -- AJOUT 2026-09-24 : une autre couleur n'est pas un jumeau
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    IF v_jumeau IS NOT NULL THEN
      UPDATE annonces_plateforme
         SET proposition = jsonb_build_object('inventaire_id', v_jumeau, 'job_id', NULL,
                                              'motif', 'titre_inclus', 'score', 0.5,
                                              'candidats', '[]'::jsonb, 'candidats_total', 1,
                                              'at', now()),
             updated_at = now()
       WHERE id = a.id;
      IF NOT EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'refus_jumeau') THEN
        INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
        VALUES (p_user, a.id, v_jumeau, 'refus_jumeau', p_par, 1,
                jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre));
      END IF;
      RETURN jsonb_build_object('ok', false, 'reason', 'jumeau_probable',
                                'inventaire_id', v_jumeau, 'titre_article', v_jumeau_titre);
    END IF;
  END IF;

  -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
  v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
  v_cap := a.capture;
  v_photos := CASE
    WHEN jsonb_typeof(v_cap -> 'photos') = 'array' AND jsonb_array_length(v_cap -> 'photos') > 0 THEN v_cap -> 'photos'
    WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url)
    ELSE NULL END;
  v_attr := '{}'::jsonb;
  FOR v_cle IN SELECT unnest(ARRAY['taille', 'etat', 'couleur', 'matiere', 'marque']) LOOP
    IF NULLIF(trim(v_cap ->> v_cle), '') IS NOT NULL THEN
      v_attr := v_attr || jsonb_build_object(v_cle, jsonb_build_object('v', trim(v_cap ->> v_cle), 'source', 'releve_' || a.platform, 'at', now()));
    END IF;
  END LOOP;
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          -- La fiche entre dans la file dès qu'elle a une photo, quelle qu'en
          -- soit l'adresse : c'est handler-watch qui sait ce qui est à nous.
          v_photos IS NOT NULL);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, updated_at = now()
   WHERE id = a.id;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', p_par, 1, jsonb_build_object('job_id', v_job));
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job);
END;
$function$;

-- Les droits d'origine (migration 20260920160000) : le front passe par
-- rapprochement_decider, jamais par rapprocher_importer directement.
REVOKE ALL ON FUNCTION public.rapprocher_importer(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rapprocher_importer(uuid, uuid, text) TO service_role;
