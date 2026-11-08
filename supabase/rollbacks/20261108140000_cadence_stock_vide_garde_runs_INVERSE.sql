-- INVERSE de 20261108140000_cadence_stock_vide_garde_runs : garde_cadence_sync_runs remise MOT POUR MOT à sa définition de
-- PRODUCTION du 08/11 (pg_get_functiondef, md5 sans CR 55eb8af87d77ca0d6edbcc7c8ee08d45).
-- Ni BEGIN ni COMMIT : appliquée seule, sur décision.

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
    if v_fini is not null and v_fini > now() - interval '15 minutes' then
      raise exception 'SYNC_CADENCE: dressing synchronisé il y a moins de 15 min (dernier run done: %)', v_fini;
    end if;
  end if;

  return new;
end;
$function$
;
