-- ── Garde extension + livraison des photos retouchées (2026-08-04) ───────────
-- Chantier « on ne débite jamais pour quelque chose qui n'est pas livré » :
-- 23 jobs publish de 13 utilisateurs (12/13 en WebView native iOS/Android)
-- dorment en pending depuis le 27/07 — Pépites débitées, aucune extension pour
-- exécuter, aucun moyen d'en installer une depuis un téléphone.
--
-- Deux changements, tous deux DANS la transaction du débit :
--
-- 1) REFUS 'extension_required' si profiles.extension_last_seen_at IS NULL :
--    aucune copie de l'extension n'a JAMAIS pollé pour ce compte → le job ne
--    serait ramassé par personne. Refus AVANT tout débit, au même rang que les
--    autres validations. Un extension_last_seen_at renseigné, même ancien,
--    laisse passer : un desktop dont Chrome est fermé reste un parcours normal
--    (le job attend, la relance email cas 1/2 sait quoi lui dire).
--    Le refus porte un champ `message` (langue du profil) affichable tel quel.
--    ⚠️ Les fronts figés d'avant ce chantier (apps natives, Capgo désactivé le
--    29/07) ne savent afficher NI reason inconnu NI message : ils montrent leur
--    « Une erreur est survenue » générique — mais aucune Pépite ne part, c'est
--    le point non négociable. Le front web affiche l'écran d'accroche.
--
-- 2) PERSISTANCE des photos du job dans inventaire.photos, même transaction :
--    la contrepartie du débit (la retouche livrée) ne dépend plus d'un UPDATE
--    client post-RPC (ListingPreviewScreen:5253, perdu si l'app se ferme ou si
--    le réseau tombe entre les deux appels). Débit ⇔ jobs créés ⇔ photos
--    rattachées à l'article : atomique. Les fronts figés en profitent aussi —
--    ils appellent la même RPC. L'UPDATE ne touche que les lignes du user
--    (SECURITY DEFINER ⇒ filtre user_id explicite) et ne fait RIEN si le job
--    ne porte pas de photos. Frontière de propriété (a88bded) : des photos
--    hébergées chez nous (objets du pipeline / storage) rendent le tableau
--    intouchable par la sync du dressing — c'est voulu, l'utilisateur a payé.
--    Le trigger enforce_inventory_limit est BEFORE INSERT seulement (vérifié
--    en prod le 04/08) : cet UPDATE ne peut pas lever LIMIT_REACHED.
--
-- Base : copie EXACTE de la définition prod relevée le 04/08 (identique à
-- 20260729180000). Idempotent : CREATE OR REPLACE.

create or replace function public.spend_coins_and_publish(p_photo_option text, p_jobs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_user      uuid := auth.uid();
  v_price     integer;
  v_wallet    coin_wallets%ROWTYPE;
  v_total     integer;
  v_from_inc  integer;
  v_from_pur  integer;
  v_job_count integer;
  v_tier      text;
  v_conflicts jsonb;
  v_ext_seen  timestamptz;
  v_lang      text;
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

  -- ── Garde extension (2026-08-04) : jamais vue = personne pour exécuter ────
  -- Placée AVANT already_published : « il te faut l'extension » englobe et
  -- explique mieux que « déjà en file » pour un compte qui n'a rien publié.
  SELECT extension_last_seen_at, lang INTO v_ext_seen, v_lang
  FROM profiles WHERE id = v_user;
  IF v_ext_seen IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_lang, 'fr') = 'en'
        THEN 'Publishing requires the free FillSell Chrome extension on a computer — it''s what posts your listings for you. Install it from fillsell.app/extension (your Vinted wardrobe syncs in seconds, included). No Nuggets were charged.'
        ELSE 'Pour publier, il faut l''extension Chrome gratuite FillSell sur un ordinateur : c''est elle qui met tes annonces en ligne pour toi. Installe-la depuis fillsell.app/extension — ton dressing Vinted s''y synchronise en quelques secondes, c''est inclus. Aucune Pépite n''a été débitée.'
      END
    );
  END IF;

  -- ── Garde inventaire_id (2026-07-29) : un publish sans ligne inventaire
  -- serait invisible pour already_published (ci-dessous) comme pour le verrou
  -- client. Refus explicite, AVANT tout débit — au même rang que les autres
  -- validations d'entrée. NULLIF couvre la clé absente ET la chaîne vide.
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
          c.status IN ('pending', 'processing')
          OR (
            c.status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM cross_post_jobs d
              WHERE d.user_id = v_user
                AND d.inventaire_id = c.inventaire_id
                AND d.platform = c.platform
                AND d.action = 'delete'
                AND d.status = 'deleted'
                AND d.created_at > c.created_at
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

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_' || p_photo_option;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    SELECT CASE
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
      'price', v_price, 'balance', v_total
    );
  END IF;

  v_from_inc := LEAST(v_wallet.included_balance, v_price);
  v_from_pur := v_price - v_from_inc;

  UPDATE coin_wallets SET
    included_balance  = included_balance  - v_from_inc,
    purchased_balance = purchased_balance - v_from_pur,
    updated_at        = now()
  WHERE user_id = v_user;

  INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, photo_option,
                               title, description, price, photos, platform_fields)
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
    j->'platform_fields'
  FROM jsonb_array_elements(p_jobs) AS j;

  -- ── Livraison des photos (2026-08-04) : même transaction que le débit ─────
  -- Une seule ligne inventaire par appel en pratique (le stepper publie UN
  -- article) ; DISTINCT ON tient quand même le cas multi-articles. Le tableau
  -- du job remplace celui de la ligne — c'est déjà la sémantique de l'UPDATE
  -- client historique (5253), désormais garanti même si le client meurt
  -- aussitôt la RPC rendue.
  UPDATE inventaire i
  SET photos = sub.photos
  FROM (
    SELECT DISTINCT ON (inv_id) inv_id, photos
    FROM (
      SELECT NULLIF(j->>'inventaire_id','')::bigint AS inv_id, j->'photos' AS photos
      FROM jsonb_array_elements(p_jobs) AS j
    ) x
    WHERE inv_id IS NOT NULL
      AND jsonb_typeof(photos) = 'array'
      AND jsonb_array_length(photos) > 0
  ) sub
  WHERE i.id = sub.inv_id AND i.user_id = v_user;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    v_user, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_publish',
    jsonb_build_object('photo_option', p_photo_option, 'platforms', v_job_count)
  );

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'publish', jsonb_build_object('coins', v_price, 'photo_option', p_photo_option));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;

-- CREATE OR REPLACE conserve les ACL ; ré-assertion par sûreté, à l'identique
-- de 20260729180000.
REVOKE ALL ON FUNCTION public.spend_coins_and_publish(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_coins_and_publish(text, jsonb) TO authenticated, service_role;
