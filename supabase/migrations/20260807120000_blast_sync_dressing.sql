-- ═══════════════════════════════════════════════════════════════════════════
-- BLAST « SYNC DU DRESSING » — DÉDUP + CIBLE ORDONNÉE (2026-08-07)
-- ✅ APPLIQUÉE en prod le 07/08 (validée par Nico), via db query --linked.
-- Vérifié dans la foulée : index recréé avec 'blast_sync_dressing' dans le
-- WHERE (pg_indexes), doublon d'insert refusé en 23505 (transaction annulée,
-- zéro résidu), RPC présente en SECURITY DEFINER. Dry_run du jour : 592
-- cibles (rangs 7/71/136/195/183), 12 internes exclus.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Le type one-shot entre dans l'index AVANT le premier envoi ───────────
-- 'blast_sync_dressing' est un type UN SEUL ENVOI PAR UTILISATEUR, À VIE.
-- L'unicité d'email_logs est portée par l'index partiel
-- email_logs_one_shot_unique, à liste FERMÉE : un type oublié ici repart en
-- doublon silencieux (bug welcome du 03/08). Recréé À L'IDENTIQUE de la prod
-- (relevé pg_indexes du 07/08) + le nouveau type. DROP+CREATE sous le même
-- nom : idempotent.
drop index if exists public.email_logs_one_shot_unique;
create unique index email_logs_one_shot_unique
  on public.email_logs (user_id, email_type)
  where email_type in (
    'welcome', 'how_it_works', 'blast_relaunch_aout', 'blast_founder',
    'founder_plan', 'voice_conversion', 'blast_sync_dressing'
  );

-- ── 2. Cible ORDONNÉE par engagement décroissant ────────────────────────────
-- Le paramètre limit de la branche d'envoi ne doit pas piocher au hasard :
-- les comptes engagés reçoivent en premier (le domaine a déjà envoyé en
-- volume — blast_relaunch_aout : 323 destinataires le 01/08 en une journée —
-- mais l'ordre reste une décision d'engagement). Rang imposé par Nico (07/08) :
--   1 = extension_last_seen_at renseigné (les plus engagés)
--   2 = actif sur 7 j   (dernier usage_logs < 7 j)
--   3 = actif sur 30 j
--   4 = dormant > 30 j avec au moins un usage
--   5 = ZÉRO usage depuis l'inscription — en dernier
-- Tri STABLE et déterministe : rang, puis dernier usage décroissant, puis
-- created_at, puis id en départage ultime — une reprise après `limit` repart
-- exactement où le lot précédent s'est arrêté (la dédup email_logs fait le
-- reste côté fonction).
-- Périmètre : lang='fr' (les 601 profils le sont tous au 07/08 — le filtre
-- fige la règle pour les inscrits futurs). Les exclusions internes
-- (estInterne : bases + alias, garde @fillsell.app) et les déjà-envoyés
-- restent appliqués CÔTÉ FONCTION, comme pour blast_relaunch — une seule
-- implémentation de la liste interne, pas de copie divergente en SQL.
-- SECURITY DEFINER + service_role only : la cible d'un blast (emails de tout
-- le parc) ne doit être lisible par aucun client.
create or replace function public.blast_sync_dressing_cibles()
returns table (
  user_id uuid,
  user_email text,
  rang int,
  dernier_usage timestamptz,
  cree_le timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.email as user_email,
    case
      when p.extension_last_seen_at is not null then 1
      when u.dernier_usage >= now() - interval '7 days' then 2
      when u.dernier_usage >= now() - interval '30 days' then 3
      when u.dernier_usage is not null then 4
      else 5
    end as rang,
    u.dernier_usage,
    p.created_at as cree_le
  from profiles p
  left join lateral (
    select max(ul.created_at) as dernier_usage
    from usage_logs ul
    where ul.user_id = p.id
  ) u on true
  where p.email is not null
    and p.lang = 'fr'
  order by rang asc,
           u.dernier_usage desc nulls last,
           p.created_at asc,
           p.id asc;
$$;

revoke all on function public.blast_sync_dressing_cibles() from public, anon, authenticated;
grant execute on function public.blast_sync_dressing_cibles() to service_role;

comment on function public.blast_sync_dressing_cibles() is
  'Cible du blast sync dressing, ordonnée par engagement décroissant '
  '(rang 1-5, arbitrage Nico 07/08) — tri stable pour reprise par lots. '
  'Exclusions internes et dédup email_logs appliquées côté email-tunnel.';
