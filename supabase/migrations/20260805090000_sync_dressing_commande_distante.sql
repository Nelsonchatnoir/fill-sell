-- ═══════════════════════════════════════════════════════════════════════════
-- SYNC DU DRESSING COMMANDABLE À DISTANCE (mobile → Chrome de l'utilisateur)
-- ⛔ NON APPLIQUÉE — à montrer à Nico avant exécution (2026-08-05).
-- ═══════════════════════════════════════════════════════════════════════════
-- Objectif produit : l'utilisateur installe l'extension UNE FOIS sur son
-- ordinateur, puis synchronise depuis son téléphone. Aujourd'hui le bouton
-- teste la présence d'une extension DANS CE NAVIGATEUR (signal postMessage) —
-- toujours faux sur mobile.
--
-- Forme retenue (arbitrage Nico) : la commande est une ligne vinted_sync_runs
-- en statut 'queued', PAS un job cross_post_jobs. Motif : les lignes
-- cross_post_jobs portent la machinerie de facturation (reservation_id,
-- pepites_debitees, triggers de refund/release) et sont servies à TOUTES les
-- versions d'extension — une 0.4.x recevant un « job de sync » tenterait de le
-- publier. Ici, l'UI lit déjà vinted_sync_runs pour la progression et la
-- cadence : l'attente n'est qu'un statut de plus dans la table qu'elle poll.
--
-- ⚠️ `status` n'a AUCUNE contrainte CHECK (cf. 20260803180000 ligne 118 : la
-- liste running|done|failed|interrupted n'est qu'un commentaire, et la prod
-- porte déjà un run en 'error'). Ajouter 'queued'/'expired'/'cancelled' ne
-- demande donc aucune migration de contrainte — et le front ne doit jamais
-- supposer une liste fermée.
--
-- Idempotente : rejouable sans effet (IF NOT EXISTS / OR REPLACE / DROP+CREATE
-- d'index sous le même nom).

-- ── 1. Version de l'extension connue du SERVEUR ─────────────────────────────
-- Le poll n'envoyait que `build` (« 2026-08-03T19:08:03Z+61a3992 ») : un
-- horodatage + un hash git, dont on ne peut PAS déduire « 0.5.0 ». Sans la
-- version, impossible de savoir si l'extension d'un compte SAIT synchroniser —
-- et c'est exactement le piège du 03/08 : une 0.4.x entretient
-- extension_last_seen_at tout en ignorant la commande de sync.
alter table public.profiles
  add column if not exists extension_version text;

comment on column public.profiles.extension_version is
  'Version de manifest la PLUS HAUTE vue sur ce compte (arbitrage Nico du '
  '05/08 : max, pas dernière — un compte à deux machines, portable 0.4.x et '
  'fixe 0.5.0, ne doit pas faire osciller le bouton). Écrite par '
  'get-pending-jobs via noter_version_extension().';

-- Clé de comparaison de version. int[] se compare nativement et élément par
-- élément (ARRAY[0,5,0] > ARRAY[0,4,9]). Une saisie illisible rend NULL, et
-- toute comparaison avec NULL est NULL → traitée comme « pas capable », jamais
-- comme « capable ». IMMUTABLE : utilisable en index si besoin un jour.
create or replace function public.version_cle(p_version text)
returns int[]
language sql
immutable
set search_path = public
as $$
  select case
    when p_version ~ '^\d+(\.\d+)*$' then string_to_array(p_version, '.')::int[]
    else null
  end;
$$;

revoke all on function public.version_cle(text) from public, anon;
grant execute on function public.version_cle(text) to authenticated, service_role;

-- MAX, jamais « dernière vue ». Le WHERE porte toute la logique : on n'écrit
-- que si la version proposée est lisible ET strictement supérieure à celle
-- déjà connue (ou si aucune n'est connue / celle stockée est illisible).
create or replace function public.noter_version_extension(p_user_id uuid, p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
     set extension_version = p_version
   where id = p_user_id
     and version_cle(p_version) is not null
     and (extension_version is null
          or version_cle(extension_version) is null
          or version_cle(p_version) > version_cle(extension_version));
end;
$$;

revoke all on function public.noter_version_extension(uuid, text) from public, anon, authenticated;
grant execute on function public.noter_version_extension(uuid, text) to service_role;

-- ── 2. La commande en attente ───────────────────────────────────────────────
-- queued_at : distinct de started_at, qui est REMIS À now() par l'extension au
-- moment où elle réclame la commande (sinon la durée affichée du run
-- engloberait les heures d'attente, et le « démarré à » mentirait).
alter table public.vinted_sync_runs
  add column if not exists queued_at  timestamptz,
  add column if not exists claimed_at timestamptz;

comment on column public.vinted_sync_runs.queued_at is
  'Horodatage de la MISE EN FILE (clic mobile). NULL pour un run lancé '
  'directement depuis un navigateur porteur de l''extension.';
comment on column public.vinted_sync_runs.claimed_at is
  'Moment où une extension a réclamé la commande (queued → running).';

-- Un seul actif par utilisateur : le prédicat couvre désormais l'ATTENTE.
-- Conséquences, toutes voulues : un 2e clic ne peut pas empiler une demande, et
-- une demande ne peut pas coexister avec un run déjà en cours sur le PC. La
-- garantie est en BASE — deux onglets, ou mobile + desktop simultanés, ne la
-- contournent pas. DROP+CREATE sous le même nom : idempotent.
drop index if exists public.vinted_sync_runs_un_seul_actif;
create unique index vinted_sync_runs_un_seul_actif
  on public.vinted_sync_runs (user_id, kind)
  where status in ('queued', 'running');

-- ── 3. TTL de 6 h (arbitrage Nico) ──────────────────────────────────────────
-- Sans expiration, un clic du lundi soir partirait au réveil du PC le
-- vendredi, très loin de l'intention. Purge LAZY (pas de cron) appelée aux
-- deux seuls endroits qui en ont besoin : la mise en file (sinon une demande
-- morte bloquerait le compte à vie via l'index unique) et la distribution
-- (get-pending-jobs, pour ne jamais servir une commande périmée).
create or replace function public.purger_sync_queue_perimee(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update vinted_sync_runs
     set status      = 'expired',
         finished_at = now(),
         erreur      = 'demande expirée (6 h sans extension disponible)',
         updated_at  = now()
   where user_id = p_user_id
     and kind    = 'dressing'
     and status  = 'queued'
     and coalesce(queued_at, started_at) < now() - interval '6 hours';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.purger_sync_queue_perimee(uuid) from public, anon, authenticated;
grant execute on function public.purger_sync_queue_perimee(uuid) to service_role;

-- ── 4. Mise en file, depuis le client ───────────────────────────────────────
-- SECURITY DEFINER + auth.uid() : l'utilisateur est pris dans le jeton, JAMAIS
-- dans un paramètre (même règle que spend_coins_and_publish — un p_user_id
-- accepté du client permettrait de commander une sync sur le compte d'autrui).
create or replace function public.demander_sync_dressing()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_prof    record;
  v_capable boolean;
  v_fini    timestamptz;
  v_dans    integer;
  v_id      uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  -- Une demande morte ne doit jamais bloquer le compte (index unique).
  perform purger_sync_queue_perimee(v_user);

  select extension_last_seen_at, extension_version into v_prof
  from profiles where id = v_user;

  -- Jamais aucune extension sur ce compte → accroche d'installation côté UI.
  if v_prof.extension_last_seen_at is null then
    return jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue');
  end if;

  -- Connue mais incapable de synchroniser (0.4.x, ou version jamais annoncée
  -- parce que le build est antérieur à l'envoi de `version` au poll) → message
  -- de mise à jour, surtout pas d'accroche d'installation.
  v_capable := version_cle(v_prof.extension_version) is not null
               and version_cle(v_prof.extension_version) >= version_cle('0.5.0');
  if not v_capable then
    return jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  end if;

  -- Cadence 15 min — vérifiée ICI **et** à la reprise par l'extension (le PC
  -- peut se réveiller des heures plus tard, après un cron quotidien qui a déjà
  -- synchronisé). Seul un run DONE arme la fenêtre : un échec se retente tout
  -- de suite. Miroir : SYNC_MANUAL_COOLDOWN_MS (background.js) et
  -- SYNC_CADENCE_MANUELLE_MS (src/utils/vintedSync.js) — même valeur, à faire
  -- évoluer ENSEMBLE.
  select max(finished_at) into v_fini
  from vinted_sync_runs
  where user_id = v_user and kind = 'dressing' and status = 'done';
  if v_fini is not null and v_fini > now() - interval '15 minutes' then
    v_dans := greatest(1, ceil(extract(epoch from (v_fini + interval '15 minutes' - now())) / 60)::int);
    return jsonb_build_object('ok', false, 'reason', 'cadence', 'prochaine_dans_min', v_dans);
  end if;

  -- L'index unique partiel est le juge : deux clics concurrents ne peuvent pas
  -- créer deux demandes, même à la milliseconde près.
  begin
    insert into vinted_sync_runs (user_id, kind, status, declencheur, queued_at)
    values (v_user, 'dressing', 'queued', 'bouton_distant', now())
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'deja_en_attente');
  end;

  return jsonb_build_object('ok', true, 'run_id', v_id);
end;
$$;

revoke all on function public.demander_sync_dressing() from public, anon;
grant execute on function public.demander_sync_dressing() to authenticated, service_role;
