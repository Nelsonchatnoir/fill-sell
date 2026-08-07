-- ═══════════════════════════════════════════════════════════════════════════
-- GARDE DE CADENCE DES RUNS DE SYNC — TENUE EN BASE (2026-08-07)
-- ⛔ NON APPLIQUÉE — à montrer à Nico avant exécution.
-- ═══════════════════════════════════════════════════════════════════════════
-- Contexte : la cadence du cron de sync du dressing (une fois par 24 h) et la
-- cadence manuelle (15 min) n'étaient tenues que dans le CODE de l'extension
-- (background.js) — sauf la mise en file distante, déjà bornée par la RPC
-- demander_sync_dressing(). Or l'extension tourne chez l'utilisateur : une
-- version figée (vieux code en cache), un profil Chrome neuf ou un client
-- trafiqué peut poster des lignes `vinted_sync_runs` à n'importe quel rythme,
-- et chaque run tape l'API Vinted. Avant une communication à ~600 comptes, la
-- cadence doit être une propriété de la BASE, pas une politesse du client.
--
-- Règles portées par ce trigger (BEFORE INSERT, kind='dressing', statuts
-- 'queued'/'running' — c.-à-d. toute NOUVELLE sync ou demande) :
--   · declencheur='cron' :
--       - il faut AU MOINS UN run 'done' antérieur : le cron ENTRETIENT une
--         sync existante, il n'en inaugure jamais une. Sans ça, l'alarme de
--         l'extension (premier tir à +10 min après installation) lisait le
--         dressing d'un compte qui n'a jamais rien demandé — vécu le 06/08 :
--         premier run d'un compte en declencheur='cron', 37 articles importés
--         sans aucun clic de l'utilisateur ;
--       - le dernier run 'done' doit dater de PLUS DE 20 H. 20 h et non 24 h,
--         même arbitrage que SYNC_CRON_COOLDOWN_MS côté extension : l'alarme
--         quotidienne retombe à la même heure ± quelques minutes ; une borne
--         stricte à 24 h refuserait la sync arrivée une minute trop tôt et
--         ferait sauter une journée entière. 20 h absorbe la dérive tout en
--         garantissant au plus une sync cron par jour en usage réel.
--   · tout autre declencheur ('bouton', 'bouton_distant', …) : le dernier run
--     'done' doit dater de plus de 15 MINUTES — miroir exact de la garde de la
--     RPC demander_sync_dressing() et de SYNC_MANUAL_COOLDOWN_MS. La RPC la
--     vérifie déjà pour la file ; ici elle couvre AUSSI l'insertion directe en
--     'running' (chemin du bouton local), qui n'était bornée que côté client.
--
-- Dans les DEUX cas : seul un run DONE arme la fenêtre. Un run 'failed',
-- 'interrupted', 'cancelled' ou 'expired' n'a rien lu (ou presque) — le
-- compter interdirait de retenter aussitôt corrigé, doctrine commune à toutes
-- les gardes du chantier. La REPRISE d'un run 'running' (PATCH, pas INSERT)
-- n'est pas concernée : continuer un run interrompu n'est pas une nouvelle
-- sync.
--
-- Le client, lui, garde ses propres gardes : elles produisent des refus
-- SILENCIEUX et journalisés (journaliserRefusCron) là où le trigger produit
-- une ERREUR d'insert. Le trigger est le filet, pas l'UX.
--
-- SECURITY DEFINER : le trigger lit l'historique des runs de l'utilisateur ;
-- l'inséreur (JWT utilisateur) voit déjà ses propres lignes via RLS, mais on
-- ne veut dépendre d'aucune policy. search_path figé, comme partout.
--
-- Idempotente : CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

create or replace function public.garde_cadence_sync_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists garde_cadence_sync_runs on public.vinted_sync_runs;
create trigger garde_cadence_sync_runs
  before insert on public.vinted_sync_runs
  for each row
  execute function public.garde_cadence_sync_runs();

comment on function public.garde_cadence_sync_runs() is
  'Cadence des syncs du dressing tenue en BASE : cron = jamais sans un premier '
  'run done + 20 h entre deux ; manuel/distant = 15 min après un done. '
  'Miroirs client : SYNC_CRON_COOLDOWN_MS / SYNC_MANUAL_COOLDOWN_MS '
  '(background.js) et demander_sync_dressing() — à faire évoluer ENSEMBLE.';
