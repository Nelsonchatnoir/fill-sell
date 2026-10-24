-- ESSAI À BLANC de 20261024200000 (transaction ANNULÉE) : plus de plafond de republication par jour.
BEGIN;
SET LOCAL statement_timeout = '300s';
CREATE TEMP TABLE _regl_avant ON COMMIT DROP AS
  SELECT p.id AS u, pf, public.republish_planifiee_reglage(p.id, pf) AS r
    FROM public.profiles p, unnest(public.republish_planifiee_plateformes()) pf
   WHERE jsonb_typeof(p.platform_settings #> ARRAY[pf, 'republish_planifiee']) = 'object';
CREATE TEMP TABLE _jobs_avant ON COMMIT DROP AS SELECT count(*) AS n FROM public.cross_post_jobs;
DO $verif$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.remise_en_vente_place(uuid)', '17ee8a806c22b673dbb11a0275516c53'),
    ('public.spend_coins_and_republish(bigint,text,text,numeric,text)', '8ec9609bd2c31e49cb76be7f41f713fa'),
    ('public.republish_planifiee_reglage(uuid,text)', '49dc8319fad5cf490e7184c0c4162ede'),
    ('public.republish_planifiee_regler(jsonb)', '3adf360a825c31963c67ea3e5c14ad75'),
    ('public.republish_planifiee_etat_multi()', '8940d12b822bece6702f78ace17e1915'),
    ('public.republish_planifiee_etat(text)', '36cfc9ac8a8c958e5066fba66f5ed78d'),
    ('public.republish_planifiee_sweep()', 'fcf45788e4eda3b5ae51521bc4a45f6d'),
    ('public.republish_plafond_palier(text)', '06140a741f55809217fbc6f23d8f19d2')) v(f, m) LOOP
    IF md5(pg_get_functiondef(r.f::regprocedure)) <> r.m THEN
      RAISE EXCEPTION '% a changé en prod depuis la lecture du 24/10 — ON S''ARRÊTE', r.f;
    END IF;
  END LOOP;
END
$verif$;

CREATE OR REPLACE FUNCTION public.remise_en_vente_place(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_palier text := COALESCE(republish_palier(p_user), 'free');
  v_quota integer; v_depuis timestamptz; v_faits integer;
  v_qfree jsonb;
BEGIN
  -- (24/10, décision de Nico) PLUS DE PLAFOND PAR JOUR, pour aucun palier : seule la limite du mois ferme la place.
  IF v_palier = 'free' THEN
    -- (05/10) 50 PAR MOIS : le compteur partagé ; épuisé, on reprend à la
    -- remise à zéro (jamais un abandon : le mois suivant rouvre la place).
    v_qfree := quota_republication_free_etat(p_user);
    IF (v_qfree ->> 'plafond') IS NOT NULL AND (v_qfree ->> 'restantes')::integer <= 0 THEN
      RETURN jsonb_build_object('place', false, 'motif', 'quota_du_mois',
        'palier', v_palier, 'plafond', (v_qfree ->> 'plafond')::integer,
        'faits', (v_qfree ->> 'faites')::integer,
        'reprise', GREATEST(COALESCE((v_qfree ->> 'remise_le')::timestamptz, now() + interval '1 day'),
                            now() + interval '1 hour'));
    END IF;
  ELSIF v_palier IN ('premium', 'pro') THEN
    SELECT NULLIF(value, 0) INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    v_depuis := debut_cycle_quotas(p_user);
  END IF;
  IF v_quota IS NOT NULL AND v_depuis IS NOT NULL THEN
    SELECT (SELECT count(*) FROM cross_post_jobs c
             WHERE c.user_id = p_user AND c.action = 'republish' AND c.created_at >= v_depuis
               AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota']))
         + (SELECT count(*) FROM remises_en_vente r
             WHERE r.user_id = p_user AND r.statut = 'faite' AND r.traite_le >= v_depuis)
      INTO v_faits;
    IF v_faits >= v_quota THEN
      RETURN jsonb_build_object('place', false,
        'motif', 'quota_du_mois',
        'palier', v_palier, 'plafond', v_quota, 'faits', v_faits,
        'reprise', now() + interval '1 day');
    END IF;
  END IF;
  RETURN jsonb_build_object('place', true, 'palier', v_palier);
END;
$function$;

CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(p_inventaire_id bigint, p_vinted_item_id text, p_source text DEFAULT 'manuel'::text, p_prix_republication numeric DEFAULT NULL::numeric, p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_platform text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer := 0;
  v_from_pur integer := 0;
  v_tier     text;
  v_prof     record;
  v_plafond  integer;
  v_faits    integer;
  v_qfree    jsonb;
  v_cycle    timestamptz;
  v_titre    text;
  v_prix     numeric;
  v_job_id   uuid;
  -- Voie planifiée (12/09)
  v_regl       jsonb;
  v_minuit     timestamptz;
  v_boutique   text;
  v_plafond_b  integer;
  v_faits_b    integer;
  -- Multiplateforme (17/09)
  v_multi      integer;
  v_min        integer;
  v_code       integer;
  v_statut     text;
  v_src        cross_post_jobs%ROWTYPE;
  v_pf_src     jsonb;
  v_photos_n   integer;
  -- 19/09 : les photos RÉELLEMENT redéposées (fiche article en repli du job
  -- source — cf. le bloc commenté plus bas).
  v_photos     jsonb;
  -- Multiplateforme automatique (18/09) : l'enveloppe de compte
  -- (17/10, Amiral 317adae1) le lien EXACT de l'annonce et son identifiant
  v_lid      text;
  v_url      text;
  v_url_ins  text;
  v_fiches_n integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  -- (02/10, sortie d'Opla) À partir de la bascule (interrupteur coin_config
  -- `opla_sortie_le`, secondes epoch ; 0 = sortie désactivée ; absente = le
  -- 10/10/2026 à 00:00 Paris, la même règle que _shared/opla-sortie.js), plus
  -- aucune republication Opla, pour personne : refusée ICI, avant toute
  -- écriture — aucun job, rien de compté. Avant la bascule : comme avant.
  IF v_platform = 'opla' AND COALESCE((SELECT value FROM coin_config WHERE key = 'opla_sortie_le'), 1791583200) > 0
     AND now() >= to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'opla_sortie_le'), 1791583200)) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'opla_arrete', 'platform', v_platform,
      'message', 'Opla n''est plus disponible dans FillSell.');
  END IF;
  IF v_platform NOT IN ('vinted', 'leboncoin', 'beebs', 'opla', 'depop') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_platform', 'platform', v_platform);
  END IF;
  IF v_platform = 'vinted' AND (v_item IS NULL OR v_item !~ '^\d+$') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item');
  END IF;
  IF p_source NOT IN ('manuel', 'auto') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_source');
  END IF;
  -- ── L'AUTO S'OUVRE AUX QUATRE PLATEFORMES (18/09) ─────────────────────────
  -- Ce qui la gardait Vinted-only n'était pas une limite technique : c'était
  -- « conçu, pas livré » (docs § 7 du 17/09). Le module planifié sait désormais
  -- nommer sa plateforme ; la porte devient donc l'interrupteur de CETTE
  -- plateforme, fail-closed (clé absente = fermée), et non plus le nom 'vinted'.
  IF p_source = 'auto' AND NOT republish_planifiee_pf_ouverte(v_platform) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plateforme_fermee', 'platform', v_platform);
  END IF;
  -- ── PAS D'AUTO PENDANT LA PAUSE ANTI-ROBOT VINTED (2026-09-27, ltouze) ────
  -- Vinted a mis le compte en vérification anti-robot (marqueur
  -- attente_antirobot_compte posé par get-pending-jobs) : une republication
  -- AUTOMATIQUE ou planifiée ne s'ajoute plus à la file tant que la pause
  -- tient — le créneau suivant la recréera. Une republication demandée par la
  -- personne ('manuel') n'est jamais refusée ici : elle attend son tour, et
  -- repart au rythme habituel à la levée. Rien n'est décompté sur ce refus.
  IF p_source = 'auto' AND v_platform = 'vinted' AND compte_en_pause_antirobot(v_user) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'pause_antirobot', 'platform', v_platform);
  END IF;
  IF p_prix_republication IS NOT NULL AND p_prix_republication < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_price');
  END IF;

  SELECT is_premium, is_pro, is_business, is_comped, extension_last_seen_at, extension_version,
         lang, platform_settings
  INTO v_prof FROM profiles WHERE id = v_user;

  IF v_prof.extension_last_seen_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. Nothing was used from your plan.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Rien n''a été décompté.'
      END);
  END IF;
  IF v_prof.extension_last_seen_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_stale',
      'derniere_activite', v_prof.extension_last_seen_at,
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Your FillSell extension hasn''t been seen for over a week. Open Chrome on your computer to wake it up, then try again. Nothing was used from your plan.'
        ELSE 'Ton extension FillSell ne s''est pas manifestée depuis plus d''une semaine. Ouvre Chrome sur ton ordinateur pour la réveiller, puis relance. Rien n''a été décompté.'
      END
    );
  END IF;

  IF version_cle(v_prof.extension_version) IS NULL
     OR version_cle(v_prof.extension_version) < version_cle('0.5.0') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  END IF;

  -- ── MULTIPLATEFORME (17/09) : porte, borne de build, source ────────────────
  IF v_platform <> 'vinted' THEN
    SELECT value INTO v_multi FROM coin_config WHERE key = 'republication_multi_ouverte';
    IF COALESCE(v_multi, 0) <> 1 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republication_multi_fermee', 'platform', v_platform);
    END IF;
    SELECT value INTO v_min FROM coin_config WHERE key = 'republication_multi_extension_min';
    v_min := COALESCE(v_min, 642);
    -- Même encodage que lbc_pro_extension_min / opla_extension_min :
    -- major×10000 + minor×100 + patch ; version illisible = 0.
    v_code := CASE
      WHEN v_prof.extension_version ~ '^\d+\.\d+\.\d+' THEN
        (split_part(v_prof.extension_version, '.', 1))::integer * 10000
        + (split_part(v_prof.extension_version, '.', 2))::integer * 100
        + (regexp_replace(split_part(v_prof.extension_version, '.', 3), '\D.*$', ''))::integer
      ELSE 0 END;
    IF v_min > 0 AND v_code < v_min THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                                'version', v_prof.extension_version, 'minimum', v_min, 'platform', v_platform);
    END IF;

    SELECT i.statut INTO v_statut FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
    IF v_statut IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item', 'platform', v_platform);
    END IF;
    IF v_statut = 'vendu' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_vendu', 'platform', v_platform);
    END IF;

    -- La source : le dernier dépôt FillSell EN LIGNE sur cette plateforme.
    SELECT j.* INTO v_src FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.inventaire_id = p_inventaire_id
      AND j.platform = v_platform AND j.action IN ('publish', 'republish')
      AND j.status = 'published' AND NULLIF(trim(j.listing_url), '') IS NOT NULL
    ORDER BY COALESCE(j.published_at, j.created_at) DESC
    LIMIT 1;
    IF v_src.id IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'annonce_introuvable', 'platform', v_platform);
    END IF;

    -- ── (17/10, Amiral 317adae1) UN JOB DE REPUBLICATION NAÎT AVEC LE LIEN EXACT DE
    --    SON ANNONCE ET UNE COPIE QUI DÉSIGNE LA MÊME — sinon refus, rien de décompté.
    -- Cas fondateur : la republication Leboncoin du 15/10 est née d'un dépôt dont le
    -- lien désignait une AUTRE annonce (retrouvé par le titre le 24/09 : celle de la
    -- fiche « Bleu et Blanc ») et le numéro la sienne ; elle a copié ce couple dans
    -- son lien ET dans sa copie, a été retenue « annonce partagée », puis a perdu sa
    -- copie. Le lien et le numéro sont ceux que la base tient pour exacts — la
    -- doctrine du déclencheur cross_post_jobs_lien_suit_identifiant (quand le lien et
    -- le numéro se contredisent, le lien suit le numéro), calculée ICI pour que la
    -- copie dise la même annonce que le job : le déclencheur ne réécrit que la
    -- colonne, jamais la copie.
    v_lid := COALESCE(NULLIF(btrim(v_src.platform_listing_id), ''), annonce_id_job(v_platform, v_src.listing_url));
    v_url := NULLIF(btrim(v_src.listing_url), '');
    IF NULLIF(btrim(v_src.platform_listing_id), '') IS NOT NULL AND annonce_id_job(v_platform, v_url) IS NOT NULL
       AND annonce_id_job(v_platform, v_url) <> v_lid THEN
      v_url := NULL;
      SELECT a.url INTO v_url
        FROM annonces_plateforme a
       WHERE a.user_id = v_user AND a.platform = v_platform AND a.listing_id = v_lid
         AND NULLIF(btrim(a.url), '') IS NOT NULL
       ORDER BY a.vu_le DESC NULLS LAST
       LIMIT 1;
    END IF;
    IF v_url IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'lien_annonce_incertain', 'cause', 'lien_inconnu',
        'platform', v_platform, 'annonce', v_lid,
        'message', 'Republication pas lancée : FillSell ne connaît pas le lien exact de ton annonce ' || initcap(v_platform)
          || '. Rien n''a été décompté, ton annonce est intacte. « Synchroniser » relit tes annonces.');
    END IF;
    -- Une annonce n'appartient jamais à deux fiches (15/10 soir) : désignée par un
    -- job d'une AUTRE fiche (fusions comprises), la cascade « annonce partagée »
    -- (rapprochement-ia) tranche d'abord ; la republication part ensuite.
    IF v_lid IS NOT NULL THEN
      SELECT count(DISTINCT COALESCE(i.fusionne_dans, i.id)) INTO v_fiches_n
        FROM cross_post_jobs o
        JOIN inventaire i ON i.id = o.inventaire_id
       WHERE o.user_id = v_user AND o.platform = v_platform AND o.inventaire_id IS NOT NULL
         AND o.status IN ('pending', 'processing', 'published', 'needs_user')
         AND (listing_designe(v_lid, o.listing_url, o.platform_listing_id)
              OR annonce_id_job(o.platform, o.listing_url) = v_lid);
      IF COALESCE(v_fiches_n, 0) > 1 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'lien_annonce_incertain', 'cause', 'annonce_partagee',
          'platform', v_platform, 'annonce', v_lid,
          'message', 'Republication pas lancée : cette annonce ' || initcap(v_platform) || ' est rattachée à deux articles. '
            || 'FillSell vérifie lequel la porte, puis la republication pourra partir. Rien n''a été décompté, ton annonce est intacte.');
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status IN ('pending', 'processing', 'needs_user')
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours', 'platform', v_platform);
    END IF;
    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status = 'published'
        AND j.published_at > now() - interval '24 hours'
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h', 'platform', v_platform);
    END IF;

    -- ── LES PHOTOS VIENNENT DE LA FICHE QUAND LE JOB SOURCE N'EN A PAS ──────
    -- (19/09/2026 — bug report louis@ttfamily.fr : « quelle que soit la
    -- plateforme : Sans photo, la republication ne peut pas aboutir ».)
    -- Cette branche comptait les photos du JOB SOURCE. Or un article IMPORTÉ
    -- par un relevé a bien son annonce en ligne et son listing_url — donc un
    -- job source trouvable — mais ce job est écrit par le relevé avec
    -- photos = NULL : le relevé recense des annonces, il ne rapatrie pas de
    -- photos dans le job. La fiche article, elle, EN A. Résultat : refus
    -- « Sans photo » sur un article qui en affiche cinq, et rien de
    -- republiable pour qui est arrivé par un relevé.
    -- La branche Vinted de cette même fonction lisait déjà inventaire.photos ;
    -- c'est la branche multiplateforme du 17/09 qui a divergé. On les aligne.
    -- Mesuré avant correctif : 210 annonces sur 13 comptes ont un job source
    -- sans photo, dont 209 avec des photos sur la fiche.
    --
    -- ⚠️ Le repli sert AUSSI à l'insert plus bas : garder v_src.photos là-bas
    -- aurait produit un job de republication à zéro photo, refusé par le
    -- handler au lieu de l'être ici — un échec déplacé, pas réparé.
    -- inventaire.photos coexiste en deux formes (chaînes nues du relevé et de
    -- la sync, objets {type,url} de nos pipelines) : on normalise en objets,
    -- ordre PRÉSERVÉ (la 1re photo reste la principale), entrées sans URL
    -- écartées.
    v_photos := CASE WHEN jsonb_typeof(v_src.photos) = 'array' AND jsonb_array_length(v_src.photos) > 0
                     THEN v_src.photos ELSE NULL END;
    IF v_photos IS NULL THEN
      SELECT COALESCE(jsonb_agg(
               CASE WHEN jsonb_typeof(a.val) = 'string'
                    THEN jsonb_build_object('url', a.val #>> '{}',
                           'type', CASE WHEN a.ord = 1 THEN 'original' ELSE 'photo_' || (a.ord - 1) END)
                    ELSE a.val END
               ORDER BY a.ord), '[]'::jsonb) INTO v_photos
      FROM inventaire i,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END)
              WITH ORDINALITY AS a(val, ord)
      WHERE i.id = p_inventaire_id AND i.user_id = v_user
        AND COALESCE(NULLIF(trim(CASE WHEN jsonb_typeof(a.val) = 'string'
                                      THEN a.val #>> '{}' ELSE a.val->>'url' END), ''), '') <> '';
    END IF;
    v_photos_n := CASE WHEN jsonb_typeof(v_photos) = 'array' THEN jsonb_array_length(v_photos) ELSE 0 END;
    IF v_photos_n = 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo', 'platform', v_platform);
    END IF;
  END IF;

  v_tier := palier_de(v_user);

  IF p_source = 'auto' THEN
    -- (1) L'auto RESTE RÉSERVÉE AU PRO (correction Nico 12/09 15h30 : l'ouverture
    -- aux abonnés de la 4/5 était une erreur d'orientation). Gate IDENTIQUE à
    -- celui d'avant la 4/5 ; code de refus inchangé.
    -- (05/10) « au moins Pro » par le palier unique (palier_au_moins) : un
    -- Business offert sans is_pro (ornellaracano) était refusé à chaque passage.
    IF NOT palier_au_moins(v_user, 'pro') THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'auto_reserve_pro');
    END IF;

    v_regl := republish_planifiee_reglage(v_user, v_platform);
    IF v_regl IS NOT NULL AND COALESCE((v_regl ->> 'actif')::boolean, false) THEN
      -- (2) VOIE PLANIFIÉE, PAR PLATEFORME. (24/10, décision de Nico) PLUS DE
      -- PLAFOND PAR JOUR NI D'ENVELOPPE DE COMPTE, pour aucun palier. Restent
      -- les nombres CHOISIS par la personne, s'il y en a (NULL = aucun) :
      --   a. le nombre par jour de CETTE plateforme, compté sur le jour LOCAL
      --      de SON fuseau ;
      --   b. le nombre par jour d'une boutique, sur Vinted.
      v_plafond := (v_regl ->> 'plafond_jour')::integer;
      v_minuit  := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));
      SELECT count(*) INTO v_faits
      FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish' AND platform = v_platform
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= v_minuit;
      IF v_plafond IS NOT NULL AND v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint',
                                  'plafond', v_plafond, 'platform', v_platform);
      END IF;

      IF v_platform = 'vinted' THEN
        SELECT NULLIF(trim(i.vinted_account_id), '') INTO v_boutique
        FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
        IF v_boutique IS NOT NULL THEN
          -- Le nombre de la boutique, sinon celui de la plateforme ; NULL = aucun.
          v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
          v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN v_plafond ELSE LEAST(GREATEST(1, v_plafond_b), v_plafond) END;
          SELECT count(*) INTO v_faits_b
          FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
          WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
            AND j.platform_fields->>'republish_source' = 'auto'
            AND j.created_at >= v_minuit
            AND i.vinted_account_id = v_boutique;
          IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_boutique_atteint',
                                      'plafond', v_plafond_b, 'boutique', v_boutique);
          END IF;
        END IF;
      END IF;
    ELSIF v_platform = 'vinted' THEN
      -- (3) VOIE HISTORIQUE, VINTED SEUL : l'ancien moteur republish_auto n'a
      -- jamais existé ailleurs. Le nombre par jour de son réglage
      -- (republish_auto.plafond_jour, 10 par défaut) ; (24/10, décision de Nico)
      -- plus de borne de 50 par jour.
      v_plafond := GREATEST(1, COALESCE(
        NULLIF(v_prof.platform_settings->'vinted'->'republish_auto'->>'plafond_jour', '')::integer, 10));
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= date_trunc('day', now());
      IF v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
      END IF;
    ELSE
      -- Auto demandée sur une plateforme dont le module n'est pas actif. Il n'y
      -- a pas de voie historique hors Vinted, et on n'en invente pas une : rien
      -- ne part, rien n'est débité.
      RETURN jsonb_build_object('allowed', false, 'reason', 'module_inactif', 'platform', v_platform);
    END IF;
  END IF;

  -- ── Bascule 02/09 : plafonds de republication par palier ─────────────────
  -- (toutes plateformes confondues : une republication est une republication)
  IF v_tier = 'free' THEN
    -- (05/10, décision Nico) 50 PAR MOIS (quota_republication_free), même
    -- cycle que quota_annonces_free. Le code de refus ne change pas : l'app
    -- ouvre la même modale ; il dit en plus la date de remise à zéro.
    v_qfree := quota_republication_free_etat(v_user);
    IF (v_qfree ->> 'plafond') IS NOT NULL AND (v_qfree ->> 'restantes')::integer <= 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_free',
                                'mode', 'mensuel',
                                'plafond', (v_qfree ->> 'plafond')::integer,
                                'faites', (v_qfree ->> 'faites')::integer, 'restantes', 0,
                                'remise_le', v_qfree -> 'remise_le');
    END IF;
  ELSIF v_tier IN ('premium', 'pro') THEN
    SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    IF v_plafond IS NOT NULL AND v_plafond > 0 THEN
      SELECT COALESCE(max(created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger WHERE user_id = v_user AND kind IN ('grant_monthly','grant_upgrade');
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish' AND created_at >= v_cycle
        AND NOT (COALESCE(platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota']);
      IF v_faits >= v_plafond THEN
        IF p_source = 'auto' THEN
          RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
        END IF;
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',
                                  'plafond', v_plafond, 'faites', v_faits);
      END IF;
    END IF;
  END IF;

  IF v_platform = 'vinted' THEN
    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform_fields->>'vinted_item_id' = v_item
        AND j.status IN ('pending', 'processing', 'needs_user')
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours');
    END IF;

    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform_fields->>'vinted_item_id' = v_item
        AND j.status = 'published'
        AND j.published_at > now() - interval '24 hours'
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM inventaire i
      WHERE i.id = p_inventaire_id AND i.user_id = v_user
        AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo');
    END IF;
  END IF;

  SELECT titre INTO v_titre FROM inventaire
  WHERE id = p_inventaire_id AND user_id = v_user;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      PERFORM upgrade_monthly_grant(v_user, v_tier, null, 'lazy');
      SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    END IF;
    IF v_wallet.included_balance + v_wallet.purchased_balance < v_price THEN
      -- `derniere_erreur` vit dans {vinted,republish_auto} : c'est le reglage de
      -- l'ANCIEN moteur Vinted, lu par les extensions 0.6.x. Une auto refusee
      -- sur Leboncoin n'a rien a y ecrire (18/09).
      IF p_source = 'auto' AND v_platform = 'vinted' THEN
        UPDATE profiles SET platform_settings = jsonb_set(
          COALESCE(platform_settings, '{}'::jsonb),
          '{vinted,republish_auto}',
          COALESCE(platform_settings #> '{vinted,republish_auto}', '{}'::jsonb)
            || jsonb_build_object(
                 'derniere_erreur', 'pepites_insuffisantes',
                 'derniere_erreur_le', now()::text),
          true)
        WHERE id = v_user;
      END IF;
      RETURN jsonb_build_object('allowed', false, 'reason', 'insufficient_coins',
        'price', v_price, 'balance', v_wallet.included_balance + v_wallet.purchased_balance);
    END IF;
    v_from_inc := LEAST(v_wallet.included_balance, v_price);
    v_from_pur := v_price - v_from_inc;
    UPDATE coin_wallets SET
      included_balance  = included_balance  - v_from_inc,
      purchased_balance = purchased_balance - v_from_pur,
      updated_at        = now()
    WHERE user_id = v_user;
  END IF;

  IF p_source = 'auto' AND v_platform = 'vinted'
     AND v_prof.platform_settings #> '{vinted,republish_auto}' ? 'derniere_erreur' THEN
    UPDATE profiles SET platform_settings = jsonb_set(
      platform_settings,
      '{vinted,republish_auto}',
      (platform_settings #> '{vinted,republish_auto}') - 'derniere_erreur' - 'derniere_erreur_le')
    WHERE id = v_user;
  END IF;

  v_prix := p_prix_republication;

  IF v_platform = 'vinted' THEN
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                 title, price, listing_url, platform_fields)
    VALUES (
      v_user, p_inventaire_id, 'vinted', 'republish', 'pending', 'original',
      v_titre, v_prix,
      'https://www.vinted.fr/items/' || v_item,
      jsonb_build_object(
        'republish_step', 'a_capturer',
        'vinted_item_id', v_item,
        'pepites_debitees', v_price,
        'republish_source', p_source
      )
      || CASE WHEN v_prix IS NOT NULL
              THEN jsonb_build_object('prix_republication', v_prix)
              ELSE '{}'::jsonb END
    ) RETURNING id INTO v_job_id;
  ELSE
    -- Copie du job source, clés transitoires retirées : tout ce qu'il faut pour
    -- redéposer, rien de ce qui racontait la vie du dépôt d'origine.
    v_pf_src := COALESCE(v_src.platform_fields, '{}'::jsonb)
      - ARRAY['needsUserField', 'needsUserFields', 'needsUserResolved', 'needsUserAttempts', 'needsUserBoucle',
              'boucle_needs_user', 'needs_user_tick_le', 'needs_user_source', 'processing_since', 'next_action_after',
              'stale_recoveries', 'attente_session', 'blocage_antirobot', 'porte_pro_lbc', 'erreurs_archivees',
              'work_window_state', 'last_diagnostic', 'lbc_depot', 'lbc_depot_non_finalise', 'depot_non_confirme_requalifie',
              'verifier_doublon_avant_publication', 'unavailable_since', 'unavailable_pending_since', 'sale_signal',
              'detected_price', 'removed_by_user', 'republished_pending', 'delete_trace', 'delete_confirmed_by',
              'delete_dry_run_trace', 'listing_url_abandon', 'retrait_attend_lien', 'removal_url_missing',
              'republish_step', 'republish_source', 'republish_snapshot', 'republish_platform', 'republish_source_job_id',
              'republish_recreation', 'recreated_at', 'deleted_at', 'deleted_at_client', 'deleted_at_serveur',
              'horloge_client_ecart_s', 'suppression_verdict', 'old_listing_url', 'old_platform_listing_id',
              'recreation_retries', 'pepites_debitees', 'pepite_remboursee', 'prix_republication', 'orphan_alerted_at',
              'deleted_hang_count', 'introuvable_indetermine', 'attente_boutique', 'republish_creneau_id',
              'republish_sweep_at', 'republish_moteur', 'republish_planifie', 'republish_prevol', 'republish_etat_reel'];
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                 title, description, price, photos, listing_url, platform_listing_id, platform_fields)
    VALUES (
      v_user, p_inventaire_id, v_platform, 'republish', 'pending', COALESCE(v_src.photo_option, 'original'),
      COALESCE(v_src.title, v_titre), v_src.description, COALESCE(v_prix, v_src.price), v_photos,
      v_url, v_src.platform_listing_id,
      v_pf_src || jsonb_build_object(
        'republish_step', 'a_capturer',
        'republish_source', p_source,
        'republish_platform', v_platform,
        'republish_source_job_id', v_src.id,
        'pepites_debitees', v_price,
        'republish_snapshot', jsonb_build_object(
          'version', 2,
          'plateforme', v_platform,
          'source_job_id', v_src.id,
          'titre', COALESCE(v_src.title, v_titre),
          'prix', COALESCE(v_prix, v_src.price),
          'listing_url', v_url,
          'platform_listing_id', v_src.platform_listing_id,
          'photos', v_photos_n,
          'captured_at', now())
      )
      || CASE WHEN v_prix IS NOT NULL
              THEN jsonb_build_object('prix_republication', v_prix)
              ELSE '{}'::jsonb END
    ) RETURNING id, listing_url INTO v_job_id, v_url_ins;
    -- Filet (17/10) : la ligne née porte le lien de sa copie — aucun déclencheur ne
    -- l'a changé : jamais un job dont le lien et la copie désignent deux annonces.
    IF v_url_ins IS DISTINCT FROM v_url THEN
      RAISE EXCEPTION 'lien_annonce_incertain : republication % née avec le lien % au lieu de %', v_job_id, v_url_ins, v_url;
    END IF;
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (v_user, -v_price,
            v_wallet.included_balance - v_from_inc,
            v_wallet.purchased_balance - v_from_pur,
            'spend_republish',
            jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id, 'platform', v_platform));
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object(
    'coins', v_price, 'vinted_item_id', v_item, 'source', p_source,
    'plan', v_tier, 'platform', v_platform
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id, 'platform', v_platform,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_reglage(p_user uuid, p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_brut jsonb; v_palier text;
  v_type text; v_de time; v_a time; v_fuseau text; v_jours integer[];
  v_plafond integer; v_age integer; v_ordre text; v_pb jsonb := '{}'::jsonb;
  v_k text; v_n integer; v_invalide text := NULL; v_actif boolean;
BEGIN
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN RETURN NULL; END IF;
  -- (09/10 soir) Depop : aucun réglage pour un compte où Depop n'est pas
  -- ouverte (depop_autorise) — le balayage ne crée donc jamais de créneau
  -- Depop refusé par la garde en base (depop_non_ouvert annulerait le passage).
  IF v_pf = 'depop' AND NOT public.depop_autorise(p_user) THEN RETURN NULL; END IF;

  SELECT p.platform_settings #> ARRAY[v_pf, 'republish_planifiee'] INTO v_brut
  FROM profiles p WHERE p.id = p_user;
  IF v_brut IS NULL OR jsonb_typeof(v_brut) <> 'object' THEN RETURN NULL; END IF;

  v_palier := republish_palier(p_user);
  -- Module = fonctionnalité PRO (correction Nico 12/09 15h30, 3bis) ; business
  -- porte is_pro (flags cumulatifs). Un non-Pro a un réglage INVALIDE.
  IF v_palier NOT IN ('pro', 'business') THEN v_invalide := 'palier'; END IF;
  -- (15/10, Louis) Une plateforme que FillSell a QUITTÉE (Opla, 10/10 :
  -- coin_config <pf>_sortie_le) n'est plus active nulle part, chez aucun
  -- compte : son réglage reste lisible, jamais actif (ni compté, ni servi).
  IF public.republish_planifiee_pf_sortie(v_pf) THEN v_invalide := 'plateforme_sortie'; END IF;

  -- Fuseau : validé par usage ; illisible → Europe/Paris (tout le parc).
  v_fuseau := COALESCE(NULLIF(v_brut ->> 'fuseau', ''), 'Europe/Paris');
  BEGIN
    PERFORM now() AT TIME ZONE v_fuseau;
  EXCEPTION WHEN OTHERS THEN v_fuseau := 'Europe/Paris';
  END;

  -- Créneau : les trois presets sont FIXES (la maquette) ; 'perso' lit de/a.
  v_type := COALESCE(v_brut ->> 'creneau', 'matin');
  CASE v_type
    WHEN 'matin' THEN v_de := '08:00'; v_a := '10:00';
    WHEN 'midi'  THEN v_de := '12:00'; v_a := '14:00';
    WHEN 'soir'  THEN v_de := '19:00'; v_a := '22:00';
    WHEN 'perso' THEN
      BEGIN
        v_de := (v_brut ->> 'de')::time; v_a := (v_brut ->> 'a')::time;
      EXCEPTION WHEN OTHERS THEN v_de := NULL; v_a := NULL;
      END;
      IF v_de IS NULL OR v_a IS NULL OR v_a <= v_de THEN v_invalide := COALESCE(v_invalide, 'creneau'); END IF;
    ELSE v_invalide := COALESCE(v_invalide, 'creneau');
  END CASE;

  IF v_brut ? 'jours' THEN
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::integer[]) INTO v_jours
    FROM (
      SELECT (e)::integer AS x
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_brut -> 'jours') = 'array' THEN v_brut -> 'jours' ELSE '[]'::jsonb END) e
      WHERE e ~ '^[1-7]$'
    ) s;
    IF cardinality(v_jours) = 0 THEN v_invalide := COALESCE(v_invalide, 'jours'); END IF;
  ELSE
    v_jours := ARRAY[1,2,3,4,5,6,7];
  END IF;

  -- Nombre par jour CHOISI par la personne : ≥ 1, aucun maximum ; absent = aucun.
  -- (24/10, décision de Nico : plus de plafond par jour du palier, plus
  --  d'enveloppe de compte.)
  BEGIN v_plafond := NULLIF(v_brut ->> 'plafond_jour', '')::integer; EXCEPTION WHEN OTHERS THEN v_plafond := NULL; END;
  v_plafond := CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(1, v_plafond) END;

  -- Ancienneté : PLANCHER 7 (anti-ban, 09/08, jamais rebaissé), plafond 365, défaut 30.
  BEGIN v_age := NULLIF(v_brut ->> 'age_jours', '')::integer; EXCEPTION WHEN OTHERS THEN v_age := NULL; END;
  v_age := LEAST(365, GREATEST(7, COALESCE(v_age, 30)));

  v_ordre := COALESCE(v_brut ->> 'ordre', 'anciennes');
  -- 'vues' n'a de sens que là où l'on relève des vues. Hors Vinted, le tri
  -- retombe sur 'anciennes' plutôt que de trier sur du vide.
  IF v_ordre NOT IN ('anciennes', 'prix', 'vues') THEN v_ordre := 'anciennes'; END IF;
  IF v_ordre = 'vues' AND v_pf <> 'vinted' THEN v_ordre := 'anciennes'; END IF;

  -- Plafond par boutique : notion VINTED (vinted_account_id). Les autres
  -- plateformes n'ont pas de boutique relevée : objet vide, jamais inventé.
  IF v_pf = 'vinted' AND jsonb_typeof(v_brut -> 'plafond_boutique') = 'object' THEN
    FOR v_k IN SELECT jsonb_object_keys(v_brut -> 'plafond_boutique') LOOP
      BEGIN v_n := (v_brut -> 'plafond_boutique' ->> v_k)::integer; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
      IF v_n IS NOT NULL THEN
        v_pb := v_pb || jsonb_build_object(v_k, LEAST(v_plafond, GREATEST(1, v_n)));
      END IF;
    END LOOP;
  END IF;

  v_actif := COALESCE((v_brut ->> 'actif')::boolean, false) AND v_invalide IS NULL;

  RETURN jsonb_build_object(
    'platform', v_pf,
    'actif', v_actif,
    'invalide', v_invalide,
    'palier', v_palier,
    'creneau', v_type,
    'de', to_char(v_de, 'HH24:MI'),
    'a', to_char(v_a, 'HH24:MI'),
    'fuseau', v_fuseau,
    'jours', to_jsonb(v_jours),
    'plafond_jour', v_plafond,
    'plafond_boutique', v_pb,
    'age_jours', v_age,
    'ordre', v_ordre,
    'active_le', v_brut ->> 'active_le',
    'arrete_le', v_brut ->> 'arrete_le',
    'arret_motif', v_brut ->> 'arret_motif',
    'palier_perdu_le', v_brut ->> 'palier_perdu_le',
    'pause_generale', COALESCE((v_brut ->> 'pause_generale')::boolean, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_regler(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text := lower(COALESCE(NULLIF(trim(p ->> 'platform'), ''), 'vinted'));
  v_palier text;
  v_ps jsonb; v_cur jsonb; v_new jsonb; v_legacy jsonb;
  v_type text; v_de time; v_a time; v_fuseau text; v_jours integer[];
  v_plafond integer; v_age integer; v_ordre text; v_pb jsonb := '{}'::jsonb;
  v_k text; v_n integer; v_actif_avant boolean; v_actif boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform', 'platform', v_pf);
  END IF;
  -- (09/10 soir) Depop : réglable seulement là où elle est ouverte.
  IF v_pf = 'depop' AND NOT public.depop_autorise(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'depop_non_ouvert', 'platform', v_pf);
  END IF;
  v_palier := republish_palier(v_user);
  IF v_palier NOT IN ('pro', 'business') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auto_reserve_pro');
  END IF;

  SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_user FOR UPDATE;
  v_cur := COALESCE(v_ps #> ARRAY[v_pf, 'republish_planifiee'], '{}'::jsonb);
  IF jsonb_typeof(v_cur) <> 'object' THEN v_cur := '{}'::jsonb; END IF;
  v_new := (v_cur || COALESCE(p, '{}'::jsonb)) - 'platform';
  v_actif_avant := COALESCE((v_cur ->> 'actif')::boolean, false);

  v_type := COALESCE(v_new ->> 'creneau', 'matin');
  IF v_type NOT IN ('matin', 'midi', 'soir', 'perso') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'creneau_invalide');
  END IF;
  IF v_type = 'perso' THEN
    BEGIN
      v_de := (v_new ->> 'de')::time; v_a := (v_new ->> 'a')::time;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'creneau_invalide');
    END;
    IF v_de IS NULL OR v_a IS NULL OR v_a <= v_de THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'creneau_invalide');
    END IF;
  ELSE
    v_de := CASE v_type WHEN 'matin' THEN '08:00'::time WHEN 'midi' THEN '12:00'::time ELSE '19:00'::time END;
    v_a  := CASE v_type WHEN 'matin' THEN '10:00'::time WHEN 'midi' THEN '14:00'::time ELSE '22:00'::time END;
  END IF;
  v_new := v_new || jsonb_build_object('creneau', v_type, 'de', to_char(v_de, 'HH24:MI'), 'a', to_char(v_a, 'HH24:MI'));

  v_fuseau := COALESCE(NULLIF(v_new ->> 'fuseau', ''), 'Europe/Paris');
  BEGIN
    PERFORM now() AT TIME ZONE v_fuseau;
  EXCEPTION WHEN OTHERS THEN v_fuseau := 'Europe/Paris';
  END;
  v_new := v_new || jsonb_build_object('fuseau', v_fuseau);

  IF v_new ? 'jours' THEN
    SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::integer[]) INTO v_jours
    FROM (
      SELECT (e)::integer AS x
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_new -> 'jours') = 'array' THEN v_new -> 'jours' ELSE '[]'::jsonb END) e
      WHERE e ~ '^[1-7]$'
    ) s;
    IF cardinality(v_jours) = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'jours_invalides'); END IF;
  ELSE
    v_jours := ARRAY[1,2,3,4,5,6,7];
  END IF;
  v_new := v_new || jsonb_build_object('jours', to_jsonb(v_jours));

  BEGIN v_plafond := NULLIF(v_new ->> 'plafond_jour', '')::integer; EXCEPTION WHEN OTHERS THEN v_plafond := NULL; END;
  -- (24/10, décision de Nico) Nombre par jour CHOISI : ≥ 1, aucun maximum ; vide = aucun.
  v_plafond := CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(1, v_plafond) END;
  BEGIN v_age := NULLIF(v_new ->> 'age_jours', '')::integer; EXCEPTION WHEN OTHERS THEN v_age := NULL; END;
  v_age := LEAST(365, GREATEST(7, COALESCE(v_age, 30)));
  v_ordre := COALESCE(v_new ->> 'ordre', 'anciennes');
  IF v_ordre NOT IN ('anciennes', 'prix', 'vues') THEN v_ordre := 'anciennes'; END IF;
  IF v_ordre = 'vues' AND v_pf <> 'vinted' THEN v_ordre := 'anciennes'; END IF;
  IF v_pf = 'vinted' AND jsonb_typeof(v_new -> 'plafond_boutique') = 'object' THEN
    FOR v_k IN SELECT jsonb_object_keys(v_new -> 'plafond_boutique') LOOP
      BEGIN v_n := (v_new -> 'plafond_boutique' ->> v_k)::integer; EXCEPTION WHEN OTHERS THEN v_n := NULL; END;
      IF v_n IS NOT NULL THEN v_pb := v_pb || jsonb_build_object(v_k, LEAST(v_plafond, GREATEST(1, v_n))); END IF;
    END LOOP;
  END IF;
  v_new := v_new || jsonb_build_object('plafond_jour', v_plafond, 'age_jours', v_age, 'ordre', v_ordre, 'plafond_boutique', v_pb);

  -- Activation / arrêt : horodatés, motif écrit. Un geste de l'utilisateur
  -- efface la mémoire d'une pause générale et d'un palier perdu.
  v_actif := COALESCE((v_new ->> 'actif')::boolean, false);
  -- (15/10, Louis) Une plateforme que FillSell a quittée (Opla) ne se rallume
  -- plus ; l'arrêter reste permis.
  IF v_actif AND public.republish_planifiee_pf_sortie(v_pf) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plateforme_sortie', 'platform', v_pf);
  END IF;
  IF v_actif AND NOT v_actif_avant THEN
    v_new := v_new || jsonb_build_object('active_le', now(), 'arrete_le', NULL, 'arret_motif', NULL);
    v_new := v_new - 'pause_generale' - 'palier_perdu_le';
  ELSIF NOT v_actif AND v_actif_avant THEN
    v_new := v_new || jsonb_build_object('arrete_le', now(), 'arret_motif', COALESCE(p ->> 'arret_motif', 'utilisateur'));
    IF COALESCE(p ->> 'arret_motif', 'utilisateur') <> 'pause_generale' THEN v_new := v_new - 'pause_generale'; END IF;
  END IF;
  v_new := v_new || jsonb_build_object('actif', v_actif);

  -- BASCULE : le module Vinted actif coupe l'ancien moteur (client + sweep
  -- témoin), qui n'a jamais concerné que Vinted.
  v_ps := jsonb_set(v_ps, ARRAY[v_pf], COALESCE(v_ps -> v_pf, '{}'::jsonb), true);
  v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_new, true);
  IF v_actif AND v_pf = 'vinted' THEN
    v_legacy := v_ps #> '{vinted,republish_auto}';
    IF v_legacy IS NOT NULL AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN
      v_ps := jsonb_set(v_ps, '{vinted,republish_auto}',
        v_legacy || jsonb_build_object('actif', false, 'arrete_le', now(), 'arret_motif', 'bascule_planifiee'), true);
    END IF;
  END IF;
  UPDATE profiles SET platform_settings = v_ps WHERE id = v_user;

  RETURN jsonb_build_object('ok', true) || republish_planifiee_etat(v_pf);
END;
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_etat_multi()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text; v_etat jsonb; v_liste jsonb := '[]'::jsonb;
  v_palier text; v_actives integer := 0;
  v_minuit timestamptz; v_crees integer; v_global integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  v_palier := republish_palier(v_user);
  SELECT value INTO v_global FROM coin_config WHERE key = 'republish_planifiee_actif';
  v_minuit := republish_minuit_local('Europe/Paris');
  SELECT count(*) INTO v_crees FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish'
    AND j.platform_fields ->> 'republish_source' = 'auto' AND j.created_at >= v_minuit;

  FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
    v_etat := republish_planifiee_etat(v_pf);
    IF COALESCE((v_etat ->> 'actif')::boolean, false) THEN v_actives := v_actives + 1; END IF;
    v_liste := v_liste || v_etat;
  END LOOP;

  RETURN jsonb_build_object(
    'palier', v_palier,
    'autorise', v_palier IN ('pro', 'business'),
    'interrupteur_global', COALESCE(v_global, 0),
    'actives', v_actives,
    -- (24/10, décision de Nico) plus d'enveloppe de compte : le décompte du jour seulement.
    'enveloppe', jsonb_build_object('crees_compte', v_crees),
    'plateformes', v_liste);
END;
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_etat(p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_regl jsonb; v_fen jsonb; v_esp jsonb; v_legacy jsonb;
  v_palier text;
  v_quota integer; v_cycle timestamptz; v_faits_mois integer;
  v_fuseau text; v_minuit timestamptz;
  v_crees_pf integer; v_abouties_pf integer; v_crees_compte integer; v_crees_total integer;
  v_ident jsonb; v_boutique text; v_boutiques jsonb; v_multi boolean;
  v_elig_total integer; v_elig_boutique integer; v_exclus jsonb; v_par_boutique jsonb;
  v_duree integer; v_capacite integer; v_restants integer; v_attendu integer; v_borne text;
  v_plafond_b integer; v_faits_b integer; v_restants_b integer;
  v_jour_prochain boolean;
  v_courant jsonb; v_dernier jsonb;
  v_faites_live integer; v_blocage jsonb; v_disjoncteur jsonb;
  v_ouverte boolean; v_en_ligne integer;
  v_cr republish_creneaux%ROWTYPE; v_faits_cr integer; v_debut_ryt timestamptz; v_prev_ryt integer;
  v_intervalle numeric; v_source_capacite text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT (v_pf = ANY (republish_planifiee_plateformes())) THEN
    RETURN jsonb_build_object('error', 'invalid_platform', 'platform', v_pf);
  END IF;

  v_palier := republish_palier(v_user);
  v_regl := republish_planifiee_reglage(v_user, v_pf);
  v_ouverte := republish_planifiee_pf_ouverte(v_pf);
  v_en_ligne := republish_planifiee_annonces_en_ligne(v_user, v_pf);
  SELECT p.platform_settings #> '{vinted,republish_auto}' INTO v_legacy FROM profiles p WHERE p.id = v_user;

  -- Quota mensuel : même définition que le RPC (cycle = dernier grant), COMMUN
  -- à toutes les plateformes — une republication est une republication.
  IF v_palier IN ('premium', 'pro') THEN
    SELECT value INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    IF v_quota IS NOT NULL AND v_quota > 0 THEN
      SELECT COALESCE(max(l.created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger l WHERE l.user_id = v_user AND l.kind IN ('grant_monthly', 'grant_upgrade');
      SELECT count(*) INTO v_faits_mois FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_cycle;
    ELSE
      v_quota := NULL;
    END IF;
  END IF;

  v_fuseau := COALESCE(v_regl ->> 'fuseau', 'Europe/Paris');
  v_minuit := republish_minuit_local(v_fuseau);
  -- Trois compteurs du jour : CETTE plateforme, le COMPTE (l'enveloppe), et le
  -- total manuel + auto (affichage).
  SELECT count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto'),
         count(*) FILTER (WHERE j.platform = v_pf AND j.platform_fields ->> 'republish_source' = 'auto' AND j.status = 'published'),
         count(*) FILTER (WHERE j.platform_fields ->> 'republish_source' = 'auto'),
         count(*)
  INTO v_crees_pf, v_abouties_pf, v_crees_compte, v_crees_total
  FROM cross_post_jobs j
  WHERE j.user_id = v_user AND j.action = 'republish' AND j.created_at >= v_minuit;

  IF v_pf = 'vinted' THEN
    v_ident := republish_boutique_connectee(v_user);
    v_boutique := v_ident ->> 'user_id';
    v_boutiques := republish_boutiques(v_user);
    v_multi := jsonb_array_length(v_boutiques) >= 2;
  ELSE
    v_ident := NULL; v_boutique := NULL; v_boutiques := '[]'::jsonb; v_multi := false;
  END IF;

  -- Pas de réglage (ou réglage sans droit) : l'app propose l'activation.
  IF v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false) THEN
    RETURN jsonb_build_object(
      'platform', v_pf,
      'actif', false,
      'configure', v_regl IS NOT NULL,
      'ouverte', v_ouverte,
      'annonces_en_ligne', v_en_ligne,
      'reglage', v_regl,
      'palier', v_palier,
      'autorise', v_palier IN ('pro', 'business'),
      'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
      'aujourdhui', jsonb_build_object(
        'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
        'crees_compte', v_crees_compte, 'crees_total', v_crees_total),
      'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
      'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
      'moteur', CASE WHEN v_pf = 'vinted' AND COALESCE((v_legacy ->> 'actif')::boolean, false) THEN 'legacy' ELSE 'aucun' END
    );
  END IF;

  v_fen := republish_planifiee_fenetre(v_regl, now());
  v_esp := republish_planifiee_espacement(v_user, v_pf);

  WITH cand AS MATERIALIZED (
    SELECT c.boutique, c.motif FROM republish_planifiee_candidats(v_user, v_regl, v_pf) c
  )
  SELECT (SELECT count(*) FROM cand WHERE motif IS NULL),
         (SELECT count(*) FROM cand WHERE motif IS NULL AND (boutique IS NULL OR boutique = v_boutique)),
         (SELECT COALESCE(jsonb_object_agg(x.m, x.n), '{}'::jsonb)
            FROM (SELECT motif AS m, count(*) AS n FROM cand WHERE motif IS NOT NULL GROUP BY motif) x),
         (SELECT COALESCE(jsonb_object_agg(COALESCE(x.b, ''), x.n), '{}'::jsonb)
            FROM (SELECT boutique AS b, count(*) AS n FROM cand WHERE motif IS NULL GROUP BY boutique) x)
  INTO v_elig_total, v_elig_boutique, v_exclus, v_par_boutique;

  -- « Ce dressing n'a pas été servi depuis X jours » : avec une ligne par
  -- boutique, la dernière fois qu'une boutique a été servie est lisible —
  -- max(debut) de SES créneaux. Avant la clé par boutique, ce chiffre
  -- n'existait pas : toutes les lignes portaient la première boutique vue.
  IF jsonb_array_length(v_boutiques) > 0 THEN
    SELECT COALESCE(jsonb_agg(b || jsonb_build_object(
             'vu_le', (SELECT max(r.debut) FROM republish_creneaux r
                        WHERE r.user_id = v_user AND r.platform = v_pf
                          AND r.boutique = b ->> 'user_id'),
             'eligibles', COALESCE((v_par_boutique ->> (b ->> 'user_id'))::integer, 0),
             'connectee', (b ->> 'user_id') IS NOT DISTINCT FROM v_boutique)
           ORDER BY o), '[]'::jsonb)
    INTO v_boutiques
    FROM jsonb_array_elements(v_boutiques) WITH ORDINALITY AS t(b, o);
  END IF;

  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer;
    v_jour_prochain := false;
  ELSIF (v_fen ->> 'prochain_debut') IS NOT NULL THEN
    v_duree := extract(epoch FROM ((v_fen ->> 'prochain_fin')::timestamptz - (v_fen ->> 'prochain_debut')::timestamptz))::integer;
    v_jour_prochain := ((v_fen ->> 'prochain_debut')::timestamptz AT TIME ZONE v_fuseau)::date <> (now() AT TIME ZONE v_fuseau)::date;
  ELSE
    v_duree := 0; v_jour_prochain := true;
  END IF;
  -- (11/10, Louis — « D'ici 17h, ce créneau permet jusqu'à 0 republication »
  -- alors que le balayage en prévoyait d'autres) La capacité annoncée est CE
  -- QUE LE BALAYAGE FERA : créneau en cours dont la ligne suit le réglage →
  -- ses prévues restantes, bornées par le temps qui reste à son rythme ;
  -- sinon le calcul que le balayage fait à la création de la ligne (part
  -- égale entre les plateformes actives, espacement réel). L'ancienne
  -- « capacité partagée » retirait le temps réservé par les autres
  -- plateformes : un autre calcul que celui du balayage, donc un autre chiffre.
  v_source_capacite := 'creation';
  IF COALESCE((v_fen ->> 'dans_creneau')::boolean, false) THEN
    SELECT r.* INTO v_cr FROM republish_creneaux r
    WHERE r.user_id = v_user AND r.platform = v_pf
      AND r.debut = (v_fen ->> 'courant_debut')::timestamptz
      AND COALESCE(r.boutique, '') = COALESCE(v_boutique, '')
    LIMIT 1;
    IF v_cr.id IS NOT NULL AND v_cr.statut = 'en_cours'
       AND v_cr.fin = (v_fen ->> 'courant_fin')::timestamptz THEN
      SELECT count(*) INTO v_faits_cr FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_cr.id::text;
      v_debut_ryt := COALESCE(NULLIF(v_cr.sautes -> '_reglage_change' ->> 'depuis', '')::timestamptz, v_cr.debut);
      v_prev_ryt := COALESCE(v_cr.prevues, 1)
                    - CASE WHEN v_cr.sautes ? '_reglage_change'
                           THEN COALESCE((v_cr.sautes -> '_reglage_change' ->> 'faites_avant')::integer, 0) ELSE 0 END;
      v_intervalle := GREATEST(60, extract(epoch FROM (v_cr.fin - v_debut_ryt)) / GREATEST(1, v_prev_ryt));
      v_capacite := LEAST(GREATEST(0, COALESCE(v_cr.prevues, 0) - v_faits_cr),
                          GREATEST(0, ceil(GREATEST(0, v_duree) / v_intervalle))::integer);
      v_source_capacite := 'creneau_en_cours';
    END IF;
  END IF;
  IF v_source_capacite = 'creation' THEN
    v_capacite := republish_planifiee_capacite(
      GREATEST(60, GREATEST(0, v_duree) / GREATEST(1, republish_planifiee_actives_eligibles(v_user)))::integer,
      (v_esp ->> 'sec')::integer);
    IF COALESCE(v_duree, 0) <= 0 THEN v_capacite := 0; END IF;
  END IF;

  -- (24/10, décision de Nico) Plus de plafond du palier ni d'enveloppe de compte :
  -- seul le nombre par jour CHOISI pour cette plateforme borne, s'il y en a un
  -- (NULL = aucun : LEAST l'ignore plus bas).
  v_restants := CASE WHEN (v_regl ->> 'plafond_jour') IS NULL THEN NULL
                     WHEN v_jour_prochain THEN (v_regl ->> 'plafond_jour')::integer
                     ELSE GREATEST(0, (v_regl ->> 'plafond_jour')::integer - v_crees_pf) END;

  IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
    v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
    v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN (v_regl ->> 'plafond_jour')::integer
                        ELSE LEAST(GREATEST(1, v_plafond_b), (v_regl ->> 'plafond_jour')::integer) END;
    SELECT count(*) INTO v_faits_b
    FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
      AND j.platform_fields ->> 'republish_source' = 'auto'
      AND j.created_at >= v_minuit
      AND i.vinted_account_id = v_boutique;
    v_restants_b := CASE WHEN v_plafond_b IS NULL THEN NULL
                         WHEN v_jour_prochain THEN v_plafond_b ELSE GREATEST(0, v_plafond_b - v_faits_b) END;
    v_restants := LEAST(v_restants, v_restants_b);
  END IF;

  v_attendu := LEAST(v_restants,
                     CASE WHEN v_multi AND v_boutique IS NOT NULL THEN v_elig_boutique ELSE v_elig_total END,
                     v_capacite);
  -- L'interrupteur de la plateforme : à 0, rien ne part.
  IF NOT v_ouverte THEN v_attendu := 0; END IF;
  v_borne := CASE
    WHEN NOT v_ouverte THEN 'plateforme_fermee'
    WHEN v_attendu = v_restants THEN 'plafond'
    WHEN v_attendu = v_capacite THEN 'creneau'
    ELSE 'eligibles' END;

  -- Une ligne par boutique : l'écran montre CELLE de la boutique connectée.
  -- Boutique inconnue → la plus récente, comme avant.
  SELECT to_jsonb(r) INTO v_courant FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut = 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  SELECT to_jsonb(r) INTO v_dernier FROM republish_creneaux r
  WHERE r.user_id = v_user AND r.platform = v_pf AND r.statut <> 'en_cours'
    AND (v_boutique IS NULL OR r.boutique IS NULL OR r.boutique = v_boutique)
  ORDER BY (r.boutique IS NOT DISTINCT FROM v_boutique) DESC, r.debut DESC LIMIT 1;
  IF v_courant IS NOT NULL THEN
    SELECT count(*) INTO v_faites_live FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.action = 'republish' AND j.status = 'published'
      AND j.platform_fields ->> 'republish_creneau_id' = (v_courant ->> 'id');
    v_blocage := v_courant -> 'sautes' -> '_bloque_en_vol';
    IF v_blocage IS NOT NULL AND (v_blocage ? 'leve_le') THEN v_blocage := NULL; END IF;
    v_disjoncteur := v_courant -> 'sautes' -> '_disjoncteur';
  END IF;

  RETURN jsonb_build_object(
    'platform', v_pf,
    'actif', true,
    'configure', true,
    'ouverte', v_ouverte,
    'annonces_en_ligne', v_en_ligne,
    'reglage', v_regl,
    'palier', v_palier,
    'autorise', true,
    'quota_mensuel', v_quota, 'faits_mois', v_faits_mois,
    'fenetre', v_fen,
    'aujourdhui', jsonb_build_object(
      'minuit', v_minuit, 'crees_auto', v_crees_pf, 'abouties_auto', v_abouties_pf,
      'crees_compte', v_crees_compte, 'crees_total', v_crees_total,
      'plafond_jour', (v_regl ->> 'plafond_jour')::integer, 'restants', v_restants,
      'plafond_boutique', v_plafond_b, 'crees_boutique', v_faits_b, 'restants_boutique', v_restants_b),
    'eligibles', jsonb_build_object('total', v_elig_total, 'boutique_connectee', v_elig_boutique,
                                    'par_boutique', v_par_boutique, 'exclus', v_exclus),
    'espacement', v_esp,
    'capacite', v_capacite, 'capacite_source', v_source_capacite, 'duree_sec', v_duree,
    'attendu', v_attendu, 'borne', v_borne,
    'boutiques', v_boutiques, 'boutique_connectee', v_ident, 'multi_boutiques', v_multi,
    'creneau_courant', v_courant, 'dernier_creneau', v_dernier,
    'faites_live', COALESCE(v_faites_live, 0), 'blocage', v_blocage, 'disjoncteur', v_disjoncteur,
    'legacy', CASE WHEN v_pf = 'vinted' THEN v_legacy ELSE NULL END,
    'moteur', 'planifie'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.republish_planifiee_sweep()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actif      integer;
  v_compte     record;
  v_pf         text;
  v_regl       jsonb;
  v_fen        jsonb;
  v_row        republish_creneaux%ROWTYPE;
  v_ident      jsonb;
  v_boutique   text;
  v_multi      boolean;
  v_esp        jsonb;
  v_capacite   integer;
  v_elig       integer;
  v_prevues    integer;
  v_minuit     timestamptz;
  v_plafond    integer;
  v_faits      integer;
  v_plafond_b  integer;
  v_faits_b    integer;
  v_intervalle numeric;
  v_dernier    timestamptz;
  v_cand       record;
  v_cle        text;
  v_notes      jsonb;
  v_rpc        jsonb;
  v_reason     text;
  v_job        uuid;
  v_examines   integer;
  v_rapport    jsonb := '[]'::jsonb;
  v_ligne      jsonb;
  v_comptes    integer := 0;
  v_hors_ligne integer;
  v_mobiles    integer;
  v_parques    integer;
  v_bloque     jsonb;
  v_faits_cr   integer;
  -- 18/09 : multiplateforme
  v_palier     text;
  v_cree       boolean;
  v_grace      integer;
  v_perdu      timestamptz;
  v_ps         jsonb;
  v_cur        jsonb;
  v_disj_n     integer;
  v_disj_max   integer;
  v_j          record;
  v_duree      integer;  -- (08/10, Louis) durée estimée d'une republication
  v_fin_regl   timestamptz;  -- (11/10, Louis) fin du créneau selon le RÉGLAGE courant
  v_debut_ryt  timestamptz;  -- (11/10) départ du rythme (réalignement compris)
  v_prev_ryt   integer;      -- (11/10) prévues comptées depuis ce départ
  v_portee     text;         -- (12/10, A4) portée d'un échec : compte | article
BEGIN
  SELECT value INTO v_actif FROM coin_config WHERE key = 'republish_planifiee_actif';
  IF COALESCE(v_actif, 0) <> 1 THEN
    RETURN jsonb_build_object('actif', false, 'comptes', 0, 'crees', 0,
      'motif', 'interrupteur coin_config.republish_planifiee_actif <> 1');
  END IF;
  SELECT value INTO v_disj_max FROM coin_config WHERE key = 'republish_disjoncteur_echecs';
  v_disj_max := GREATEST(1, COALESCE(v_disj_max, 2));
  SELECT value INTO v_grace FROM coin_config WHERE key = 'republish_palier_perdu_grace_h';
  v_grace := GREATEST(1, COALESCE(v_grace, 48));

  -- Les comptes qui ont AU MOINS UNE plateforme active.
  FOR v_compte IN
    SELECT p.id, p.email, p.extension_last_seen_at
    FROM profiles p
    WHERE EXISTS (
      SELECT 1 FROM unnest(republish_planifiee_plateformes()) pf
      WHERE COALESCE((p.platform_settings #> ARRAY[pf, 'republish_planifiee'] ->> 'actif')::boolean, false)
    )
    ORDER BY p.id
  LOOP
    v_comptes := v_comptes + 1;
    v_cree := false;

    -- 0. LE DROIT. Un compte actif sans palier Pro : on pose la date, puis on
    -- arrête au-delà de la grâce — une seule fois, pour les quatre.
    v_palier := republish_palier(v_compte.id);
    IF v_palier NOT IN ('pro', 'business') THEN
      SELECT COALESCE(p2.platform_settings, '{}'::jsonb) INTO v_ps FROM profiles p2 WHERE p2.id = v_compte.id FOR UPDATE;
      FOREACH v_pf IN ARRAY republish_planifiee_plateformes() LOOP
        v_cur := v_ps #> ARRAY[v_pf, 'republish_planifiee'];
        CONTINUE WHEN v_cur IS NULL OR jsonb_typeof(v_cur) <> 'object'
                   OR NOT COALESCE((v_cur ->> 'actif')::boolean, false);
        v_perdu := NULLIF(v_cur ->> 'palier_perdu_le', '')::timestamptz;
        IF v_perdu IS NULL THEN
          v_cur := v_cur || jsonb_build_object('palier_perdu_le', now());
        ELSIF v_perdu < now() - make_interval(hours => v_grace) THEN
          v_cur := v_cur || jsonb_build_object('actif', false, 'arrete_le', now(),
                                               'arret_motif', 'palier_perdu');
        ELSE
          CONTINUE;
        END IF;
        v_ps := jsonb_set(v_ps, ARRAY[v_pf, 'republish_planifiee'], v_cur, true);
      END LOOP;
      UPDATE profiles SET platform_settings = v_ps WHERE id = v_compte.id;
      CONTINUE;
    END IF;

    -- 1. Historique : clôturer ce qui est passé (toutes plateformes).
    PERFORM republish_creneau_cloturer(v_compte.id);

    FOR v_pf IN
      SELECT pf FROM unnest(republish_planifiee_plateformes()) AS pf
      ORDER BY (SELECT count(*) FROM cross_post_jobs j
                 WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = pf
                   AND j.platform_fields ->> 'republish_source' = 'auto'
                   AND j.created_at >= date_trunc('day', now())) ASC,  -- MODIF FAMINE 2026-09-24 : la plateforme la MOINS servie aujourd hui passe d abord (tour de role), au lieu de Vinted toujours en tete
               array_position(republish_planifiee_plateformes(), pf)
    LOOP
      EXIT WHEN v_cree;  -- UN job par compte et par passage, toutes plateformes.

      v_regl := republish_planifiee_reglage(v_compte.id, v_pf);
      CONTINUE WHEN v_regl IS NULL OR NOT COALESCE((v_regl ->> 'actif')::boolean, false);
      -- Interrupteur de la plateforme (fail-closed).
      CONTINUE WHEN NOT republish_planifiee_pf_ouverte(v_pf);
      -- La date de palier perdu n'a plus lieu d'être : le droit est là.
      IF v_regl ->> 'palier_perdu_le' IS NOT NULL THEN
        UPDATE profiles
           SET platform_settings = jsonb_set(platform_settings, ARRAY[v_pf, 'republish_planifiee'],
                 (platform_settings #> ARRAY[v_pf, 'republish_planifiee']) - 'palier_perdu_le', true)
         WHERE id = v_compte.id;
      END IF;

      -- 2. Hors créneau → rien. Un créneau manqué n'est jamais rattrapé.
      v_fen := republish_planifiee_fenetre(v_regl, now());
      CONTINUE WHEN NOT COALESCE((v_fen ->> 'dans_creneau')::boolean, false);

      v_minuit := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));

      -- 2bis. DISJONCTEUR DU JOUR : cette plateforme s'est-elle déjà arrêtée
      -- aujourd'hui ? (note posée sur un créneau de la journée locale)
      IF EXISTS (
        SELECT 1 FROM republish_creneaux r
        WHERE r.user_id = v_compte.id AND r.platform = v_pf
          AND r.debut >= v_minuit AND r.sautes ? '_disjoncteur'
      ) THEN
        CONTINUE;
      END IF;

      IF v_pf = 'vinted' THEN
        v_ident    := republish_boutique_connectee(v_compte.id);
        v_boutique := v_ident ->> 'user_id';
        v_multi    := jsonb_array_length(republish_boutiques(v_compte.id)) >= 2;
      ELSE
        v_ident := NULL; v_boutique := NULL; v_multi := false;
      END IF;

      -- (24/10, décision de Nico) Plus de plafond du palier ni d'enveloppe de
      -- compte : le nombre par jour CHOISI pour cette plateforme (NULL = aucun).
      v_plafond  := (v_regl ->> 'plafond_jour')::integer;
      SELECT count(*) INTO v_faits
      FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_minuit;

      v_plafond_b := NULL; v_faits_b := 0;
      IF v_pf = 'vinted' AND v_boutique IS NOT NULL THEN
        v_plafond_b := NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer;
        v_plafond_b := CASE WHEN v_plafond_b IS NULL THEN v_plafond ELSE LEAST(GREATEST(1, v_plafond_b), v_plafond) END;
        SELECT count(*) INTO v_faits_b
        FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = 'vinted'
          AND j.platform_fields ->> 'republish_source' = 'auto'
          AND j.created_at >= v_minuit
          AND i.vinted_account_id = v_boutique;
      END IF;

      -- La ligne du créneau courant, créée au premier passage avec ce que le
      -- serveur ATTEND à cet instant (c'est ce que l'app annonce). La capacité
      -- est PARTAGÉE : le temps déjà réservé par les autres plateformes est
      -- déduit — un seul Chrome pour quatre files.
      SELECT * INTO v_row FROM republish_creneaux
      WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
        AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      -- Boutique connue, aucune ligne à son nom : une ligne SANS boutique du
      -- même créneau est née avant que la sonde ne parle — elle lui appartient.
      -- On la BAPTISE, on n'en crée pas une seconde. (Baptiser n'est pas geler :
      -- l'autre boutique aura, elle, sa PROPRE ligne, parce que la lecture
      -- ci-dessus discrimine sur la boutique à chaque passage.)
      IF NOT FOUND AND v_boutique IS NOT NULL THEN
        UPDATE republish_creneaux
           SET boutique = v_boutique, updated_at = now()
         WHERE user_id = v_compte.id AND platform = v_pf
           AND debut = (v_fen ->> 'courant_debut')::timestamptz AND boutique IS NULL
        RETURNING * INTO v_row;
      END IF;
      -- Boutique INCONNUE alors que le créneau a déjà une ligne : on ne fabrique
      -- pas un doublon sans nom (il réserverait de la capacité pour les autres
      -- plateformes sans jamais rien produire). On reprend celle qui existe.
      IF NOT FOUND AND v_boutique IS NULL THEN
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf
          AND debut = (v_fen ->> 'courant_debut')::timestamptz
        ORDER BY updated_at DESC LIMIT 1;
      END IF;
      IF NOT FOUND THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        -- MODIF FAMINE 2026-09-24 : part EGALE du creneau entre les plateformes actives+eligibles
        -- (republish_planifiee_actives_eligibles), au lieu de reserver tout le temps a la premiere
        -- (Vinted). Un compte mono-plateforme -> N=1 -> part pleine -> INCHANGE. On ne touche NI a
        -- l espacement (v_esp, propre a la plateforme), NI aux plafonds/quotas (LEAST plus bas).
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM ((v_fen ->> 'courant_fin')::timestamptz - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        v_prevues := LEAST(CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(0, v_plafond - v_faits) END,
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        INSERT INTO republish_creneaux
          (user_id, platform, jour, de, a, fuseau, debut, fin, statut, boutique,
           eligibles_debut, prevues, espacement_sec, extension_vue)
        VALUES
          (v_compte.id, v_pf, (v_fen ->> 'jour_local')::date, (v_regl ->> 'de')::time, (v_regl ->> 'a')::time,
           COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'),
           (v_fen ->> 'courant_debut')::timestamptz, (v_fen ->> 'courant_fin')::timestamptz, 'en_cours', v_boutique,
           v_elig, v_prevues, (v_esp ->> 'sec')::integer,
           v_compte.extension_last_seen_at > now() - interval '10 minutes')
        ON CONFLICT (user_id, platform, debut, (COALESCE(boutique, ''::text))) DO NOTHING;
        SELECT * INTO v_row FROM republish_creneaux
        WHERE user_id = v_compte.id AND platform = v_pf AND debut = (v_fen ->> 'courant_debut')::timestamptz
          AND COALESCE(boutique, '') = COALESCE(v_boutique, '');
      END IF;

      -- 2ter. (11/10, Louis — @evat, plus rien après 14:00) LA LIGNE DU CRÉNEAU
      -- SUIT LE RÉGLAGE. Elle est retrouvée par son DÉBUT : déplacer la FIN du
      -- créneau (14:00 → 17:00 → 23:59) reprenait la ligne née avec l'ancienne
      -- fin — 6ter coupait tout à 14:00, la clôture la passait « ecourte », et
      -- l'app annonçait des republications que le balayage ne faisait plus.
      -- Désormais, une fin (ou des heures) qui ne sont plus celles du réglage
      -- RÉALIGNENT la ligne : nouvelle fin, ligne rouverte si la fin est à venir,
      -- prévues recalculées pour le TEMPS RESTANT exactement comme à la
      -- création (part égale, espacement réel, plafonds, éligibles), et le
      -- rythme repart de cet instant (6). Raccourcir le créneau le raccourcit
      -- aussi : plus rien ne part après la nouvelle fin (6ter).
      v_fin_regl := (v_fen ->> 'courant_fin')::timestamptz;
      IF v_row.id IS NOT NULL AND v_fin_regl IS NOT NULL
         AND (v_row.fin IS DISTINCT FROM v_fin_regl
              OR v_row.a IS DISTINCT FROM (v_regl ->> 'a')::time
              OR v_row.de IS DISTINCT FROM (v_regl ->> 'de')::time) THEN
        v_esp := republish_planifiee_espacement(v_compte.id, v_pf);
        v_capacite := republish_planifiee_capacite(
          GREATEST(60, (extract(epoch FROM (v_fin_regl - now()))::integer
                        / republish_planifiee_actives_eligibles(v_compte.id)))::integer,
          (v_esp ->> 'sec')::integer);
        SELECT count(*) INTO v_elig
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        WHERE c.motif IS NULL
          AND (v_boutique IS NULL OR NOT v_multi OR c.boutique IS NULL OR c.boutique = v_boutique);
        SELECT count(*) INTO v_faits_cr FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
        v_prevues := LEAST(CASE WHEN v_plafond IS NULL THEN NULL ELSE GREATEST(0, v_plafond - v_faits) END,
                           v_elig, v_capacite);
        IF v_plafond_b IS NOT NULL THEN
          v_prevues := LEAST(v_prevues, GREATEST(0, v_plafond_b - v_faits_b));
        END IF;
        UPDATE republish_creneaux
           SET de = (v_regl ->> 'de')::time, a = (v_regl ->> 'a')::time,
               fin = v_fin_regl,
               prevues = v_faits_cr + v_prevues,
               espacement_sec = (v_esp ->> 'sec')::integer,
               statut = CASE WHEN v_fin_regl > now() THEN 'en_cours' ELSE statut END,
               sautes = (sautes - '_fin_de_creneau' - '_prevues_atteintes')
                        || jsonb_build_object('_reglage_change', jsonb_build_object(
                             'motif', 'reglage_change', 'platform', v_pf,
                             'fin_avant', v_row.fin, 'fin', v_fin_regl,
                             'prevues_avant', v_row.prevues, 'prevues', v_faits_cr + v_prevues,
                             'faites_avant', v_faits_cr, 'depuis', now(),
                             'statut_avant', v_row.statut, 'at', now())),
               updated_at = now()
         WHERE id = v_row.id
        RETURNING * INTO v_row;
      END IF;

      -- 3. Extension vivante ? 10 MINUTES : au-delà on créerait des jobs pour
      -- des Chrome éteints, qui dormiraient en pending en consommant le plafond.
      CONTINUE WHEN v_compte.extension_last_seen_at IS NULL
                 OR v_compte.extension_last_seen_at <= now() - interval '10 minutes';
      -- ⛔ Plus de `boutique = COALESCE(boutique, v_boutique)` ici : c'était le
      -- gel. La ligne PORTE sa boutique depuis sa lecture ; une autre boutique
      -- ne réécrit plus celle-ci, elle obtient la sienne.
      IF NOT v_row.extension_vue THEN
        UPDATE republish_creneaux
           SET extension_vue = true, updated_at = now()
         WHERE id = v_row.id;
      END IF;

      -- 3bis. LE DISJONCTEUR : les échecs DU COMPTE consécutifs de ce créneau,
      -- sur cette plateforme, sans réussite intercalée.
      -- (12/10, A4) Il comptait un échec d'ARTICLE (un failed quel qu'en soit
      -- le motif) comme une panne du compte, et ne voyait pas une panne du
      -- compte parquée en needs_user (session, anti-robot) : deux articles
      -- refusés arrêtaient la plateforme pour la journée. Désormais
      -- (republish_echec_portee) : seul un échec qui vient du COMPTE (session,
      -- anti-robot, compte bloqué, restriction Vinted, accès, boutique ouverte
      -- étrangère…) compte ; un article en échec ne bloque que lui — il ne
      -- compte pas et ne coupe pas la chaîne ; un job en cours (pending,
      -- processing sans cause du compte) l'arrête comme avant.
      v_disj_n := 0;
      FOR v_j IN
        SELECT j.status, j.platform_fields AS pf, j.error
        FROM cross_post_jobs j
        WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
          AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
        ORDER BY j.created_at DESC
      LOOP
        EXIT WHEN v_j.status = 'published';
        v_portee := republish_echec_portee(v_j.status, v_j.pf, v_j.error);
        IF v_portee = 'compte' THEN v_disj_n := v_disj_n + 1;
        ELSIF v_portee = 'article' THEN CONTINUE;  -- un article en échec ne bloque que lui
        ELSE EXIT;  -- pending / processing sans cause du compte : en cours, pas un échec
        END IF;
      END LOOP;
      IF v_disj_n >= v_disj_max THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_disjoncteur', jsonb_build_object(
            'motif', 'echecs_compte_consecutifs', 'platform', v_pf,
            'echecs', v_disj_n, 'seuil', v_disj_max, 'at', now())));
        CONTINUE;
      END IF;

      -- 4. Garde anti-rafale, PAR PLATEFORME.
      -- (08/10, Louis) une suppression ENVOYÉE (pas encore prouvée) compte comme
      -- un retrait engagé : l'annonce est peut-être déjà hors ligne, le créneau attend.
      SELECT count(*) FILTER (WHERE j.platform_fields ->> 'republish_step' = 'deleted' OR j.platform_fields ? 'republish_suppression_envoyee'),
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND (v_boutique IS NULL OR NULLIF(trim(i.vinted_account_id), '') IS NULL
                                     OR trim(i.vinted_account_id) = v_boutique)
                                AND COALESCE(republish_ts_safe(j.platform_fields, 'next_action_after'), now()) <= now()),  -- MODIF 2026-09-24 : un job PARQUE (reprise future : anti-robot 45 min, session 60 min) et sans suppression (step <> deleted) n'occupe pas le creneau ; il n'est plus compte en vol, le creneau continue avec un autre article, l'annonce parquee reste en ligne
             count(*) FILTER (WHERE COALESCE(j.platform_fields ->> 'republish_step', 'a_capturer') <> 'deleted'
                                AND v_boutique IS NOT NULL AND NULLIF(trim(i.vinted_account_id), '') IS NOT NULL
                                AND trim(i.vinted_account_id) <> v_boutique)
      INTO v_hors_ligne, v_mobiles, v_parques
      FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.status IN ('pending', 'processing');
      IF v_hors_ligne + v_mobiles > 0 THEN
        v_bloque := COALESCE(v_row.sautes -> '_bloque_en_vol', '{}'::jsonb);
        v_bloque := (v_bloque - 'leve_le') || jsonb_build_object(
          'motif', CASE WHEN v_hors_ligne > 0 THEN 'annonce_hors_ligne' ELSE 'republication_en_vol' END,
          'platform', v_pf,
          'en_vol', v_hors_ligne + v_mobiles,
          'hors_ligne', v_hors_ligne,
          'parques_autre_boutique', v_parques,
          'boutique', v_boutique,
          'depuis', COALESCE(v_bloque ->> 'depuis', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
          'at', now());
        UPDATE republish_creneaux
           SET sautes = sautes || jsonb_build_object('_bloque_en_vol', v_bloque), updated_at = now()
         WHERE id = v_row.id;
        CONTINUE;
      END IF;
      IF v_row.sautes ? '_bloque_en_vol' AND NOT (v_row.sautes -> '_bloque_en_vol' ? 'leve_le') THEN
        UPDATE republish_creneaux
           SET sautes = jsonb_set(sautes, '{_bloque_en_vol,leve_le}', to_jsonb(now())), updated_at = now()
         WHERE id = v_row.id;
      END IF;
      IF v_parques > 0 THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_parques_autre_boutique',
            jsonb_build_object('motif', 'parques_autre_boutique', 'n', v_parques, 'boutique', v_boutique, 'at', now())));
      END IF;

      -- 5. Le nombre par jour CHOISI pour la plateforme, s'il y en a un.
      -- (24/10, décision de Nico) Plus d'enveloppe de compte ni de plafond du palier.
      IF v_plafond IS NOT NULL AND v_faits >= v_plafond THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_jour', jsonb_build_object('motif', 'plafond_jour', 'plafond', v_plafond, 'at', now())));
        CONTINUE;
      END IF;

      -- 6. Espacement déterministe.
      -- (11/10) Ligne réalignée sur un nouveau réglage : le rythme repart du
      -- réalignement, sur les prévues qui restaient à faire (sinon la fenêtre
      -- entière, comme avant). Jamais plus serré que la création ne l'aurait fait.
      v_debut_ryt := COALESCE(NULLIF(v_row.sautes -> '_reglage_change' ->> 'depuis', '')::timestamptz, v_row.debut);
      v_prev_ryt := COALESCE(v_row.prevues, 1)
                    - CASE WHEN v_row.sautes ? '_reglage_change'
                           THEN COALESCE((v_row.sautes -> '_reglage_change' ->> 'faites_avant')::integer, 0) ELSE 0 END;
      v_intervalle := extract(epoch FROM (v_row.fin - v_debut_ryt)) / GREATEST(1, v_prev_ryt);
      SELECT max(j.created_at) INTO v_dernier FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish'
        AND j.platform_fields ->> 'republish_source' = 'auto'
        AND j.created_at >= v_row.debut;
      CONTINUE WHEN v_dernier IS NOT NULL AND v_dernier > now() - make_interval(secs => v_intervalle);
      -- 6bis. Le créneau s'arrête à ce qu'il a ANNONCÉ.
      SELECT count(*) INTO v_faits_cr FROM cross_post_jobs j
      WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
        AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text;
      IF v_row.prevues IS NOT NULL AND v_faits_cr >= v_row.prevues THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_prevues_atteintes', jsonb_build_object('motif', 'prevues_atteintes', 'prevues', v_row.prevues, 'at', now())));
        CONTINUE;
      END IF;

      -- 6ter. (08/10, Louis) JAMAIS UNE REPUBLICATION LANCÉE QUI NE PEUT PAS FINIR
      -- DANS LE CRÉNEAU. Le 06/10, la 9e republication Beebs de Louis est partie
      -- à 21:54 (créneau 19:00–22:00, ~20 min par republication Beebs) : sa
      -- suppression a eu lieu à 21:58, la remise en ligne tombait hors créneau.
      -- Il reste moins que la durée d'une republication sur cette plateforme pour
      -- ce compte (republish_duree_estimee) : on n'en lance plus, l'article
      -- reste en ligne, intact, et part au créneau suivant.
      v_duree := republish_duree_estimee(v_compte.id, v_pf);
      IF v_row.fin IS NOT NULL AND v_row.fin - now() < make_interval(secs => v_duree) THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_fin_de_creneau', jsonb_build_object('motif', 'fin_de_creneau', 'platform', v_pf,
            'reste_s', GREATEST(0, extract(epoch FROM v_row.fin - now())::integer), 'duree_s', v_duree, 'at', now())));
        CONTINUE;
      END IF;

      -- 7. Plafond de la boutique connectée (Vinted, calculé plus haut).
      IF v_plafond_b IS NOT NULL AND v_faits_b >= v_plafond_b THEN
        PERFORM republish_creneau_noter(v_row.id,
          jsonb_build_object('_plafond_boutique:' || v_boutique,
            jsonb_build_object('motif', 'plafond_boutique', 'boutique', v_boutique, 'plafond', v_plafond_b, 'at', now())));
        CONTINUE;
      END IF;

      -- 8. Candidats : boutique connectée d'abord, sans boutique ensuite,
      -- autres boutiques jamais pendant ce créneau (Vinted seul).
      v_notes := '{}'::jsonb; v_examines := 0;
      FOR v_cand IN
        SELECT c.inv_id, c.item_id, c.boutique, c.titre, c.motif, c.rang
        FROM republish_planifiee_candidats(v_compte.id, v_regl, v_pf) c
        ORDER BY CASE WHEN v_boutique IS NOT NULL AND c.boutique = v_boutique THEN 0
                      WHEN c.boutique IS NULL THEN 1
                      ELSE 2 END,
                 c.rang
        LIMIT 50
      LOOP
        v_examines := v_examines + 1;
        v_cle := CASE WHEN v_pf = 'vinted' AND v_cand.item_id IS NOT NULL
                      THEN v_cand.item_id ELSE 'inv:' || v_cand.inv_id::text END;
        IF v_cand.motif IS NOT NULL THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle)
             AND NOT EXISTS (
               SELECT 1 FROM cross_post_jobs j
               WHERE j.user_id = v_compte.id AND j.action = 'republish' AND j.platform = v_pf
                 AND j.platform_fields ->> 'republish_creneau_id' = v_row.id::text
                 AND j.inventaire_id = v_cand.inv_id) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', v_cand.motif, 'titre', left(COALESCE(v_cand.titre, ''), 80),
                                 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;
        IF v_boutique IS NOT NULL AND v_multi AND v_cand.boutique IS NOT NULL AND v_cand.boutique <> v_boutique THEN
          IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
            v_notes := v_notes || jsonb_build_object(v_cle,
              jsonb_build_object('motif', 'autre_boutique', 'boutique', v_cand.boutique,
                                 'titre', left(COALESCE(v_cand.titre, ''), 80), 'platform', v_pf, 'at', now()));
          END IF;
          CONTINUE;
        END IF;

        -- 9. L'APPEL, avec l'identité de l'utilisateur et rien d'autre.
        BEGIN
          PERFORM set_config('request.jwt.claims',
            json_build_object('sub', v_compte.id, 'role', 'authenticated')::text, true);
          v_rpc := public.spend_coins_and_republish(v_cand.inv_id, v_cand.item_id, 'auto', NULL, v_pf);
          PERFORM set_config('request.jwt.claims', '', true);
        EXCEPTION WHEN OTHERS THEN
          PERFORM set_config('request.jwt.claims', '', true);
          v_rpc := jsonb_build_object('allowed', false, 'reason', 'exception',
                                      'message', left(SQLERRM, 200));
        END;
        v_reason := v_rpc ->> 'reason';

        v_ligne := jsonb_build_object(
          'compte', v_compte.email, 'platform', v_pf, 'inventaire_id', v_cand.inv_id,
          'vinted_item_id', v_cand.item_id, 'examines', v_examines,
          'creneau_id', v_row.id, 'boutique', v_boutique,
          'allowed', COALESCE((v_rpc ->> 'allowed')::boolean, false),
          'reason', v_reason);

        IF COALESCE((v_rpc ->> 'allowed')::boolean, false) THEN
          v_job := NULLIF(v_rpc ->> 'job_id', '')::uuid;
          UPDATE cross_post_jobs
             SET platform_fields = platform_fields || jsonb_build_object(
                   'republish_moteur', 'serveur',
                   'republish_planifie', true,
                   'republish_creneau_id', v_row.id::text,
                   'republish_sweep_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'))
           WHERE id = v_job;
          v_ligne := v_ligne || jsonb_build_object('job_id', v_job);
          v_rapport := v_rapport || v_ligne;
          v_cree := true;
          EXIT;
        END IF;

        IF NOT (v_row.sautes ? v_cle) AND NOT (v_notes ? v_cle) THEN
          v_notes := v_notes || jsonb_build_object(v_cle,
            jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'),
                               'titre', left(COALESCE(v_cand.titre, ''), 80),
                               'platform', v_pf, 'at', now()));
        END IF;
        v_rapport := v_rapport || v_ligne;
        -- Portée ARTICLE → candidat suivant ; portée COMPTE → on sort.
        -- (17/10) lien_annonce_incertain : le lien exact de CETTE annonce n'est pas sûr,
        -- seul cet article attend (spend_coins_and_republish, Amiral 317adae1).
        IF v_reason IN ('invalid_item', 'republish_en_cours', 'cadence_24h',
                        'article_sans_photo', 'article_vendu', 'annonce_introuvable', 'lien_annonce_incertain') THEN
          CONTINUE;
        END IF;
        v_notes := v_notes || jsonb_build_object('_refus_compte',
          jsonb_build_object('motif', COALESCE(v_reason, 'refus_sans_motif'), 'message', v_rpc ->> 'message',
                             'platform', v_pf, 'at', now()));
        EXIT;
      END LOOP;

      IF v_notes <> '{}'::jsonb THEN
        PERFORM republish_creneau_noter(v_row.id, v_notes);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'actif', true,
    'comptes', v_comptes,
    'traites', jsonb_array_length(v_rapport),
    'crees', (SELECT count(*) FROM jsonb_array_elements(v_rapport) e
              WHERE COALESCE((e ->> 'allowed')::boolean, false)),
    'detail', v_rapport);
END;
$function$;

-- Plus aucune fonction ne lit le plafond du palier : on le vérifie, puis on le supprime.
DO $plus_personne$
DECLARE v text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname <> 'republish_plafond_palier'
     AND pg_get_functiondef(p.oid) ~ '(republish_plafond_palier|republish_plafond_jour)';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'encore lu par : % — ON S''ARRÊTE', v; END IF;
END
$plus_personne$;
DROP FUNCTION public.republish_plafond_palier(text);

CREATE TEMP TABLE _regl_apres ON COMMIT DROP AS
  SELECT p.id AS u, pf, public.republish_planifiee_reglage(p.id, pf) AS r
    FROM public.profiles p, unnest(public.republish_planifiee_plateformes()) pf
   WHERE jsonb_typeof(p.platform_settings #> ARRAY[pf, 'republish_planifiee']) = 'object';
CREATE TEMP TABLE _temoin ON COMMIT DROP AS
  SELECT a.u FROM _regl_apres a WHERE COALESCE((a.r ->> 'actif')::boolean, false) ORDER BY a.u LIMIT 1;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT u FROM _temoin), 'role', 'authenticated')::text, true);
CREATE TEMP TABLE _etat ON COMMIT DROP AS SELECT public.republish_planifiee_etat_multi() AS e;
CREATE TEMP TABLE _place ON COMMIT DROP AS SELECT public.remise_en_vente_place('54b136db-b9dd-4929-8fa5-3367797763d9'::uuid) AS p;
CREATE TEMP TABLE _sweep ON COMMIT DROP AS SELECT public.republish_planifiee_sweep() AS s;
SELECT o, k, v FROM (
  SELECT 1 AS o, 'fonction du plafond du palier' AS k, CASE WHEN to_regprocedure('public.republish_plafond_palier(text)') IS NULL THEN 'supprimée' ELSE 'ENCORE LÀ' END AS v
  UNION ALL SELECT 2, 'fonctions qui lisent encore un plafond par jour', (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND pg_get_functiondef(p.oid) ~ '(republish_plafond_palier|republish_plafond_jour)')
  UNION ALL SELECT 3, 'réglages relus (avant / après)', (SELECT count(*) FROM _regl_avant) || ' / ' || (SELECT count(*) FROM _regl_apres)
  UNION ALL SELECT 4, 'réglages : actif changé', (SELECT count(*)::text FROM _regl_avant b JOIN _regl_apres a USING (u, pf) WHERE (b.r ->> 'actif') IS DISTINCT FROM (a.r ->> 'actif'))
  UNION ALL SELECT 5, 'réglages : nombre par jour changé (avant → après)', COALESCE((SELECT string_agg(left(b.u::text, 8) || ':' || b.pf || ' ' || COALESCE(b.r ->> 'plafond_jour', 'null') || '→' || COALESCE(a.r ->> 'plafond_jour', 'null'), ', ') FROM _regl_avant b JOIN _regl_apres a USING (u, pf) WHERE (b.r ->> 'plafond_jour') IS DISTINCT FROM (a.r ->> 'plafond_jour')), 'aucun')
  UNION ALL SELECT 6, 'réglages : clé plafond_palier encore rendue', (SELECT count(*)::text FROM _regl_apres a WHERE a.r ? 'plafond_palier')
  UNION ALL SELECT 7, 'état multi du témoin ' || (SELECT left(u::text, 8) FROM _temoin), (SELECT (e ? 'plafond_palier')::text || ' · enveloppe ' || (e -> 'enveloppe')::text || ' · ' || (SELECT string_agg((x ->> 'platform') || ':' || COALESCE(x ->> 'attendu', '-') || '/' || COALESCE(x ->> 'borne', '-'), ' ') FROM jsonb_array_elements(e -> 'plateformes') x) FROM _etat)
  UNION ALL SELECT 8, 'remise_en_vente_place (linda, Premium)', (SELECT p::text FROM _place)
  UNION ALL SELECT 9, 'balayage planifié (annulé)', (SELECT left(s::text, 400) FROM _sweep)
  UNION ALL SELECT 10, 'jobs créés pendant l essai (annulés)', ((SELECT count(*) FROM public.cross_post_jobs) - (SELECT n FROM _jobs_avant))::text
) t ORDER BY o;
ROLLBACK;
