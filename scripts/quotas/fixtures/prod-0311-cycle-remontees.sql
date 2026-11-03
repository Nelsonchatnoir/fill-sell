-- public.grant_monthly_coins(uuid,text,timestamptz,text)
CREATE OR REPLACE FUNCTION public.grant_monthly_coins(p_user_id uuid, p_tier text, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_amount      integer;
  v_override    integer;
  v_wallet      coin_wallets%ROWTYPE;
  v_anchor      int;
  v_created     timestamptz;
  v_has_billing boolean;
  v_is_comped   boolean;
  v_due         timestamptz;
  v_next        timestamptz;
  v_new_inc     integer;
  v_delta       integer;
  v_ref         text;
begin
  if p_tier not in ('free','premium','pro','business') then
    return jsonb_build_object('granted', false, 'reason', 'invalid_tier');
  end if;

  select value into v_amount from coin_config where key = 'monthly_grant_' || p_tier;
  if v_amount is null then
    return jsonb_build_object('granted', false, 'reason', 'grant_not_configured');
  end if;

  select monthly_grant_override, created_at,
         (stripe_customer_id is not null
          or apple_original_transaction_id is not null
          or google_purchase_token is not null),
         coalesce(is_comped, false)
    into v_override, v_created, v_has_billing, v_is_comped
  from profiles where id = p_user_id;

  if v_override is not null and v_override > 0 then
    v_amount := v_override;
  end if;

  insert into coin_wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_wallet from coin_wallets where user_id = p_user_id for update;

  v_anchor := coalesce(v_wallet.grant_anchor_day,
                       extract(day from coalesce(v_created, now()))::int);
  v_due := v_wallet.next_grant_at;

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

  -- Pas de paiement, pas de grant — SAUF compte offert (is_comped) : personne
  -- ne paie pour lui, et il garde souvent un identifiant de paiement d'une
  -- periode anterieure. coins_awaiting_payment() porte la MEME condition.
  if p_source <> 'payment' and v_has_billing and not v_is_comped and p_tier <> 'free'
     and v_due is not null and v_due < now() - interval '3 days' then
    return jsonb_build_object('granted', false, 'reason', 'awaiting_payment_event',
                              'next_grant_at', v_due, 'tier', p_tier);
  end if;

  -- ── REMPLACEMENT (2026-09-02) — les Pépites incluses du mois sont pour le
  -- mois. L'ancien cumul plafonné (greatest/least, cap ×2) est retiré : le
  -- solde inclus devient le grant du palier, ni plus, ni moins. v_delta peut
  -- être négatif (solde de la veille > grant) : la ligne de ledger le porte
  -- tel quel, c'est la trace honnête du remplacement.
  -- purchased_balance n'apparaît nulle part ici — il ne bouge JAMAIS.
  v_new_inc := v_amount;
  v_delta   := v_new_inc - v_wallet.included_balance;

  if p_period_end is not null and p_period_end > now() then
    v_next := p_period_end;
  else
    v_next := grant_next_due(now(), v_anchor);
  end if;

  v_ref := 'grant_monthly:' || p_user_id || ':' || to_char(coalesce(v_due, now()), 'YYYY-MM-DD');
  begin
    insert into coin_ledger (user_id, delta, included_after, purchased_after, kind, ref, metadata)
    values (
      p_user_id, v_delta, v_new_inc, v_wallet.purchased_balance,
      'grant_monthly', v_ref,
      jsonb_build_object('tier', p_tier, 'override', v_override,
                         'source', p_source,
                         'solde_avant', v_wallet.included_balance,
                         'montant_theorique', v_amount,
                         'remplacement', true,
                         'next_grant_at', v_next)
    );
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'already_granted', 'ref', v_ref);
  end;

  -- (15/10, lot D) Le solde et l'échéance ne bougent QU'AVEC leur ligne.
  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = v_next,
    grant_anchor_day = v_anchor,
    updated_at       = now()
  where user_id = p_user_id;

  return jsonb_build_object('granted', true, 'amount', v_delta,
                            'montant_theorique', v_amount,
                            'solde_avant', v_wallet.included_balance,
                            'included_after', v_new_inc,
                            'next_grant_at', v_next,
                            'source', p_source);
end;
$function$;

-- public.upgrade_monthly_grant(uuid,text,timestamptz,text)
CREATE OR REPLACE FUNCTION public.upgrade_monthly_grant(p_user_id uuid, p_tier text, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wallet     coin_wallets%ROWTYPE;
  v_old_tier   text;
  v_new_amount integer;
  v_override   integer;
  v_delta      integer;
  v_cap        integer;
  v_new_inc    integer;
  v_ref        text;
begin
  if p_tier not in ('free','premium','pro','business') then
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

  -- Même palier : rien à créditer (RESTARTED sans paiement, rejeu, etc.).
  -- Une date de store fournie fait quand même autorité sur l'échéance.
  if v_old_tier is not distinct from p_tier then
    if p_period_end is not null and p_period_end > now() then
      update coin_wallets set next_grant_at = p_period_end, updated_at = now()
      where user_id = p_user_id;
    end if;
    return jsonb_build_object('granted', false, 'reason', 'no_upgrade_needed',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

  -- Changement de palier payant : montant PLEIN du nouveau palier (le
  -- différentiel historique est supprimé — cf. en-tête de la migration).
  v_delta := v_new_amount;

  -- Le plafond du report s'apprécie sur le grant du NOUVEAU tier.
  v_cap     := v_new_amount * 2;
  v_new_inc := greatest(v_wallet.included_balance,
                        least(v_wallet.included_balance + v_delta, v_cap));
  v_delta   := v_new_inc - v_wallet.included_balance;

  if v_delta <= 0 then
    return jsonb_build_object('granted', false, 'reason', 'cap_reached',
                              'from_tier', v_old_tier, 'tier', p_tier);
  end if;

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

  -- (15/10, lot D) Le solde ne bouge QU'AVEC sa ligne : l'UPDATE vient après
  -- l'insertion réussie (avant, un « already_granted » par collision de clé
  -- laissait le solde modifié sans aucune trace au grand livre).
  update coin_wallets set
    included_balance = v_new_inc,
    next_grant_at    = case when p_period_end is not null and p_period_end > now()
                            then p_period_end else next_grant_at end,
    updated_at       = now()
  where user_id = p_user_id;

  return jsonb_build_object('granted', true, 'topup', true, 'amount', v_delta,
                            'from_tier', v_old_tier, 'tier', p_tier,
                            'included_after', v_new_inc);
end;
$function$;

-- public.grant_next_due(timestamptz,integer)
CREATE OR REPLACE FUNCTION public.grant_next_due(p_after timestamp with time zone, p_anchor_day integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

-- public.debut_cycle_quotas(uuid)
CREATE OR REPLACE FUNCTION public.debut_cycle_quotas(p_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT max(created_at) FROM coin_ledger
      WHERE user_id = p_user_id AND kind IN ('grant_monthly','grant_upgrade')),
    date_trunc('month', now())
  );
$function$;

-- public.palier_de(uuid)
CREATE OR REPLACE FUNCTION public.palier_de(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT CASE
    WHEN p.is_business IS TRUE THEN 'business'
    WHEN p.is_pro IS TRUE THEN 'pro'
    WHEN p.is_premium IS TRUE OR p.is_comped IS TRUE THEN 'premium'
    ELSE 'free' END
  FROM public.profiles p WHERE p.id = p_user), 'free');
$function$;

-- public.palier_au_moins(uuid,text)
CREATE OR REPLACE FUNCTION public.palier_au_moins(p_user uuid, p_requis text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (CASE palier_de(p_user) WHEN 'business' THEN 3 WHEN 'pro' THEN 2 WHEN 'premium' THEN 1 ELSE 0 END)
      >= (CASE p_requis WHEN 'business' THEN 3 WHEN 'pro' THEN 2 WHEN 'premium' THEN 1 WHEN 'free' THEN 0 WHEN 'gratuit' THEN 0 ELSE 99 END);
$function$;

-- public.republish_palier(uuid)
CREATE OR REPLACE FUNCTION public.republish_palier(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.palier_de(p_user);
$function$;

-- public.quota_annonces_compte(uuid,text)
CREATE OR REPLACE FUNCTION public.quota_annonces_compte(p_user uuid, p_tier text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select q.quota_annonces from public.quotas_par_compte q where q.user_id = p_user),
    (select c.value from public.coin_config c where c.key = 'quota_annonces_' || coalesce(p_tier, 'free'))
  );
$function$;

-- public.quota_annonces_consommees(uuid,timestamptz)
CREATE OR REPLACE FUNCTION public.quota_annonces_consommees(p_user_id uuid, p_cycle timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH borne AS (
    SELECT GREATEST(
      p_cycle,
      to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_annonces_depuis'), 0))
    ) AS t
  )
  SELECT (
    -- Annonces générées (portes A et B) — dédup régénération 24 h inchangée.
    (SELECT count(*) FROM usage_logs u, borne
      WHERE u.user_id = p_user_id AND u.feature = 'generate_listing'
        AND u.created_at >= borne.t
        AND NOT (
          u.metadata ? 'inventaire_id' AND EXISTS (
            SELECT 1 FROM usage_logs prev
            WHERE prev.user_id = u.user_id AND prev.feature = 'generate_listing'
              AND prev.metadata->>'inventaire_id' = u.metadata->>'inventaire_id'
              AND prev.created_at <  u.created_at
              AND prev.created_at >= u.created_at - interval '24 hours'
          )
        ))
    -- + scans NON unifiés depuis la borne : 1 unité chacun. Les scans unifiés
    -- (unifie:true) sont portés par leur ligne generate_listing.
    + (SELECT count(*) FROM usage_logs l, borne
        WHERE l.user_id = p_user_id AND l.feature = 'lens'
          AND l.created_at >= borne.t
          AND NOT (l.metadata ? 'unifie'))
  )::int;
$function$;

-- public.quota_republication_free_etat(uuid)
CREATE OR REPLACE FUNCTION public.quota_republication_free_etat(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plafond integer;
  v_borne   timestamptz;
  v_exec    integer;
  v_vol     integer;
  v_remise  timestamptz;
BEGIN
  SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_free';
  IF v_plafond IS NULL OR v_plafond <= 0 THEN
    -- Clé absente ou à 0 : pas de compteur (jamais un faux zéro, doctrine du 02/09).
    RETURN jsonb_build_object('mode', 'mensuel', 'plafond', NULL);
  END IF;
  v_borne := GREATEST(
    debut_cycle_quotas(p_user),
    to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_republication_free_depuis'), 0)));
  SELECT count(*) FILTER (WHERE j.published_at >= v_borne),
         count(*) FILTER (WHERE j.published_at IS NULL AND j.created_at >= v_borne
                            AND j.status IN ('pending', 'processing', 'needs_user'))
    INTO v_exec, v_vol
    FROM cross_post_jobs j
   WHERE j.user_id = p_user
     AND j.action = 'republish'
     AND (j.published_at >= v_borne OR j.created_at >= v_borne)
     AND NOT (COALESCE(j.platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota'])
     AND COALESCE(j.handler_build, '') !~ '(sync-dressing|releve-annonces)';
  SELECT w.next_grant_at INTO v_remise FROM coin_wallets w WHERE w.user_id = p_user;
  RETURN jsonb_build_object(
    'mode', 'mensuel',
    'plafond', v_plafond,
    'faites', v_exec + v_vol,          -- utilisées : exécutées + en cours
    'executees', v_exec,
    'en_cours', v_vol,
    'restantes', GREATEST(0, v_plafond - v_exec - v_vol),
    'depuis', v_borne,
    'remise_le', v_remise);            -- coin_wallets.next_grant_at, comme les annonces
END;
$function$;

-- public.quotas_etat()
CREATE OR REPLACE FUNCTION public.quotas_etat()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_tier  text;
  v_cycle timestamptz;
  v_qa integer; v_qs integer; v_qr integer; v_qrep integer;
  v_avie integer; v_depuis integer;
  v_ca integer; v_cs integer; v_cr integer; v_crep integer;
  v_repub jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  SELECT CASE
           WHEN p.is_business = true THEN 'business'
           WHEN p.is_pro = true THEN 'pro'
           WHEN p.is_premium = true OR p.is_comped = true THEN 'premium'
           ELSE 'free'
         END INTO v_tier
  FROM profiles p WHERE p.id = v_user;
  v_tier  := COALESCE(v_tier, 'free');
  v_cycle := debut_cycle_quotas(v_user);

  -- (11/10) Le quota d'annonces du COMPTE : son réglage s'il en a un, sinon
  -- celui du palier (quota_annonces_compte, table quotas_par_compte).
  v_qa := quota_annonces_compte(v_user, v_tier);
  SELECT value INTO v_qs   FROM coin_config WHERE key = 'quota_scan_'      || v_tier;
  SELECT value INTO v_qr   FROM coin_config WHERE key = 'quota_retouche_'  || v_tier;
  -- Fusion 02/09 soir : clés scans à 0 (retour arrière) — 0 = pas de compteur.
  v_qs := NULLIF(COALESCE(v_qs, 0), 0);

  v_ca := quota_annonces_consommees(v_user, v_cycle);
  SELECT count(*)::int INTO v_cs FROM usage_logs
   WHERE user_id = v_user AND feature = 'lens' AND created_at >= v_cycle;
  -- Retouches : même remise à zéro que les annonces (quotas_retouche_depuis).
  SELECT count(*)::int INTO v_cr FROM usage_logs
   WHERE user_id = v_user AND feature = 'photo_retouche'
     AND (metadata->>'delivered') IS DISTINCT FROM 'false'
     AND created_at >= GREATEST(v_cycle,
       to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'quotas_retouche_depuis'), 0)));

  IF v_tier = 'free' THEN
    -- (05/10, décision Nico) 50 PAR MOIS, plus « à vie » : le compteur et sa
    -- remise à zéro vivent dans quota_republication_free_etat (même cycle
    -- que quota_annonces_free).
    v_repub := quota_republication_free_etat(v_user);
  ELSIF v_tier = 'business' THEN
    v_repub := jsonb_build_object('mode', 'illimite');
  ELSE
    SELECT value INTO v_qrep FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    SELECT count(*)::int INTO v_crep FROM cross_post_jobs
     WHERE user_id = v_user AND action = 'republish' AND created_at >= v_cycle
       AND NOT (COALESCE(platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota']);
    v_repub := jsonb_build_object('mode', 'mensuel',
                                  'plafond', NULLIF(COALESCE(v_qrep, 0), 0),
                                  'faites', v_crep,
                                  'restantes', CASE WHEN COALESCE(v_qrep,0) > 0
                                    THEN GREATEST(0, v_qrep - v_crep) ELSE NULL END);
  END IF;

  RETURN jsonb_build_object(
    'palier', v_tier,
    'cycle_debut', v_cycle,
    'annonces',  jsonb_build_object('plafond', v_qa, 'consommes', v_ca,
                   'restantes', CASE WHEN v_qa IS NOT NULL THEN GREATEST(0, v_qa - v_ca) END),
    'scans',     jsonb_build_object('plafond', v_qs, 'consommes', v_cs,
                   'restantes', CASE WHEN v_qs IS NOT NULL THEN GREATEST(0, v_qs - v_cs) END),
    'retouches', jsonb_build_object('plafond', v_qr, 'consommes', v_cr,
                   'restantes', CASE WHEN v_qr IS NOT NULL THEN GREATEST(0, v_qr - v_cr) END),
    'republication', v_repub
  );
END;
$function$;

-- public.remise_en_vente_place(uuid)
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
             WHERE r.user_id = p_user AND r.statut = 'faite' AND r.traite_le >= v_depuis
               -- (24/10 soir) une remise après une vente ANNULÉE est hors quota
               AND NOT EXISTS (SELECT 1 FROM cross_post_jobs jv WHERE jv.id = r.job_vendu
                                AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'))
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

-- public.republish_planifiee_etat(text)
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
      -- (25/10) comme le balayage (6bis) : un essai SAUTÉ rend sa place tant que les sautés du
      -- créneau restent ≤ prévues — l'app annonce ce que le balayage fera.
      SELECT count(*) FILTER (WHERE NOT republish_essai_saute(j.status, j.platform_fields, j.error))
             + CASE WHEN count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error))
                         <= COALESCE(v_cr.prevues, 0)
                    THEN 0
                    ELSE count(*) FILTER (WHERE republish_essai_saute(j.status, j.platform_fields, j.error)) END
        INTO v_faits_cr FROM cross_post_jobs j
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

-- public.spend_coins_and_republish(bigint,text,text,numeric,text)
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
