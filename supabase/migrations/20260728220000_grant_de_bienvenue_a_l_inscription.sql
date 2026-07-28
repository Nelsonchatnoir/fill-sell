-- ═══════════════════════════════════════════════════════════════════════════
-- Les 30 Pépites sont accordées À L'INSCRIPTION, plus à la première action
-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-28.
--
-- CE QUE LES DONNÉES DISENT (et qui corrige le diagnostic initial) : le grant
-- n'a JAMAIS été posé à l'inscription. Sur les comptes créés ces 36 dernières
-- heures, l'horodatage du premier grant est rigoureusement égal à celui de la
-- première action (`grant_egale_action = true`, 49 s à 9 min après
-- l'inscription — le temps d'un premier scan Lens), et pour les comptes
-- restés inactifs il vaut exactement 04:15:00, l'heure du sweep — soit 5 à
-- 7 heures d'attente. Deux chemins existaient donc, aucun n'était
-- l'inscription :
--   · le grant paresseux des RPC de dépense, au premier scan ou à la première
--     publication ;
--   · le sweep quotidien de 04:15.
-- Le cycle par utilisateur (20260728160000) n'a rien retiré : le sweep
-- balaie toujours les profils sans wallet (LEFT JOIN, next_grant_at NULL) et
-- le chemin paresseux fonctionne — vérifié en simulant le premier scan du
-- compte concerné. Ce n'était pas une régression, mais un angle mort d'origine.
--
-- CE QU'ON CORRIGE : un inscrit qui ouvre l'app sans rien faire voyait un
-- solde vide jusqu'au sweep de la nuit suivante. C'est le premier écran du
-- produit ; le grant doit être là avant que l'utilisateur regarde.
--
-- SÉCURITÉ DU TRIGGER — le point critique de cette migration : ce trigger
-- s'exécute dans la transaction d'inscription. Une exception non rattrapée y
-- ferait ÉCHOUER LA CRÉATION DE COMPTE. Le grant est donc enveloppé dans un
-- bloc EXCEPTION qui avale tout : au pire on retombe sur les deux chemins
-- existants (paresseux et sweep), qui restent en place et ne sont pas touchés.
-- Mieux vaut un grant tardif qu'une inscription refusée.
--
-- IDEMPOTENCE : garantie par grant_monthly_coins lui-même — il pose
-- next_grant_at (un second appel repart avec 'already_granted') et écrit une
-- ref unique dans coin_ledger, protégée par coin_ledger_ref_unique. Un
-- rejeu du trigger ou un chevauchement avec le sweep ne peut pas créditer
-- deux fois.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;

  -- Pépites de bienvenue : wallet créé et grant free posé immédiatement, pour
  -- que le premier écran affiche un solde réel. Le tier est TOUJOURS 'free' à
  -- l'inscription — un abonnement ne peut pas précéder la création du compte.
  -- Le trigger est AFTER INSERT : la ligne auth.users existe déjà, la clé
  -- étrangère de coin_wallets est donc satisfaite.
  BEGIN
    PERFORM public.grant_monthly_coins(new.id, 'free');
  EXCEPTION WHEN OTHERS THEN
    -- Ne JAMAIS faire échouer l'inscription pour un grant : le chemin
    -- paresseux et le sweep restent en filet.
    RAISE WARNING '[handle_new_user] grant de bienvenue impossible pour % : %', new.id, SQLERRM;
  END;

  IF new.email IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/email-tunnel',
      headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
      body    := json_build_object(
        'welcome_now',  true,
        'user_id',      new.id::text,
        'user_email',   new.email
      )::jsonb
    );
  END IF;

  RETURN new;
END;
$function$;

-- Rattrapage des comptes déjà inscrits et restés sans wallet, pour qu'ils
-- n'attendent pas le sweep. Passe par la même RPC que le trigger : mêmes
-- règles, même idempotence, aucun risque de double crédit sur un compte déjà
-- servi (il repart en 'already_granted').
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id FROM public.profiles p
    LEFT JOIN public.coin_wallets w ON w.user_id = p.id
    WHERE w.user_id IS NULL
  LOOP
    BEGIN
      PERFORM public.grant_monthly_coins(r.id, 'free');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'rattrapage grant impossible pour % : %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
