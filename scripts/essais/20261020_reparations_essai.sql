-- Essai à blanc des réparations du 20/10 soir (Sébastien, Louis) : ROLLBACK.
-- npx supabase db query --linked -f scripts/essais/20261020_reparations_essai.sql
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


-- 20/10 soir — Sébastien (Pro) : 13 dépôts Beebs du 20/10 (09:10 → 11:13) jamais vus en ligne — ni par un relevé
-- Beebs (ni « en ligne », ni « en vérification »), ni par la veille — portaient la question « Annonces plus en
-- ligne — Vendue ? » (9 posées, 4 en attente de la 2e lecture). Leur page publique répond 404 ; Beebs les a vues
-- naître (preuve du dépôt « avant/après » dans « En cours de vérification », 09:10 → 11:13) puis ne les a jamais
-- montrées. Un « Oui » écrivait une fausse vente et retirait ses vraies annonces ailleurs.
-- La RÈGLE (migration 20261020220000, appliquée AVANT ce script) : un dépôt jamais vu en ligne ne pose jamais la
-- question ; il reste « pas encore visible » (marqueur pas_encore_visible, « Beebs vérifie ton annonce ») et devient
-- un échec de publication 72 h après le dépôt s'il n'est toujours ni en ligne ni en vérification. Ce script rend
-- aux 13 l'état que la règle leur aurait donné : drapeaux « plus en ligne » retirés, marqueur posé. AUCUNE vente,
-- aucun retrait, aucun mail, aucun push ; le stock ne bouge pas.
-- Ordre de Nico (20/10 soir) : « nettoie les alertes actuelles de Sébastien, sans enregistrer de vente ni lancer de
-- retrait ». Sauvegarde _backup_2010_sebastien_beebs_jobs ; inverse : 20261020_sebastien_beebs_pas_encore_visibles_INVERSE.sql.
create temp table _j as
  select j.id, j.platform_fields
    from cross_post_jobs j
   where j.user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and j.platform = 'beebs'
     and j.status = 'published' and j.action = 'publish'
     and (j.platform_fields ? 'unavailable_since' or j.platform_fields ? 'unavailable_pending_since')
     and coalesce(j.platform_fields ->> 'sale_signal', 'unavailable') = 'unavailable'
     and public.job_jamais_vu_en_ligne(j.id, j.user_id, j.platform, j.vu_en_ligne_le, j.platform_listing_id, j.listing_url, j.platform_fields);
do $g$ begin
  if (select count(*) from _j) <> 13 then raise exception 'attendu 13 dépôts Beebs jamais vus en alerte, trouvé % — réparation arrêtée', (select count(*) from _j); end if;
  if to_regprocedure('public.cross_post_jobs_vue_ou_pas_encore_visible()') is null then raise exception 'la règle 20261020220000 n''est pas appliquée — réparation arrêtée'; end if;
end $g$;
create table public._backup_2010_sebastien_beebs_jobs as
  select j.id, j.platform_fields, now() as sauve_le from cross_post_jobs j where j.id in (select id from _j);
update cross_post_jobs j set
  platform_fields = (j.platform_fields - array['unavailable_since', 'sale_signal', 'unavailable_pending_since'])
    || jsonb_build_object('pas_encore_visible', jsonb_build_object(
         'depuis', to_jsonb(coalesce(j.published_at, j.created_at)),
         'lectures', 1, 'derniere', now(), 'regle', 'jamais_vue_en_ligne_2010', 'par', 'reparation_2010_sebastien'))
 where j.id in (select id from _j);
insert into _r select 'R1 Sébastien', true, row_to_json(x)::text from (select (select count(*) from _backup_2010_sebastien_beebs_jobs) sauvegardes,
       (select count(*) from cross_post_jobs where id in (select id from _j) and platform_fields ? 'pas_encore_visible'
          and not (platform_fields ? 'unavailable_since') and not (platform_fields ? 'unavailable_pending_since')
          and platform_fields ->> 'sale_signal' is null and status = 'published') reparees,
       (select count(*) from ventes where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and created_at >= now()) ventes_creees,
       (select count(*) from cross_post_jobs where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and action = 'delete' and created_at >= now()) retraits_crees,
       (select count(*) from push_ventes where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and cree_le >= now()) push_crees,
       (select count(*) from cross_post_jobs where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and platform = 'beebs'
          and status = 'published' and platform_fields ? 'unavailable_since') alertes_beebs_restantes) x;

-- 20/10 soir — Louis (louis-seller, Business, relié à louis@) : 55 dépôts Leboncoin du 19/10 passés en ÉCHEC le 20/10
-- (06:14, 15:11, 16:37) avec le motif « refusée par sa modération ». Le motif était faux pour 54 d'entre eux : leur
-- fiche est coupée en deux depuis le 18/10 (fiches_liees_comptes), sa JUMELLE chez louis@ est EN LIGNE sur le MÊME
-- compte Leboncoin — Leboncoin a refusé le doublon. Le 55e n'a pas de jumelle en ligne : il reste en échec.
-- La RÈGLE (migration 20261020210000 + 20261020220000, appliquées AVANT ce script) : la fiche jumelle occupe la
-- plateforme — aucun nouveau dépôt, aucune relance, et un dépôt refusé pour ce motif est clos sans rouge
-- (« déjà en ligne via ton compte relié, rien à refaire »), comme les 71 encore en attente le seront au relevé.
-- Ce script donne aux 54 le verdict de la règle : 'cancelled' + le vrai motif. Réservation déjà réglée (aucune
-- unité rendue deux fois), aucune vente, aucun retrait, aucun mail ; RIEN n'est republié.
-- Ordre de Nico (20/10 soir) : « les 54 échecs ne doivent pas être republiés » ; réparation après sauvegarde.
-- Sauvegarde _backup_2010_louis_seller_lbc_echecs ; inverse : 20261020_louis_seller_lbc_doublons_relie_INVERSE.sql.
create temp table _j2 as
  select j.id, j.status, j.error, j.platform_fields, o.listing_id as annonce_jumelle
    from cross_post_jobs j
    cross join lateral (select o.listing_id from public.jumelle_occupe_plateformes(j.user_id, j.inventaire_id) o
                         where o.platform = 'leboncoin' and o.statut = 'en_ligne' limit 1) o
   where j.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and j.platform = 'leboncoin'
     and j.action = 'publish' and j.status = 'failed'
     and j.platform_fields #>> '{depot_jamais_en_ligne,issue}' = 'refus_moderation_probable'
     and j.created_at >= '2026-10-18 22:00+00' and j.created_at < '2026-10-20 22:00+00'
     and o.listing_id is not null
     and o.listing_id <> all (array_remove(array[nullif(btrim(j.platform_listing_id), ''),
                                                 nullif(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), '')], null));
do $g$ begin
  -- 54 au 20/10 ≈ 22:45 ; davantage si un relevé a jugé d'autres dépôts entre-temps (même motif, même règle).
  if (select count(*) from _j2) < 54 then raise exception 'attendu au moins 54 échecs à jumelle en ligne, trouvé % — réparation arrêtée', (select count(*) from _j2); end if;
  if to_regprocedure('public.cross_post_jobs_refus_relance_jumelle_en_ligne()') is null then raise exception 'la règle 20261020210000 n''est pas appliquée — réparation arrêtée'; end if;
end $g$;
create table public._backup_2010_louis_seller_lbc_echecs as
  select j.id, j.status, j.error, j.platform_fields, j.reservation_settled_at, now() as sauve_le
    from cross_post_jobs j where j.id in (select id from _j2);
update cross_post_jobs j set
  status = 'cancelled',
  error = 'Ce dépôt n''a pas été mis en ligne par Leboncoin : ton article y est DÉJÀ en ligne sous l''annonce '
          || x.annonce_jumelle || ', publiée par ton compte FillSell relié — Leboncoin refuse les doublons. Rien à refaire, rien n''est vendu.',
  platform_fields = jsonb_set(j.platform_fields, '{depot_jamais_en_ligne}',
      (j.platform_fields -> 'depot_jamais_en_ligne') || jsonb_build_object(
        'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', x.annonce_jumelle,
        'reclasse', jsonb_build_object('le', now(), 'par', 'reparation_2010_louis', 'avant', 'refus_moderation_probable')))
  from _j2 x
 where j.id = x.id and j.status = 'failed';
insert into _r select 'R2 Louis', true, row_to_json(x)::text from (select (select count(*) from _backup_2010_louis_seller_lbc_echecs) sauvegardes,
       (select count(*) from cross_post_jobs where id in (select id from _j2) and status = 'cancelled'
          and platform_fields #>> '{depot_jamais_en_ligne,issue}' = 'en_ligne_par_compte_relie') reclasses,
       (select count(*) from cross_post_jobs j join _backup_2010_louis_seller_lbc_echecs b on b.id = j.id
         where j.reservation_settled_at is distinct from b.reservation_settled_at) reservations_touchees,
       (select count(*) from cross_post_jobs where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and platform = 'leboncoin'
          and status = 'failed' and created_at >= '2026-10-18 22:00+00') echecs_restants,
       (select count(*) from cross_post_jobs where user_id in ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
          and created_at >= now()) jobs_crees,
       (select count(*) from coin_ledger where user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and created_at >= now()) mouvements_unites) x;

-- L'app après R1 : la requête des alertes « plus en ligne » de Sébastien ne rend plus aucun Beebs.
insert into _r select 'R1b alertes Beebs de Sébastien (requête de l''app)', count(*) = 0, count(*)::text
  from cross_post_jobs where user_id = '48dd94f7-3105-49a7-af54-24d9c479a980' and status = 'published' and action in ('publish','republish')
   and inventaire_id is not null and platform_fields ->> 'unavailable_since' is not null and platform = 'beebs';
-- La relance d'un des 54 (désormais annulé) reste refusée.
do $$ begin
  update cross_post_jobs set status = 'pending' where id = (select id from _backup_2010_louis_seller_lbc_echecs limit 1);
  insert into _r values ('R2b relance d''un des 54 refusée', false, 'acceptée');
exception when check_violation then insert into _r values ('R2b relance d''un des 54 refusée', true, left(sqlerrm, 120)); end $$;

-- INVERSE de 20261020_sebastien_beebs_pas_encore_visibles.sql : rend aux 13 dépôts leurs platform_fields d'avant
-- (sauvegarde _backup_2010_sebastien_beebs_jobs), pour les seuls jobs encore 'published'.
-- La règle (déclencheur cross_post_jobs_vue_ou_pas_encore_visible) remplacerait aussitôt les drapeaux rendus : la
-- restauration passe par sa porte (fillsell.restauration, cette transaction seulement).
set local fillsell.restauration = 'on';
update cross_post_jobs j set platform_fields = b.platform_fields
  from public._backup_2010_sebastien_beebs_jobs b
 where j.id = b.id and j.status = 'published';
insert into _r select 'R1 inverse', true, row_to_json(x)::text from (select count(*) restaures from cross_post_jobs j join public._backup_2010_sebastien_beebs_jobs b on b.id = j.id
 where j.platform_fields = b.platform_fields) x;

-- INVERSE de 20261020_louis_seller_lbc_doublons_relie.sql : rend aux 54 dépôts leur statut, motif et platform_fields
-- d'avant (sauvegarde _backup_2010_louis_seller_lbc_echecs), pour les seuls jobs encore 'cancelled' par ce script.
update cross_post_jobs j set status = b.status, error = b.error, platform_fields = b.platform_fields
  from public._backup_2010_louis_seller_lbc_echecs b
 where j.id = b.id and j.status = 'cancelled'
   and j.platform_fields #>> '{depot_jamais_en_ligne,reclasse,par}' = 'reparation_2010_louis';
insert into _r select 'R2 inverse', true, row_to_json(x)::text from (select count(*) restaures from cross_post_jobs j join public._backup_2010_louis_seller_lbc_echecs b on b.id = j.id
 where j.status = b.status and j.error is not distinct from b.error and j.platform_fields = b.platform_fields) x;

select essai, ok, left(detail, 400) detail from _r order by essai;
rollback;
