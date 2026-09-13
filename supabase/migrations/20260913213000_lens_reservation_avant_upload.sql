-- ═══════════════════════════════════════════════════════════════════════════
-- LENS — LA RÉSERVATION PASSE AVANT LA MONTÉE DES PHOTOS (2026-09-13, soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT MESURÉ. Le lot de 20 h posait la réservation dans lens-analysis,
-- donc seulement une fois les photos montées ET la requête partie. Entre
-- l'appui sur le bouton et ce moment-là, il s'écoule le temps de lire, réduire
-- et téléverser jusqu'à 5 photos — plusieurs secondes. Test de Nico :
-- scan lancé, page rechargée avant la fin de la montée → AUCUNE ligne
-- lens_scans, AUCUN appel dans function_edge_logs, écran vide au retour.
-- Exactement l'état d'avant le lot, sur toute la fenêtre de démarrage.
--
-- CE QUE ÇA CHANGE. L'app réserve son scan AVANT de téléverser quoi que ce
-- soit, par cette RPC. La ligne existe donc dès la première fraction de
-- seconde : quoi qu'il arrive ensuite, la reprise a une poignée.
--
-- POURQUOI UNE RPC ET PAS UN INSERT DIRECT. La RLS de lens_scans interdit
-- toute écriture cliente, et c'est volontaire : une écriture libre
-- permettrait de forger un `statut = 'termine'` avec un faux résultat et de
-- se faire servir un scan sans jamais le payer. Cette RPC est la seule porte,
-- et elle n'écrit QUE 'preparation' — jamais un statut qui vaut livraison.
--
-- LE PRÉLÈVEMENT NE BOUGE PAS. Il reste attaché à une transition unique, mais
-- ce n'est plus l'INSERT : c'est le passage 'preparation' → 'en_cours', fait
-- par lens-analysis en UPDATE conditionnel. Un seul appel peut gagner cette
-- transition (l'UPDATE est atomique) ; tous les autres repartent sans débit.
-- Quatre statuts, une seule marche payante :
--   preparation → réservé par l'app, photos en cours de montée, RIEN débité
--   en_cours    → réclamé par la fonction, débité UNE fois
--   termine     → résultat complet en base
--   echec       → motif en base, relance gratuite

alter table public.lens_scans drop constraint if exists lens_scans_statut_check;
alter table public.lens_scans add constraint lens_scans_statut_check
  check (statut in ('preparation', 'en_cours', 'termine', 'echec'));

comment on column public.lens_scans.statut is
  'preparation = réservé par l''app avant la montée des photos, rien débité. en_cours = réclamé par lens-analysis, débité UNE fois (la transition preparation→en_cours EST le point de prélèvement). termine / echec = issue en base.';

-- Le rattrapage et la purge balaient les deux statuts vivants.
drop index if exists lens_scans_en_cours_idx;
create index if not exists lens_scans_vivants_idx
  on public.lens_scans (created_at) where statut in ('preparation', 'en_cours');

-- ── LA PORTE D'ÉCRITURE CLIENTE, ÉTROITE PAR CONSTRUCTION ─────────────────
-- Elle pose une réservation, ou complète la liste de photos d'une réservation
-- ENCORE en préparation. Elle ne peut rien faire d'autre :
--   · user_id vient de auth.uid(), jamais du paramètre — impossible de
--     réserver au nom d'un autre ;
--   · le `where` du ON CONFLICT interdit de toucher une ligne qui n'est plus
--     en préparation (déjà réclamée, terminée, en échec) ou qui appartient à
--     quelqu'un d'autre : le conflit ne fait alors rien, sans erreur ;
--   · le statut écrit est TOUJOURS 'preparation'.
create or replace function public.reserver_scan_lens(p_scan_id uuid, p_photos jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user     uuid := auth.uid();
  v_recentes int;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'raison', 'non_authentifie');
  end if;

  -- Garde d'abus : c'est le seul endroit où un client écrit dans cette table.
  -- 30 par heure est très au-dessus du maximum réel observé en base
  -- (16 scans/jour/utilisateur, p95 = 10) ; seule une boucle l'atteint.
  select count(*) into v_recentes
    from lens_scans
   where user_id = v_user
     and created_at > now() - interval '1 hour';
  if v_recentes >= 30 then
    return jsonb_build_object('ok', false, 'raison', 'trop_de_reservations');
  end if;

  insert into lens_scans (scan_id, user_id, statut, photos)
  values (p_scan_id, v_user, 'preparation', coalesce(p_photos, '[]'::jsonb))
  on conflict (scan_id) do update
     set photos = coalesce(p_photos, lens_scans.photos)
   where lens_scans.user_id = v_user
     and lens_scans.statut  = 'preparation';

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.reserver_scan_lens(uuid, jsonb) from public;
grant execute on function public.reserver_scan_lens(uuid, jsonb) to authenticated;

comment on function public.reserver_scan_lens(uuid, jsonb) is
  'Pose (ou complète) la réservation d''un scan Lens AVANT la montée des photos. Écrit toujours statut=preparation pour auth.uid(). Ne peut ni débiter, ni livrer, ni toucher une ligne déjà réclamée. Le prélèvement reste la transition preparation→en_cours, faite par lens-analysis.';

-- ── Rattrapage : le sweep balaie aussi les réservations mortes avant envoi ──
-- Corps de prod recréé à l'identique (boucle de grants comprise, indentation
-- de prod incluse : `when p.is_pro` à 10 espaces, ce n'est pas une coquille).
-- Seule la boucle de rattrapage change : elle couvre désormais 'preparation'
-- en plus de 'en_cours'. Une réservation abandonnée avant envoi n'a RIEN
-- débité — son remboursement est donc nul par construction (coins_debites = 0)
-- et la garde `> 0` suffit ; elle est requalifiée pour ne pas rester vivante,
-- et pour que l'audit sache qu'un scan a été lancé sans jamais partir.
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

  -- Scans vivants dont plus rien ne viendra : réservation jamais partie
  -- ('preparation') ou runtime jamais revenu ('en_cours'). Requalifiés en
  -- échec, et remboursés s'ils avaient coûté quelque chose. Boucle et non
  -- UPDATE de masse : refund_coins doit être appelé ligne à ligne.
  for s in
    select scan_id, user_id, coins_debites, statut
    from lens_scans
    where statut in ('preparation', 'en_cours')
      and created_at < now() - interval '30 minutes'
  loop
    update lens_scans
       set statut = 'echec',
           motif  = case when s.statut = 'preparation'
                      then jsonb_build_object('code', 'abandon_avant_envoi',
                             'message', 'scan réservé dont la requête n''est jamais partie — requalifié par le sweep')
                      else jsonb_build_object('code', 'abandon_runtime',
                             'message', 'scan réservé jamais terminé — requalifié par le sweep')
                    end,
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
