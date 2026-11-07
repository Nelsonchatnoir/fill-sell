-- 20261107150000 — Ventes annulées : une proposition « Remettre en vente » se FERME quand l'article n'est plus à remettre
-- (07/11/2026, compte d'Ornella ; règle pour TOUS les comptes)
--
-- Constat vérifié en lecture le 07/11 : l'écran « Ventes annulées » (rpc ventes_annulees_a_remettre) gardait des lignes
-- « Remettre en vente » pour des articles REMIS EN LIGNE ou VENDUS sous une AUTRE fiche du compte : la synchro du dressing
-- fait une fiche neuve pour tout numéro Vinted inconnu, et la règle « remise en ligne » ne relie pas les deux fiches
-- quand la vente a été annulée (Vinted garde « sold » sur l'annonce d'une commande annulée). Pull rayé 1792342856185 →
-- 1793203726300000 (en ligne) ; machine L'OR Barista 1792932819386 → 1793203726300004 (vendue le 30/10) ; robe gris foncé
-- 1791910125547 → 1793203726300002 (vendue) ; robe portefeuille 1791994772257 → 1793203726300001 (vendue). Un appui sur
-- « Remettre en vente » aurait créé de NOUVELLES annonces eBay / Leboncoin pour un article déjà VENDU (double vente) :
-- la pré-fermeture « déjà en vente » ne regardait que CETTE fiche, et une fiche vendue ne fermait rien.
--
-- LA RÈGLE (remises_en_vente_tick, avant l'appui ET juste avant de créer la publication) :
--   A1 fiche hors stock (vendue, quantité 0, fondue, effacée) → la proposition se ferme « plus_en_stock » ;
--   A2 fiche JUMELLE PROUVÉE (fiche_jumelle_prouvee : même compte, née d'un relevé, même boutique Vinted quand les deux
--      en ont une, apparue APRÈS la vente, ≥ 2 photos quasi identiques — dHash ≤ 4 — ou 1 si un côté n'a qu'une photo,
--      entre les photos de la fiche et de ses dépôts et celles de la jumelle, l'ancienne annonce jamais revue en ligne
--      depuis l'apparition de la jumelle, un seul exemplaire de chaque côté, UNE SEULE jumelle) → TOUTES les plateformes
--      de la remise se ferment :
--      jumelle vendue « vendu_sous_autre_fiche », jumelle en stock et en ligne « deja_en_vente_autre_fiche ».
--      Jamais sur un titre. Doute (deux jumelles, en ligne ensemble, photos différentes) = la ligne reste.
--   « Ne pas remettre en vente » : ventes_annulees_ne_pas_remettre(p_inventaire) (le compte appelant, CETTE fiche) →
--      « abandonnee », motif « choix_personne » (motif déjà connu de remises_en_vente, aucune contrainte sur motif).
--   ventes_annulees_a_remettre : une fiche hors stock ou fondue ne s'affiche plus.
-- Ce qui ne change PAS : la remise acceptée d'une fiche sans jumelle (hors quota, relevé attendu, « Republier » Vinted),
-- les autres remises en vente, la fusion des fiches (aucune fusion, aucune question posée ici), aucun mail, aucun retrait.
-- CPU : mesuré en lecture le 07/11 sur la prod (48 fiches proposées) : 236 ms pour toutes ; borné à 50 fiches par passage.
-- Définitions réécrites depuis pg_get_functiondef EN PRODUCTION (07/11 : remises_en_vente_tick md5
-- 8727977d992fbdf357f76718908554ca, ventes_annulees_a_remettre md5 9dd603b95e08cd6d8c91587be2ad4882) ; inverse :
-- supabase/rollbacks/20261107150000_ventes_annulees_fermeture_INVERSE.sql ; preuve (Postgres jetable) :
-- scripts/preuve-ventes-annulees-fermeture.mjs.

-- ── Garde : la prod n'a pas changé depuis la lecture du 07/11 (ou cette migration est déjà passée) ──
DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> '8727977d992fbdf357f76718908554ca' AND position('remise_annulee_jumelle_fermer' IN v_d) = 0 THEN
    RAISE EXCEPTION 'remises_en_vente_tick a changé en prod depuis le 07/11 : repartir de pg_get_functiondef';
  END IF;
  SELECT replace(pg_get_functiondef('public.ventes_annulees_a_remettre()'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> '9dd603b95e08cd6d8c91587be2ad4882' AND position('plus en stock' IN v_d) = 0 THEN
    RAISE EXCEPTION 'ventes_annulees_a_remettre a changé en prod depuis le 07/11 : repartir de pg_get_functiondef';
  END IF;
END
$garde$;

-- ── Quand la vente annulée a-t-elle été faite ? (le repère « après la vente » de la jumelle) ──
-- La plus récente des ventes annulées qui portent les remises ouvertes de la fiche : la date du job vendu (sold_at),
-- sinon celle de la vente retirée (ventes_supprimees.vendu_le, par le numéro de vente du marqueur vente_annulee_remise).
-- Inconnue → NULL : aucune jumelle ne peut être prouvée.
CREATE OR REPLACE FUNCTION public.remise_annulee_vente_le(p_user uuid, p_fiche bigint)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT max(COALESCE(jv.sold_at, (
           SELECT min(vs.vendu_le) FROM public.ventes_supprimees vs
            WHERE vs.user_id = rv.user_id
              AND vs.vente_id = CASE WHEN (jv.platform_fields #>> '{vente_annulee_remise,vente}') ~ '^[0-9]{1,18}$'
                                     THEN (jv.platform_fields #>> '{vente_annulee_remise,vente}')::bigint END)))
    FROM public.remises_en_vente rv
    JOIN public.cross_post_jobs jv ON jv.id = rv.job_vendu
   WHERE rv.user_id = p_user AND rv.inventaire_id = p_fiche AND rv.statut IN ('proposee', 'a_faire')
     AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise';
$function$;

-- ── La fiche JUMELLE PROUVÉE d'une fiche dont la vente a été annulée (jamais un titre) ──
-- Rend au plus UNE ligne : la jumelle t et le motif de fermeture ('vendu_sous_autre_fiche' si t est vendue,
-- 'deja_en_vente_autre_fiche' si t est en stock ET en ligne), avec le nombre de photos communes. Rien si :
-- la fiche est fondue ou a plusieurs exemplaires, le repère est inconnu, aucune ou PLUSIEURS jumelles (deux exemplaires
-- remis en ligne = le doute), l'ancienne annonce (son numéro Vinted, ceux de ses dépôts) a été revue en ligne depuis
-- l'apparition de t, ou une autre annonce de la fiche a été vue en ligne depuis (en ligne ensemble = deux exemplaires).
-- t : même compte, non fondue, un exemplaire au plus, née d'un relevé (origine vinted_sync / releve_*), même boutique
-- Vinted quand les deux en ont une, apparue (créée ou vue en premier) APRÈS la vente, numéro Vinted différent ; photos : ≥ 2 photos de t à dHash ≤ 4 d'une photo de la fiche
-- ou de ses dépôts (publish / republish) — 1 suffit si la fiche ou t n'a qu'une photo.
CREATE OR REPLACE FUNCTION public.fiche_jumelle_prouvee(p_user uuid, p_fiche bigint, p_apres timestamp with time zone)
 RETURNS TABLE(jumelle bigint, motif text, photos_communes integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH f AS (
    SELECT i.id, i.vinted_account_id, i.photos
      FROM public.inventaire i
     WHERE i.id = p_fiche AND i.user_id = p_user AND i.fusionne_dans IS NULL
       AND COALESCE(i.quantite, 1) <= 1 AND p_apres IS NOT NULL
  ),
  anciennes AS (
    SELECT btrim(i.vinted_item_id) AS id FROM public.inventaire i
     WHERE i.id = p_fiche AND i.user_id = p_user AND NULLIF(btrim(i.vinted_item_id), '') IS NOT NULL
    UNION
    SELECT btrim(c.platform_listing_id) FROM public.cross_post_jobs c
     WHERE c.inventaire_id = p_fiche AND c.user_id = p_user AND c.platform = 'vinted'
       AND COALESCE(c.action, 'publish') IN ('publish', 'republish') AND NULLIF(btrim(c.platform_listing_id), '') IS NOT NULL
  ),
  urls_f AS (
    SELECT CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e ->> 'url' END AS url
      FROM f, jsonb_array_elements(CASE WHEN jsonb_typeof(f.photos) = 'array' THEN f.photos ELSE '[]'::jsonb END) e
    UNION
    SELECT CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' WHEN 'object' THEN e ->> 'url' END
      FROM public.cross_post_jobs c,
           jsonb_array_elements(CASE WHEN jsonb_typeof(c.photos) = 'array' THEN c.photos ELSE '[]'::jsonb END) e
     WHERE c.inventaire_id = p_fiche AND c.user_id = p_user AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
  ),
  emp_f AS (
    SELECT DISTINCT pe.dhash::bit(64) AS d
      FROM urls_f u JOIN public.photo_empreintes pe ON pe.url = u.url
     WHERE pe.dhash ~ '^[01]{64}$'
  ),
  cand AS (
    SELECT t.id, t.statut, t.vinted_item_id, t.vinted_status, t.disparu_le, t.photos, t.origine,
           LEAST(t.created_at, t.first_seen_at) AS apparue
      FROM f, public.inventaire t
     WHERE t.user_id = p_user AND t.id <> f.id AND t.fusionne_dans IS NULL
       AND COALESCE(t.quantite, 1) <= 1
       -- née d'un RELEVÉ (l'annonce remise en ligne par la personne sur la plateforme), jamais une fiche faite dans
       -- l'app (un second exemplaire dupliqué à la main n'est pas une remise en ligne)
       AND (t.origine = 'vinted_sync' OR t.origine LIKE 'releve\_%')
       AND LEAST(t.created_at, t.first_seen_at) > p_apres
       AND (NULLIF(btrim(f.vinted_account_id), '') IS NULL OR NULLIF(btrim(t.vinted_account_id), '') IS NULL
            OR btrim(t.vinted_account_id) = btrim(f.vinted_account_id))
       AND (t.vinted_item_id IS NULL OR btrim(t.vinted_item_id) NOT IN (SELECT a.id FROM anciennes a))
  ),
  photos_t AS (
    SELECT c.id, u.url, pe.dhash::bit(64) AS d
      FROM cand c
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.photos) = 'array' THEN c.photos ELSE '[]'::jsonb END) x
      CROSS JOIN LATERAL (SELECT CASE jsonb_typeof(x) WHEN 'string' THEN x #>> '{}' WHEN 'object' THEN x ->> 'url' END AS url) u
      JOIN public.photo_empreintes pe ON pe.url = u.url AND pe.dhash ~ '^[01]{64}$'
  ),
  communes AS (
    SELECT pt.id, LEAST(count(DISTINCT pt.url), count(DISTINCT ef.d)) AS n
      FROM photos_t pt JOIN emp_f ef ON bit_count(pt.d # ef.d) <= 4
     GROUP BY pt.id
  ),
  prouvees AS (
    SELECT c.id, c.statut, cm.n
      FROM cand c JOIN communes cm ON cm.id = c.id, f
     WHERE (cm.n >= 2
            OR (cm.n >= 1 AND (jsonb_array_length(CASE WHEN jsonb_typeof(c.photos) = 'array' THEN c.photos ELSE '[]'::jsonb END) <= 1
                               OR jsonb_array_length(CASE WHEN jsonb_typeof(f.photos) = 'array' THEN f.photos ELSE '[]'::jsonb END) <= 1)))
       AND NOT EXISTS (
             SELECT 1 FROM public.vinted_listing_snapshots s
              WHERE s.user_id = p_user AND s.vinted_item_id IN (SELECT a.id FROM anciennes a)
                AND s.status = 'active' AND s.captured_at >= c.apparue)
       AND NOT EXISTS (
             SELECT 1 FROM public.annonces_plateforme ap
              WHERE ap.user_id = p_user AND ap.inventaire_id = p_fiche
                AND ap.statut_plateforme IN ('en_ligne', 'en_verification')
                AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
                AND COALESCE(ap.vu_le, ap.created_at) >= c.apparue
                AND NOT (ap.platform = 'leboncoin'
                         AND COALESCE(public.leboncoin_transaction_lue(ap.transaction_plateforme, ap.capture), '') IN ('pending', 'sold')))
       AND (c.statut = 'vendu'
            OR (c.statut = 'stock'
                AND ((NULLIF(btrim(c.vinted_item_id), '') IS NOT NULL AND c.vinted_status = 'active' AND c.disparu_le IS NULL)
                     OR EXISTS (SELECT 1 FROM public.annonces_plateforme ap
                                 WHERE ap.user_id = p_user AND ap.inventaire_id = c.id
                                   AND ap.statut_plateforme IN ('en_ligne', 'en_verification')
                                   AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL))))
  )
  SELECT p.id AS jumelle,
         CASE WHEN p.statut = 'vendu' THEN 'vendu_sous_autre_fiche' ELSE 'deja_en_vente_autre_fiche' END AS motif,
         p.n::integer AS photos_communes
    FROM prouvees p
   WHERE (SELECT count(*) FROM prouvees) = 1
$function$;

-- ── Fermer TOUTES les plateformes d'une remise après vente annulée dont la jumelle est prouvée ──
-- Appelée par remises_en_vente_tick (avant l'appui, et juste avant de créer une publication). Ferme les lignes
-- « proposée » et « à faire » de la fiche (seulement celles d'une vente annulée), une trace usage_logs
-- « remise_annulee_fermee_jumelle » par fiche fermée. Rend NULL quand rien n'est prouvé (rien n'est écrit).
CREATE OR REPLACE FUNCTION public.remise_annulee_jumelle_fermer(p_user uuid, p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_apres timestamptz; v_jumelle bigint; v_motif text; v_photos integer; v_n integer;
BEGIN
  IF p_user IS NULL OR p_fiche IS NULL THEN RETURN NULL; END IF;
  v_apres := public.remise_annulee_vente_le(p_user, p_fiche);
  IF v_apres IS NULL THEN RETURN NULL; END IF;
  SELECT x.jumelle, x.motif, x.photos_communes INTO v_jumelle, v_motif, v_photos
    FROM public.fiche_jumelle_prouvee(p_user, p_fiche, v_apres) x LIMIT 1;
  IF v_jumelle IS NULL THEN RETURN NULL; END IF;
  UPDATE remises_en_vente rv SET statut = 'abandonnee', motif = v_motif, traite_le = now()
   WHERE rv.user_id = p_user AND rv.inventaire_id = p_fiche AND rv.statut IN ('proposee', 'a_faire')
     AND EXISTS (SELECT 1 FROM cross_post_jobs jv
                  WHERE jv.id = rv.job_vendu AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN NULL; END IF;
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user, 'remise_annulee_fermee_jumelle', jsonb_build_object(
    'inventaire_id', p_fiche::text, 'jumelle', v_jumelle::text, 'motif', v_motif, 'photos_communes', v_photos,
    'vente_le', v_apres, 'lignes', v_n, 'regle', 'ventes_annulees_fermeture_0711'));
  RETURN jsonb_build_object('jumelle', v_jumelle, 'motif', v_motif, 'photos_communes', v_photos, 'lignes', v_n);
END;
$function$;

-- ── remises_en_vente_tick : définition de PROD du 07/11, chaque ligne gardée, plus A1 / A2 et la garde avant l'INSERT ──
CREATE OR REPLACE FUNCTION public.remises_en_vente_tick(p_limite integer DEFAULT 20, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_cpu numeric;
  r record; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_op jsonb; v_place jsonb; v_motif text; v_report timestamptz; v_nouveau uuid;
  v_vu timestamptz; v_api boolean; v_sortie bigint; v_prix integer;
  v_faites integer := 0; v_abandons integer := 0; v_reports integer := 0;
  v_annul boolean; v_restant integer;   -- (18/10) copie retirée à cause d'une vente annulée
  v_trans text; v_conv text; v_rep jsonb;   -- (25/10) « Republier » de Vinted : commande, conversation
  v_f record; v_jum jsonb; v_hors_stock integer := 0; v_jumelles integer := 0;   -- (07/11) ventes annulées : fermetures
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

  -- (07/11, Ornella) AVANT l'appui : une remise proposée après une vente annulée dont la FICHE n'est plus en stock (vendue,
  -- quantité 0, fondue dans une autre fiche, ou effacée) se ferme « plus_en_stock » — rien à remettre en vente, la carte
  -- ne la montre plus (ventes_annulees_a_remettre). Lignes « proposée » seules (index remises_en_vente_proposees).
  UPDATE remises_en_vente rv SET statut = 'abandonnee', motif = 'plus_en_stock', traite_le = now()
    FROM cross_post_jobs jv
   WHERE rv.statut = 'proposee' AND (p_user IS NULL OR rv.user_id = p_user)
     AND jv.id = rv.job_vendu AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     AND NOT EXISTS (SELECT 1 FROM inventaire ix
                      WHERE ix.id = rv.inventaire_id AND ix.user_id = rv.user_id AND ix.fusionne_dans IS NULL
                        AND ix.statut = 'stock' AND COALESCE(ix.quantite, 1) > 0);
  GET DIAGNOSTICS v_hors_stock = ROW_COUNT;

  -- (24/10 nuit, Nico) AVANT l'appui : un article remis en ligne DIRECTEMENT sur la plateforme — par le vendeur ou par la
  -- plateforme elle-même — n'est plus « à remettre en vente » sur cette plateforme : sa proposition se ferme « déjà en
  -- vente » et la carte le dit (jamais de doublon). Même lecture que la garde « déjà en vente » plus bas : le relevé de
  -- l'annonce vendue revue ACTIVE après l'annulation, ou une autre annonce en ligne de CETTE fiche — jamais le titre.
  UPDATE remises_en_vente rv SET statut = 'abandonnee', motif = 'deja_en_vente', traite_le = now()
    FROM cross_post_jobs jv, inventaire iv
   WHERE rv.statut = 'proposee' AND (p_user IS NULL OR rv.user_id = p_user)
     AND jv.id = rv.job_vendu AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     AND iv.id = rv.inventaire_id AND iv.user_id = rv.user_id
     AND (
       (rv.platform = 'vinted' AND NULLIF(btrim(jv.platform_listing_id), '') IS NOT NULL AND coalesce((
          SELECT sv.status = 'active' FROM vinted_listing_snapshots sv
           WHERE sv.user_id = rv.user_id AND sv.vinted_item_id = btrim(jv.platform_listing_id)
             AND sv.captured_at > COALESCE(NULLIF(jv.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, rv.cree_le)
           ORDER BY sv.captured_at DESC LIMIT 1), false))
       OR EXISTS (
          SELECT 1 FROM annonces_plateforme av
           WHERE av.user_id = rv.user_id AND av.inventaire_id = rv.inventaire_id AND av.platform = rv.platform
             AND av.statut_plateforme IN ('en_ligne', 'en_verification')
             AND av.disparu_le IS NULL AND av.retiree_le IS NULL AND av.ignoree_le IS NULL
             AND COALESCE(av.vu_le, av.created_at) > COALESCE(NULLIF(jv.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, rv.cree_le))
       OR (rv.platform = 'vinted' AND iv.vinted_item_id IS NOT NULL
           AND iv.vinted_item_id IS DISTINCT FROM NULLIF(btrim(jv.platform_listing_id), '')
           AND iv.disparu_le IS NULL AND COALESCE(iv.vinted_status, 'active') NOT IN ('sold', 'closed')));

  -- (07/11, Ornella) AVANT l'appui : l'article remis en ligne, ou VENDU, sous une AUTRE fiche du même compte (la synchro
  -- du dressing a fait une fiche neuve pour son nouveau numéro Vinted ; Vinted garde « sold » sur l'annonce d'une commande
  -- annulée, la règle « remise en ligne » ne les relie pas). La PREUVE, jamais le titre : fiche_jumelle_prouvee() (mêmes
  -- photos, même boutique, apparue après la vente, l'ancienne jamais revue en ligne depuis, une seule jumelle, un seul
  -- exemplaire de chaque côté). Jumelle vendue → « vendu_sous_autre_fiche » ; en stock et en ligne →
  -- « deja_en_vente_autre_fiche ». TOUTES les plateformes de la remise se ferment (remise_annulee_jumelle_fermer) :
  -- jamais une nouvelle annonce eBay / Leboncoin pour un article déjà vendu. Borné : 50 fiches au plus par passage,
  -- tirées au sort (chacune finit par passer) ; une erreur sur une fiche ne retient ni les autres ni la boucle.
  FOR v_f IN
    SELECT rv.user_id, rv.inventaire_id
      FROM remises_en_vente rv JOIN cross_post_jobs jv ON jv.id = rv.job_vendu
     WHERE rv.statut = 'proposee' AND (p_user IS NULL OR rv.user_id = p_user)
       AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     GROUP BY rv.user_id, rv.inventaire_id
     ORDER BY random()
     LIMIT 50
  LOOP
    BEGIN
      IF public.remise_annulee_jumelle_fermer(v_f.user_id, v_f.inventaire_id) IS NOT NULL THEN
        v_jumelles := v_jumelles + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'remises_en_vente_tick : jumelle (%, %) : %', v_f.user_id, v_f.inventaire_id, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT * FROM remises_en_vente
     WHERE statut = 'a_faire' AND prochain_essai <= now()
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY prochain_essai
     LIMIT GREATEST(1, LEAST(p_limite, 50))
     FOR UPDATE SKIP LOCKED
  LOOP
    -- (07/11) une ligne fermée depuis la lecture (toutes les plateformes d'une remise se ferment ensemble) : rien à refaire.
    IF NOT EXISTS (SELECT 1 FROM remises_en_vente x WHERE x.id = r.id AND x.statut = 'a_faire') THEN CONTINUE; END IF;
    v_motif := NULL; v_report := NULL; v_nouveau := NULL;
    SELECT * INTO j FROM cross_post_jobs WHERE id = r.job_vendu;
    SELECT * INTO i FROM inventaire WHERE id = r.inventaire_id AND user_id = r.user_id;
    v_op := NULL;
    IF j.id IS NOT NULL AND NULLIF(j.platform_fields->>'vente_operation_cle', '') IS NOT NULL THEN
      SELECT o.resultat INTO v_op FROM ventes_operations o
       WHERE o.user_id = r.user_id AND o.cle = j.platform_fields->>'vente_operation_cle';
    END IF;
    -- (18/10) Le dépôt `cancelled` d'une copie retirée à cause d'une vente Vinted
    -- annulée (vente_commande_annulee_vinted) : pas de reçu, le restant est la
    -- quantité de la fiche ; toutes les autres gardes s'appliquent.
    v_annul := (j.id IS NOT NULL AND j.status = 'cancelled' AND (COALESCE(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'));
    v_restant := CASE WHEN v_annul THEN COALESCE(i.quantite, 1) ELSE NULLIF(v_op->>'restant', '')::integer END;

    IF j.id IS NULL OR (j.status <> 'sold' AND NOT v_annul) THEN
      v_motif := 'annonce_plus_vendue';            -- vente annulée, job revenu
    ELSIF NOT v_annul AND (v_op IS NULL OR (v_op->>'ok') IS DISTINCT FROM 'true') THEN
      v_motif := 'vente_non_enregistree';          -- signal sans reçu : on ne sait pas
    ELSIF NOT v_annul AND COALESCE(NULLIF(v_op->>'restant', '')::integer, 0) <= 0 THEN
      v_motif := 'plus_de_stock';                  -- dernière unité : rien à remettre
    ELSIF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
      v_motif := 'fiche_absente';
    ELSIF i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0 THEN
      v_motif := 'plus_de_stock';
    -- (24/10 soir, décision de Nico) Après une vente ANNULÉE, jamais de doublon : le vendeur a pu remettre l'article en
    -- ligne lui-même. La remise attend un relevé COMPLET de la plateforme fait après l'annulation et au plus tôt
    -- 15 min avant l'appui (demandé par l'appui) ; ce relevé rattache l'annonce remise en ligne, et « déjà en vente »
    -- l'écarte plus bas. Un compte sans aucun relevé de cette plateforme garde les gardes d'avant. 3 jours au plus.
    ELSIF v_annul AND public.releve_apres_annulation(r.user_id, r.platform,
            GREATEST(COALESCE(NULLIF(j.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, r.cree_le),
                     COALESCE(r.accepte_le, r.cree_le) - interval '15 minutes')) = 'attendu' THEN
      v_motif := 'releve_attendu';
      v_report := CASE WHEN COALESCE(r.accepte_le, r.cree_le) < now() - interval '3 days' THEN NULL
                       ELSE now() + interval '20 minutes' END;
    ELSIF r.platform NOT IN ('vinted', 'beebs', 'opla', 'leboncoin', 'ebay', 'depop') THEN
      v_motif := 'plateforme_non_geree';
    ELSIF r.platform IN ('leboncoin', 'ebay')
      AND (COALESCE(j.platform_fields->>'source', '') = 'releve'
           OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      -- (05/11, règle de Nico) Leboncoin : « importée » se juge sur l'annonce VENDUE elle-même. Une REPUBLICATION est un
      -- dépôt FillSell (une pièce) qui hérite source / rattachement de l'annonce d'origine (3298491503, job 6696ce1f) :
      -- jamais « importée à quantité ». eBay : inchangé.
      AND NOT (r.platform = 'leboncoin' AND COALESCE(j.action, 'publish') = 'republish')
      -- (06/10 soir) eBay : une annonce importée n'est « vendue » que si eBay
      -- la dit ÉPUISÉE (ebay-api-worker, sale_evidence.exact) — elle n'est plus
      -- en ligne ; la fiche qui garde du stock doit être remise en vente.
      AND NOT (r.platform = 'ebay' AND (
            COALESCE(j.platform_fields #>> '{sale_evidence,exact}', '') = 'true'
         OR (COALESCE(j.platform_fields #>> '{quantite_ebay,exacte}', '') = 'true'
             AND COALESCE(NULLIF(j.platform_fields #>> '{quantite_ebay,disponible}', '')::numeric, 1) <= 0))) THEN
      v_motif := 'annonce_importee_a_quantite';    -- peut rester en ligne avec son stock
    ELSIF r.platform = 'opla' AND COALESCE(v_sortie, 0) > 0 AND now() >= to_timestamp(v_sortie) THEN
      v_motif := 'opla_sortie';
    ELSIF COALESCE(v_prix, 0) > 0 THEN
      v_motif := 'publication_payante';            -- jamais de débit sans le geste de la personne
    -- (08/10, Louis) L'annonce « vendue » est encore EN LIGNE après la vente
    -- (dressing Vinted, relevé des autres plateformes) : une remise ferait un
    -- doublon. On revient dans 6 h (la vente annulée ou l'annonce partie, elle
    -- repart d'elle-même).
    ELSIF (r.platform = 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND (
             SELECT s.status = 'active' AND s.captured_at > COALESCE(j.sold_at, now())
               FROM vinted_listing_snapshots s
              WHERE s.user_id = r.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)
              ORDER BY s.captured_at DESC LIMIT 1))
       OR (r.platform <> 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND EXISTS (
             SELECT 1 FROM annonces_plateforme a
              WHERE a.user_id = r.user_id AND a.platform = r.platform AND a.listing_id = btrim(j.platform_listing_id)
                AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.vu_le > COALESCE(j.sold_at, now())
                -- (05/11, règle de Nico) Leboncoin garde l'annonce « active » pendant la transaction (« Achat en cours »)
                -- et une fois vendue (« Vendu ») : sous transaction, elle n'est pas « encore en vente » — la remise part.
                AND NOT (a.platform = 'leboncoin'
                         AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') IN ('pending', 'sold')))) THEN
      v_motif := 'annonce_vendue_encore_en_ligne'; v_report := now() + interval '6 hours';
    ELSIF EXISTS (
        SELECT 1 FROM cross_post_jobs c
         WHERE c.user_id = r.user_id AND c.inventaire_id = r.inventaire_id AND c.platform = r.platform
           AND c.id <> j.id AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
           AND (c.status IN ('pending', 'processing', 'needs_user')
                OR (c.status = 'published' AND NOT EXISTS (
                      SELECT 1 FROM cross_post_jobs d
                       WHERE d.user_id = c.user_id AND d.inventaire_id = c.inventaire_id
                         AND d.platform = c.platform AND d.action = 'delete' AND d.status = 'deleted'
                         AND CASE WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                                   AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                                  THEN annonce_id_de_job(d.platform_listing_id, d.listing_url)
                                     = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                                  ELSE d.created_at > COALESCE(c.published_at, c.created_at) END))))
      OR EXISTS (
        SELECT 1 FROM annonces_plateforme a
         WHERE a.user_id = r.user_id AND a.inventaire_id = r.inventaire_id AND a.platform = r.platform
           AND a.statut_plateforme IN ('en_ligne', 'en_verification')
           AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
           AND a.listing_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
           -- (05/11, règle de Nico) Même règle : une AUTRE annonce Leboncoin de la fiche sous transaction (« Achat en
           -- cours » / « Vendu » — la vente d'avant, que Leboncoin garde listée des jours) n'est pas « déjà en vente ».
           AND NOT (a.platform = 'leboncoin'
                    AND COALESCE(public.leboncoin_transaction_lue(a.transaction_plateforme, a.capture), '') IN ('pending', 'sold'))
           AND COALESCE(a.vu_le, a.created_at) > COALESCE(j.sold_at, now()))
      OR (r.platform = 'vinted' AND i.vinted_item_id IS NOT NULL
          AND i.vinted_item_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
          AND i.disparu_le IS NULL AND COALESCE(i.vinted_status, 'active') NOT IN ('sold', 'closed')) THEN
      v_motif := 'deja_en_vente';
    -- (09/10 soir, Louis) Plus de branche « jumeau_en_ligne » : l'annonce
    -- d'une AUTRE fiche ne retient jamais la remise en vente de celle-ci
    -- (migration 20261009233000). « deja_en_vente » (CETTE fiche) reste.
    END IF;

    IF v_motif IS NULL AND EXISTS (SELECT 1 FROM platform_health h WHERE h.platform = r.platform AND h.paused) THEN
      v_motif := 'plateforme_en_pause'; v_report := now() + interval '1 hour';
    END IF;
    IF v_motif IS NULL THEN
      SELECT p.extension_last_seen_at, COALESCE(p.ebay_voie_api, false) INTO v_vu, v_api
        FROM profiles p WHERE p.id = r.user_id;
      IF NOT (v_vu > now() - interval '7 days' OR (r.platform = 'ebay' AND v_api)) THEN
        v_motif := 'poste_absent'; v_report := now() + interval '6 hours';
      END IF;
    END IF;
    -- (24/10 soir) Une remise après une vente ANNULÉE est hors quota : c'est l'état d'avant la vente, pas une publication voulue.
    IF v_motif IS NULL AND NOT v_annul THEN
      v_place := remise_en_vente_place(r.user_id);
      IF (v_place->>'place') IS DISTINCT FROM 'true' THEN
        v_motif := v_place->>'motif';
        v_report := NULLIF(v_place->>'reprise', '')::timestamptz;
        IF v_report IS NULL THEN v_report := 'infinity'; END IF;  -- quota à vie : n'est plus tenté
      END IF;
    END IF;

    -- (25/10 nuit, décision de Nico du 24/10 23:21) Vinted, vente ANNULÉE : la remise passe par le bouton « Republier »
    -- de Vinted (même annonce, mêmes photos, nouveau numéro) — l'extension ≥ 0.6.142 l'actionne (get-pending-jobs ne
    -- sert ce job qu'à un poste qui déclare « vinted_republier_v1 »). Sans numéro de commande ou d'annonce : rien
    -- n'est créé, jamais une nouvelle annonce en plus du bouton de Vinted.
    v_rep := '{}'::jsonb;
    IF v_motif IS NULL AND r.platform = 'vinted' AND v_annul THEN
      v_trans := NULLIF(btrim(COALESCE(j.platform_fields #>> '{vente_annulee_remise,commande}', '')), '');
      IF v_trans IS NULL OR v_trans !~ '^[0-9]+$' OR NULLIF(btrim(j.platform_listing_id), '') IS NULL THEN
        v_motif := 'republier_commande_inconnue';
      ELSE
        SELECT NULLIF(btrim(pc.conversation_ref), '') INTO v_conv FROM plateforme_commandes pc
         WHERE pc.user_id = r.user_id AND pc.platform = 'vinted' AND pc.commande_ref = v_trans
         ORDER BY pc.maj_le DESC NULLS LAST LIMIT 1;
        v_rep := jsonb_build_object('remise_par_republier', jsonb_build_object(
          'transaction_id', v_trans, 'conversation_id', v_conv, 'item_id', btrim(j.platform_listing_id),
          'vente', j.platform_fields #>> '{vente_annulee_remise,vente}', 'annulee_le', j.platform_fields #>> '{vente_annulee_remise,le}',
          'job_vendu', j.id, 'cree_le', now()));
      END IF;
    END IF;

    -- (07/11, Ornella) La MÊME garde juste avant de créer la publication d'une remise après vente annulée : l'article
    -- remis en ligne ou vendu sous une autre fiche (preuve : fiche_jumelle_prouvee) → rien n'est créé, toutes les
    -- plateformes de la remise se ferment. Une vérification impossible (erreur) ne crée rien : on revient dans 1 h.
    IF v_motif IS NULL AND v_annul THEN
      BEGIN
        v_jum := public.remise_annulee_jumelle_fermer(r.user_id, r.inventaire_id);
      EXCEPTION WHEN OTHERS THEN
        v_jum := NULL; v_motif := 'jumelle_non_verifiee'; v_report := now() + interval '1 hour';
      END;
      IF v_jum IS NOT NULL THEN
        v_abandons := v_abandons + 1; v_jumelles := v_jumelles + 1;
        CONTINUE;   -- la ligne est déjà fermée (avec ses sœurs) par remise_annulee_jumelle_fermer
      END IF;
    END IF;

    IF v_motif IS NULL THEN
      BEGIN
        INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                     title, description, price, photos, platform_fields)
        VALUES (r.user_id, r.inventaire_id, r.platform, 'pending', 'publish', COALESCE(j.photo_option, 'original'),
                -- (24/10 nuit, le short de Nico) Le contenu de la FICHE quand le job source n'en a pas (annonce importée du
                -- dressing, ancienne republication) : jamais une publication sans titre, sans prix ou sans photo.
                coalesce(nullif(btrim(j.title), ''), i.titre), coalesce(nullif(btrim(j.description), ''), i.description),
                coalesce(j.price, i.prix_vente),
                -- (06/11, the_closet72) Les photos du job vendu, dans l'ORDRE DE LA FICHE (public.photos_ordre_article).
                CASE WHEN jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 0
                          THEN public.photos_ordre_article(j.photos, i.photos, j.platform_fields)
                     WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE j.photos END,
                remise_en_vente_champs(j.platform_fields) || jsonb_build_object('remise_en_vente',
                  jsonb_build_object('apres_vente_job', j.id, 'annonce_vendue', NULLIF(btrim(j.platform_listing_id), ''),
                                     'vente', j.platform_fields->>'vente_operation_cle',
                                     'restant', v_restant, 'apres_annulation', v_annul, 'le', now()))
                || CASE WHEN v_annul THEN jsonb_build_object('hors_quota', true) ELSE '{}'::jsonb END
                || v_rep)
        RETURNING id INTO v_nouveau;
      EXCEPTION
        WHEN unique_violation THEN v_motif := 'deja_en_vente';
        WHEN OTHERS THEN v_motif := 'refus_creation: ' || left(SQLERRM, 160);
      END;
    END IF;

    IF v_nouveau IS NOT NULL THEN
      UPDATE remises_en_vente SET statut = 'faite', motif = NULL, job_cree = v_nouveau,
             essais = essais + 1, traite_le = now() WHERE id = r.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (r.user_id, 'remise_en_vente', jsonb_build_object('plateforme', r.platform,
        'inventaire_id', r.inventaire_id::text, 'job_vendu', j.id, 'job_cree', v_nouveau,
        'restant', v_restant, 'apres_annulation', v_annul, 'par_republier', v_rep ? 'remise_par_republier'));
      v_faites := v_faites + 1;
    ELSIF v_report IS NOT NULL AND v_report <> 'infinity' THEN
      UPDATE remises_en_vente SET motif = v_motif, essais = essais + 1, prochain_essai = v_report,
             traite_le = now() WHERE id = r.id;
      v_reports := v_reports + 1;
    ELSE
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = v_motif, essais = essais + 1,
             traite_le = now() WHERE id = r.id;
      v_abandons := v_abandons + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('issue', 'tour', 'faites', v_faites, 'reportees', v_reports,
                            'abandonnees', v_abandons, 'cpu', v_cpu,
                            'hors_stock', v_hors_stock, 'jumelles', v_jumelles);
END;
$function$;

-- ── ventes_annulees_a_remettre : définition de PROD du 07/11 ; une fiche hors stock ou fondue ne s'affiche plus ──
CREATE OR REPLACE FUNCTION public.ventes_annulees_a_remettre()
 RETURNS TABLE(inventaire_id bigint, titre text, photo text, plateformes text[], etat text, motif text, le timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.inventaire_id, max(i.titre), max(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ->> 0 END),
         array_agg(DISTINCT r.platform ORDER BY r.platform),
         CASE WHEN bool_or(r.statut = 'proposee') THEN 'proposee'
              WHEN bool_or(r.statut = 'a_faire') THEN 'en_cours'
              WHEN bool_or(r.statut = 'abandonnee' AND r.motif = 'deja_en_vente') THEN 'deja_en_vente'
              WHEN bool_and(r.statut = 'faite') THEN 'faite' ELSE 'abandonnee' END,
         max(r.motif), max(COALESCE(r.traite_le, r.accepte_le, r.cree_le))
    FROM remises_en_vente r
    JOIN cross_post_jobs j ON j.id = r.job_vendu AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
    JOIN inventaire i ON i.id = r.inventaire_id AND i.user_id = r.user_id
     -- (07/11, Ornella) une fiche plus en stock (vendue, quantité 0) ou fondue dans une autre ne s'affiche plus
     AND i.fusionne_dans IS NULL AND i.statut = 'stock' AND COALESCE(i.quantite, 1) > 0
   WHERE r.user_id = auth.uid()
     AND (r.statut IN ('proposee', 'a_faire') OR COALESCE(r.traite_le, r.cree_le) > now() - interval '24 hours')
   GROUP BY r.inventaire_id
$function$;

-- ── « Ne pas remettre en vente » (geste de la personne, une ligne de l'écran « Ventes annulées ») ──
-- Les propositions de CETTE fiche, du compte APPELANT seulement (auth.uid()), passent « abandonnee », motif
-- « choix_personne ». Rien d'autre : ni la fiche, ni une annonce, ni une autre remise. Trace usage_logs.
CREATE OR REPLACE FUNCTION public.ventes_annulees_ne_pas_remettre(p_inventaire bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise' USING ERRCODE = '42501'; END IF;
  WITH m AS (
    UPDATE remises_en_vente r SET statut = 'abandonnee', motif = 'choix_personne', traite_le = now()
     WHERE r.user_id = v_user AND r.inventaire_id = p_inventaire AND r.statut = 'proposee'
     RETURNING r.platform)
  SELECT array_agg(DISTINCT platform ORDER BY platform) INTO v_pf FROM m;
  IF v_pf IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'rien_a_remettre'); END IF;
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'remise_apres_annulation_refusee', jsonb_build_object('inventaire_id', p_inventaire::text, 'plateformes', to_jsonb(v_pf)));
  RETURN jsonb_build_object('ok', true, 'plateformes', to_jsonb(v_pf));
END;
$function$;

-- ── Droits : les aides restent au serveur ; le geste s'ouvre à la session (authenticated) seulement ──
REVOKE ALL ON FUNCTION public.remise_annulee_vente_le(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiche_jumelle_prouvee(uuid, bigint, timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remise_annulee_jumelle_fermer(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remise_annulee_vente_le(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fiche_jumelle_prouvee(uuid, bigint, timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.remise_annulee_jumelle_fermer(uuid, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.ventes_annulees_ne_pas_remettre(bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ventes_annulees_ne_pas_remettre(bigint) TO authenticated;
