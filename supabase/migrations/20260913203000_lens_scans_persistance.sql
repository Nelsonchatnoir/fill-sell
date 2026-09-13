-- ═══════════════════════════════════════════════════════════════════════════
-- lens_scans — le résultat d'un scan PAYANT survit à l'app (2026-09-13)
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI SE PASSAIT. Le résultat d'un scan payant n'était persisté NULLE PART :
-- il vivait dans un useState (App.jsx lensResult) et n'était recopié en
-- sessionStorage que si l'utilisateur ouvrait le stepper. Basculer d'appli
-- pendant l'analyse — 21 s de médiane, p90 à 23 s — suffisait à tout perdre :
-- la webview meurt, la requête meurt avec elle, et le scan était à refaire.
-- Refait = une unité de plus au compteur d'annonces (5/cycle en free).
-- Mesure du 13/09 : 73 re-scans du MÊME objet par le MÊME utilisateur à moins
-- de 15 min sur 823 scans / 60 j (8,9 %), 44 utilisateurs ; 16/200 depuis la
-- bascule quota du 02/09. La seule table qui gardait une sortie de Lens était
-- lens_identify_cache — le mode GRATUIT, purgé à 24 h.
--
-- CE QUE CETTE TABLE EST. Le registre des scans payants : un scan réservé
-- avant tout débit, son résultat COMPLET quand il aboutit, son motif d'échec
-- sinon. Trois usages, dans cet ordre d'importance :
--   1. REPRISE — l'app retrouve son scan au retour, terminé ou en cours ;
--   2. NON-DOUBLE-FACTURATION — la réservation (clé primaire scan_id, posée
--      par l'app AVANT l'upload) est le point unique de prélèvement : un
--      second POST sur le même scan_id entre en conflit, ne rejoue rien et ne
--      débite rien ;
--   3. AUDIT QUALITÉ — on ne savait pas ce qu'un utilisateur avait réellement
--      vu (ni description, ni prix proposé, ni fourchette) : usage_logs ne
--      porte qu'une empreinte (objet, titre, confiance). `resultat` porte la
--      réponse servie, telle quelle.
--
-- CE QU'ELLE N'EST PAS. Ni un cache, ni une idempotence par photos : la clé
-- est le scan_id de l'app, jamais un hash d'URLs. Deux scans volontaires du
-- même article restent deux scans, et se facturent comme tels.

create table if not exists public.lens_scans (
  -- Généré par l'app (crypto.randomUUID) AVANT l'upload des photos, conservé
  -- en localStorage — pas sessionStorage : il doit survivre à la mort de la
  -- webview, c'est tout l'objet du lot.
  scan_id       uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- en_cours → termine | echec. Jamais d'autre valeur : l'app lit ce champ
  -- pour décider entre « voilà ton résultat » et « ça tourne encore ».
  statut        text not null default 'en_cours'
                check (statut in ('en_cours', 'termine', 'echec')),
  mode          text,
  -- URLs lens-temp du scan. Indispensables à la reprise : les lensPhotos de
  -- l'app sont des data: URL en mémoire, mortes avec la webview — sans ces
  -- URLs, un résultat restauré s'afficherait sans ses photos et ne pourrait
  -- pas partir en annonce.
  photos        jsonb,
  -- La réponse COMPLÈTE servie à l'utilisateur (itemData + annonce le cas
  -- échéant), pas un drapeau « terminé ».
  resultat      jsonb,
  -- motifEchec() de lens-analysis : code + détail (image refusée et laquelle,
  -- api_injoignable, api_4xx, erreur). Même vocabulaire que usage_logs.motif.
  motif         jsonb,
  -- Unités réellement débitées pour CE scan. Vaut 0 tant que
  -- price_lens_overflow = 0 (modèle quota) ; écrit seulement quand il est non
  -- nul, pour que le rattrapage ci-dessous sache quoi rendre si le prix
  -- redevient positif.
  coins_debites integer not null default 0,
  created_at    timestamptz not null default now(),
  termine_le    timestamptz
);

comment on table public.lens_scans is
  'Registre des scans Lens PAYANTS : réservation (point unique de prélèvement), résultat complet servi à l''utilisateur, motif d''échec. Écrit UNIQUEMENT par lens-analysis en service_role ; l''app y LIT ses propres lignes pour reprendre un scan interrompu. Purgée par grant_monthly_coins_sweep (cron 04:15).';
comment on column public.lens_scans.scan_id is
  'UUID généré par l''app avant l''upload et gardé en localStorage. Sa clé primaire EST la garde anti-double-facturation : un second POST sur le même scan_id entre en conflit et ne débite rien.';
comment on column public.lens_scans.resultat is
  'Réponse complète servie à l''utilisateur — description, prix proposé, fourchette, comparables, annonces. Sert la reprise ET l''audit qualité (avant ce lot, on ne savait pas ce qu''un utilisateur avait vu).';

-- Reprise : l'app lit par scan_id (clé primaire, déjà indexée).
-- Ces deux index-ci servent le rattrapage/la purge et l'audit par utilisateur.
create index if not exists lens_scans_en_cours_idx
  on public.lens_scans (created_at) where statut = 'en_cours';
create index if not exists lens_scans_user_created_idx
  on public.lens_scans (user_id, created_at desc);

-- ── Accès ─────────────────────────────────────────────────────────────────
-- GRANT à authenticated : obligatoire depuis le breaking change Supabase de
-- mai 2026 (aucun privilège implicite sur une nouvelle table du schéma public).
-- Contrairement à lens_identify_cache, l'app LIT ici — c'est le chemin de
-- reprise. Elle n'écrit jamais : la réservation, le résultat et le motif sont
-- posés par lens-analysis en service_role, qui contourne la RLS. Une écriture
-- cliente pourrait forger un « termine » et se servir un résultat gratuit.
grant select, insert, update, delete on public.lens_scans to authenticated;

alter table public.lens_scans enable row level security;

drop policy if exists "lecture de ses propres scans" on public.lens_scans;
create policy "lecture de ses propres scans"
  on public.lens_scans
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "aucune ecriture cliente" on public.lens_scans;
create policy "aucune ecriture cliente"
  on public.lens_scans
  for all
  to authenticated
  using (false)
  with check (false);

-- ── Rattrapage + purge — BRANCHÉS SUR LE CRON EXISTANT, aucun job nouveau ──
-- grant_monthly_coins_sweep() tourne déjà tous les jours à 04:15 (job pg_cron
-- « coins-monthly-sweep »). On la RECRÉE avec son corps de prod actuel, au
-- caractère près, en ajoutant deux gestes avant la boucle de grants :
--
--   a) RATTRAPAGE des scans abandonnés. Un scan réservé et débité dont le
--      runtime meurt (limite de temps d'exécution, panne d'isolat) reste
--      « en_cours » pour toujours : l'utilisateur n'a ni résultat ni
--      remboursement. 30 min est une borne large — le p90 mesuré est de 23 s
--      et le plafond d'exécution d'une Edge Function est de 400 s.
--      Le remboursement passe par refund_coins sous la MÊME source que le
--      filet existant, 'lens_analysis_failed' : c'est le même cas (analyse
--      jamais livrée), il ne doit pas apparaître comme un motif à part. Il ne
--      déclenche RIEN tant que price_lens_overflow = 0 (coins_debites = 0),
--      et ne touche pas au plafond des remboursements « identification
--      contredite », qui ne compte que sa propre source.
--
--   b) PURGE à 90 jours. Fenêtre d'audit qualité, pas de rétention perpétuelle
--      d'un résultat d'analyse. ~650 scans/mois → la table reste sous 20 Mo.
create or replace function public.grant_monthly_coins_sweep()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_granted   int := 0;
  v_skipped   int := 0;
  v_awaiting  int := 0;
  v_purges    int := 0;
  v_abandons  int := 0;
  v_rendus    int := 0;
  v_scans_purges int := 0;
  r   record;
  s   record;
  res jsonb;
begin
  -- Purge du cache identify expiré (> 24 h). Best-effort : elle ne conditionne
  -- JAMAIS la fraîcheur (vérifiée à la lecture), elle évite juste la croissance
  -- sans fin de la table.
  delete from lens_identify_cache where created_at < now() - interval '24 hours';
  get diagnostics v_purges = row_count;

  -- Scans réservés dont le runtime n'est jamais revenu : requalifiés en échec
  -- et remboursés s'ils avaient coûté quelque chose. Boucle et non UPDATE de
  -- masse : refund_coins doit être appelé ligne à ligne.
  for s in
    select scan_id, user_id, coins_debites
    from lens_scans
    where statut = 'en_cours'
      and created_at < now() - interval '30 minutes'
  loop
    update lens_scans
       set statut = 'echec',
           motif  = jsonb_build_object('code', 'abandon_runtime',
                                       'message', 'scan réservé jamais terminé — requalifié par le sweep'),
           termine_le = now()
     where scan_id = s.scan_id;
    v_abandons := v_abandons + 1;
    if s.coins_debites > 0 then
      perform refund_coins(
        s.user_id, s.coins_debites,
        jsonb_build_object('source', 'lens_analysis_failed',
                           'motif', 'abandon_runtime',
                           'scan_id', s.scan_id)
      );
      v_rendus := v_rendus + s.coins_debites;
    end if;
  end loop;

  -- Fenêtre d'audit qualité : 90 jours.
  delete from lens_scans where created_at < now() - interval '90 days';
  get diagnostics v_scans_purges = row_count;

  for r in
    select p.id,
           case
             when p.is_business = true then 'business'
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
                            'lens_cache_purge', v_purges,
                            'lens_scans_abandonnes', v_abandons,
                            'lens_scans_unites_rendues', v_rendus,
                            'lens_scans_purges', v_scans_purges,
                            'ran_at', now());
end;
$function$;

-- ── APPLIQUÉE EN PROD LE 2026-09-13 ────────────────────────────────────────
-- Version distante enregistrée : 20260913170117 (nom lens_scans_persistance).
-- L'indentation de `when p.is_pro` (10 espaces, pas 13) n'est PAS une coquille :
-- c'est celle du corps qui tournait en prod. La recopier à l'identique est la
-- seule façon de pouvoir affirmer que la boucle de grants n'a pas bougé —
-- vérifié après application : md5 de la boucle 3139d598f0a7cfb1b87855512073a86a
-- et 869 caractères, avant comme après.
