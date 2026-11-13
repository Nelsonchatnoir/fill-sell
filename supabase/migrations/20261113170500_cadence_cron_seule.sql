-- 20261113170500_cadence_cron_seule — LE RELEVÉ VINTED AUTOMATIQUE NE COMPTE QUE LES RELEVÉS AUTOMATIQUES DANS SES 20 H
-- (13/11, étape 5 du lot « zéro problème », bloc 6 P2 — décision de Nico : « ne compter que les crons dans les 20 h +
-- miroir SQL »).
-- CONSTAT (audit bloc 6, 7 jours) : ≈ 491 refus « cadence_cron » sur 127 comptes ; la garde comptait le dernier relevé
-- réussi QUEL QUE SOIT son déclencheur : un geste du soir faisait refuser le relevé automatique du lendemain matin, et
-- l'alarme suivante ne venait que 24 h plus tard. Compte 447d920c : geste le 11/11 à 20:29 (Paris), relevé automatique
-- refusé le 12/11 à 10:34, ~38 h sans relevé automatique ; 30 comptes sans aucun relevé automatique réussi en 7 jours
-- alors que le leur avait été refusé.
-- LA RÈGLE (miroir de decisionCadenceCron, background.js, extension 0.6.187) :
--   · garde_cadence_sync_runs (BEFORE INSERT sur vinted_sync_runs), branche « cron » SEULEMENT : la fenêtre de 20 h se
--     lit sur le dernier relevé AUTOMATIQUE réussi (declencheur = 'cron'), plus sur le dernier relevé quelconque ;
--   · INCHANGÉ : la première synchro reste un geste (SYNC_CRON_SANS_PREMIERE_SYNC, sur tout relevé réussi) ; la cadence
--     de 15 min des gestes et l'exception « stock vide » (08/11) ; les autres déclencheurs ; les droits.
--   · Coût : une lecture max(finished_at) de plus par relevé automatique demandé (≈ 60 par jour, sur les lignes d'UN
--     compte). Aucune ligne écrite.
-- ⛔ Jamais un relevé lancé par le serveur ; rien ne se déclenche après la connexion d'une plateforme au Cloud.
-- Ordre de livraison : migration et extension 0.6.187 ensemble ou dans n'importe quel ordre — sans la migration, la
-- 0.6.187 voit la base refuser (comme aujourd'hui) et arme son rattrapage à « fin + 20 h » (P1) ; sans la 0.6.187,
-- les extensions servies refusent d'elles-mêmes (leur garde compte encore les gestes) : rien ne change pour elles.
-- Banc : node scripts/cloud/pg-jetable.mjs scripts/cadence-cron-seule-banc.mjs (Postgres jetable : prod / migration /
-- inverse à l'octet / rejouée).
-- Inverse : supabase/rollbacks/20261113170500_cadence_cron_seule_INVERSE.sql (la définition de prod, md5 304ab0f8…).
-- À jouer (feu vert de Nico) : npx supabase db query --linked -f supabase/migrations/20261113170500_cadence_cron_seule.sql
--   puis npx supabase migration repair --linked --status applied 20261113170500  (version à relire contre « migration list »).
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
  v_fini_cron timestamptz;
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
    -- (13/11, lot « zéro problème », bloc 6 P2 — décision de Nico) Seuls les relevés AUTOMATIQUES comptent dans les
    -- 20 h : un geste (bouton, bouton distant, app) ne repousse plus le relevé automatique du lendemain (447d920c : geste
    -- le 11/11 à 20:29, relevé automatique refusé le 12/11 à 10:34). Miroir de decisionCadenceCron (extension 0.6.187).
    select max(finished_at) into v_fini_cron
    from vinted_sync_runs
    where user_id = new.user_id
      and kind = 'dressing'
      and status = 'done'
      and declencheur = 'cron';
    if v_fini_cron > now() - interval '20 hours' then
      raise exception 'SYNC_CRON_CADENCE: relevé automatique il y a moins de 20 h (dernier relevé automatique done: %)', v_fini_cron;
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

COMMENT ON FUNCTION public.garde_cadence_sync_runs() IS 'Cadence des syncs du dressing tenue en BASE : cron = jamais sans un premier run done + 20 h entre deux relevés AUTOMATIQUES (13/11, bloc 6 P2 : un geste ne repousse plus le cron) ; manuel/distant = 15 min après un done. Miroirs client : SYNC_CRON_COOLDOWN_MS / decisionCadenceCron / SYNC_MANUAL_COOLDOWN_MS (background.js) et demander_sync_dressing() — à faire évoluer ENSEMBLE.';

COMMIT;
