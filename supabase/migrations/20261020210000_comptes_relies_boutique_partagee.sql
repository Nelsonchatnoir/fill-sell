-- ═══════════════════════════════════════════════════════════════════════════
-- COMPTES RELIÉS SUR UNE BOUTIQUE PARTAGÉE : LA FICHE JUMELLE OCCUPE LA PLATEFORME (20/10 soir, Louis)
-- ═══════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/urgences-2010/RAPPORT.md, point 3.
--
-- Constat (20/10) : louis-seller et louis@ (comptes reliés, 18/10) publient sur le MÊME compte Leboncoin. Les
-- 195 fiches coupées en deux le 18/10 portent leur copie Leboncoin chez louis@ (fiche jumelle) ; chez
-- louis-seller, rien ne le disait : « pas publiée » sur Leboncoin. 223 dépôts Leboncoin de louis-seller les
-- 19-20/10, dont 170 sur une fiche jumelle déjà en ligne : 55 refusés par Leboncoin (doublons), 75 jamais
-- apparus, 40 EN LIGNE en double. La règle « une fiche, une annonce par plateforme » (already_published) ne
-- voyait que la fiche, jamais sa jumelle.
--
-- Règle (décisions du 18/10 inchangées : une boutique = un compte, chaque compte surveille ce qu'IL publie,
-- une vente d'un côté retire les copies de l'autre) : une fiche dont la JUMELLE est en ligne — ou en file —
-- sur une plateforme dont la boutique est PARTAGÉE avec le compte relié est « déjà en ligne » sur cette
-- plateforme, pour les deux comptes : aucun nouveau dépôt (spend_coins_and_publish), aucune relance d'un dépôt
-- terminé (déclencheur), et l'app le montre (copies_fiches_jumelles).
-- « Boutique partagée » se PROUVE par le relevé : un relevé d'un des deux comptes a déjà écarté une annonce
-- publiée par l'autre sur cette plateforme (sync_import_ecartes 'compte_relie:<pf>', règle du 18/10). Vinted
-- jamais (une boutique Vinted = un compte). Sans fiche jumelle, rien ne change (un seul couple relié au parc).
-- Inverse : supabase/rollbacks/20261020210000_comptes_relies_boutique_partagee_INVERSE.sql

create or replace function public.boutique_partagee_compte_relie(p_user uuid, p_autre uuid, p_platform text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(p_platform, '') not in ('', 'vinted')
     and public.comptes_sont_lies(p_user, p_autre)
     and exists (select 1 from public.sync_import_ecartes e
                  where e.user_id in (p_user, p_autre) and e.motif = 'compte_relie:' || p_platform)
$$;
revoke all on function public.boutique_partagee_compte_relie(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.boutique_partagee_compte_relie(uuid, uuid, text) to service_role;

-- Les plateformes que la fiche jumelle de p_fiche occupe dans une boutique partagée : son annonce vue par un relevé
-- du compte relié (en ligne ou en vérification, pas disparue), ou un dépôt du compte relié en file, en attente ou
-- publié sans retrait fait après lui (même lecture que already_published).
create or replace function public.jumelle_occupe_plateformes(p_user uuid, p_fiche bigint)
returns table(platform text, listing_id text, url text, statut text, compte uuid, fiche bigint)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with p as (
    select f.fiche_b as fiche, f.user_b as compte from public.fiches_liees_comptes f where f.fiche_a = p_fiche and f.user_a = p_user
    union
    select f.fiche_a, f.user_a from public.fiches_liees_comptes f where f.fiche_b = p_fiche and f.user_b = p_user
  ), vivantes as (
    select a.platform, a.listing_id, a.url, a.statut_plateforme as statut, p.compte, p.fiche, 1 as rang
      from p
      join public.inventaire i on i.id = p.fiche and i.user_id = p.compte and i.fusionne_dans is null
      join public.annonces_plateforme a on a.user_id = p.compte and a.inventaire_id = p.fiche
       and a.disparu_le is null and a.statut_plateforme in ('en_ligne', 'en_verification')
    union all
    select c.platform, public.annonce_id_de_job(c.platform_listing_id, c.listing_url), c.listing_url, c.status, p.compte, p.fiche, 2
      from p
      join public.inventaire i on i.id = p.fiche and i.user_id = p.compte and i.fusionne_dans is null
      join public.cross_post_jobs c on c.user_id = p.compte and c.inventaire_id = p.fiche
       and coalesce(c.action, 'publish') in ('publish', 'republish')
       and (c.status in ('pending', 'processing', 'needs_user')
            or (c.status = 'published' and not exists (
                  select 1 from public.cross_post_jobs d
                   where d.user_id = c.user_id and d.inventaire_id = c.inventaire_id and d.platform = c.platform
                     and d.action = 'delete' and d.status = 'deleted'
                     and case when public.annonce_id_de_job(d.platform_listing_id, d.listing_url) is not null
                               and public.annonce_id_de_job(c.platform_listing_id, c.listing_url) is not null
                              then public.annonce_id_de_job(d.platform_listing_id, d.listing_url) = public.annonce_id_de_job(c.platform_listing_id, c.listing_url)
                              else d.created_at > coalesce(c.published_at, c.created_at) end)))
  )
  select distinct on (v.platform) v.platform, v.listing_id, v.url, v.statut, v.compte, v.fiche
    from vivantes v
   where public.boutique_partagee_compte_relie(p_user, v.compte, v.platform)
   order by v.platform, v.rang, v.listing_id
$$;
revoke all on function public.jumelle_occupe_plateformes(uuid, bigint) from public, anon, authenticated;
grant execute on function public.jumelle_occupe_plateformes(uuid, bigint) to service_role;

-- Pour l'app (auth.uid()) : les copies des fiches jumelles de MES fiches en stock, par plateforme. Vide pour tout
-- compte sans fiche jumelle (lecture de fiches_liees_comptes seulement).
create or replace function public.copies_fiches_jumelles()
returns table(inventaire_id bigint, platform text, listing_id text, url text, statut text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select m.fiche, o.platform, o.listing_id, o.url, o.statut
    from (select f.fiche_a as fiche from public.fiches_liees_comptes f where f.user_a = auth.uid()
          union
          select f.fiche_b from public.fiches_liees_comptes f where f.user_b = auth.uid()) m
    join public.inventaire i on i.id = m.fiche and i.user_id = auth.uid() and i.fusionne_dans is null and i.statut = 'stock'
    cross join lateral public.jumelle_occupe_plateformes(auth.uid(), m.fiche) o
   where auth.uid() is not null
$$;
revoke all on function public.copies_fiches_jumelles() from public, anon;
grant execute on function public.copies_fiches_jumelles() to authenticated, service_role;

-- Relancer un dépôt terminé (échec, annulé, attente → file) quand la jumelle occupe déjà la plateforme : refusé,
-- avec la phrase vraie (même patron que cross_post_jobs_refus_relance_article_vendu).
create or replace function public.cross_post_jobs_refus_relance_jumelle_en_ligne()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_o record;
begin
  if new.status = 'pending' and old.status is distinct from 'pending'
     and coalesce(new.action, 'publish') = 'publish'
     and new.inventaire_id is not null
     and exists (select 1 from public.fiches_liees_comptes f where f.fiche_a = new.inventaire_id or f.fiche_b = new.inventaire_id) then
    select o.* into v_o from public.jumelle_occupe_plateformes(new.user_id, new.inventaire_id) o where o.platform = new.platform limit 1;
    if v_o.platform is not null then
      raise exception 'Relance refusée : cet article est déjà en ligne sur % via ton compte FillSell relié% — republier ferait un doublon, rien à refaire (article %, job %).',
        initcap(new.platform), coalesce(' (annonce ' || v_o.listing_id || ')', ''), new.inventaire_id, new.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.cross_post_jobs_refus_relance_jumelle_en_ligne() from public, anon, authenticated;
drop trigger if exists cross_post_jobs_refus_relance_jumelle_en_ligne on public.cross_post_jobs;
create trigger cross_post_jobs_refus_relance_jumelle_en_ligne
  before update of status on public.cross_post_jobs
  for each row when (new.status = 'pending' and old.status is distinct from 'pending' and new.inventaire_id is not null)
  execute function public.cross_post_jobs_refus_relance_jumelle_en_ligne();

-- spend_coins_and_publish : corps relu en prod (pg_get_functiondef, 20/10 ≈ 22:40), garde ajoutée seule.
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

  -- (09/10 soir, Louis) La garde « fiche jumelle en ligne » (27/09, motif
  -- jumeau_en_ligne) est RETIRÉE : une annonce rattachée à une AUTRE fiche
  -- n'est jamais un « déjà en ligne » pour celle-ci. Seule reste la règle
  -- « une fiche, une annonce en ligne par plateforme » (already_published
  -- ci-dessus, inchangée). Migration 20261009233000.

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
      j->'platform_fields',
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
  );
END;
$function$;
