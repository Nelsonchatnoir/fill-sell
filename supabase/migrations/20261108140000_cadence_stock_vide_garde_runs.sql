-- 20261108140000 — « Synchroniser » depuis un stock VIDE n'est jamais refusé par la cadence de 15 min (08/11, ayadi007)
--
-- Constat (prod, 08/11, lecture seule) : ayadi007 réinitialise son inventaire à 11:00:38 (rpc
-- supprimer_mon_stock_sans_retrait, journal d'API). Son dressing Vinted avait été lu à 10:53:23. À 11:01:06 il touche
-- « Synchroniser » depuis l'écran du stock vide (usage_logs sync_click, source stock_empty) ; le repli par la file
-- (11:01:16) reçoit l'EXCEPTION « SYNC_CADENCE: dressing synchronisé il y a moins de 15 min » et l'app affiche « La
-- demande n'a pas pu être envoyée. Réessaie dans un instant. » — faux motif, aucune heure.
-- Cause : la règle du 26/10 (B3, Nico) « pas de cadence sur un stock VIDE » a été posée dans demander_sync_dressing
-- (migration 20261026150000) et dans l'extension (stockVideCadence), mais PAS dans ce déclencheur BEFORE INSERT de
-- vinted_sync_runs, qui juge toute nouvelle ligne dressing (bouton, bouton_distant, app…) : demander_sync_dressing laisse
-- passer, son INSERT est refusé ici.
--
-- LA RÈGLE (tous comptes) : la cadence de 15 min des syncs MANUELLES ne s'applique pas quand le compte n'a AUCUN article
-- au stock (même condition, mot pour mot, que demander_sync_dressing : statut 'stock', non fusionné). Le cron garde sa
-- règle (jamais d'inauguration, 20 h) : la veille n'est pas un geste. Rien d'autre ne change.
-- Définition réécrite depuis pg_get_functiondef EN PRODUCTION (08/11, md5 55eb8af87d77ca0d6edbcc7c8ee08d45) : chaque
-- ligne gardée, une condition ajoutée. Inverse : supabase/rollbacks/20261108140000_cadence_stock_vide_garde_runs_INVERSE.sql.
-- Preuve (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-ayadi-0811.mjs
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite, après le feu vert.

DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.garde_cadence_sync_runs()'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> '55eb8af87d77ca0d6edbcc7c8ee08d45' AND position('(08/11, ayadi007)' IN v_d) = 0 THEN
    RAISE EXCEPTION 'garde_cadence_sync_runs a changé en prod depuis le 08/11 : repartir de pg_get_functiondef';
  END IF;
  -- Le miroir : demander_sync_dressing porte toujours la règle du 26/10 (même condition).
  SELECT replace(pg_get_functiondef('public.demander_sync_dressing()'::regprocedure), chr(13), '') INTO v_d;
  IF position('i.statut = ''stock'' and i.fusionne_dans is null' IN v_d) = 0 THEN
    RAISE EXCEPTION 'demander_sync_dressing ne porte plus la règle « stock vide » du 26/10 : relire avant d''appliquer';
  END IF;
END
$garde$;

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
$function$;
