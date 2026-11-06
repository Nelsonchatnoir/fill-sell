-- ═══════════════════════════════════════════════════════════════════════════
-- L'ORDRE DES PHOTOS DE L'ARTICLE FAIT FOI (06/11/2026, the_closet72 — règle de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Constat (prouvé en base) : deux jeans publiés le 06/11 à 16:50 et 17:05 dans l'ordre de prise de vue (la fiche
-- enregistrée au clic porte photos ET processedPhotos 0, 1, 2…), puis réordonnés dans Stock › Modifier à 17:21 et
-- 17:35 (journaux PostgREST). L'article gardait le nouvel ordre ; rien ne le portait plus loin :
--   · spend_coins_and_republish reprenait les photos de l'ANCIEN job (la fiche n'était qu'un repli) ;
--   · remises_en_vente_tick, pareil (le job vendu d'abord) ;
--   · une tâche pas encore partie gardait l'ordre de sa création.
-- Même défaut chez Alizee (Leboncoin republiée le 10/10 dans l'ordre d'avant, couverture comprise) et DeadRoz.
--
-- La règle (public.photos_ordre_article, jumeau exact de supabase/functions/_shared/ordre-photos.js) :
--   · l'ordre de l'article fait foi ; un ordre CHOISI pour une plateforme (photos_choisies) le remplace pour elle ;
--   · un dépôt plafonné (lbcPhotosCapped : quota gratuit Leboncoin) garde les N premières de l'article ;
--   · sinon le job garde SES photos, remises dans l'ordre de l'article ; le moindre doute → le job tel quel.
-- Ce que fait cette migration :
--   1. public.photos_ordre_article (IMMUTABLE, pure) ;
--   2. spend_coins_and_republish et remises_en_vente_tick : définitions de PROD du 06/11 (pg_get_functiondef),
--      une seule insertion chacune — les photos du job source passent par la règle ;
--   3. déclencheur inventaire_ordre_photos_vers_taches : l'ordre changé sur l'article passe aux tâches PAS ENCORE
--      PARTIES de cet article (pending, needs_user, failed ; jamais processing, jamais une annonce en ligne).
-- Les annonces DÉJÀ en ligne ne sont pas touchées ici (remise en ordre sur place : proposition séparée, feu vert).
-- Prouvé sur un Postgres jetable : scripts/preuve-ordre-photos.mjs ; règle verrouillée : npm run selftest:ordre-photos.

-- ── 1. LA RÈGLE ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.photos_ordre_article(p_job jsonb, p_article jsonb, p_pf jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_cles text[];
  v_art_cles text[] := '{}';
  v_art_ent  jsonb[] := '{}';
  v_e        jsonb;
  v_c        text;
  v_i        integer;
  v_n        integer;
  v_plaf     boolean;
  v_sortie   jsonb := '[]'::jsonb;
BEGIN
  IF p_job IS NULL OR jsonb_typeof(p_job) <> 'array' OR jsonb_array_length(p_job) = 0 THEN RETURN p_job; END IF;
  -- Un ordre choisi pour CETTE plateforme : le sien, tel quel.
  IF COALESCE(p_pf ->> 'photos_choisies', '') = 'true' THEN RETURN p_job; END IF;
  IF p_article IS NULL OR jsonb_typeof(p_article) <> 'array' OR jsonb_array_length(p_article) = 0 THEN RETURN p_job; END IF;
  -- La clé d'une photo : son URL sans la requête (?v=…).
  SELECT array_agg(NULLIF(split_part(btrim(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}'
                                                                 WHEN 'object' THEN e ->> 'url' END, E' \t\r\n'), '?', 1), '')
                   ORDER BY o)
    INTO v_job_cles
    FROM jsonb_array_elements(p_job) WITH ORDINALITY AS t(e, o);
  IF array_position(v_job_cles, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT c) FROM unnest(v_job_cles) AS c) <> cardinality(v_job_cles) THEN
    RETURN p_job;
  END IF;
  FOR v_e IN SELECT e FROM jsonb_array_elements(p_article) WITH ORDINALITY AS t(e, o) ORDER BY o LOOP
    v_c := NULLIF(split_part(btrim(CASE jsonb_typeof(v_e) WHEN 'string' THEN v_e #>> '{}'
                                                          WHEN 'object' THEN v_e ->> 'url' END, E' \t\r\n'), '?', 1), '');
    IF v_c IS NOT NULL AND NOT (v_c = ANY (v_art_cles)) THEN
      v_art_cles := array_append(v_art_cles, v_c);
      v_art_ent := array_append(v_art_ent, v_e);
    END IF;
  END LOOP;
  -- Une photo du job que l'article ne porte pas (autre hébergement, photo retirée) : aucune déduction.
  IF NOT (v_job_cles <@ v_art_cles) THEN RETURN p_job; END IF;
  v_plaf := COALESCE(p_pf ->> 'lbcPhotosCapped', '') = 'true';
  v_n := cardinality(v_job_cles);
  FOR v_i IN 1 .. cardinality(v_art_cles) LOOP
    v_c := v_art_cles[v_i];
    IF v_plaf THEN
      -- Dépôt plafonné : les N premières de l'article.
      EXIT WHEN jsonb_array_length(v_sortie) >= v_n;
      IF v_c = ANY (v_job_cles) THEN
        v_sortie := v_sortie || jsonb_build_array(p_job -> (array_position(v_job_cles, v_c) - 1));
      ELSIF jsonb_typeof(v_art_ent[v_i]) = 'string' THEN
        v_sortie := v_sortie || jsonb_build_array(jsonb_build_object('url', v_art_ent[v_i] #>> '{}',
          'type', CASE WHEN jsonb_array_length(v_sortie) = 0 THEN 'original' ELSE 'photo_' || jsonb_array_length(v_sortie) END));
      ELSE
        v_sortie := v_sortie || jsonb_build_array(v_art_ent[v_i]);
      END IF;
    ELSIF v_c = ANY (v_job_cles) THEN
      -- Les photos du job, dans l'ordre de l'article.
      v_sortie := v_sortie || jsonb_build_array(p_job -> (array_position(v_job_cles, v_c) - 1));
    END IF;
  END LOOP;
  IF v_sortie = p_job THEN RETURN p_job; END IF;
  RETURN v_sortie;
EXCEPTION WHEN OTHERS THEN
  -- Jamais une republication, une remise en vente ou une écriture de fiche refusée à cause de l'ordre : le job tel quel.
  RETURN p_job;
END
$function$;

COMMENT ON FUNCTION public.photos_ordre_article(jsonb, jsonb, jsonb) IS
  '06/11 (the_closet72) : les photos d''un job dans l''ordre de l''article (inventaire.photos) — choix par plateforme gardé, dépôt plafonné = N premières, doute = job tel quel. Jumeau : supabase/functions/_shared/ordre-photos.js.';

-- ── 2a. REPUBLICATION : définition de PROD du 06/11 (pg_get_functiondef), une insertion ─────────────────
CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(p_inventaire_id bigint, p_vinted_item_id text, p_source text DEFAULT 'manuel'::text, p_prix_republication numeric DEFAULT NULL::numeric, p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_partie   text;   -- (05/11) republication_annonce_partie()
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
  v_garde    jsonb;
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

    -- ── (05/11, décision de Nico) UNE ANNONCE QU'ON SAIT PARTIE NE SE REPUBLIE PAS : refus à la source, rien décompté ──
    -- Le bouton « Republier » de l'app la créait quand même (sale_signal retiré de la copie), puis elle s'arrêtait
    -- « introuvable » ou attendait sans fin. Le juge est celui des relevés (7c48b8c) : republication_annonce_partie()
    -- lit ses verdicts, jamais un doute. Motif d'article (la file automatique passe au candidat suivant).
    v_partie := public.republication_annonce_partie(v_user, p_inventaire_id, v_platform, v_lid);
    IF v_partie IS NOT NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'annonce_introuvable', 'motif', v_partie,
        'platform', v_platform, 'annonce', v_lid,
        'message', CASE
          WHEN COALESCE(v_prof.lang, 'fr') = 'en' AND v_partie = 'annonce_vendue'
            THEN 'Repost not started: this ' || initcap(v_platform) || ' listing is sold. Nothing was used from your plan.'
          WHEN COALESCE(v_prof.lang, 'fr') = 'en'
            THEN 'Repost not started: this ' || initcap(v_platform) || ' listing is no longer online (confirmed by your syncs, '
              || 'not seen since). Nothing was used from your plan. « Sync » reads it again.'
          WHEN v_partie = 'annonce_vendue'
            THEN 'Republication pas lancée : cette annonce ' || initcap(v_platform) || ' est vendue. Rien n''a été décompté.'
          ELSE 'Republication pas lancée : cette annonce ' || initcap(v_platform) || ' n''est plus en ligne (confirmé par les relevés, '
            || 'pas revue depuis). Rien n''a été décompté. « Synchroniser » la relit.' END);
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
    -- (06/11, the_closet72 — règle de Nico) L'ORDRE DE L'ARTICLE FAIT FOI, en republication aussi : les photos du job
    -- source (rien d'ajouté, rien de retiré) remises dans l'ordre de la fiche ; un choix fait pour CETTE plateforme
    -- (photos_choisies) gardé tel quel ; un dépôt plafonné (quota Leboncoin) = les N premières de la fiche
    -- (public.photos_ordre_article). Avant : l'ordre de l'ANCIEN job, même après un réordonnancement de la fiche.
    v_photos := public.photos_ordre_article(v_photos,
      (SELECT i.photos FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user),
      v_src.platform_fields);
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
    -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : 1 500 au Premium, illimité au Pro avec la grille.
    v_plafond := quota_remontees_plafond(v_tier);
    IF v_plafond IS NOT NULL AND v_plafond > 0 THEN
      SELECT COALESCE(max(created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger WHERE user_id = v_user AND kind IN ('grant_monthly','grant_upgrade');
      -- (03/11, décision de Nico) faites + en cours, jamais les annulées jamais publiées (remontees_du_cycle).
      v_faits := remontees_du_cycle(v_user, v_cycle);
      IF v_faits >= v_plafond THEN
        IF p_source = 'auto' THEN
          RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
        END IF;
        -- (04/11/2026, demande de Nico : la remise à zéro, aussi pour les payants ; seulement avec la grille)
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',
                                  'plafond', v_plafond, 'faites', v_faits)
          || CASE WHEN jauges_actives() THEN jsonb_build_object('remise_le', (SELECT w.next_grant_at FROM coin_wallets w WHERE w.user_id = v_user)) ELSE '{}'::jsonb END;
      END IF;
    END IF;
  END IF;

  -- (03/11/2026, grille à 3 jauges, décision de Nico ; interrupteur coin_config.grille_trois_jauges, 0 = règles d'avant) : le garde-fou du jour. L'automatique reçoit le code que l'extension 0.6.169 connaît déjà.
  v_garde := garde_fou_jour(v_user, 'remontees', 1);
  IF v_garde IS NOT NULL THEN
    IF p_source = 'auto' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'garde_fou', true,
                                'plafond', (v_garde ->> 'garde')::integer);
    END IF;
    RETURN v_garde || jsonb_build_object('platform', v_platform);
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
    -- (04/11) D'abord aucune trace de retrait (règle par préfixes), puis la liste d'avant.
    v_pf_src := public.republication_sans_traces(COALESCE(v_src.platform_fields, '{}'::jsonb))
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

-- ── 2b. REMISE EN VENTE APRÈS VENTE : définition de PROD du 06/11 (pg_get_functiondef), une insertion ────
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
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

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
                            'abandonnees', v_abandons, 'cpu', v_cpu);
END;
$function$;

-- ── 3. L'ORDRE CHANGÉ SUR L'ARTICLE PASSE AUX TÂCHES PAS ENCORE PARTIES ──────
-- Stock › Modifier, une publication qui réordonne la fiche (spend_coins_and_publish), tout geste qui change
-- inventaire.photos : les publications et republications de CET article qui ne sont pas encore parties suivent.
-- Jamais une tâche en cours (processing), jamais une annonce en ligne, jamais un choix par plateforme ; une écriture
-- seulement si l'ordre change vraiment (aucune ligne inchangée réécrite). Coût : une requête indexée
-- (cross_post_jobs_inventaire) par changement de photos d'un article.
CREATE OR REPLACE FUNCTION public.inventaire_ordre_photos_vers_taches()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF jsonb_typeof(NEW.photos) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.photos) < 2 THEN RETURN NULL; END IF;
  UPDATE cross_post_jobs j
     SET photos = public.photos_ordre_article(j.photos, NEW.photos, j.platform_fields)
   WHERE j.inventaire_id = NEW.id
     AND j.user_id = NEW.user_id
     AND j.action IN ('publish', 'republish')
     AND j.status IN ('pending', 'needs_user', 'failed')
     AND jsonb_typeof(j.photos) = 'array' AND jsonb_array_length(j.photos) > 1
     AND public.photos_ordre_article(j.photos, NEW.photos, j.platform_fields) IS DISTINCT FROM j.photos;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Jamais une écriture de fiche refusée à cause des tâches : l'ordre des tâches reste celui d'avant.
  RAISE WARNING 'inventaire_ordre_photos_vers_taches : article % : % — tâches inchangées', NEW.id, SQLERRM;
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS inventaire_ordre_photos_vers_taches ON public.inventaire;
CREATE TRIGGER inventaire_ordre_photos_vers_taches
  AFTER UPDATE OF photos ON public.inventaire
  FOR EACH ROW WHEN (OLD.photos IS DISTINCT FROM NEW.photos)
  EXECUTE FUNCTION public.inventaire_ordre_photos_vers_taches();
