-- ═══════════════════════════════════════════════════════════════════════════
-- CYCLE DE GRANT PAR UTILISATEUR — fin du crédit calendaire au 1er du mois
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision Nico, 2026-07-28. Le système de pièces créditait tout le monde dans
-- la nuit du 31 au 1er (included_granted_month = date_trunc('month', now())).
-- Un utilisateur qui s'abonnait le 28 touchait deux réserves en quatre jours ;
-- depuis l'ajout du REPORT le matin même, ce double grant ne s'écrasait plus
-- mais s'ADDITIONNAIT — le décalage était devenu une fuite de valeur réelle.
--
-- Le design d'origine (migration 20260706200000) était pourtant le bon dans son
-- intention : « les grants sont normalement déclenchés par les webhooks, ce
-- sweep quotidien rattrape ». Ce qui l'a inversé, c'est l'unité d'idempotence :
-- calée sur le mois calendaire, elle faisait que le sweep du 1er devançait
-- toujours le webhook du 28, réduisant celui-ci à un no-op. On corrige donc
-- l'unité d'idempotence, et le sweep redevient un filet.
--
-- Règles posées ici :
--   · ABONNÉS  — l'échéance est la date que donne le store (Stripe
--     current_period_end, Apple expiresDate, Google expiryTime). Jamais de
--     calcul maison : +30 jours dériverait de 5 jours par an (12 × 30 = 360)
--     et finirait par recréer un grant de trop.
--   · FREE / COMPED / FOUNDERS / comptes promus à la main — ancrage sur
--     profiles.created_at, via grant_next_due() qui préserve le jour d'ancrage
--     (un 31 janvier donne 28 février puis 31 mars, sans glisser sur le 28).
--   · REPORT plafonné à 2× le grant du tier, sans jamais amputer un solde déjà
--     supérieur (on cesse d'ajouter, on ne confisque pas).
--   · PAST_DUE — un compte à canal de paiement n'est crédité que sur événement
--     de paiement ; le filet ne rattrape que dans une fenêtre de 3 jours après
--     l'échéance, au-delà on attend le store. Pas de paiement, pas de grant.
--
-- La colonne included_granted_month n'est plus lue par aucune fonction après
-- cette migration (vérifié : aucun code applicatif ne la référence non plus).
-- Elle est laissée en place le temps de valider en prod ; une seconde migration
-- la supprimera.

-- ── 1. Schéma ──────────────────────────────────────────────────────────────
alter table public.coin_wallets
  add column if not exists next_grant_at    timestamptz,
  add column if not exists grant_anchor_day smallint;

comment on column public.coin_wallets.next_grant_at is
  'Échéance du prochain grant. Posée par les webhooks depuis la date du store '
  'pour les abonnés, calculée depuis grant_anchor_day sinon. NULL = jamais crédité.';
comment on column public.coin_wallets.grant_anchor_day is
  'Jour d''ancrage du cycle (1-31), issu de profiles.created_at. Préserve le '
  'jour d''origine à travers les mois courts (31 → 28 février → 31 mars).';

create index if not exists coin_wallets_next_grant_idx
  on public.coin_wallets (next_grant_at)
  where next_grant_at is not null;

-- ── 2. Helper : prochaine échéance ancrée ──────────────────────────────────
-- Renvoie la première date STRICTEMENT postérieure à p_after qui tombe sur le
-- jour d'ancrage, en clampant au dernier jour des mois courts. Calculé depuis
-- l'ancre et non depuis l'échéance précédente : c'est ce qui empêche la dérive
-- (un cycle ancré au 31 ne se retrouve pas bloqué au 28 après un mois de
-- février). Aucun date_trunc('month') : le mois se construit avec make_date.
create or replace function public.grant_next_due(p_after timestamptz, p_anchor_day int)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ref    date := p_after::date;
  v_first  date;
  v_last   int;
  v_cand   date;
  v_anchor int := least(greatest(coalesce(p_anchor_day, 1), 1), 31);
  i        int;
begin
  v_first := make_date(extract(year from v_ref)::int, extract(month from v_ref)::int, 1);
  for i in 0..1 loop
    v_last := extract(day from (v_first + interval '1 month' - interval '1 day'))::int;
    v_cand := v_first + (least(v_anchor, v_last) - 1);
    if v_cand > v_ref then
      return v_cand::timestamptz;
    end if;
    v_first := (v_first + interval '1 month')::date;
  end loop;
  return v_cand::timestamptz;
end;
$$;

revoke all on function public.grant_next_due(timestamptz, int) from public, anon, authenticated;
grant execute on function public.grant_next_due(timestamptz, int) to service_role;

-- ── 3. grant_monthly_coins ─────────────────────────────────────────────────
-- Signature élargie (p_period_end, p_source) : les appels existants à deux
-- arguments restent valides grâce aux valeurs par défaut. DROP nécessaire —
-- CREATE OR REPLACE ne peut pas changer le nombre de paramètres, et une simple
-- surcharge laisserait cohabiter l'ancienne version calendaire.
drop function if exists public.grant_monthly_coins(uuid, text);

create function public.grant_monthly_coins(
  p_user_id    uuid,
  p_tier       text,
  p_period_end timestamptz default null,   -- date du store (événement de paiement)
  p_source     text        default 'auto'  -- 'payment' | 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount      integer;
  v_override    integer;
  v_wallet      coin_wallets%ROWTYPE;
  v_anchor      int;
  v_created     timestamptz;
  v_has_billing boolean;
  v_due         timestamptz;
  v_next        timestamptz;
  v_cap         integer;
  v_new_inc     integer;
  v_delta       integer;
  v_ref         text;
begin
  if p_tier not in ('free','premium','pro') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  select value into v_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;

  select monthly_grant_override, created_at,
         (stripe_customer_id is not null
          or apple_original_transaction_id is not null
          or google_purchase_token is not null)
    into v_override, v_created, v_has_billing
  from profiles where id = p_user_id;

  if v_override is not null and v_override > 0 then
    v_amount := v_override;
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  v_anchor := coalesce(v_wallet.grant_anchor_day,
                       extract(day from coalesce(v_created, now()))::int);
  v_due := v_wallet.next_grant_at;

  -- Idempotence : l'échéance fait foi, plus le mois calendaire. Une tolérance
  -- de 2 jours n'existe que pour les événements de paiement, dont l'horodatage
  -- peut légèrement précéder la fin de période côté store.
  if v_due is not null then
    if p_source = 'payment' then
      if v_due > now() + interval '2 days' then
        return jsonb_build_object('granted', false, 'reason', 'already_granted',
                                  'next_grant_at', v_due);
      end if;
    elsif v_due > now() then
      return jsonb_build_object('granted', false, 'reason', 'already_granted',
                                'next_grant_at', v_due);
    end if;
  end if;

  -- Pas de paiement, pas de grant : sur un compte à canal de paiement actif, le
  -- renouvellement doit venir du store. Le filet ne rattrape qu'un retard court
  -- (webhook perdu) ; au-delà, l'absence d'événement SIGNIFIE l'absence de
  -- paiement (past_due, abonnement mort) et on cesse de créditer. Le tier est
  -- exigé non-free pour ne pas pénaliser un ex-abonné dont le token store
  -- subsiste après résiliation (cf. bug « premium fantôme » du 25/07).
  if p_source <> 'payment' and v_has_billing and p_tier <> 'free'
     and v_due is not null and v_due < now() - interval '3 days' then
    return jsonb_build_object('granted', false, 'reason', 'awaiting_payment_event',
                              'next_grant_at', v_due, 'tier', p_tier);
  end if;

  -- Report plafonné à 2× le grant du tier. GREATEST : un solde déjà au-dessus
  -- du plafond (override abaissé, achat massif) n'est jamais amputé — il cesse
  -- simplement de croître.
  v_cap     := v_amount * 2;
  v_new_inc := greatest(v_wallet.included_balance,
                        least(v_wallet.included_balance + v_amount, v_cap));
  v_delta   := v_new_inc - v_wallet.included_balance;

  -- Prochaine échéance : la date du store si on en a une, sinon l'ancre.
  if p_period_end is not null and p_period_end > now() then
    v_next := p_period_end;
  else
    v_next := grant_next_due(now(), v_anchor);
  end if;

  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = v_next,
    grant_anchor_day = v_anchor,
    updated_at       = now()
  where user_id = p_user_id;

  -- Ref d'idempotence : l'échéance consommée (unique par cycle et par user).
  -- Format YYYY-MM-DD, distinct de l'ancien YYYY-MM — aucune collision avec
  -- l'historique. L'index unique partiel coin_ledger_ref_unique est le second
  -- filet si deux processus concourent malgré le FOR UPDATE.
  v_ref := 'grant_monthly:' || p_user_id || ':' || to_char(coalesce(v_due, now()), 'YYYY-MM-DD');
  begin
    insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
    values (
      p_user_id, v_delta, v_new_inc, v_wallet.purchased_balance,
      'grant_monthly', v_ref,
      jsonb_build_object('tier', p_tier, 'override', v_override,
                         'source', p_source,
                         'reporte', v_wallet.included_balance,
                         'montant_theorique', v_amount,
                         'plafonne', (v_delta < v_amount),
                         'next_grant_at', v_next)
    );
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'ref', v_ref);
  end;

  return jsonb_build_object('granted', true, 'amount', v_delta,
                            'montant_theorique', v_amount,
                            'plafonne', (v_delta < v_amount),
                            'reporte', v_wallet.included_balance,
                            'included_after', v_new_inc,
                            'next_grant_at', v_next,
                            'source', p_source);
end;
$$;

revoke all on function public.grant_monthly_coins(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.grant_monthly_coins(uuid, text, timestamptz, text) to service_role;

-- ── 4. upgrade_monthly_grant ───────────────────────────────────────────────
-- Changement de tier en cours de cycle : crédite la seule différence, et
-- réaligne l'échéance sur la nouvelle période de facturation quand le store en
-- fournit une (un upgrade ouvre une période neuve).
drop function if exists public.upgrade_monthly_grant(uuid, text);

create function public.upgrade_monthly_grant(
  p_user_id    uuid,
  p_tier       text,
  p_period_end timestamptz default null,
  p_source     text        default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet     coin_wallets%ROWTYPE;
  v_old_tier   text;
  v_old_amount integer;
  v_new_amount integer;
  v_override   integer;
  v_delta      integer;
  v_cap        integer;
  v_new_inc    integer;
  v_ref        text;
begin
  if p_tier not in ('free','premium','pro') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  -- Échéance atteinte (ou compte jamais crédité) : c'est un grant plein.
  if v_wallet.next_grant_at is null or v_wallet.next_grant_at <= now()
     or (p_source = 'payment' and v_wallet.next_grant_at <= now() + interval '2 days') then
    return grant_monthly_coins(p_user_id, p_tier, p_period_end, p_source);
  end if;

  -- Montant fixé à la main : pas de top-up de changement de tier.
  select monthly_grant_override into v_override from profiles where id = p_user_id;
  if v_override is not null and v_override > 0 then
    return jsonb_build_object('granted', false, 'reason', 'override_fixed_amount',
                              'amount', v_override, 'tier', p_tier);
  end if;

  -- Tier du cycle courant = celui du dernier grant enregistré (le cycle étant
  -- désormais propre à l'utilisateur, il n'y a plus de fenêtre calendaire à
  -- interroger : le dernier grant EST le début du cycle en cours).
  select l.metadata->>'tier' into v_old_tier
  from coin_ledger l
  where l.user_id = p_user_id
    and l.kind in ('grant_monthly','grant_upgrade')
  order by l.created_at desc, l.id desc
  limit 1;
  v_old_tier := coalesce(v_old_tier, 'free');

  select value into v_new_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_new_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;
  select value into v_old_amount from coin_config where key = 'monthly_grant_' || v_old_tier;
  v_old_amount := coalesce(v_old_amount, 0);

  v_delta := v_new_amount - v_old_amount;

  -- Même sans top-up à créditer, une date de store fait autorité : on réaligne
  -- l'échéance sur la nouvelle période de facturation.
  if v_delta <= 0 then
    if p_period_end is not null and p_period_end > now() then
      update coin_wallets set next_grant_at = p_period_end, updated_at = now()
      where user_id = p_user_id;
    end if;
    return jsonb_build_object('granted', false, 'reason', 'no_upgrade_needed',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

  -- Le plafond du report s'apprécie sur le grant du NOUVEAU tier.
  v_cap     := v_new_amount * 2;
  v_new_inc := greatest(v_wallet.included_balance,
                        least(v_wallet.included_balance + v_delta, v_cap));
  v_delta   := v_new_inc - v_wallet.included_balance;

  if v_delta <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'cap_reached',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = case when p_period_end is not null and p_period_end > now()
                            then p_period_end else next_grant_at end,
    updated_at       = now()
  where user_id = p_user_id;

  v_ref := 'grant_upgrade:' || p_user_id || ':'
           || to_char(coalesce(v_wallet.next_grant_at, now()), 'YYYY-MM-DD') || ':' || p_tier;
  begin
    insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
    values (
      p_user_id, v_delta, v_new_inc, v_wallet.purchased_balance,
      'grant_upgrade', v_ref,
      jsonb_build_object('tier', p_tier, 'from_tier', v_old_tier, 'source', p_source)
    );
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'ref', v_ref);
  end;

  return jsonb_build_object('granted', true, 'topup', true, 'amount', v_delta,
                            'from_tier', v_old_tier, 'tier', p_tier,
                            'included_after', v_new_inc);
end;
$$;

revoke all on function public.upgrade_monthly_grant(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.upgrade_monthly_grant(uuid, text, timestamptz, text) to service_role;

-- ── 5. Sweep : filet, plus pilote ──────────────────────────────────────────
-- Ne parcourt QUE les échéances atteintes, et n'invente aucune date. Les
-- comptes à canal de paiement hors fenêtre de grâce sont comptés à part
-- (awaiting_payment) : c'est le signal qu'un webhook de renouvellement ne
-- parvient plus, à surveiller côté ops.
create or replace function public.grant_monthly_coins_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted  int := 0;
  v_skipped  int := 0;
  v_awaiting int := 0;
  r   record;
  res jsonb;
begin
  for r in
    select p.id,
           case
             when p.is_pro = true then 'pro'
             when p.is_premium = true or p.is_comped = true then 'premium'
             else 'free'
           end as tier
    from profiles p
    -- LEFT JOIN impératif : un profil sans ligne coin_wallets (inscrit qui n'a
    -- encore rien dépensé) doit être balayé, sinon il ne serait jamais crédité.
    -- next_grant_at vaut alors NULL, ce que la condition ci-dessous accepte.
    left join coin_wallets w on w.user_id = p.id
    where w.next_grant_at is null or w.next_grant_at <= now()
  loop
    res := upgrade_monthly_grant(r.id, r.tier, null, 'sweep');
    if coalesce((res->>'granted')::boolean, false) then
      v_granted := v_granted + 1;
    elsif res->>'reason' = 'awaiting_payment_event' then
      v_awaiting := v_awaiting + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('granted', v_granted, 'skipped', v_skipped,
                            'awaiting_payment', v_awaiting, 'ran_at', now());
end;
$$;

revoke all on function public.grant_monthly_coins_sweep() from public, anon, authenticated;
grant execute on function public.grant_monthly_coins_sweep() to service_role;

-- ── 6. Lazy grant des RPC de dépense ───────────────────────────────────────
-- Même bascule : l'échéance remplace le mois calendaire. La garde
-- « pas de paiement, pas de grant » de grant_monthly_coins s'applique ici
-- aussi, puisque l'appel passe par upgrade_monthly_grant en source 'auto'.
create or replace function public.spend_coins_for_lens(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_total    integer;
  v_from_inc integer;
  v_from_pur integer;
  v_tier     text;
BEGIN
  SELECT value INTO v_price FROM coin_config WHERE key = 'price_lens_overflow';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  INSERT INTO coin_wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
    SELECT CASE
             WHEN p.is_pro = true THEN 'pro'
             WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
             ELSE 'free'
           END INTO v_tier
    FROM profiles p WHERE p.id = p_user_id;
    PERFORM upgrade_monthly_grant(p_user_id, COALESCE(v_tier, 'free'), null, 'lazy');
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;
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
  WHERE user_id = p_user_id;

  INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
  VALUES (
    p_user_id, -v_price,
    v_wallet.included_balance - v_from_inc,
    v_wallet.purchased_balance - v_from_pur,
    'spend_lens',
    jsonb_build_object('model', 'per_scan')
  );

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (p_user_id, 'lens', jsonb_build_object('coins', v_price, 'model', 'per_scan'));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price,
    'included_after',  v_wallet.included_balance - v_from_inc,
    'purchased_after', v_wallet.purchased_balance - v_from_pur
  );
END;
$$;

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

-- ── 7. Backfill des comptes existants ─────────────────────────────────────
-- DANS LA MÊME MIGRATION, à dessein : entre la création des fonctions et la
-- pose des échéances, tout wallet a next_grant_at NULL — un lazy grant
-- déclenché dans cet intervalle accorderait un second grant à quelqu'un déjà
-- servi en juillet. Les exécuter ensemble réduit cette fenêtre à néant.
--
-- Valeur posée : la prochaine occurrence FUTURE du jour d'inscription. C'est
-- ce qui garantit qu'aucun compte n'est crédité deux fois pendant la bascule
-- (toutes les échéances tombent à J+1 au plus tôt), au prix d'une attente
-- pouvant aller jusqu'à 31 jours pour ceux dont le jour d'ancrage vient de
-- passer. Personne ne perd de Pépites : aucun solde n'est touché ici, et le
-- report conserve l'existant. Les comptes à canal de paiement se recalent
-- d'eux-mêmes sur leur vraie date de facturation au premier renouvellement.
--
-- La clause « next_grant_at is null » rend ce backfill rejouable sans effet.
update public.coin_wallets w
set grant_anchor_day = least(greatest(extract(day from p.created_at)::int, 1), 31),
    next_grant_at    = public.grant_next_due(
                         now(),
                         least(greatest(extract(day from p.created_at)::int, 1), 31)
                       ),
    updated_at       = now()
from public.profiles p
where p.id = w.user_id
  and w.next_grant_at is null;
