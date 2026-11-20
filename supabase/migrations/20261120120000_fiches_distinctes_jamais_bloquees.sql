-- 20/11/2026 (lot « problèmes », point 2 de Nico — thecloset72000, 8ac5bbda) : deux fiches distinctes ne sont
-- JAMAIS bloquées comme « déjà publié ». Réécrite depuis pg_get_functiondef de PROD (md5 5e5a9084a5c7e8c58259c054acc8bf85,
-- lu le 20/11). Changement : le bloc 13/11 N6a ne RETOURNE plus de refus — v_meme_objet devient un avertissement
-- ajouté à la réponse « allowed: true ». Inverse : supabase/rollbacks/20261120120000_fiches_distinctes_jamais_bloquees_INVERSE.sql
DO $garde$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.spend_coins_and_publish(text, jsonb)'::regprocedure))) <> '5e5a9084a5c7e8c58259c054acc8bf85' THEN
    RAISE EXCEPTION 'spend_coins_and_publish a changé en prod depuis sa lecture du 20/11 : relire pg_get_functiondef avant de rejouer';
  END IF;
END
$garde$;
DO $garde2$
BEGIN
  IF (SELECT md5(pg_get_functiondef('public.doublon_attribut_distinctif(text, text, jsonb, jsonb)'::regprocedure))) <> '093690a5a53bb728823ac8ac66b0f475' THEN
    RAISE EXCEPTION 'doublon_attribut_distinctif a changé en prod depuis sa lecture du 20/11 : relire pg_get_functiondef avant de rejouer';
  END IF;
END
$garde2$;

CREATE OR REPLACE FUNCTION public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user          uuid := auth.uid();
  v_price         integer;
  v_price_photo   integer;
  v_price_unit    integer;
  v_price_pub     integer;
  v_photos_billed boolean := true;
  v_wallet        coin_wallets%ROWTYPE;
  v_total         integer;
  v_from_inc      integer := 0;
  v_from_pur      integer := 0;
  v_photo_inc     integer;
  v_pub_inc       integer;
  v_pub_pur       integer;
  v_job_count     integer;
  v_tier          text;
  v_conflicts     jsonb;
  v_ext_seen      timestamptz;
  v_lang          text;
  v_res_id        uuid := NULL;
  v_ebay_api_seul boolean := false;
  v_en_pause      jsonb := NULL;
  v_conflits_relie jsonb;
  v_pub_plafond   integer;
  v_pub_faites    integer;
  v_pub_remise    timestamptz;
  v_garde         jsonb;
  -- ⟦13/11 N6a
  v_meme_objet    jsonb;
  -- 13/11 N6a⟧
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  IF p_photo_option NOT IN ('original','ia_light','ia_advanced') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_photo_option');
  END IF;
  v_job_count := COALESCE(jsonb_array_length(p_jobs), 0);
  IF v_job_count < 1 OR v_job_count > 5 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_jobs');
  END IF;

  BEGIN
    SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_en_pause
    FROM jsonb_array_elements(p_jobs) AS j
    WHERE EXISTS (SELECT 1 FROM public.platform_health h WHERE h.platform = j->>'platform' AND h.paused = true);
  EXCEPTION WHEN OTHERS THEN
    v_en_pause := NULL;
  END;
  -- (25/10, décision de Nico : « Aucun job ne doit être créé. ») LEBONCOIN N'ACCEPTE QUE LES ADRESSES EN FRANCE :
  -- une publication Leboncoin d'un compte dont l'adresse de remise est hors de France n'entre JAMAIS en file, quelle
  -- que soit la version de l'app (Marta, 25/10 : 52 jobs créés après l'OTA 2.9.115 par une app restée sur l'ancien
  -- paquet). Même verdict que _shared/lbc-adresse-france.js (lbc_adresse_hors_france) ; même réponse qu'une plateforme
  -- en pause, que toutes les versions de l'app savent dire — rien n'est créé, rien n'est décompté.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_jobs) AS j WHERE j->>'platform' = 'leboncoin')
     AND public.lbc_adresse_hors_france(v_user) THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'platform_paused', 'motif', 'lbc_hors_france', 'platforms', '["leboncoin"]'::jsonb,
      'messages', jsonb_build_object('leboncoin', jsonb_build_object('fr', 'Leboncoin n''accepte que les adresses en France. Ton adresse de remise est hors de France : FillSell ne publie donc pas sur Leboncoin pour ton compte. Rien n''a été publié, et tes autres plateformes continuent normalement.', 'en', 'Leboncoin only accepts addresses in France. Your pickup address is outside France, so FillSell doesn''t publish on Leboncoin for your account. Nothing was published, and your other platforms carry on as usual.'))
    );
  END IF;

  IF v_en_pause IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'platform_paused', 'platforms', v_en_pause,
      'messages', (SELECT COALESCE(jsonb_object_agg(h.platform, jsonb_build_object('fr', h.message_fr, 'en', h.message_en)), '{}'::jsonb)
                   FROM public.platform_health h WHERE h.paused = true AND v_en_pause ? h.platform)
    );
  END IF;

  SELECT NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_jobs) AS j WHERE j->>'platform' IS DISTINCT FROM 'ebay'
         )
         AND COALESCE(p.ebay_voie_api, false)
         AND a.user_id IS NOT NULL
         AND a.revoked_at IS NULL
         AND a.fulfillment_policy_id IS NOT NULL
         AND a.payment_policy_id IS NOT NULL
         AND a.return_policy_id IS NOT NULL
         AND (a.seller_state->>'bloque_par_etat_ebay') = 'false'
    INTO v_ebay_api_seul
  FROM profiles p
  LEFT JOIN ebay_accounts a ON a.user_id = p.id
  WHERE p.id = v_user;
  v_ebay_api_seul := COALESCE(v_ebay_api_seul, false);

  SELECT extension_last_seen_at, lang
    INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_jobs) AS j
    WHERE NULLIF(j->>'inventaire_id','') IS NULL
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_inventaire_id');
  END IF;

  SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_conflicts
  FROM jsonb_array_elements(p_jobs) AS j
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM cross_post_jobs c
      WHERE c.user_id = v_user
        AND c.inventaire_id = NULLIF(j->>'inventaire_id','')::bigint
        AND c.platform = j->>'platform'
        AND COALESCE(c.action, 'publish') <> 'delete'
        AND (
          c.status IN ('pending', 'processing', 'needs_user')
          OR (
            c.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = v_user
                AND d.inventaire_id = c.inventaire_id
                AND d.platform = c.platform
                AND d.action = 'delete'
                AND d.status = 'deleted'
                AND (
                  CASE
                    WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                     AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                    THEN annonce_id_de_job(d.platform_listing_id, d.listing_url) = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                    ELSE d.created_at > COALESCE(c.published_at, c.created_at)
                  END
                )
            )
          )
        )
    );
  IF v_conflicts IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', v_conflicts
    );
  END IF;

  -- (20/10, Louis) COMPTES RELIÉS SUR UNE BOUTIQUE PARTAGÉE : la fiche jumelle (fiches_liees_comptes)
  -- est déjà en ligne — ou en file — sur cette plateforme, dans la MÊME boutique (un relevé l'a prouvé :
  -- jumelle_occupe_plateformes). Republier ici ferait le doublon (Leboncoin le refuse, ou le laisse passer) :
  -- refus already_published, plateforme par plateforme, AVANT tout débit. 'compte_relie' nomme celles-là.
  -- Sans fiche jumelle (tous les autres comptes) : rien de lu au-delà de l'index fiches_liees_comptes.
  SELECT jsonb_agg(DISTINCT j->>'platform') INTO v_conflits_relie
  FROM jsonb_array_elements(p_jobs) AS j
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL
    AND EXISTS (SELECT 1 FROM fiches_liees_comptes f
                 WHERE f.fiche_a = NULLIF(j->>'inventaire_id','')::bigint OR f.fiche_b = NULLIF(j->>'inventaire_id','')::bigint)
    AND EXISTS (SELECT 1 FROM jumelle_occupe_plateformes(v_user, NULLIF(j->>'inventaire_id','')::bigint) o
                 WHERE o.platform = j->>'platform');
  IF v_conflits_relie IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', v_conflits_relie, 'compte_relie', v_conflits_relie
    );
  END IF;

  -- ⟦13/11 N6a — LE MÊME OBJET DÉJÀ EN LIGNE PAR UNE AUTRE FICHE, EN ATTENTE DE « EST-CE LE MÊME ARTICLE ? » (bf85d176)
  -- Le 12/11 à 15:53, la fiche du dressing 1794494010078017 est partie sur Leboncoin alors que la question « Est-ce le
  -- même article ? » (photo identique, posée à 15:40) la liait à 1790174130756, en ligne sur Leboncoin (3272015849) :
  -- Leboncoin a refusé le doublon ; s'il l'avait accepté, le « Oui » n'aurait plus pu réunir les deux fiches (deux
  -- annonces d'une plateforme) et le même objet restait vendable deux fois. Retenue, plateforme par plateforme, AVANT tout
  -- débit, tant que la question est OUVERTE : jamais pour deux exemplaires (« Non » répondu, quantité > 1, ou les deux
  -- fiches déjà en ligne sur une même plateforme), jamais sur un titre ni un doute à plusieurs candidats (Louis, 09/10 :
  -- seule une question « photo_identique » retient), jamais une question introuvable (les deux fiches au stock : la
  -- carte « Est-ce le même article ? » de Stock › Synchroniser ; une fiche à vérifier : À régler › Annonces à vérifier —
  -- le message dit laquelle). « Non, deux exemplaires » la lève pour toujours ; « Oui » réunit les deux fiches.
  -- Réponse already_published (toutes les versions de l'app sortent la plateforme et publient les autres) + meme_objet.
  SELECT jsonb_object_agg(j->>'platform', x.m) INTO v_meme_objet
  FROM jsonb_array_elements(p_jobs) AS j
  CROSS JOIN LATERAL (SELECT public.publication_meme_objet_en_ligne(v_user, NULLIF(j->>'inventaire_id','')::bigint, j->>'platform') AS m) x
  WHERE NULLIF(j->>'inventaire_id','') IS NOT NULL AND x.m IS NOT NULL;
  -- ⟦20/11 — DEUX FICHES DISTINCTES NE SONT JAMAIS BLOQUÉES (règle de Nico, thecloset72000)
  -- Le 20/11 à 07:44, 07:49 et 07:53, la fiche 1795156645552 (jean Wrangler #409C14, Très bon état) a été refusée sur
  -- ses 5 plateformes en already_published : une question « Est-ce le même article ? » (photo_identique, posée à 07:40)
  -- la liait à 1795101900457 (jean Wrangler #407C15, Bon état), en ligne. Deux articles différents ; le jean n’est jamais
  -- parti. Règle : une AUTRE fiche (inventaire_id différent) ne fait JAMAIS refuser une publication. La question reste
  -- posée (Stock › Synchroniser) et voyage dans la réponse comme un AVERTISSEMENT non bloquant
  -- (avertissement_meme_objet), jamais comme un refus. Seuls refusent : la MÊME fiche déjà en ligne ou en file
  -- (v_conflicts) et la fiche jumelle d’un compte relié sur la même boutique (v_conflits_relie, prouvée par un relevé).
  -- 20/11⟧
  -- 13/11 N6a⟧
  -- (09/10 soir, Louis) La garde « fiche jumelle en ligne » (27/09, motif
  -- jumeau_en_ligne) est RETIRÉE : une annonce rattachée à une AUTRE fiche
  -- n'est jamais un « déjà en ligne » pour celle-ci. Seule reste la règle
  -- « une fiche, une annonce en ligne par plateforme » (already_published
  -- ci-dessus, inchangée). Migration 20261009233000.

  -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : la jauge Publications (1 par plateforme, avec ou sans IA) et le garde-fou du jour, AVANT tout débit.
  IF jauges_actives() THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('publications:' || v_user::text, 0));
    v_pub_plafond := jauge_publications_plafond(palier_de(v_user));
    IF v_pub_plafond IS NOT NULL THEN
      v_pub_faites := publications_du_cycle(v_user, debut_cycle_quotas(v_user));
      IF v_pub_faites + v_job_count > v_pub_plafond THEN
        SELECT w.next_grant_at INTO v_pub_remise FROM coin_wallets w WHERE w.user_id = v_user;
        RETURN jsonb_build_object(
          'allowed', false, 'reason', 'quota_publications_atteint', 'jauge', 'publications',
          'plafond', v_pub_plafond, 'consommes', v_pub_faites,
          'restantes', GREATEST(0, v_pub_plafond - v_pub_faites), 'demandees', v_job_count, 'remise_le', v_pub_remise,
          'message', CASE WHEN v_pub_faites >= v_pub_plafond
            THEN format('Tes %s publications du mois sont faites%s. Rien n''a été publié ni décompté.', v_pub_plafond,
                   CASE WHEN v_pub_remise IS NOT NULL THEN ' : elles reviennent le ' || to_char(v_pub_remise AT TIME ZONE 'Europe/Paris', 'DD/MM') ELSE '' END)
            ELSE format('Il te reste %s publication%s ce mois-ci, et cet article en demande %s : décoche une plateforme. Rien n''a été publié ni décompté.',
                   v_pub_plafond - v_pub_faites, CASE WHEN v_pub_plafond - v_pub_faites > 1 THEN 's' ELSE '' END, v_job_count)
          END);
      END IF;
    END IF;
    v_garde := garde_fou_jour(v_user, 'publications', v_job_count);
    IF v_garde IS NOT NULL THEN
      RETURN v_garde;
    END IF;
  END IF;

  SELECT value INTO v_price_photo FROM coin_config WHERE key = 'price_' || p_photo_option;
  SELECT value INTO v_price_unit  FROM coin_config WHERE key = 'price_per_platform';
  IF v_price_photo IS NULL OR v_price_unit IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF p_photo_option <> 'original' AND v_price_photo > 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_jobs) AS j
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(j->'photos') = 'array' THEN j->'photos' ELSE '[]'::jsonb END
      ) AS ph
      WHERE (jsonb_typeof(ph) = 'object' AND (
               COALESCE(ph->>'enhanced', '')   <> ''
               OR COALESCE(ph->>'bg_removed', '') <> ''
               OR COALESCE(ph->>'type', '') LIKE 'enhanced%'
               OR COALESCE(ph->>'url', '')  LIKE '%/enhanced/%'))
         OR (jsonb_typeof(ph) = 'string' AND (ph #>> '{}') LIKE '%/enhanced/%')
    ) THEN
      v_price_photo   := 0;
      v_photos_billed := false;
    END IF;
  END IF;

  v_price_pub := v_price_unit * v_job_count;
  v_price     := v_price_photo + v_price_pub;

  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;

    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      SELECT CASE
               WHEN p.is_business = true THEN 'business'
        WHEN p.is_pro = true THEN 'pro'
               WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
               ELSE 'free'
             END INTO v_tier
      FROM profiles p WHERE p.id = v_user;
      PERFORM upgrade_monthly_grant(v_user, COALESCE(v_tier, 'free'), null, 'lazy');
      SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    END IF;

    v_total := v_wallet.included_balance + v_wallet.purchased_balance;
    IF v_total < v_price THEN
      RETURN jsonb_build_object(
        'allowed', false, 'reason', 'insufficient_coins',
        'price', v_price, 'balance', v_total,
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed
      );
    END IF;

    v_photo_inc := LEAST(v_wallet.included_balance, v_price_photo);
    v_pub_inc   := LEAST(v_wallet.included_balance - v_photo_inc, v_price_pub);
    v_pub_pur   := v_price_pub - v_pub_inc;
    v_from_inc  := v_photo_inc + v_pub_inc;
    v_from_pur  := v_price - v_from_inc;

    UPDATE coin_wallets SET
      included_balance  = included_balance  - v_from_inc,
      purchased_balance = purchased_balance - v_from_pur,
      reserved_balance  = reserved_balance  + v_price_pub,
      updated_at        = now()
    WHERE user_id = v_user;

    INSERT INTO coin_reservations (user_id, amount, unit_price, from_included, from_purchased, job_count, photo_option)
    VALUES (v_user, v_price_pub, v_price_unit, v_pub_inc, v_pub_pur, v_job_count, p_photo_option)
    RETURNING id INTO v_res_id;
  END IF;

  BEGIN
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, photo_option,
                                 title, description, price, photos, platform_fields, reservation_id)
    SELECT
      v_user,
      NULLIF(j->>'inventaire_id','')::bigint,
      j->>'platform',
      'pending',
      p_photo_option,
      j->>'title',
      j->>'description',
      NULLIF(j->>'price','')::numeric,
      j->'photos',
      -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : avec la grille, un appel de l'app ne pose jamais lui-même un marqueur hors quota.
      CASE WHEN jauges_actives() THEN (j->'platform_fields') - 'hors_quota' - 'opla_sortie' ELSE j->'platform_fields' END,
      v_res_id
    FROM jsonb_array_elements(p_jobs) AS j;
  EXCEPTION WHEN unique_violation THEN
    IF v_price > 0 THEN
      UPDATE coin_wallets SET
        included_balance  = included_balance  + v_from_inc,
        purchased_balance = purchased_balance + v_from_pur,
        reserved_balance  = reserved_balance  - v_price_pub,
        updated_at        = now()
      WHERE user_id = v_user;
      DELETE FROM coin_reservations WHERE id = v_res_id;
    END IF;
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'already_published',
      'platforms', (SELECT jsonb_agg(DISTINCT j->>'platform') FROM jsonb_array_elements(p_jobs) AS j)
    );
  END;

  UPDATE inventaire i
  SET photos = sub.photos
  FROM (
    SELECT DISTINCT ON (inv_id) inv_id, photos
    FROM (
      SELECT NULLIF(j->>'inventaire_id','')::bigint AS inv_id, j->'photos' AS photos,
             -- Un job PLAFONNÉ par sa plateforme (Leboncoin « Divers > Autres » :
             -- 3 photos gratuites, regles.js) ne porte qu'un extrait : il ne
             -- réécrit JAMAIS la fiche (2026-09-27).
             COALESCE(j->'platform_fields'->'lbcPhotosCapped' = 'true'::jsonb, false) AS plafonne
      FROM jsonb_array_elements(p_jobs) AS j
    ) x
    WHERE inv_id IS NOT NULL
      AND jsonb_typeof(photos) = 'array'
      AND jsonb_array_length(photos) > 0
      AND NOT plafonne
    -- Sans ORDER BY, DISTINCT ON gardait le PREMIER job venu : quand c'était
    -- celui de Leboncoin plafonné, la fiche perdait ses photos. La liste la
    -- plus longue est la liste entière.
    ORDER BY inv_id, jsonb_array_length(photos) DESC
  ) sub
  WHERE i.id = sub.inv_id AND i.user_id = v_user;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (
      v_user, -v_price,
      v_wallet.included_balance - v_from_inc,
      v_wallet.purchased_balance - v_from_pur,
      'spend_publish',
      jsonb_build_object(
        'photo_option', p_photo_option, 'platforms', v_job_count,
        'price_photos', v_price_photo, 'price_publication', v_price_pub,
        'photos_billed', v_photos_billed,
        'reservation_id', v_res_id
      )
    );
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object(
    'coins', v_price, 'photo_option', p_photo_option, 'platforms', v_job_count
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'price_photos', v_price_photo, 'price_publication', v_price_pub,
    'photos_billed', v_photos_billed,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END,
    'reserved_after',  CASE WHEN v_price > 0 THEN v_wallet.reserved_balance + v_price_pub ELSE NULL END
  ) || CASE WHEN v_meme_objet IS NOT NULL THEN jsonb_build_object('avertissement_meme_objet', v_meme_objet) ELSE '{}'::jsonb END;
END;
$function$;

-- ══ (20/11) UNE RÉFÉRENCE OU UN SKU DIFFÉRENT = UN ARTICLE DIFFÉRENT, pour TOUTE question « même article ? » ══════════
-- doublon_attribut_distinctif (md5 de prod 093690a5a53bb728823ac8ac66b0f475, lue le 20/11) est appelée par
-- doublon_ecarte_par_regle, donc par le déclencheur inventaire_doublons_attribut_distinctif à CHAQUE question posée,
-- quelle que soit sa source (moteur, même photo, copies) : « reference » l'écarte comme une couleur ou une taille.
-- (20/11) Les références du vendeur dans un titre : « #409C14 » (au moins 2 chiffres : jamais « #Y2K »), « réf. 12345 »,
-- « SKU: AB-123 », « référence 501 » ; tirets retirés, majuscules. Même règle que referencesVendeur (texte.js) : le banc
-- scripts/bancs/fiches-distinctes-2011 compare les deux sur le corpus des fixtures.
CREATE OR REPLACE FUNCTION public.doublon_references(p_titre text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(array_agg(DISTINCT r ORDER BY r), '{}'::text[]) FROM (
    SELECT upper(replace(m[1], '-', '')) AS r
      FROM regexp_matches(COALESCE(p_titre, ''), '#([0-9A-Za-z][0-9A-Za-z-]{1,14})', 'g') AS m
     WHERE length(regexp_replace(m[1], '[^0-9]', '', 'g')) >= 2
    UNION
    SELECT upper(replace(m[1], '-', ''))
      FROM regexp_matches(COALESCE(p_titre, ''), '(?<![[:alnum:]])(?:r[éeÉE]f(?:[éeÉE]rence)?|sku)\.?\s*[°n#:]*\s*([0-9A-Za-z][0-9A-Za-z-]{2,19})', 'gi') AS m
     WHERE m[1] ~ '[0-9]'
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.doublon_attribut_distinctif(p_titre_a text, p_titre_b text, p_attr_a jsonb DEFAULT NULL::jsonb, p_attr_b jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  ca jsonb := public.doublon_couleurs(p_titre_a, p_attr_a #>> '{couleur,v}');
  cb jsonb := public.doublon_couleurs(p_titre_b, p_attr_b #>> '{couleur,v}');
  a_tout text[]; b_tout text[]; a_seul text[]; b_seul text[];
  na text[] := public.doublon_nombres(p_titre_a); nb text[] := public.doublon_nombres(p_titre_b);
  -- (20/11) Références du vendeur (même règle que _shared/rapprochement/texte.js referencesVendeur).
  ra text[] := public.doublon_references(p_titre_a); rb text[] := public.doublon_references(p_titre_b);
  -- Taille d'attribut comparable : sans « taille/EU/FR/UK/US », sans parenthèses ;
  -- seulement un nombre ou une taille-lettre (M ≠ 38 ne se juge pas : équivalences).
  ta text := NULLIF(regexp_replace(regexp_replace(lower(COALESCE(p_attr_a #>> '{taille,v}', '')), '\(.*?\)|taille|eu|fr|uk|us|\s', '', 'g'), '[^a-z0-9.,]', '', 'g'), '');
  tb text := NULLIF(regexp_replace(regexp_replace(lower(COALESCE(p_attr_b #>> '{taille,v}', '')), '\(.*?\)|taille|eu|fr|uk|us|\s', '', 'g'), '[^a-z0-9.,]', '', 'g'), '');
  v_voisines jsonb := '{"blanc":["beige","gris"],"beige":["blanc","marron","jaune","orange","rose","gris"],
    "marron":["beige","orange","jaune","rouge","vert","gris","noir"],"noir":["gris","marron","bleu"],
    "gris":["noir","blanc","beige","bleu","vert","marron"],"bleu":["gris","noir","vert","violet"],
    "rouge":["rose","orange","marron","violet"],"rose":["rouge","violet","orange","beige"],
    "vert":["bleu","jaune","marron","gris","beige"],"jaune":["orange","beige","vert","marron"],
    "orange":["rouge","jaune","marron","rose","beige"],"violet":["rose","bleu","rouge"]}'::jsonb;
BEGIN
  -- RÉFÉRENCE (20/11, règle de Nico — thecloset72000) : une référence ou un SKU différent = un article différent.
  -- Deux titres qui en portent chacun, sans aucune en commun ; une seule des deux : on ne juge pas.
  IF cardinality(ra) > 0 AND cardinality(rb) > 0 AND NOT (ra && rb) THEN
    RETURN 'reference';
  END IF;
  -- COULEUR
  IF NOT (ca ->> 'multi')::boolean AND NOT (cb ->> 'multi')::boolean THEN
    a_tout := ARRAY(SELECT jsonb_array_elements_text(ca -> 'base') UNION SELECT jsonb_array_elements_text(ca -> 'nuance'));
    b_tout := ARRAY(SELECT jsonb_array_elements_text(cb -> 'base') UNION SELECT jsonb_array_elements_text(cb -> 'nuance'));
    IF cardinality(a_tout) > 0 AND cardinality(b_tout) > 0 THEN
      a_seul := ARRAY(SELECT unnest(a_tout) EXCEPT SELECT unnest(b_tout));
      b_seul := ARRAY(SELECT unnest(b_tout) EXCEPT SELECT unnest(a_tout));
      IF cardinality(a_seul) > 0 AND cardinality(b_seul) > 0 THEN
        -- Tolérance : deux titres d'UNE couleur chacun, voisines, et l'une
        -- n'est nommée que par une nuance (anthracite / noir).
        IF NOT (cardinality(a_tout) = 1 AND cardinality(b_tout) = 1
                AND COALESCE((v_voisines -> a_tout[1]) ? b_tout[1], false)
                AND (jsonb_array_length(ca -> 'nuance') = 1 OR jsonb_array_length(cb -> 'nuance') = 1)) THEN
          RETURN 'couleur';
        END IF;
      END IF;
    END IF;
  END IF;
  -- NOMBRE
  IF cardinality(na) > 0 AND cardinality(nb) > 0
     AND EXISTS (SELECT 1 FROM unnest(na) x WHERE NOT x = ANY (nb))
     AND EXISTS (SELECT 1 FROM unnest(nb) x WHERE NOT x = ANY (na)) THEN
    RETURN 'nombre';
  END IF;
  -- TAILLE (attributs des deux fiches)
  IF ta IS NOT NULL AND tb IS NOT NULL AND ta <> tb
     AND ((ta ~ '^\d+([.,]\d+)?$' AND tb ~ '^\d+([.,]\d+)?$')
          OR (ta ~ '^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl)$' AND tb ~ '^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl)$')) THEN
    RETURN 'taille';
  END IF;
  RETURN NULL;
END;
$function$;
