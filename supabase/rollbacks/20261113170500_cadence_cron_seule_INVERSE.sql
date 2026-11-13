-- INVERSE de supabase/migrations/20261113170500_cadence_cron_seule.sql (13/11/2026) : la définition de PROD de
-- public.garde_cadence_sync_runs() lue le 13/11 vers 03:00 (pg_get_functiondef, lecture seule), à l'octet
-- (md5 304ab0f8261de9e747757ce51a534833 — version du 08/11, migration 20261108140000). Droits et déclencheur inchangés
-- (CREATE OR REPLACE les garde) ; le commentaire de prod remis tel quel. Aucune ligne à remettre : la migration n'en écrit aucune.
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261113170500_cadence_cron_seule_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261113170500
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.garde_cadence_sync_runs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fini timestamptz;
begin
  -- Seules les NOUVELLES syncs/demandes du dressing sont bornées.
  if new.kind is distinct from 'dressing'
     or new.status not in ('queued', 'running') then
    return new;
  end if;

  select max(finished_at) into v_fini
  from vinted_sync_runs
  where user_id = new.user_id
    and kind = 'dressing'
    and status = 'done';

  if new.declencheur = 'cron' then
    if v_fini is null then
      raise exception 'SYNC_CRON_SANS_PREMIERE_SYNC: le cron n''inaugure jamais une sync — la première est un geste explicite de l''utilisateur';
    end if;
    if v_fini > now() - interval '20 hours' then
      raise exception 'SYNC_CRON_CADENCE: dressing synchronisé il y a moins de 20 h (dernier run done: %)', v_fini;
    end if;
  else
    -- (08/11, ayadi007) Pas de cadence sur un stock VIDE : même condition que demander_sync_dressing (règle du 26/10,
    -- B3 — Nico). Sans elle, la demande acceptée par demander_sync_dressing mourait ici (« SYNC_CADENCE » après
    -- « Réinitialiser »).
    if v_fini is not null and v_fini > now() - interval '15 minutes'
       and exists (select 1 from inventaire i where i.user_id = new.user_id and i.statut = 'stock' and i.fusionne_dans is null) then
      raise exception 'SYNC_CADENCE: dressing synchronisé il y a moins de 15 min (dernier run done: %)', v_fini;
    end if;
  end if;

  return new;
end;
$function$
;

COMMENT ON FUNCTION public.garde_cadence_sync_runs() IS 'Cadence des syncs du dressing tenue en BASE : cron = jamais sans un premier run done + 20 h entre deux ; manuel/distant = 15 min après un done. Miroirs client : SYNC_CRON_COOLDOWN_MS / SYNC_MANUAL_COOLDOWN_MS (background.js) et demander_sync_dressing() — à faire évoluer ENSEMBLE.';

COMMIT;
