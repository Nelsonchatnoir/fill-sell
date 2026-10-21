-- Essai à blanc de 20261020210000 (comptes reliés) + 20261020220000 (jamais vue en ligne) — 20/10 soir : ROLLBACK.
-- npx supabase db query --linked -f scripts/essais/20261020220000_essai.sql
-- B : boutique partagée, jumelle, copies pour l'app, garde de publication, relance. C : déclencheur, trancher
-- (nouvelle boucle, jumelle), rejeu symétrique avant/après sur le dernier relevé probant de chaque compte × plateforme.
begin;
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
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

-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE JAMAIS VUE EN LIGNE N'EST JAMAIS « PLUS EN LIGNE — VENDUE ? » (20/10 soir, Sébastien)
-- ═══════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/urgences-2010/RAPPORT.md, point 1.
--
-- Constat (20/10) : 13 dépôts Beebs de Sébastien (Pro), 09:10 → 11:13, jamais vus par aucun relevé Beebs (ni en
-- ligne, ni en vérification) ni par la veille ; leur page publique répond 404. La veille de l'extension lit le
-- lien du dépôt (posé dès le numéro, 30/09) : 404 deux fois → unavailable_since + sale_signal 'unavailable' →
-- « Annonces plus en ligne — Vendue ? ». Un « Oui » écrivait une fausse vente et retirait ses vraies annonces
-- ailleurs. La règle du 09/10 (un dépôt jamais vu en ligne est un échec, jamais une vente) ne couvrait que les
-- dépôts SANS lien (trancher_publications_sans_lien) ; Beebs, jamais jugé (27/09), restait à la merci de la veille.
--
-- Règle, pour tout le parc :
--   1. un dépôt (non Vinted) qui n'a JAMAIS été vu en ligne — ni par un relevé de son compte (en ligne / vendue),
--      ni par la veille (vu_en_ligne_le) — ne reçoit jamais la question : le drapeau « plus en ligne » est
--      remplacé par le marqueur platform_fields.pas_encore_visible (déclencheur, quel que soit l'écrivain) ;
--      l'app y lit « Beebs vérifie ton annonce » (message existant) ;
--   2. le marqueur s'efface dès que la veille ou un relevé voit l'annonce en ligne ;
--   3. toujours invisible après la grâce (72 h Beebs, 4 h ailleurs) et absent de deux relevés complets : échec
--      de publication (trancher_publications_sans_lien, nouvelle boucle des dépôts AVEC lien), ou clos sans rouge
--      si l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié — 20261020210000).
-- Inchangé : une annonce VUE en ligne puis disparue (question d'avant), une preuve de vente « sold », Vinted.
-- Dépend de 20261020210000 (jumelle_occupe_plateformes).
-- trancher_publications_sans_lien : corps relu en prod (pg_get_functiondef, 20/10 ≈ 22:45), ajouts seuls.
-- Inverse : supabase/rollbacks/20261020220000_jamais_vue_en_ligne_jamais_vendue_INVERSE.sql

-- Jamais vu en ligne : ni la veille, ni un relevé de son compte (en ligne ou vendue) sous un de ses identifiants
-- ou rattaché à lui.
create or replace function public.job_jamais_vu_en_ligne(p_job uuid, p_user uuid, p_platform text, p_vu_en_ligne timestamptz,
                                                         p_listing_id text, p_listing_url text, p_pf jsonb)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select p_vu_en_ligne is null and not exists (
    select 1 from public.annonces_plateforme a
     where a.user_id = p_user and a.platform = p_platform
       and a.statut_plateforme in ('en_ligne', 'vendue')
       and (a.job_id = p_job
            or a.listing_id = any (array_remove(array[
                 nullif(btrim(p_listing_id), ''),
                 public.annonce_id_job(p_platform, p_listing_url),
                 nullif(btrim(p_pf #>> '{lbc_depot,adsubmit,id}'), ''),
                 nullif(btrim(p_pf #>> '{lbc_depot,sans_adsubmit,id}'), '')], null))))
$$;
revoke all on function public.job_jamais_vu_en_ligne(uuid, uuid, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.job_jamais_vu_en_ligne(uuid, uuid, text, timestamptz, text, text, jsonb) to service_role;

-- Le déclencheur. Nommé pour passer APRÈS cross_post_jobs_vu_en_ligne (les déclencheurs BEFORE d'une table passent
-- par ordre alphabétique : « vu_ » avant « vue_ ») : quand la veille voit l'annonce en ligne dans la même écriture,
-- vu_en_ligne_le est déjà posé ici, et le marqueur s'efface.
create or replace function public.cross_post_jobs_vue_ou_pas_encore_visible()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_pev jsonb;
begin
  -- Restauration par nous seuls (inverse d'une réparation) : même porte que fillsell.import_releve.
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  -- Vue en ligne (la veille vient de la voir) : plus « pas encore visible ».
  if new.platform_fields ? 'pas_encore_visible' and new.vu_en_ligne_le is not null then
    new.platform_fields := new.platform_fields - 'pas_encore_visible';
    return new;
  end if;
  -- Un drapeau « plus en ligne » NEUF (pas une preuve de vente) sur un dépôt jamais vu en ligne : pas de question.
  if new.platform_fields ? 'unavailable_since'
     and not (coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since')
     and coalesce(new.platform_fields ->> 'sale_signal', 'unavailable') = 'unavailable'
     -- Les DÉPÔTS seulement : une recréation (republish) jamais revue a son propre circuit (« introuvable à confirmer »).
     and new.status = 'published' and coalesce(new.action, 'publish') = 'publish'
     and public.job_jamais_vu_en_ligne(new.id, new.user_id, new.platform, new.vu_en_ligne_le,
                                       new.platform_listing_id, new.listing_url, new.platform_fields) then
    v_pev := coalesce(old.platform_fields -> 'pas_encore_visible', '{}'::jsonb);
    new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'unavailable_pending_since'])
      || jsonb_build_object('pas_encore_visible', jsonb_build_object(
           'depuis', coalesce(v_pev -> 'depuis', to_jsonb(now())),
           'lectures', coalesce((v_pev ->> 'lectures')::int, 0) + 1,
           'derniere', now(),
           'regle', 'jamais_vue_en_ligne_2010'));
  end if;
  return new;
exception when others then
  raise warning 'cross_post_jobs_vue_ou_pas_encore_visible : job % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $$;
revoke all on function public.cross_post_jobs_vue_ou_pas_encore_visible() from public, anon, authenticated;
drop trigger if exists cross_post_jobs_vue_ou_pas_encore_visible on public.cross_post_jobs;
create trigger cross_post_jobs_vue_ou_pas_encore_visible
  before update of platform_fields, last_checked_at, vu_en_ligne_le on public.cross_post_jobs
  for each row when (new.platform <> 'vinted' and (
        (new.platform_fields ? 'unavailable_since' and not (coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since'))
     or (new.platform_fields ? 'pas_encore_visible' and new.vu_en_ligne_le is not null)))
  execute function public.cross_post_jobs_vue_ou_pas_encore_visible();

CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
  v_jum_id text;
  v_grace interval;
  n_jumelle integer := 0; n_jamais_vues integer := 0; n_visibles integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- (20/10) « PAS ENCORE VISIBLE » LEVÉ PAR LE RELEVÉ : une annonce que le relevé de CE compte voit en ligne (ou
  -- vendue) n'est plus « pas encore visible » — le marqueur posé par cross_post_jobs_vue_ou_pas_encore_visible
  -- s'efface. Bornée aux jobs qui le portent ; aucune autre ligne réécrite.
  UPDATE cross_post_jobs c SET platform_fields = c.platform_fields - 'pas_encore_visible'
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.platform_fields ? 'pas_encore_visible'
     AND EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.statut_plateforme IN ('en_ligne', 'vendue')
                    AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)));
  GET DIAGNOSTICS n_visibles = ROW_COUNT;

  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été mis en ligne par ' || v_nom || ' (refusé à la vérification ou retiré), mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    -- (20/10, Louis) Comptes reliés sur une boutique PARTAGÉE : la fiche JUMELLE y est en ligne (vue par le relevé
    -- du compte relié) — ce dépôt était le doublon, refusé par la plateforme : clos sans rouge, rien à refaire.
    v_jum_id := NULL;
    IF j.inventaire_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
      SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
       WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
    END IF;
    IF v_jum_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
          || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', v_jum_id))
       WHERE id = j.id AND status = 'published';
      n_jumelle := n_jumelle + 1; n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    v_msg := v_nom || ' n''a jamais mis cette annonce en ligne : elle a été refusée par sa modération (ou retirée avant sa mise en ligne). '
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne : ' || v_nom || ' refuse les doublons. '
           ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. '
      || 'Absente de tes annonces aux relevés du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || '.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  -- ── (20/10, Sébastien) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE VENTE — AUSSI QUAND IL A UN LIEN ────────
  -- La boucle ci-dessus ne lit que les dépôts SANS lien. Un dépôt Beebs a toujours son lien (numéro → /fr/p/,
  -- déclencheur du 30/09) ; Leboncoin, eBay, Depop souvent. Jamais vu en ligne (aucun relevé de ce compte ne l'a
  -- vu, sous aucun statut ; la veille non plus), il ne pose plus la question « Plus en ligne — Vendue ? »
  -- (cross_post_jobs_vue_ou_pas_encore_visible) : il reste « pas encore visible ». Toujours absent de deux
  -- relevés complets après la grâce — 72 h pour Beebs (sa vérification est humaine), 4 h ailleurs — c'est un
  -- ÉCHEC DE PUBLICATION, traité comme celui d'au-dessus : 'failed' + motif + publication rendue, ou clos sans
  -- rouge quand l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié). Ni vente, ni
  -- stock touché, ni retrait, ni question. Vinted jamais (sa preuve est le dressing). Une question déjà ouverte
  -- reste telle quelle. Bornée : 14 derniers jours, 25 par relevé.
  IF p_platform <> 'vinted' THEN
    v_grace := CASE WHEN p_platform = 'beebs' THEN interval '72 hours' ELSE interval '4 hours' END;
    FOR j IN
      SELECT c.id, c.platform_listing_id, c.listing_url, c.platform_fields, c.inventaire_id, c.vu_en_ligne_le,
             COALESCE(c.published_at, c.created_at) AS publie
        FROM cross_post_jobs c
       WHERE c.user_id = p_user AND c.platform = p_platform
         AND c.status = 'published' AND c.action = 'publish' AND c.listing_url IS NOT NULL
         AND c.vu_en_ligne_le IS NULL
         AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')
         AND COALESCE(c.published_at, c.created_at) > now() - interval '14 days'
         AND COALESCE(c.published_at, c.created_at) < now() - v_grace
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                          WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)))
       ORDER BY COALESCE(c.published_at, c.created_at)
       LIMIT 25 FOR UPDATE OF c SKIP LOCKED
    LOOP
      v_ids := ARRAY(
        SELECT DISTINCT x FROM unnest(ARRAY[
          NULLIF(btrim(j.platform_listing_id), ''),
          annonce_id_job(p_platform, j.listing_url),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
        ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
      IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;
      -- Vue par un relevé sous un de ses identifiants, ou rattachée au job (tout statut, « en vérification »
      -- compris) : ce n'est pas un refus — la plateforme l'examine encore, ou elle est en ligne.
      IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform
                    AND (ap.listing_id = ANY(v_ids) OR ap.job_id = j.id)) THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_precedent.id IS NULL OR v_precedent.started_at < j.publie + v_grace THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_vivante := NULL;
      SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
       WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
         AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
         AND ap.listing_id <> ALL(v_ids)
       ORDER BY ap.vu_le DESC LIMIT 1;
      v_jum_id := NULL;
      IF v_vivante.listing_id IS NULL AND j.inventaire_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
        SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
         WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
      END IF;
      IF v_vivante.listing_id IS NOT NULL OR v_jum_id IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = CASE WHEN v_vivante.listing_id IS NOT NULL
            THEN 'Ce dépôt n''a jamais été mis en ligne par ' || v_nom || ' (refusé à la vérification ou retiré), mais ton article y est en ligne sous l''annonce '
                 || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.'
            ELSE 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
                 || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', CASE WHEN v_vivante.listing_id IS NOT NULL THEN 'article_en_ligne_ailleurs' ELSE 'en_ligne_par_compte_relie' END,
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        IF v_jum_id IS NOT NULL THEN n_jumelle := n_jumelle + 1; END IF;
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_doublon := NULL;
      SELECT ap.listing_id INTO v_doublon
        FROM inventaire i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
        JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
        JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
          AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
        JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
       WHERE i.id = j.inventaire_id AND i.user_id = p_user
       LIMIT 1;
      v_refund := refund_publish_unconfirmed(j.id);
      v_msg := v_nom || ' n''a jamais mis cette annonce en ligne : '
        || CASE WHEN p_platform = 'beebs'
             THEN 'trois jours après le dépôt, elle n''est ni en ligne ni « en vérification » dans tes annonces Beebs — refusée par sa vérification, ou retirée. '
             ELSE 'elle a été refusée par sa modération (ou retirée avant sa mise en ligne). ' END
        || CASE WHEN v_doublon.listing_id IS NOT NULL
             THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne : ' || v_nom || ' refuse les doublons. '
             ELSE '' END
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. '
        || 'Absente de tes annonces aux relevés du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
        || ' et du ' || v_releve_txt || '.';
      UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund, 'avec_lien', true))
       WHERE id = j.id AND status = 'published';
      n_jamais_vues := n_jamais_vues + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees + n_jamais_vues, 'en_ligne', n_en_ligne, 'en_attente', n_attente,
                            'jamais_vues_avec_lien', n_jamais_vues, 'compte_relie', n_jumelle, 'redevenues_visibles', n_visibles);
END;
$function$;

-- Les corps d'AVANT, sous un autre nom, pour comparer (annulés avec le reste).
CREATE OR REPLACE FUNCTION public._trancher_avant_2010(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été mis en ligne par ' || v_nom || ' (refusé à la vérification ou retiré), mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    v_msg := v_nom || ' n''a jamais mis cette annonce en ligne : elle a été refusée par sa modération (ou retirée avant sa mise en ligne). '
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne : ' || v_nom || ' refuse les doublons. '
           ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. '
      || 'Absente de tes annonces aux relevés du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || '.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees, 'en_ligne', n_en_ligne, 'en_attente', n_attente);
END;
$function$;

CREATE OR REPLACE FUNCTION public._spend_avant_2010(p_photo_option text, p_jobs jsonb)
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


-- ═══ Les tests ═══
do $$
declare
  seb uuid := '48dd94f7-3105-49a7-af54-24d9c479a980';
  ls uuid := '447d920c-976a-4d8f-aff4-a2998050358c';
  lou uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  r jsonb; r2 jsonb; n int; n2 int; t text; v_job uuid; v_job2 uuid; v_inv bigint; pf jsonb; v_run uuid; v_run_ls uuid;
  v_fiche_echec bigint; v_job_echec uuid;
begin
  -- ── B : boutique partagée, jumelle, copies, garde de publication, relance ─────────────────────────
  insert into _r values ('B01 boutique partagée louis-seller/louis@ leboncoin', boutique_partagee_compte_relie(ls, lou, 'leboncoin'), '');
  insert into _r values ('B02 beebs pas partagée', not boutique_partagee_compte_relie(ls, lou, 'beebs'), '');
  insert into _r values ('B03 vinted jamais', not boutique_partagee_compte_relie(ls, lou, 'vinted'), '');
  insert into _r values ('B04 comptes non reliés jamais', not boutique_partagee_compte_relie(seb, ls, 'leboncoin'), '');

  -- Un des 55 échecs Leboncoin de louis-seller (fiche jumelle en ligne chez louis@).
  select j.id, j.inventaire_id into v_job_echec, v_fiche_echec from cross_post_jobs j
   where j.user_id = ls and j.platform = 'leboncoin' and j.status = 'failed' and j.action = 'publish'
     and j.platform_fields ? 'depot_jamais_en_ligne'
     and exists (select 1 from jumelle_occupe_plateformes(ls, j.inventaire_id) o where o.platform = 'leboncoin' and o.statut = 'en_ligne')
     and not exists (select 1 from cross_post_jobs k where k.inventaire_id = j.inventaire_id and k.platform = 'leboncoin' and k.status in ('pending','processing','needs_user','published') and k.action = 'publish')
   order by j.created_at limit 1;
  select count(*) into n from jumelle_occupe_plateformes(ls, v_fiche_echec) o where o.platform = 'leboncoin';
  insert into _r values ('B05 jumelle occupe leboncoin pour la fiche d''un échec', v_fiche_echec is not null and n = 1, coalesce(v_fiche_echec::text, 'aucune'));

  perform set_config('request.jwt.claims', json_build_object('sub', ls, 'role', 'authenticated')::text, true);
  select count(*), count(*) filter (where platform = 'leboncoin'), count(distinct inventaire_id) into n, n2, v_inv from copies_fiches_jumelles();
  insert into _r values ('B06 copies_fiches_jumelles louis-seller : leboncoin seulement', n > 0 and n = n2, n || ' copie(s), ' || v_inv || ' fiche(s)');
  -- garde de publication
  r := spend_coins_and_publish('original', jsonb_build_array(jsonb_build_object('inventaire_id', v_fiche_echec, 'platform', 'leboncoin', 'title', 'Essai', 'price', 999, 'photos', '[]'::jsonb, 'platform_fields', '{}'::jsonb)));
  insert into _r values ('B09 publier leboncoin sur la fiche jumelle refusé (compte_relie)',
    r->>'reason' = 'already_published' and r->'compte_relie' ? 'leboncoin', r::text);
  r := spend_coins_and_publish('original', jsonb_build_array(jsonb_build_object('inventaire_id', v_fiche_echec, 'platform', 'beebs', 'title', 'Essai', 'price', 999, 'photos', '[]'::jsonb, 'platform_fields', '{}'::jsonb)));
  insert into _r values ('B10 publier beebs (boutique non partagée) jamais refusé par la jumelle', not (r ? 'compte_relie'), r::text);
  perform set_config('request.jwt.claims', json_build_object('sub', seb, 'role', 'authenticated')::text, true);
  select count(*) into n from copies_fiches_jumelles();
  insert into _r values ('B07 copies_fiches_jumelles d''un compte sans jumelle : vide', n = 0, n::text);
  perform set_config('request.jwt.claims', json_build_object('sub', lou, 'role', 'authenticated')::text, true);
  select count(*) into n from copies_fiches_jumelles();
  insert into _r values ('B08 copies_fiches_jumelles louis@ (copies de louis-seller)', true, n::text);

  -- B11 compte non relié : même réponse que la fonction d'avant (savepoints implicites, annulés)
  perform set_config('request.jwt.claims', json_build_object('sub', seb, 'role', 'authenticated')::text, true);
  select id into v_inv from inventaire where user_id = seb and statut = 'stock' and fusionne_dans is null order by id desc limit 1;
  begin
    r := _spend_avant_2010('original', jsonb_build_array(jsonb_build_object('inventaire_id', v_inv, 'platform', 'leboncoin', 'title', 'Essai', 'price', 999, 'photos', '[]'::jsonb, 'platform_fields', '{}'::jsonb)));
    raise exception 'annule';
  exception when raise_exception then null; end;
  begin
    r2 := spend_coins_and_publish('original', jsonb_build_array(jsonb_build_object('inventaire_id', v_inv, 'platform', 'leboncoin', 'title', 'Essai', 'price', 999, 'photos', '[]'::jsonb, 'platform_fields', '{}'::jsonb)));
    raise exception 'annule';
  exception when raise_exception then null; end;
  insert into _r values ('B11 compte non relié : réponse identique avant/après', (r - 'reserved_after' - 'included_after' - 'purchased_after') = (r2 - 'reserved_after' - 'included_after' - 'purchased_after'), r::text || ' / ' || r2::text);
  perform set_config('request.jwt.claims', '', true);

  -- B12 relance d'un échec dont la jumelle est en ligne : refusée
  begin
    update cross_post_jobs set status = 'pending', error = null where id = v_job_echec;
    insert into _r values ('B12 relance refusée (jumelle en ligne)', false, 'acceptée');
  exception when check_violation then insert into _r values ('B12 relance refusée (jumelle en ligne)', sqlerrm like '%compte FillSell relié%', sqlerrm); end;
  -- B13 relance d'un échec d'un compte non relié : ce déclencheur ne dit rien
  select j.id into v_job from cross_post_jobs j join inventaire i on i.id = j.inventaire_id and i.statut = 'stock'
   where j.status = 'failed' and j.action = 'publish' and j.user_id not in (ls, lou) and j.created_at > now() - interval '10 days' limit 1;
  begin
    begin
      update cross_post_jobs set status = 'pending', error = null where id = v_job;
      t := 'acceptée';
    exception when others then t := sqlerrm; end;
    raise exception 'annule';
  exception when raise_exception then null; end;
  insert into _r values ('B13 relance d''un autre compte : pas de refus « compte relié »', v_job is not null and t not like '%compte FillSell relié%', coalesce(t, 'aucun job'));

  -- ── C : le déclencheur « jamais vue en ligne » ───────────────────────────────────────────────────
  -- C01 dépôt Beebs de Sébastien jamais vu : drapeau neuf → remplacé par pas_encore_visible
  v_job := 'f1c1a63e-a36e-434d-9bb4-e60eacf3f8bf';
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since'] where id = v_job;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = v_job;
  select platform_fields into pf from cross_post_jobs where id = v_job;
  insert into _r values ('C01 jamais vue : pas de question, pas_encore_visible', not (pf ? 'unavailable_since') and not (pf ? 'sale_signal') and pf ? 'pas_encore_visible', (pf->'pas_encore_visible')::text);
  -- C06 la veille la voit en ligne : vu_en_ligne_le posé, marqueur effacé (même écriture)
  update cross_post_jobs set last_checked_at = now() where id = v_job;
  select platform_fields into pf from cross_post_jobs where id = v_job;
  insert into _r values ('C06 vue par la veille : marqueur effacé', not (pf ? 'pas_encore_visible') and (select vu_en_ligne_le is not null from cross_post_jobs where id = v_job), '');
  -- C02 dépôt VU par la veille : la question d'avant tient
  v_job2 := 'c1711abc-37b6-4c57-b1af-97d2ac7fe61e';
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = v_job2;
  select platform_fields into pf from cross_post_jobs where id = v_job2;
  insert into _r values ('C02 vue en ligne puis disparue : question inchangée', pf ? 'unavailable_since' and pf->>'sale_signal' = 'unavailable' and not (pf ? 'pas_encore_visible'), '');
  -- C03 vu par un relevé seulement (vu_en_ligne_le nul) : question inchangée
  select j.id into v_job2 from cross_post_jobs j
   where j.platform in ('beebs','leboncoin','ebay') and j.status = 'published' and j.action = 'publish' and j.vu_en_ligne_le is null
     and not (j.platform_fields ? 'unavailable_since')
     and exists (select 1 from annonces_plateforme a where a.user_id = j.user_id and a.platform = j.platform and a.listing_id = annonce_id_de_job(j.platform_listing_id, j.listing_url) and a.statut_plateforme = 'en_ligne')
   limit 1;
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = v_job2;
  select platform_fields into pf from cross_post_jobs where id = v_job2;
  insert into _r values ('C03 vue par un relevé seulement : question inchangée', v_job2 is not null and pf ? 'unavailable_since', coalesce(v_job2::text, 'aucun'));
  -- C04 preuve « sold » sur un jamais-vu : inchangée
  v_job2 := '2079e84f-aacc-4aa4-9403-74a39dc06f22';
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since'] where id = v_job2;
  update cross_post_jobs set platform_fields = platform_fields || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'sold') where id = v_job2;
  select platform_fields into pf from cross_post_jobs where id = v_job2;
  insert into _r values ('C04 preuve sold : inchangée', pf->>'sale_signal' = 'sold' and pf ? 'unavailable_since', '');
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal'] where id = v_job2;
  -- C05 Vinted jamais vu : hors règle (sa preuve est le dressing)
  select j.id into v_job2 from cross_post_jobs j where j.platform = 'vinted' and j.status = 'published' and j.action = 'publish' and j.vu_en_ligne_le is null and not (j.platform_fields ? 'unavailable_since') limit 1;
  update cross_post_jobs set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = v_job2;
  select platform_fields into pf from cross_post_jobs where id = v_job2;
  insert into _r values ('C05 Vinted : inchangé', pf ? 'unavailable_since', '');
  -- C07 la 2e lecture d'une alerte en attente (unavailable_pending_since) : remplacée elle aussi
  select j.id into v_job2 from cross_post_jobs j where j.user_id = seb and j.platform = 'beebs' and j.platform_fields ? 'unavailable_pending_since' and not (j.platform_fields ? 'unavailable_since') limit 1;
  update cross_post_jobs set platform_fields = (platform_fields - 'unavailable_pending_since') || jsonb_build_object('unavailable_since', now(), 'sale_signal', 'unavailable') where id = v_job2;
  select platform_fields into pf from cross_post_jobs where id = v_job2;
  insert into _r values ('C07 2e lecture d''une alerte en attente : pas de question', v_job2 is not null and not (pf ? 'unavailable_since') and pf ? 'pas_encore_visible', coalesce(v_job2::text,'aucun'));

  -- ── C : trancher, nouvelle boucle (dépôts AVEC lien jamais vus) ─────────────────────────────────
  select id into v_run from vinted_sync_runs where user_id = seb and platform = 'beebs' and kind = 'annonces' and status = 'done' order by started_at desc limit 1;
  -- C08 un jamais-vu publié il y a 4 jours (simulé) → échec de publication Beebs, rendu
  v_job2 := '803df781-a884-419e-a21a-c5aaf14ee87e';
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since'],
         published_at = now() - interval '4 days' where id = v_job2;
  -- C09 un jamais-vu présent au relevé « en vérification » (simulé) → reste en attente
  update cross_post_jobs set platform_fields = platform_fields - array['unavailable_since','sale_signal','unavailable_pending_since'],
         published_at = now() - interval '4 days' where id = 'ab256351-5987-4c4d-8e93-2e5d7e406176';
  insert into annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, vu_le)
  values (seb, 'beebs', '34201162', 'https://www.beebs.app/fr/p/34201162', 'Essai', 'en_verification', now());
  r := trancher_publications_sans_lien(seb, 'beebs', v_run);
  select status, error into t, pf from (select status, jsonb_build_object('e', error) error from cross_post_jobs where id = v_job2) x;
  insert into _r values ('C08 Beebs jamais vue après 72 h : échec de publication', t = 'failed' and pf->>'e' like 'Beebs n''a jamais mis cette annonce en ligne : trois jours après%', r::text);
  select status into t from cross_post_jobs where id = 'ab256351-5987-4c4d-8e93-2e5d7e406176';
  insert into _r values ('C09 en vérification au relevé : reste publiée', t = 'published', t);
  select count(*) into n from cross_post_jobs where user_id = seb and platform = 'beebs' and status = 'failed';
  insert into _r values ('C10 les autres jamais-vues récentes (< 72 h) restent publiées', n = 1, n || ' échec(s) Beebs');
  insert into _r values ('C11 aucune vente, aucun retrait', not exists (select 1 from ventes where user_id = seb and created_at > now() - interval '1 minute')
     and not exists (select 1 from cross_post_jobs where user_id = seb and action = 'delete' and created_at > now() - interval '1 minute'), '');
end $$;

-- C12 trancher avec la jumelle (boucle d'origine) : louis-seller, comparé à la fonction d'avant
do $$
declare
  ls uuid := '447d920c-976a-4d8f-aff4-a2998050358c';
  v_run uuid; r_av jsonb; r_ap jsonb; c_av jsonb; c_ap jsonb;
begin
  select id into v_run from vinted_sync_runs where user_id = ls and platform = 'leboncoin' and kind = 'annonces' and status = 'done' and releve_preuve_absence(id) order by started_at desc limit 1;
  begin
    r_av := _trancher_avant_2010(ls, 'leboncoin', v_run);
    select jsonb_object_agg(s, n) into c_av from (select status || ':' || coalesce(platform_fields#>>'{depot_jamais_en_ligne,issue}', '-') s, count(*) n from cross_post_jobs where user_id = ls and platform = 'leboncoin' and (platform_fields#>>'{depot_jamais_en_ligne,le}')::timestamptz >= now() group by 1) x;
    raise exception 'annule';
  exception when raise_exception then null; end;
  begin
    r_ap := trancher_publications_sans_lien(ls, 'leboncoin', v_run);
    select jsonb_object_agg(s, n) into c_ap from (select status || ':' || coalesce(platform_fields#>>'{depot_jamais_en_ligne,issue}', '-') s, count(*) n from cross_post_jobs where user_id = ls and platform = 'leboncoin' and (platform_fields#>>'{depot_jamais_en_ligne,le}')::timestamptz >= now() group by 1) x;
    raise exception 'annule';
  exception when raise_exception then null; end;
  insert into _r values ('C12 louis-seller : doublons du compte relié clos sans rouge au lieu d''échecs',
    coalesce((c_ap->>'cancelled:en_ligne_par_compte_relie')::int, 0) > 0
    and coalesce((c_ap->>'failed:refus_moderation_probable')::int, 0) < coalesce((c_av->>'failed:refus_moderation_probable')::int, 0),
    'avant ' || coalesce(c_av::text, '{}') || ' · après ' || coalesce(c_ap::text, '{}'));
end $$;

-- C13 REJEU SYMÉTRIQUE : le dernier relevé probant de chaque compte × plateforme (3 jours), ancienne fonction contre
-- nouvelle, chacune annulée. Toute différence est listée avec sa cause ; seules sont attendues les jamais-vues AVEC
-- lien (boucle nouvelle) et les doublons du compte relié.
create temp table _rejeu (run uuid, user_id uuid, platform text, job uuid, avant text, apres text);
grant all on _rejeu to public;
do $$
declare
  x record; c_av jsonb; c_ap jsonb; k text; n int := 0;
begin
  for x in
    select distinct on (r.user_id, r.platform) r.id, r.user_id, r.platform
      from vinted_sync_runs r
     where r.kind = 'annonces' and r.status = 'done' and r.started_at > now() - interval '3 days' and releve_preuve_absence(r.id)
     order by r.user_id, r.platform, r.started_at desc
  loop
    n := n + 1;
    c_av := '{}'; c_ap := '{}';
    begin
      perform _trancher_avant_2010(x.user_id, x.platform, x.id);
      select coalesce(jsonb_object_agg(id::text, status || ':' || coalesce(platform_fields#>>'{depot_jamais_en_ligne,issue}', '-') || ':' || coalesce(platform_fields ? 'pas_encore_visible', false)::text), '{}') into c_av
        from cross_post_jobs where user_id = x.user_id and platform = x.platform
         and ((platform_fields#>>'{depot_jamais_en_ligne,le}')::timestamptz >= now()
              or (platform_fields#>>'{lien_retrouve_par_identifiant,le}')::timestamptz >= now());
      raise exception 'annule';
    exception when raise_exception then null; when others then c_av := jsonb_build_object('erreur', sqlerrm); end;
    begin
      perform trancher_publications_sans_lien(x.user_id, x.platform, x.id);
      select coalesce(jsonb_object_agg(id::text, status || ':' || coalesce(platform_fields#>>'{depot_jamais_en_ligne,issue}', '-') || ':' || coalesce(platform_fields ? 'pas_encore_visible', false)::text), '{}') into c_ap
        from cross_post_jobs where user_id = x.user_id and platform = x.platform
         and ((platform_fields#>>'{depot_jamais_en_ligne,le}')::timestamptz >= now()
              or (platform_fields#>>'{lien_retrouve_par_identifiant,le}')::timestamptz >= now());
      raise exception 'annule';
    exception when raise_exception then null; when others then c_ap := jsonb_build_object('erreur', sqlerrm); end;
    -- Une erreur de la NOUVELLE fonction est toujours une différence (même si l'ancienne échouait aussi).
    if c_ap ? 'erreur' then insert into _rejeu values (x.id, x.user_id, x.platform, null, 'ERREUR_NOUVELLE', c_ap->>'erreur'); end if;
    for k in select jsonb_object_keys(c_av || c_ap) loop
      if (c_av->>k) is distinct from (c_ap->>k) then
        insert into _rejeu values (x.id, x.user_id, x.platform, case when k ~ '^[0-9a-f-]{36}$' then k::uuid end, c_av->>k, c_ap->>k);
      end if;
    end loop;
  end loop;
  insert into _r values ('C13 rejeu : relevés rejoués', n > 0, n || ' compte(s) × plateforme');
end $$;
insert into _r select 'C14 rejeu : différences = jamais-vues avec lien ou compte relié seulement',
  coalesce(bool_and(r.avant is null and (r.apres like '%:refus_moderation_probable:%' or r.apres like '%:article_en_ligne_ailleurs:%' or r.apres like '%:en_ligne_par_compte_relie:%')
                    or (r.avant like 'failed:refus_moderation_probable:%' and r.apres like 'cancelled:en_ligne_par_compte_relie:%')), true),
  count(*) || ' différence(s) : ' || coalesce(string_agg(distinct r.platform || ' ' || coalesce(r.avant, 'rien') || ' → ' || coalesce(r.apres, 'rien'), ' | '), '')
  from _rejeu r;

select essai, ok, left(detail, 300) detail from _r order by essai;
rollback;
