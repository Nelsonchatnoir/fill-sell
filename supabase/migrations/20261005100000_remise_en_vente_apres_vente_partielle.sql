-- ═══════════════════════════════════════════════════════════════════════════
-- Remise en vente après une vente partielle — 05/10/2026 (décision de Nico : OUI)
-- ═══════════════════════════════════════════════════════════════════════════
-- Louis (Business) : « 12 adaptateurs … » et « Rangement … » (quantité 9998).
-- Une unité se vend sur Vinted : l'annonce Vinted est CLOSE (une annonce
-- Vinted = un exemplaire), la fiche garde 9997 unités… et plus rien ne la
-- remet sur Vinted. Ce que fait chaque plateforme à la vente (établi le 05/10) :
--   · Vinted : annonce close (statut « sold »), aucune quantité ;
--   · Beebs, Opla : un dépôt FillSell = un exemplaire, annonce close ;
--   · eBay (dépôt FillSell, API) : availableQuantity 1 → annonce finie ;
--   · Leboncoin : un dépôt FillSell (quantité 1) affiche « Article vendu »
--     (vu dans Chrome le 05/10 sur 3245280957) — la page reste, l'achat non.
--   · une annonce IMPORTÉE par un relevé (Leboncoin pro, eBay) peut porter
--     plusieurs unités et rester en ligne : jamais remise en vente ici.
--
-- RÈGLE : quand une vente ENREGISTRÉE (reçu ventes_operations, ok, restant > 0)
-- clôt l'annonce d'une plateforme, une nouvelle publication du même contenu
-- (titre, texte, prix, photos, champs) part sur CETTE plateforme.
-- Garde-fous :
--   · jamais de doublon : aucune autre annonce vivante ni publication en vol
--     sur la plateforme pour cette fiche (jobs, relevés, fiche Vinted), et
--     l'index unique cross_post_jobs_un_seul_publish_actif_par_article_plateforme ;
--   · plafonds du palier : une remise en vente COMPTE comme une republication
--     (plafond du jour à Paris, quota du mois, quota à vie du gratuit) ; plafond
--     atteint = reportée au lendemain, jamais forcée ;
--   · quantité 0 (ou fiche vendue) : rien ;
--   · retraits croisés : inchangés (la vente partielle n'en arme aucun ; la
--     nouvelle annonce est un dépôt FillSell, donc un retrait prouvé le jour où
--     la quantité tombe à 0).
-- File : remises_en_vente, alimentée par un déclencheur sur la vente (job →
-- 'sold') et traitée par remises_en_vente_tick (cron 5 min, 20 au plus par
-- tour, tour sauté si veille_cpu > 50 %, comptes dont l'extension est vue
-- depuis 7 jours ou eBay relié). Les fiches déjà dans cet état sont rattrapées
-- par la MÊME règle (amorçage de la file, plus bas).
-- Inverse : scripts/reparations/20261005_remise_en_vente_INVERSE.sql.

CREATE TABLE IF NOT EXISTS public.remises_en_vente (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  inventaire_id bigint NOT NULL,
  platform text NOT NULL,
  job_vendu uuid NOT NULL UNIQUE,
  statut text NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'faite', 'abandonnee')),
  motif text,
  job_cree uuid,
  essais integer NOT NULL DEFAULT 0,
  prochain_essai timestamptz NOT NULL DEFAULT now(),
  cree_le timestamptz NOT NULL DEFAULT now(),
  traite_le timestamptz
);
CREATE INDEX IF NOT EXISTS remises_en_vente_a_faire_idx
  ON public.remises_en_vente (prochain_essai) WHERE statut = 'a_faire';
CREATE INDEX IF NOT EXISTS remises_en_vente_user_idx ON public.remises_en_vente (user_id, traite_le);
ALTER TABLE public.remises_en_vente ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.remises_en_vente TO authenticated;
DROP POLICY IF EXISTS remises_en_vente_lecture ON public.remises_en_vente;
CREATE POLICY remises_en_vente_lecture ON public.remises_en_vente
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── La vente alimente la file ───────────────────────────────────────────────
-- Le reçu (ventes_operations) et la quantité restante sont relus au
-- traitement, deux minutes plus tard : dans enregistrer_vente_atomique le job
-- passe 'sold' AVANT la fiche, dans la même transaction.
CREATE OR REPLACE FUNCTION public.cross_post_jobs_vendu_remise_en_vente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai)
    VALUES (NEW.user_id, NEW.inventaire_id, NEW.platform, NEW.id, now() + interval '2 minutes')
    ON CONFLICT (job_vendu) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'remise en vente non notée (job %) : % — vente poursuivie', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.cross_post_jobs_vendu_remise_en_vente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cross_post_jobs_vendu_remise_en_vente ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_vendu_remise_en_vente
  AFTER UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.status = 'sold' AND OLD.status IS DISTINCT FROM 'sold'
        AND NEW.inventaire_id IS NOT NULL
        AND COALESCE(NEW.action, 'publish') IN ('publish', 'republish'))
  EXECUTE FUNCTION public.cross_post_jobs_vendu_remise_en_vente();

-- ── Place restante du palier (une remise en vente = une republication) ──────
CREATE OR REPLACE FUNCTION public.remise_en_vente_place(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_palier text := COALESCE(republish_palier(p_user), 'free');
  v_minuit timestamptz := republish_minuit_local('Europe/Paris', now());
  v_plafond integer := republish_plafond_palier(v_palier);
  v_jour integer; v_quota integer; v_depuis timestamptz; v_faits integer;
BEGIN
  SELECT (SELECT count(*) FROM cross_post_jobs c
           WHERE c.user_id = p_user AND c.action = 'republish' AND c.status = 'published'
             AND c.published_at >= v_minuit)
       + (SELECT count(*) FROM remises_en_vente r
           WHERE r.user_id = p_user AND r.statut = 'faite' AND r.traite_le >= v_minuit)
    INTO v_jour;
  IF v_jour >= v_plafond THEN
    RETURN jsonb_build_object('place', false, 'motif', 'plafond_du_jour', 'palier', v_palier,
      'plafond', v_plafond, 'faits', v_jour, 'reprise', v_minuit + interval '1 day 5 minutes');
  END IF;
  IF v_palier = 'free' THEN
    SELECT value INTO v_quota FROM coin_config WHERE key = 'republication_avie_free';
    SELECT to_timestamp(value) INTO v_depuis FROM coin_config WHERE key = 'republication_avie_depuis';
  ELSIF v_palier IN ('premium', 'pro') THEN
    SELECT NULLIF(value, 0) INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    v_depuis := debut_cycle_quotas(p_user);
  END IF;
  IF v_quota IS NOT NULL AND v_depuis IS NOT NULL THEN
    SELECT (SELECT count(*) FROM cross_post_jobs c
             WHERE c.user_id = p_user AND c.action = 'republish' AND c.created_at >= v_depuis
               AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'opla_sortie'))
         + (SELECT count(*) FROM remises_en_vente r
             WHERE r.user_id = p_user AND r.statut = 'faite' AND r.traite_le >= v_depuis)
      INTO v_faits;
    IF v_faits >= v_quota THEN
      RETURN jsonb_build_object('place', false,
        'motif', CASE WHEN v_palier = 'free' THEN 'quota_a_vie' ELSE 'quota_du_mois' END,
        'palier', v_palier, 'plafond', v_quota, 'faits', v_faits,
        'reprise', CASE WHEN v_palier = 'free' THEN NULL ELSE now() + interval '1 day' END);
    END IF;
  END IF;
  RETURN jsonb_build_object('place', true, 'palier', v_palier, 'plafond', v_plafond, 'faits', v_jour);
END;
$function$;
REVOKE ALL ON FUNCTION public.remise_en_vente_place(uuid) FROM PUBLIC, anon, authenticated;

-- ── Les champs du formulaire, sans l'état d'exécution de l'ancien dépôt ─────
CREATE OR REPLACE FUNCTION public.remise_en_vente_champs(p_pf jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(p_pf) = 'object' THEN p_pf ELSE '{}'::jsonb END) e
   WHERE e.key !~ ('^(source|rattachement|check_|work_window|processing_since|veille_|quantite_ebay|'
     || 'last_diagnostic|unavailable|sale_|sold_|warnings|listing_url|lbc_depot|livraison_lbc|detected_price|'
     || 'beebs_moderation|beebs_valeurs_posees|beebs_index|beebs_rouvert|revue_|absence_|fin_ebay|reporte_|'
     || 'lien_|lien$|erreurs_|alerte_|numero_|vente|candidat_|needsUserAttempts|needsUserBoucle|'
     || 'needsUserField|needs_user|ebay_api|ebay_draft|ebay_format|ebay_connexion|ebayCategorieAttente|'
     || 'ebay_rayon_aveugle|moderation_|avant_|error_|retour_|preuve_|sequence_|opla_acces|opla_cookies|'
     || 'opla_sortie|publish_|derniere_|relance|pending_removal|retrait_|identifiant_|unfilled_|'
     || 'server_required|pas_de_rouge|attente_|lot_publication|suspect_|verdict_|stale_|reprise|'
     || 'rattrapage_|horloge_|plateforme_reprise|next_action|fige_|tache_|vinted_account_proof|gel_|'
     || 'remise_en_vente|republish|superseded|statut_reel|boucle|mur_|refus_|repare|requalif|'
     || 'reparation|titre_corrige|sonde_|compte_vendeur|build_min|correctif|verifier_doublon|'
     || 'new_listing|vinted_item_id|item_id|marque_traduite|colis_au_service|livraison_au_service)');
$function$;

-- ── Le traitement ───────────────────────────────────────────────────────────
-- p_user : un seul compte (essai réel sur le compte de Nico) ; NULL = tous.
DROP FUNCTION IF EXISTS public.remises_en_vente_tick(integer);
CREATE OR REPLACE FUNCTION public.remises_en_vente_tick(p_limite integer DEFAULT 20, p_user uuid DEFAULT NULL)
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
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

  FOR r IN
    SELECT * FROM remises_en_vente
     WHERE statut = 'a_faire' AND prochain_essai <= now()
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY prochain_essai
     LIMIT GREATEST(1, LEAST(p_limite, 50))
     FOR UPDATE SKIP LOCKED
  LOOP
    v_motif := NULL; v_report := NULL; v_nouveau := NULL;
    SELECT * INTO j FROM cross_post_jobs WHERE id = r.job_vendu;
    SELECT * INTO i FROM inventaire WHERE id = r.inventaire_id AND user_id = r.user_id;
    v_op := NULL;
    IF j.id IS NOT NULL AND NULLIF(j.platform_fields->>'vente_operation_cle', '') IS NOT NULL THEN
      SELECT o.resultat INTO v_op FROM ventes_operations o
       WHERE o.user_id = r.user_id AND o.cle = j.platform_fields->>'vente_operation_cle';
    END IF;

    IF j.id IS NULL OR j.status <> 'sold' THEN
      v_motif := 'annonce_plus_vendue';            -- vente annulée, job revenu
    ELSIF v_op IS NULL OR (v_op->>'ok') IS DISTINCT FROM 'true' THEN
      v_motif := 'vente_non_enregistree';          -- signal sans reçu : on ne sait pas
    ELSIF COALESCE(NULLIF(v_op->>'restant', '')::integer, 0) <= 0 THEN
      v_motif := 'plus_de_stock';                  -- dernière unité : rien à remettre
    ELSIF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
      v_motif := 'fiche_absente';
    ELSIF i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0 THEN
      v_motif := 'plus_de_stock';
    ELSIF r.platform NOT IN ('vinted', 'beebs', 'opla', 'leboncoin', 'ebay') THEN
      v_motif := 'plateforme_non_geree';
    ELSIF r.platform IN ('leboncoin', 'ebay')
      AND (COALESCE(j.platform_fields->>'source', '') = 'releve'
           OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true') THEN
      v_motif := 'annonce_importee_a_quantite';    -- peut rester en ligne avec son stock
    ELSIF r.platform = 'opla' AND COALESCE(v_sortie, 0) > 0 AND now() >= to_timestamp(v_sortie) THEN
      v_motif := 'opla_sortie';
    ELSIF COALESCE(v_prix, 0) > 0 THEN
      v_motif := 'publication_payante';            -- jamais de débit sans le geste de la personne
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
           AND COALESCE(a.vu_le, a.created_at) > COALESCE(j.sold_at, now()))
      OR (r.platform = 'vinted' AND i.vinted_item_id IS NOT NULL
          AND i.vinted_item_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
          AND i.disparu_le IS NULL AND COALESCE(i.vinted_status, 'active') NOT IN ('sold', 'closed')) THEN
      v_motif := 'deja_en_vente';
    -- Fiche jumelle encore en doute (« Est-ce le même article ? ») déjà en
    -- ligne sur la plateforme : même garde que spend_coins_and_publish
    -- (jumeau_en_ligne). Reportée : la personne peut trancher « deux articles ».
    ELSIF EXISTS (
        SELECT 1 FROM inventaire_doublons d
          JOIN inventaire t ON t.id = CASE WHEN d.garde = r.inventaire_id THEN d.absorbe ELSE d.garde END
         WHERE d.user_id = r.user_id AND d.statut = 'proposee' AND r.inventaire_id IN (d.garde, d.absorbe)
           AND (EXISTS (SELECT 1 FROM cross_post_jobs c
                         WHERE c.user_id = r.user_id AND c.inventaire_id = t.id AND c.platform = r.platform
                           AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
                           AND c.status IN ('pending', 'processing', 'needs_user', 'published'))
                OR (r.platform = 'vinted' AND t.vinted_item_id IS NOT NULL AND t.disparu_le IS NULL
                    AND COALESCE(t.vinted_status, 'active') NOT IN ('sold', 'closed')
                    AND COALESCE(t.statut, '') <> 'vendu'))) THEN
      v_motif := 'jumeau_en_ligne'; v_report := now() + interval '12 hours';
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
    IF v_motif IS NULL THEN
      v_place := remise_en_vente_place(r.user_id);
      IF (v_place->>'place') IS DISTINCT FROM 'true' THEN
        v_motif := v_place->>'motif';
        v_report := NULLIF(v_place->>'reprise', '')::timestamptz;
        IF v_report IS NULL THEN v_report := 'infinity'; END IF;  -- quota à vie : n'est plus tenté
      END IF;
    END IF;

    IF v_motif IS NULL THEN
      BEGIN
        INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                     title, description, price, photos, platform_fields)
        VALUES (r.user_id, r.inventaire_id, r.platform, 'pending', 'publish', COALESCE(j.photo_option, 'original'),
                j.title, j.description, j.price, j.photos,
                remise_en_vente_champs(j.platform_fields) || jsonb_build_object('remise_en_vente',
                  jsonb_build_object('apres_vente_job', j.id, 'annonce_vendue', NULLIF(btrim(j.platform_listing_id), ''),
                                     'vente', j.platform_fields->>'vente_operation_cle',
                                     'restant', (v_op->>'restant')::integer, 'le', now())))
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
        'restant', (v_op->>'restant')::integer));
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
                            'abandonnees', v_abandons, 'cpu', v_cpu);
END;
$function$;
REVOKE ALL ON FUNCTION public.remises_en_vente_tick(integer, uuid) FROM PUBLIC, anon, authenticated;

-- ── Les fiches déjà dans cet état : la même règle, amorcée ─────────────────
-- Dernière annonce vendue par (fiche, plateforme) dont le reçu laisse du
-- stock. Le tick tranche (doublon, plafond, quantité) exactement comme pour
-- une vente d'aujourd'hui.
INSERT INTO public.remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai)
SELECT DISTINCT ON (c.inventaire_id, c.platform) c.user_id, c.inventaire_id, c.platform, c.id, now()
  FROM public.cross_post_jobs c
  JOIN public.ventes_operations o ON o.user_id = c.user_id AND o.cle = c.platform_fields->>'vente_operation_cle'
 WHERE c.status = 'sold' AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
   AND c.inventaire_id IS NOT NULL
   AND (o.resultat->>'ok') = 'true' AND COALESCE(NULLIF(o.resultat->>'restant', '')::integer, 0) > 0
 ORDER BY c.inventaire_id, c.platform, c.sold_at DESC NULLS LAST
ON CONFLICT (job_vendu) DO NOTHING;

