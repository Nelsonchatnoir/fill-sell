-- ══════════════════════════════════════════════════════════════════════════════
-- CAPTURE DE LA PROD (audit dépôt ↔ prod du 26/09/2026)
-- Migration 20260728122055 « cycle_grant_par_utilisateur_a_schema_helper_backfill » : APPLIQUÉE en prod, mais aucun fichier
-- ne la portait dans le dépôt. Ce fichier reprend MOT POUR MOT les instructions
-- enregistrées dans supabase_migrations.schema_migrations.statements — il ne
-- change rien en prod (même version déjà inscrite dans l'historique distant).
-- ⛔ Ne pas réappliquer à la main.
-- ══════════════════════════════════════════════════════════════════════════════
-- Bloc A : schéma + helper + backfill. Appliqué AVANT la réécriture des
-- fonctions : tant que celles-ci restent calendaires, rien ne lit
-- next_grant_at, donc poser les échéances d'abord supprime toute fenêtre
-- pendant laquelle un wallet aurait next_grant_at NULL face à une fonction
-- qui l'interprète comme « jamais crédité ».

alter table public.coin_wallets
  add column if not exists next_grant_at    timestamptz,
  add column if not exists grant_anchor_day smallint;

comment on column public.coin_wallets.next_grant_at is
  'Échéance du prochain grant. Posée par les webhooks depuis la date du store pour les abonnés, calculée depuis grant_anchor_day sinon. NULL = jamais crédité.';
comment on column public.coin_wallets.grant_anchor_day is
  'Jour d''ancrage du cycle (1-31), issu de profiles.created_at. Préserve le jour d''origine à travers les mois courts (31 → 28 février → 31 mars).';

create index if not exists coin_wallets_next_grant_idx
  on public.coin_wallets (next_grant_at)
  where next_grant_at is not null;

create or replace function public.grant_next_due(p_after timestamptz, p_anchor_day int)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ref    date := p_after::date;
  v_first  date;
  v_last   int;
  v_cand   date;
  v_anchor int := least(greatest(coalesce(p_anchor_day, 1), 1), 31);
  i        int;
begin
  v_first := make_date(extract(year from v_ref)::int, extract(month from v_ref)::int, 1);
  for i in 0..1 loop
    v_last := extract(day from (v_first + interval '1 month' - interval '1 day'))::int;
    v_cand := v_first + (least(v_anchor, v_last) - 1);
    if v_cand > v_ref then
      return v_cand::timestamptz;
    end if;
    v_first := (v_first + interval '1 month')::date;
  end loop;
  return v_cand::timestamptz;
end;
$$;

revoke all on function public.grant_next_due(timestamptz, int) from public, anon, authenticated;
grant execute on function public.grant_next_due(timestamptz, int) to service_role;

update public.coin_wallets w
set grant_anchor_day = least(greatest(extract(day from p.created_at)::int, 1), 31),
    next_grant_at    = public.grant_next_due(
                         now(),
                         least(greatest(extract(day from p.created_at)::int, 1), 31)
                       ),
    updated_at       = now()
from public.profiles p
where p.id = w.user_id
  and w.next_grant_at is null;
