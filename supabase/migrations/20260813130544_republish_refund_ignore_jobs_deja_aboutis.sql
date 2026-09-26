-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260813130544 « republish_refund_ignore_jobs_deja_aboutis » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- Ne jamais rembourser une republication qui a DÉJÀ abouti.
-- Contexte : la détection de vente clôt en 'cancelled' un ancien job réussi
-- quand l'article est republié une seconde fois (« pas une vente »).
-- Le trigger lisait ce 'cancelled' comme un échec et remboursait une
-- prestation déjà rendue et facturée. 25 cas constatés depuis le 07/08/2026.
-- Seul ajout : le bloc de garde published_at / new_vinted_item_id.
create or replace function public.republish_refund_on_terminal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_montant integer;
BEGIN
  IF NEW.action IS DISTINCT FROM 'republish' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('failed', 'cancelled', 'dry_run_completed') THEN RETURN NEW; END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF (NEW.platform_fields->>'pepite_remboursee') = 'true' THEN RETURN NEW; END IF;

  -- GARDE : un job déjà abouti n'est jamais remboursé.
  -- Un 'cancelled' après succès = clôture d'historique, pas un échec.
  IF NEW.published_at IS NOT NULL
     OR (NEW.platform_fields->>'new_vinted_item_id') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_montant := COALESCE(NULLIF(NEW.platform_fields->>'pepites_debitees', '')::integer, 0);
  IF v_montant > 0 THEN
    PERFORM refund_coins(NEW.user_id, v_montant,
      jsonb_build_object('source', 'republish_' || NEW.status, 'job_id', NEW.id),
      'refund_republish');
    NEW.platform_fields := jsonb_set(COALESCE(NEW.platform_fields, '{}'::jsonb),
      '{pepite_remboursee}', 'true'::jsonb);
  END IF;
  RETURN NEW;
END;
$function$;
