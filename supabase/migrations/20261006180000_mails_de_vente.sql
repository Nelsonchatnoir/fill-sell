-- ════════════════════════════════════════════════════════════════════════════
-- UN MAIL À CHAQUE VENTE DÉTECTÉE (06/10/2026, décision de Nico)
-- ════════════════════════════════════════════════════════════════════════════
-- AVANT : une vente n'était dite par mail que dans le récapitulatif « ventes du
-- jour » (email-tunnel, cron 7), retenu par un plafond de 2 mails par 24 h TOUS
-- TYPES confondus, support compris. Cas Louis (Amiral) : 8 ventes des 04 et
-- 05/10 annoncées le 06/10 à 12:00 seulement — ses mails de support du 03 au
-- 05/10 tenaient le plafond à chaque passage horaire.
--
-- LA RÈGLE (Nico, 06/10)
--   · un mail à CHAQUE vente détectée, tout de suite, même une toutes les
--     10 minutes ; JAMAIS retenu par un plafond de mails ;
--   · seulement les vraies ventes récentes, mêmes règles que les notifications
--     push : rien pour une vente ancienne retrouvée par un relevé, rien pour
--     une vente déclarée par la personne, rien pour un rattrapage de masse ;
--   · une vente vue par plusieurs chemins = un seul mail ;
--   · le récapitulatif quotidien disparaît (email-tunnel).
--
-- CE QUE FAIT CETTE MIGRATION (partie de la définition EN PROD de chaque
-- fonction, lue par pg_get_functiondef le 06/10)
--   1. `push_noter` note la vente pour TOUS les comptes (avant : rien sans
--      téléphone enregistré — la table restait vide). La note est la vente
--      à annoncer ; le push et le mail sont ses deux canaux.
--   2. `push_ventes` : `part_le` (décidée « part », une fois, pour les deux
--      canaux) et l'état du canal mail (`mail_statut`, `mail_essais`,
--      `mail_traite_le`, `mail_motif`).
--   3. `push_ventes_a_envoyer` décide AVANT de regarder les appareils
--      (doublon, rattrapage, second temps d'une commande, déclarée) ; l'absence
--      de téléphone ne ferme que le canal push (`sans_appareil`). Le
--      dédoublonnage compte toute note décidée « part » (`part_le`) ou
--      déclarée : sans téléphone, deux chemins d'une même vente = un mail.
--      Un verrou par compte (essai, jamais d'attente) : deux appels simultanés
--      ne décident jamais deux fois la même vente.
--   4. `push_ventes_resultat` rend aussi le verdict du mail (trois essais).
--   5. Ventes anciennes : un job ne vaut une vente que si elle est RÉCENTE
--      (annonce disparue il y a moins de 24 h, ou vue en ligne il y a moins de
--      24 h, ou commande eBay arrivée par l'API) ; une plateforme n'est
--      « suivie » que si son dernier relevé réussi date de moins de 24 h (avant :
--      3 jours) — une vente retrouvée après une absence n'est pas annoncée.
--   6. `email_logs_vente_unique` : un mail par note, quoi qu'il arrive (même
--      après un arrêt entre l'envoi et le verdict) — modèle exact de
--      `email_logs_payment_failed_unique`. Type récurrent : jamais dans
--      l'index one-shot.
--   7. Cron 34 `push-ventes-1min` : appelle aussi quand un mail attend.
-- L'envoi : fonction edge `push-ventes` (push + mail, `envoyerEmail`,
-- catégorie `support`, type `vente:<id de la note>`, réservation avant envoi).
--
-- Charge (règle du 04/10) : quelques dizaines de ventes par jour ; chaque
-- déclencheur garde sa clause WHEN ; la décision lit des index (file partielle,
-- clés GIN, user_id). Aucune relecture de table entière.
-- ════════════════════════════════════════════════════════════════════════════

set lock_timeout = '3s';

-- ── 2. Colonnes du canal mail ──────────────────────────────────────────────
alter table public.push_ventes add column if not exists part_le        timestamptz;
alter table public.push_ventes add column if not exists mail_statut    text;
alter table public.push_ventes add column if not exists mail_essais    integer not null default 0;
alter table public.push_ventes add column if not exists mail_traite_le timestamptz;
alter table public.push_ventes add column if not exists mail_motif     text;
alter table public.push_ventes drop constraint if exists push_ventes_mail_statut_check;
alter table public.push_ventes add constraint push_ventes_mail_statut_check
  check (mail_statut is null or mail_statut in ('a_envoyer', 'en_envoi', 'envoye', 'deja_envoye', 'sans_adresse', 'echec'));
create index if not exists push_ventes_mail_a_traiter on public.push_ventes (mail_traite_le)
  where mail_statut in ('a_envoyer', 'en_envoi');
create index if not exists push_ventes_parties on public.push_ventes (user_id, part_le)
  where part_le is not null;

-- ── 6. Un mail par note ────────────────────────────────────────────────────
create unique index if not exists email_logs_vente_unique
  on public.email_logs (user_id, email_type)
  where email_type like 'vente:%';

-- ── 5a. Plateforme suivie = dernier relevé réussi de moins de 24 h ─────────
create or replace function public.push_plateforme_suivie(p_user uuid, p_pf text)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  -- (06/10) 24 h, plus 3 jours : ce qu'un relevé trouve après une absence plus
  -- longue est un rattrapage, pas une vente du moment.
  select exists (
    select 1 from public.vinted_sync_runs r
     where r.user_id = p_user
       and r.platform = p_pf
       and r.status = 'done'
       and r.finished_at between now() - interval '24 hours' and now() - interval '10 minutes'
  );
$$;

-- ── 1. La note, pour tous les comptes ──────────────────────────────────────
create or replace function public.push_noter(p_user uuid, p_origine text, p_pf text, p_vente bigint DEFAULT NULL::bigint, p_inv bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_commande text DEFAULT NULL::text, p_annonce text DEFAULT NULL::text, p_titre text DEFAULT NULL::text, p_prix numeric DEFAULT NULL::numeric, p_devise text DEFAULT NULL::text, p_vendu_le timestamp with time zone DEFAULT NULL::timestamp with time zone, p_declaree boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cles text[] := '{}';
  v_q    integer;
  v_pf   text := nullif(btrim(coalesce(p_pf, '')), '');
begin
  -- Point d'essai : la preuve « un échec d'envoi ne bloque pas la vente ».
  if coalesce(current_setting('fillsell.push_essai_panne', true), '') = '1' then
    raise exception 'panne simulée (essai)';
  end if;
  if p_user is null then return; end if;
  -- (06/10) Plus de sortie « sans téléphone » : la note porte aussi le mail.

  if p_commande is not null and v_pf is not null then
    v_cles := v_cles || ('commande:' || v_pf || ':' || p_commande);
  end if;
  if p_annonce is not null and v_pf is not null then
    v_cles := v_cles || ('annonce:' || v_pf || ':' || p_annonce);
  end if;
  if p_job is not null then
    v_cles := v_cles || ('job:' || p_job::text);
  end if;
  -- La fiche n'identifie la vente que pour un article à pièce unique : deux
  -- ventes d'une fiche en plusieurs exemplaires sont deux ventes.
  if p_inv is not null then
    select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = p_inv;
    if coalesce(v_q, 1) <= 1 or p_declaree then
      v_cles := v_cles || ('fiche:' || p_inv::text);
    end if;
  end if;

  insert into public.push_ventes (
    user_id, origine, plateforme, vente_id, inventaire_id, job_id, commande_ref, annonce_id,
    titre, prix, devise, vendu_le, cles, statut, lot
  ) values (
    p_user, case when p_declaree then 'declaree' else p_origine end, v_pf, p_vente, p_inv, p_job,
    p_commande, p_annonce, left(p_titre, 200), p_prix, p_devise, p_vendu_le, v_cles,
    case when p_declaree then 'declaree' else 'a_envoyer' end,
    pg_current_xact_id()::text::bigint
  );

  -- Un seul appel par transaction ; pg_net ne part qu'après la validation.
  if not p_declaree and coalesce(current_setting('fillsell.push_relance', true), '') <> '1' then
    perform set_config('fillsell.push_relance', '1', true);
    perform net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
      headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
      body    := '{"trigger":"push_noter"}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
end;
$function$;

-- ── 5b. Un job ne vaut une vente annoncée que si elle est RÉCENTE ─────────
create or replace function public.push_trg_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pf text;
  v_declaree boolean;
  v_dispa timestamptz;
begin
  begin
    v_pf := public.plateforme_normalisee(new.platform);
    v_declaree := public.push_declaration_en_cours(new.user_id, new.inventaire_id);
    if not v_declaree then
      -- (06/10) Rien pour une vente ANCIENNE. La date de la disparition de
      -- l'annonce (veille) date la vente ; à défaut, la dernière lecture de
      -- l'annonce en ligne ; une commande eBay arrivée par l'API est du moment.
      v_dispa := least(public._ts_ou_null(new.platform_fields ->> 'unavailable_since'),
                       public._ts_ou_null(new.platform_fields ->> 'unavailable_pending_since'));
      if v_dispa is not null then
        if v_dispa < now() - interval '24 hours' then return new; end if;
      elsif not (coalesce(new.voie, '') = 'api' and new.status = 'sold') then
        if old.last_checked_at is null or old.last_checked_at < now() - interval '24 hours' then
          return new;
        end if;
      end if;
    end if;
    perform public.push_noter(new.user_id, 'job', v_pf, null, new.inventaire_id, new.id,
      null, nullif(btrim(coalesce(new.platform_listing_id, '')), ''), new.title, new.price, null, null,
      v_declaree);
  exception when others then
    raise warning 'push_trg_job (job %) : % — vente poursuivie', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- ── 3. La décision, puis les deux canaux ───────────────────────────────────
create or replace function public.push_ventes_a_envoyer(p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_user     uuid;
  r          record;
  v_v        record;
  v_q        integer;
  v_cles     text[];
  v_app      jsonb;
  v_prof     record;
  v_rafale   integer;
  v_out      jsonb := '[]'::jsonb;
  v_n        integer := 0;
  v_attente  numeric;
begin
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus — par canal.
  -- Une note déjà décidée (part_le) ne repasse jamais par la décision : elle
  -- repart par la boucle des relances, plus bas, canal par canal.
  update public.push_ventes
     set statut = case when essais >= 3 then 'echec' else 'a_envoyer' end,
         motif  = case when essais >= 3 then 'envoi_interrompu' else motif end
   where statut = 'en_envoi' and traite_le < now() - interval '3 minutes';
  update public.push_ventes
     set mail_statut = case when mail_essais >= 3 then 'echec' else 'a_envoyer' end,
         mail_motif  = case when mail_essais >= 3 then 'envoi_interrompu' else mail_motif end
   where mail_statut = 'en_envoi' and mail_traite_le < now() - interval '3 minutes';
  -- Une note jamais décidée en 2 h n'apprend plus rien à personne.
  update public.push_ventes set statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and cree_le < now() - interval '2 hours';
  -- Le journal ne garde que 30 jours (borné : 500 lignes par passage).
  delete from public.push_ventes where id in (
    select id from public.push_ventes where cree_le < now() - interval '30 days' limit 500);

  for v_user in
    select x.user_id from (
      select p.user_id, min(p.cree_le) as d from public.push_ventes p
       where p.statut = 'a_envoyer' and p.part_le is null and p.cree_le < now() - interval '15 seconds'
       group by p.user_id
      union all
      select p.user_id, min(coalesce(p.mail_traite_le, p.traite_le, p.cree_le)) from public.push_ventes p
       where p.part_le is not null and (p.statut = 'a_envoyer' or p.mail_statut = 'a_envoyer')
       group by p.user_id
    ) x group by x.user_id order by min(x.d) limit 20
  loop
    -- Un seul appel décide pour un compte ; l'autre passe (il reviendra).
    if not pg_try_advisory_xact_lock(hashtextextended('push_ventes:' || v_user::text, 0)) then
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      into v_app from public.appareils_push a where a.user_id = v_user;
    select p.email, coalesce(p.lang, 'fr') as lang into v_prof from public.profiles p where p.id = v_user;

    -- Relances d'une vente déjà décidée « part » : chaque canal en attente
    -- repart seul ; la décision n'est jamais refaite.
    for r in
      select * from public.push_ventes
       where user_id = v_user and part_le is not null
         and (statut = 'a_envoyer' or mail_statut = 'a_envoyer')
       order by id
       for update skip locked
    loop
      update public.push_ventes set
        statut = case when statut = 'a_envoyer'
                      then case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end
                      else statut end,
        essais = essais + case when statut = 'a_envoyer' and jsonb_array_length(v_app) > 0 then 1 else 0 end,
        traite_le = case when statut = 'a_envoyer' then now() else traite_le end,
        mail_statut = case when mail_statut = 'a_envoyer' then 'en_envoi' else mail_statut end,
        mail_essais = mail_essais + case when mail_statut = 'a_envoyer' then 1 else 0 end,
        mail_traite_le = case when mail_statut = 'a_envoyer' then now() else mail_traite_le end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id,
        'appareils', case when r.statut = 'a_envoyer' then v_app else '[]'::jsonb end,
        'push', r.statut = 'a_envoyer' and jsonb_array_length(v_app) > 0,
        'mail', r.mail_statut = 'a_envoyer', 'email', v_prof.email, 'lang', v_prof.lang);
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;

    -- Rattrapage de masse : 8 VENTES DISTINCTES (ou plus) en 5 minutes. Une
    -- même vente vue par plusieurs chemins (signal de la veille, relevé,
    -- commande) partage au moins une clé : elle ne compte qu'UNE fois.
    select count(*) into v_rafale from public.push_ventes p
     where p.user_id = v_user and p.origine not in ('declaree', 'essai')
       and p.statut not in ('declaree', 'doublon') and p.cree_le > now() - interval '5 minutes'
       and not exists (
         select 1 from public.push_ventes o
          where o.user_id = v_user and o.id < p.id
            and o.origine not in ('declaree', 'essai') and o.statut not in ('declaree', 'doublon')
            and o.cree_le > now() - interval '5 minutes'
            and o.cles && p.cles);
    if v_rafale >= 8 then
      update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer' and part_le is null;
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and part_le is null
         and cree_le < now() - interval '15 seconds'
       order by id
       for update skip locked
    loop
      v_cles := r.cles;
      -- Le relevé Vinted pose la commande d'abord, l'annonce ensuite : on relit.
      if r.vente_id is not null then
        select v.annonce_id, v.inventaire_id into v_v from public.ventes v where v.id = r.vente_id;
        if found then
          if v_v.annonce_id is not null and r.plateforme is not null then
            v_cles := v_cles || ('annonce:' || r.plateforme || ':' || v_v.annonce_id);
          end if;
          if v_v.inventaire_id is not null then
            select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = v_v.inventaire_id;
            if coalesce(v_q, 1) <= 1 then v_cles := v_cles || ('fiche:' || v_v.inventaire_id::text); end if;
          end if;
        end if;
      end if;
      -- Une commande sans annonce ni fiche attend son second temps (3 min au plus).
      if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%')
         and r.cree_le > now() - interval '3 minutes' then
        continue;
      end if;
      v_cles := array(select distinct k from unnest(v_cles) k);
      -- Même vente déjà annoncée (push ou mail), ou déclarée par la personne.
      if exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && v_cles) then
        update public.push_ventes set statut = 'doublon', cles = v_cles, traite_le = now() where id = r.id;
        continue;
      end if;
      -- Décidée : elle part. Le push seulement s'il y a un téléphone ; le mail toujours.
      update public.push_ventes
         set part_le = now(), cles = v_cles, traite_le = now(),
             statut = case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end,
             essais = essais + case when jsonb_array_length(v_app) > 0 then 1 else 0 end,
             mail_statut = case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 'sans_adresse' else 'en_envoi' end,
             mail_traite_le = now(),
             mail_essais = mail_essais + case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 0 else 1 end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id, 'appareils', v_app, 'push', jsonb_array_length(v_app) > 0,
        'mail', nullif(btrim(coalesce(v_prof.email, '')), '') is not null,
        'email', v_prof.email, 'lang', v_prof.lang);
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;
  end loop;

  select extract(epoch from (min(cree_le) + interval '16 seconds' - now()))
    into v_attente from public.push_ventes where statut = 'a_envoyer' and part_le is null;
  return jsonb_build_object('notes', v_out, 'attente_s', greatest(coalesce(v_attente, -1), -1));
end;
$function$;

-- ── 4. Les verdicts des deux canaux ────────────────────────────────────────
create or replace function public.push_ventes_resultat(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  x jsonb;
  v_purges integer := 0;
begin
  for x in select value from jsonb_array_elements(coalesce(p -> 'notes', '[]'::jsonb)) loop
    -- Canal push (absent quand seul le mail repartait). Un push à réessayer
    -- d'une vente décidée repasse « a_envoyer » : la boucle des relances le
    -- reprend seul, sans refaire la décision.
    if nullif(x ->> 'statut', '') is not null then
      update public.push_ventes set
        statut = case x ->> 'statut'
                   when 'envoyee' then 'envoyee'
                   when 'a_reessayer' then case when essais >= 3 then 'echec' else 'a_envoyer' end
                   else 'echec' end,
        motif = nullif(x ->> 'motif', ''),
        resultat = x -> 'resultat',
        traite_le = now()
      where id = (x ->> 'id')::bigint and statut = 'en_envoi';
    end if;
    -- Canal mail.
    if x ? 'mail' then
      update public.push_ventes set
        mail_statut = case x -> 'mail' ->> 'statut'
                        when 'envoye' then 'envoye'
                        when 'deja_envoye' then 'deja_envoye'
                        when 'sans_adresse' then 'sans_adresse'
                        when 'a_reessayer' then case when mail_essais >= 3 then 'echec' else 'a_envoyer' end
                        else 'echec' end,
        mail_motif = nullif(x -> 'mail' ->> 'motif', ''),
        mail_traite_le = now()
      where id = (x ->> 'id')::bigint and mail_statut = 'en_envoi';
    end if;
  end loop;
  -- Apple ou Google ont refusé le jeton : l'appareil est oublié.
  delete from public.appareils_push
   where jeton in (select jsonb_array_elements_text(coalesce(p -> 'invalides', '[]'::jsonb)));
  get diagnostics v_purges = row_count;
  update public.appareils_push set dernier_envoi_le = now(), dernier_echec = null
   where id in (select (jsonb_array_elements_text(coalesce(p -> 'ok', '[]'::jsonb)))::uuid);
  update public.appareils_push set apns_env = 'sandbox'
   where id in (select (jsonb_array_elements_text(coalesce(p -> 'sandbox', '[]'::jsonb)))::uuid);
  update public.appareils_push a set dernier_echec = left(e ->> 'motif', 200)
    from jsonb_array_elements(coalesce(p -> 'echecs', '[]'::jsonb)) e
   where a.id = (e ->> 'id')::uuid;
  return jsonb_build_object('ok', true, 'appareils_oublies', v_purges);
end;
$function$;

revoke all on function public.push_ventes_a_envoyer(integer) from public, anon, authenticated;
revoke all on function public.push_ventes_resultat(jsonb) from public, anon, authenticated;
revoke all on function public.push_noter(uuid, text, text, bigint, bigint, uuid, text, text, text, numeric, text, timestamptz, boolean) from public, anon, authenticated;

-- ── 7. Le cron appelle aussi quand un mail attend ──────────────────────────
select cron.alter_job(
  (select jobid from cron.job where jobname = 'push-ventes-1min'),
  command := $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
    headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
    body    := '{"trigger":"push_ventes_cron"}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE EXISTS (SELECT 1 FROM public.push_ventes WHERE statut IN ('a_envoyer', 'en_envoi') OR mail_statut IN ('a_envoyer', 'en_envoi'));
$cron$
);
