-- ═══════════════════════════════════════════════════════════════════════════
-- Cache d'idempotence du mode identify de lens-analysis (2026-07-28)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le mode identify est GRATUIT (inclus dans le prix de publication) : rien
-- n'empêche de le relancer en boucle. Le cas d'abus PROBABLE n'est pas un
-- script, c'est quelqu'un qui re-clique parce que le résultat ne lui plaît pas
-- — et avec temperature: 0, il obtiendrait de toute façon la même chose.
--
-- Ce cache mémorise le résultat par (utilisateur, mode, version de prompt, jeu
-- de photos trié) pendant 24 h. Il est testé AVANT tout compteur de quota :
-- sinon l'utilisateur qui re-clique brûlerait son quota pour un résultat déjà
-- produit et déjà payé en API.
--
-- La clé est un SHA-256 calculé côté Edge Function :
--   user_id | mode | VERSION_PROMPT | urls triées
-- Le mode et la version sont INDISPENSABLES : sans eux, un identify et un scan
-- complet sur les mêmes photos entreraient en collision, et un changement de
-- prompt continuerait de servir du périmé.

create table if not exists public.lens_identify_cache (
  cle        text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  resultat   jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.lens_identify_cache is
  'Cache 24 h des réponses du mode identify de lens-analysis, par (user, mode, version de prompt, jeu de photos trié). Écrit et lu UNIQUEMENT par la fonction lens-analysis en service_role. Aucun accès client. Purgé par grant_monthly_coins_sweep (cron 04:15).';
comment on column public.lens_identify_cache.cle is
  'SHA-256 de user_id|mode|VERSION_PROMPT|urls triées. Bumper VERSION_PROMPT dans lens-analysis invalide de fait tout le cache existant.';

-- Expiration : vérifiée À LA LECTURE par la fonction (created_at > now() -
-- 24 h). L'index sert la purge quotidienne.
create index if not exists lens_identify_cache_created_at_idx
  on public.lens_identify_cache (created_at);

-- ── Accès ─────────────────────────────────────────────────────────────────
-- GRANT à authenticated : obligatoire depuis le breaking change Supabase de
-- mai 2026 (aucun privilège implicite sur une nouvelle table du schéma public).
-- Il ne donne AUCUN accès réel ici : la RLS est activée et la seule politique
-- refuse tout. C'est volontaire — la table contient des résultats d'analyse
-- bruts, et le client n'a rien à y lire (il reçoit la réponse de la fonction).
-- Le service_role, lui, contourne la RLS : c'est le seul chemin d'accès.
grant select, insert, update, delete on public.lens_identify_cache to authenticated;

alter table public.lens_identify_cache enable row level security;

drop policy if exists "aucun acces client" on public.lens_identify_cache;
create policy "aucun acces client"
  on public.lens_identify_cache
  for all
  to authenticated
  using (false)
  with check (false);

-- ── Purge — BRANCHÉE SUR UN CRON EXISTANT, aucun job nouveau ──────────────
-- grant_monthly_coins_sweep() est déjà appelée tous les jours à 04:15 par le
-- job pg_cron « coins-monthly-sweep » (jobid 3). On la RECRÉE à l'identique
-- (corps inchangé au caractère près) en préfixant la purge du cache expiré.
-- Choisir cette fonction plutôt qu'un nouveau job : une purge de cache ne
-- mérite pas son propre cron, et le sweep tourne déjà à une heure creuse.
create or replace function public.grant_monthly_coins_sweep()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_granted  int := 0;
  v_skipped  int := 0;
  v_awaiting int := 0;
  v_purges   int := 0;
  r   record;
  res jsonb;
begin
  -- Purge du cache identify expiré (> 24 h). Best-effort : elle ne conditionne
  -- JAMAIS la fraîcheur (vérifiée à la lecture), elle évite juste la croissance
  -- sans fin de la table.
  delete from lens_identify_cache where created_at < now() - interval '24 hours';
  get diagnostics v_purges = row_count;

  for r in
    select p.id,
           case
             when p.is_pro = true then 'pro'
             when p.is_premium = true or p.is_comped = true then 'premium'
             else 'free'
           end as tier
    from profiles p
    -- LEFT JOIN impératif : un profil sans ligne coin_wallets doit être balayé,
    -- sinon il ne serait jamais crédité. next_grant_at vaut alors NULL.
    left join coin_wallets w on w.user_id = p.id
    where w.next_grant_at is null or w.next_grant_at <= now()
  loop
    res := upgrade_monthly_grant(r.id, r.tier, null, 'sweep');
    if coalesce((res->>'granted')::boolean, false) then
      v_granted := v_granted + 1;
    elsif res->>'reason' = 'awaiting_payment_event' then
      v_awaiting := v_awaiting + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;
  return jsonb_build_object('granted', v_granted, 'skipped', v_skipped,
                            'awaiting_payment', v_awaiting,
                            'lens_cache_purge', v_purges, 'ran_at', now());
end;
$function$;
