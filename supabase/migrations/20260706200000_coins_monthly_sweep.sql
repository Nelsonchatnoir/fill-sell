-- ── Système de pièces — filet de sécurité des grants mensuels ────────────────
-- Les grants sont normalement déclenchés par les webhooks (Stripe invoice.paid,
-- Apple DID_RENEW, Google RENEWED). Ce sweep quotidien rattrape les abonnés
-- actifs non crédités du mois (webhook raté, renouvellement Apple/Google dont
-- l'event tombe avant le 1er du mois, Founders à vie sans event récurrent).
-- Idempotent : grant_monthly_coins ne crédite qu'une fois par mois calendaire.

CREATE OR REPLACE FUNCTION public.grant_monthly_coins_sweep()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_granted int := 0;
  v_skipped int := 0;
  r record;
  res jsonb;
BEGIN
  FOR r IN
    -- Abonnés actifs : Pro (is_pro) sinon Premium (is_premium maintenu par les
    -- webhooks, is_founder = plan à vie qui ne doit jamais sauter un mois)
    SELECT id, is_pro FROM profiles
    WHERE is_pro = true OR is_premium = true OR is_founder = true
  LOOP
    res := grant_monthly_coins(r.id, CASE WHEN r.is_pro THEN 'pro' ELSE 'premium' END);
    IF COALESCE((res->>'granted')::boolean, false) THEN
      v_granted := v_granted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('granted', v_granted, 'skipped', v_skipped, 'ran_at', now());
END;
$$;
REVOKE ALL ON FUNCTION public.grant_monthly_coins_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_coins_sweep() TO service_role;

-- Quotidien 04:15 UTC — la garantie « chaque abonné actif a ses pièces du mois
-- au plus tard le matin du 1er », quel que soit l'état des webhooks.
DO $$
BEGIN
  PERFORM cron.unschedule('coins-monthly-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL; -- premier passage : le job n'existe pas encore
END $$;
SELECT cron.schedule('coins-monthly-sweep', '15 4 * * *', $$SELECT public.grant_monthly_coins_sweep()$$);
