-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260919132234 « rapatriement_fonctions_triggers_vue » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_ebay_accounts_updated_at on public.ebay_accounts;
create trigger trg_ebay_accounts_updated_at
  before update on public.ebay_accounts
  for each row execute function public.ebay_accounts_touch_updated_at();

CREATE OR REPLACE VIEW public.v_categorie_arbitrage_extension AS
SELECT
  (j.created_at AT TIME ZONE 'Europe/Paris')::date AS jour,
  coalesce(w->>'plateforme', j.platform)           AS plateforme,
  w->>'motif'                                      AS motif,
  count(*)                                         AS n,
  sum((w->>'n_candidats')::int)                    AS candidats_cumules
FROM public.cross_post_jobs j,
     LATERAL jsonb_array_elements(coalesce(j.platform_fields->'warnings', '[]'::jsonb)) w
WHERE w->>'code' = 'categorie_arbitrage'
GROUP BY 1, 2, 3;

GRANT SELECT ON public.v_categorie_arbitrage_extension TO authenticated;

create or replace function public.garde_aspects_lbc_requis()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.platform is distinct from 'leboncoin' then
    return new;
  end if;

  -- (a) champs absents du formulaire particulier : jamais requis
  if new.field_key in ('estimated_parcel_weight', 'quantity', 'spare_parts_availability') then
    new.required := false;
    return new;
  end if;

  -- (b) pas de montée false → true sur une ligne déjà connue
  if tg_op = 'UPDATE' and coalesce(old.required, false) = false and coalesce(new.required, false) = true then
    new.required := false;
  end if;

  return new;
end;
$$;

drop trigger if exists garde_aspects_lbc_requis on public.platform_category_aspects;
create trigger garde_aspects_lbc_requis
  before insert or update on public.platform_category_aspects
  for each row execute function public.garde_aspects_lbc_requis();

create or replace function public.garde_aspects_question_posable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(new.required, false) = false then
    return new;
  end if;

  -- (a) contenu de l'annonce, jamais un attribut
  if new.field_key ~* '^(photo|photos|image|images|picture|pictures|media|title|titre|description|price|prix)$' then
    new.required := false;
    return new;
  end if;

  -- (b) libellé jamais traduit : la clé technique brute
  if new.field_label = new.field_key and new.field_label ~ '^[a-z0-9]+(_[a-z0-9]+)+$' then
    new.required := false;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists garde_aspects_question_posable on public.platform_category_aspects;
create trigger garde_aspects_question_posable
  before insert or update on public.platform_category_aspects
  for each row execute function public.garde_aspects_question_posable();

CREATE OR REPLACE FUNCTION public.set_profile_currency(p_currency text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles SET currency = p_currency WHERE id = auth.uid();
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'cross_post_jobs_republish_maintenance'
       AND tgrelid = 'public.cross_post_jobs'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER cross_post_jobs_republish_maintenance
      BEFORE INSERT ON public.cross_post_jobs
      FOR EACH ROW EXECUTE FUNCTION public.republish_maintenance_guard();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-tunnel-job-relaunch-hourly') THEN
    PERFORM cron.schedule(
      'email-tunnel-job-relaunch-hourly',
      '0 * * * *',
      $cmd$
  select net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/email-tunnel',
    headers := '{"Content-Type":"application/json","x-cron-secret":"__CRON_SECRET_DU_VAULT__"}'::jsonb,
    body    := '{"job_relaunch":true}'::jsonb
  );
  $cmd$
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'profiles'
       AND policyname = 'select own profile'
  ) THEN
    CREATE POLICY "select own profile" ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'founder_config'
       AND policyname = 'founder_config_read_public'
  ) THEN
    CREATE POLICY founder_config_read_public ON public.founder_config
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
