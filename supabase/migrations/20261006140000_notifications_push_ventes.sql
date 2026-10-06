-- ════════════════════════════════════════════════════════════════════════════
-- NOTIFICATIONS PUSH À CHAQUE VENTE (06/10/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Avant : une vente n'était signalée que par le mail « ventes_du_jour » (un
-- par jour au plus) ou à l'ouverture de l'app. Un vendeur hors de l'app
-- n'était pas prévenu : risque de double vente, d'expédition en retard.
--
-- CE QUE FAIT CETTE MIGRATION
--   1. `appareils_push` : les jetons des téléphones (iOS = jeton APNs,
--      Android = jeton FCM). Plusieurs appareils par compte. Lecture et
--      suppression de SES jetons seulement (RLS) ; l'écriture passe par
--      `push_enregistrer_appareil` (un jeton qui change de compte suit le
--      dernier compte connecté) ; l'envoi est fait par le serveur.
--   2. `push_ventes` : la file ET le journal. Une ligne par vente vue, avec
--      ses CLÉS d'identité (commande, annonce, fiche, job). Une même vente vue
--      par plusieurs chemins partage au moins une clé : UNE notification.
--   3. Les déclencheurs, posés là où la PLATEFORME dit « vendu » :
--        · ventes        INSERT d'une commande relevée (source = 'releve') ;
--        · inventaire    vinted_status passe à 'sold' (relevé Vinted) ;
--        · annonces_plateforme  statut_plateforme passe à 'vendue'
--                        (Leboncoin, eBay, Beebs, Opla) ;
--        · cross_post_jobs  une annonce publiée par FillSell passe vendue
--                        (sale_signal 'sold' posé par la veille, ou statut
--                        'sold' posé par l'API eBay).
--      Une vente DÉCLARÉE par la personne (saisie dans l'app, bouton
--      « Vendue ? ») est notée 'declaree' : jamais envoyée, elle sert à ne pas
--      notifier ensuite la même vente quand un relevé la retrouve.
--   4. Gardes « ventes anciennes » : rien n'est noté sans appareil enregistré
--      (le système est INERTE tant qu'aucun jeton n'existe) ; une vente
--      relevée ne compte que si la plateforme était déjà suivie (relevé réussi
--      fini il y a 10 min à 3 jours — jamais le premier import) et, quand sa
--      date est connue, si elle a moins de 24 h ; une rafale (8 ventes ou plus
--      notées en 5 minutes pour un compte) est un rattrapage : rien ne part.
--   5. L'envoi ne bloque JAMAIS une vente : chaque déclencheur est dans un
--      bloc d'exception (avertissement et on continue), et l'appel à la
--      fonction d'envoi passe par pg_net, qui ne part qu'APRÈS la validation
--      de la transaction (une transaction annulée n'appelle rien).
--   6. Envoi : fonction edge `push-ventes` (verify_jwt false, garde
--      x-cron-secret), appelée tout de suite (pg_net, une fois par
--      transaction) et par le cron `push-ventes-1min` en filet, qui n'appelle
--      la fonction QUE s'il reste une note à envoyer.
--
-- Charge (règle du 04/10) : les déclencheurs ont une clause WHEN (aucun appel
-- plpgsql hors transition), puis une seule lecture indexée
-- (appareils_push.user_id) qui sort tout de suite pour un compte sans
-- téléphone. Le cron lit un index partiel sur une file presque vide.
-- ════════════════════════════════════════════════════════════════════════════

-- Les déclencheurs se posent sur des tables chaudes (ventes, inventaire,
-- annonces_plateforme, cross_post_jobs) : on n'attend jamais un verrou en
-- faisant la queue devant tout le monde.
set lock_timeout = '3s';

-- ── 1. Les appareils ────────────────────────────────────────────────────────
create table if not exists public.appareils_push (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  plateforme         text not null check (plateforme in ('ios', 'android')),
  jeton              text not null check (length(jeton) between 20 and 4096),
  version_app        text,
  -- APNs : un binaire App Store / TestFlight parle à la passerelle de
  -- production ; un build Xcode de développement à la « sandbox ». Le serveur
  -- essaie la production, puis la sandbox sur BadDeviceToken, et retient.
  apns_env           text not null default 'production' check (apns_env in ('production', 'sandbox')),
  cree_le            timestamptz not null default now(),
  vu_le              timestamptz not null default now(),
  dernier_envoi_le   timestamptz,
  dernier_echec      text,
  constraint appareils_push_jeton_unique unique (jeton)
);
-- Index de la FK (sans lui, la suppression d'un compte balaie la table : cf.
-- les 500 de suppression du 06/10) et de la lecture des déclencheurs.
create index if not exists appareils_push_user on public.appareils_push (user_id);

alter table public.appareils_push enable row level security;
drop policy if exists appareils_push_lecture on public.appareils_push;
create policy appareils_push_lecture on public.appareils_push
  for select to authenticated using (user_id = auth.uid());
drop policy if exists appareils_push_suppression on public.appareils_push;
create policy appareils_push_suppression on public.appareils_push
  for delete to authenticated using (user_id = auth.uid());
-- Aucune policy INSERT/UPDATE : l'écriture passe par push_enregistrer_appareil.
grant select, insert, update, delete on public.appareils_push to authenticated;

-- ── 2. La file et le journal ────────────────────────────────────────────────
create table if not exists public.push_ventes (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- commande | vinted | annonce | job | declaree
  origine        text not null,
  plateforme     text,
  vente_id       bigint,
  inventaire_id  bigint,
  job_id         uuid,
  commande_ref   text,
  annonce_id     text,
  titre          text,
  prix           numeric,
  devise         text,
  vendu_le       timestamptz,
  cles           text[] not null default '{}',
  statut         text not null default 'a_envoyer'
                 check (statut in ('a_envoyer', 'en_envoi', 'envoyee', 'doublon', 'ignoree',
                                   'declaree', 'sans_appareil', 'echec')),
  motif          text,
  lot            bigint,
  essais         integer not null default 0,
  cree_le        timestamptz not null default now(),
  traite_le      timestamptz,
  resultat       jsonb
);
create index if not exists push_ventes_a_traiter on public.push_ventes (cree_le)
  where statut in ('a_envoyer', 'en_envoi');
create index if not exists push_ventes_user on public.push_ventes (user_id, cree_le desc);
create index if not exists push_ventes_cles on public.push_ventes using gin (cles);

alter table public.push_ventes enable row level security;
drop policy if exists push_ventes_lecture on public.push_ventes;
create policy push_ventes_lecture on public.push_ventes
  for select to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.push_ventes to authenticated;

-- ── 3. Les briques ──────────────────────────────────────────────────────────

-- La plateforme est-elle SUIVIE pour ce compte : un relevé réussi s'est fini
-- il y a 10 minutes à 3 jours. Le premier import n'est jamais « suivi » (son
-- relevé n'est pas fini), un compte qui n'a pas relevé depuis des jours non
-- plus : ce qu'on trouverait serait un rattrapage, pas une vente du moment.
create or replace function public.push_plateforme_suivie(p_user uuid, p_pf text)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.vinted_sync_runs r
     where r.user_id = p_user
       and r.platform = p_pf
       and r.status = 'done'
       and r.finished_at between now() - interval '3 days' and now() - interval '10 minutes'
  );
$$;

-- La transaction en cours est-elle une DÉCLARATION de la personne :
--   · le bouton « Vendue ? » (check-listing-status → enregistrer_vente_declaree)
--     pose fillsell.vente_declaree ;
--   · la saisie d'une vente dans l'app (enregistrer_vente_atomique sans job)
--     écrit son reçu 'manuel:…' dans cette même transaction.
create or replace function public.push_declaration_en_cours(p_user uuid, p_inv bigint)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(current_setting('fillsell.vente_declaree', true), '') = '1'
      or exists (
        select 1 from public.ventes_operations o
         where o.user_id = p_user
           and o.inventaire_id is not distinct from p_inv
           and o.cree_le = now()
           and o.cle like 'manuel:%'
      );
$$;

-- Noter une vente. Ne lève JAMAIS vers l'appelant (les déclencheurs ont en
-- plus leur propre bloc d'exception). Sort tout de suite sans appareil.
create or replace function public.push_noter(
  p_user uuid, p_origine text, p_pf text,
  p_vente bigint default null, p_inv bigint default null, p_job uuid default null,
  p_commande text default null, p_annonce text default null,
  p_titre text default null, p_prix numeric default null, p_devise text default null,
  p_vendu_le timestamptz default null, p_declaree boolean default false
) returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
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
  if not exists (select 1 from public.appareils_push a where a.user_id = p_user) then
    return;
  end if;

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
$$;

-- ── 4. Les déclencheurs ─────────────────────────────────────────────────────

-- 4a. ventes : une commande relevée (veille, relevé, API eBay) = détection ;
--     une vente saisie par la personne = déclaration (journal seulement).
create or replace function public.push_trg_ventes()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pf text;
begin
  begin
    v_pf := public.plateforme_normalisee(coalesce(nullif(btrim(new.plateforme_code), ''), new.plateforme));
    if tg_argv[0] = 'releve' then
      if new.vendu_le is not null and new.vendu_le < now() - interval '24 hours' then return new; end if;
      if new.vendu_le is not null and new.vendu_le > now() + interval '1 hour' then return new; end if;
      if v_pf is null or not public.push_plateforme_suivie(new.user_id, v_pf) then return new; end if;
      perform public.push_noter(new.user_id, 'commande', v_pf, new.id, new.inventaire_id, null,
        new.commande_ref, new.annonce_id, new.titre, new.prix_vente, new.devise, new.vendu_le, false);
    elsif tg_argv[0] = 'personne' or public.push_declaration_en_cours(new.user_id, new.inventaire_id) then
      perform public.push_noter(new.user_id, 'declaree', v_pf, new.id, new.inventaire_id, null,
        new.commande_ref, new.annonce_id, new.titre, new.prix_vente, new.devise, new.vendu_le, true);
    end if;
  exception when others then
    raise warning 'push_trg_ventes (vente %) : % — vente enregistrée quand même', new.id, sqlerrm;
  end;
  return new;
end;
$$;

do $$ begin
  -- Création seule (jamais DROP : il prend le verrou exclusif de la table).
  if not exists (select 1 from pg_trigger where tgname = 'ventes_push_releve' and tgrelid = 'public.ventes'::regclass) then
    create trigger ventes_push_releve
    after insert on public.ventes
    for each row when (new.source = 'releve')
    execute function public.push_trg_ventes('releve');
  end if;
end $$;

do $$ begin
  -- Création seule (jamais DROP : il prend le verrou exclusif de la table).
  if not exists (select 1 from pg_trigger where tgname = 'ventes_push_personne' and tgrelid = 'public.ventes'::regclass) then
    create trigger ventes_push_personne
    after insert on public.ventes
    for each row when (new.source is distinct from 'releve' and current_user = 'authenticated')
    execute function public.push_trg_ventes('personne');
  end if;
end $$;

do $$ begin
  -- Création seule (jamais DROP : il prend le verrou exclusif de la table).
  if not exists (select 1 from pg_trigger where tgname = 'ventes_push_serveur' and tgrelid = 'public.ventes'::regclass) then
    create trigger ventes_push_serveur
    after insert on public.ventes
    for each row when (new.source is distinct from 'releve' and current_user <> 'authenticated')
    execute function public.push_trg_ventes('serveur');
  end if;
end $$;

-- 4b. inventaire : le relevé Vinted voit l'annonce passer « sold ».
create or replace function public.push_trg_inventaire_vinted()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  begin
    if new.fusionne_dans is not null then return new; end if;
    if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then return new; end if;
    if not public.push_plateforme_suivie(new.user_id, 'vinted') then return new; end if;
    perform public.push_noter(new.user_id, 'vinted', 'vinted', null, new.id, null,
      null, new.vinted_item_id, new.titre, new.prix_vente, null, null, false);
  exception when others then
    raise warning 'push_trg_inventaire_vinted (article %) : % — relevé poursuivi', new.id, sqlerrm;
  end;
  return new;
end;
$$;

do $$ begin
  -- Création seule (jamais DROP : il prend le verrou exclusif de la table).
  if not exists (select 1 from pg_trigger where tgname = 'inventaire_push_vinted_vendu' and tgrelid = 'public.inventaire'::regclass) then
    create trigger inventaire_push_vinted_vendu
    after update of vinted_status on public.inventaire
    for each row when (new.vinted_status = 'sold' and old.vinted_status is distinct from 'sold')
    execute function public.push_trg_inventaire_vinted();
  end if;
end $$;

-- 4c. annonces_plateforme : Leboncoin, eBay, Beebs, Opla disent « vendue ».
create or replace function public.push_trg_annonce()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_titre text;
begin
  begin
    if not public.push_plateforme_suivie(new.user_id, new.platform) then return new; end if;
    v_titre := new.titre;
    if v_titre is null and new.inventaire_id is not null then
      select i.titre into v_titre from public.inventaire i where i.id = new.inventaire_id;
    end if;
    perform public.push_noter(new.user_id, 'annonce', new.platform, null, new.inventaire_id, null,
      null, new.listing_id, v_titre, new.prix, null, null, false);
  exception when others then
    raise warning 'push_trg_annonce (annonce %) : % — relevé poursuivi', new.id, sqlerrm;
  end;
  return new;
end;
$$;

do $$ begin
  -- Création seule (jamais DROP : il prend le verrou exclusif de la table).
  if not exists (select 1 from pg_trigger where tgname = 'annonces_plateforme_push_vendue' and tgrelid = 'public.annonces_plateforme'::regclass) then
    create trigger annonces_plateforme_push_vendue
    after update of statut_plateforme on public.annonces_plateforme
    for each row when (new.statut_plateforme = 'vendue' and old.statut_plateforme is distinct from 'vendue')
    execute function public.push_trg_annonce();
  end if;
end $$;

-- 4d. cross_post_jobs : une annonce publiée par FillSell est vue vendue
--     (sale_signal de la veille, ou statut 'sold' posé par l'API eBay). Le
--     bouton « Vendue ? » passe par enregistrer_vente_declaree : déclaration.
create or replace function public.push_trg_job()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_pf text;
  v_declaree boolean;
begin
  begin
    v_pf := public.plateforme_normalisee(new.platform);
    v_declaree := public.push_declaration_en_cours(new.user_id, new.inventaire_id);
    perform public.push_noter(new.user_id, 'job', v_pf, null, new.inventaire_id, new.id,
      null, nullif(btrim(coalesce(new.platform_listing_id, '')), ''), new.title, new.price, null, null,
      v_declaree);
  exception when others then
    raise warning 'push_trg_job (job %) : % — vente poursuivie', new.id, sqlerrm;
  end;
  return new;
end;
$$;

do $$ begin
  -- Création seule (jamais DROP : il prend le verrou exclusif de la table).
  if not exists (select 1 from pg_trigger where tgname = 'cross_post_jobs_push_vendu' and tgrelid = 'public.cross_post_jobs'::regclass) then
    create trigger cross_post_jobs_push_vendu
    after update of status, platform_fields on public.cross_post_jobs
    for each row when (
      new.action in ('publish', 'republish')
      and (
        (new.status = 'sold' and old.status is distinct from 'sold')
        or (new.platform_fields ->> 'sale_signal' = 'sold'
            and (old.platform_fields ->> 'sale_signal') is distinct from 'sold')
      )
    )
    execute function public.push_trg_job();
  end if;
end $$;

-- ── 5. Le bouton « Vendue ? » = une déclaration ─────────────────────────────
-- Même résultat, au caractère près, qu'enregistrer_vente_atomique : la seule
-- différence est le drapeau de transaction lu par les déclencheurs.
create or replace function public.enregistrer_vente_declaree(p_user uuid, p_job uuid, p_prix numeric default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform set_config('fillsell.vente_declaree', '1', true);
  return public.enregistrer_vente_atomique(p_user := p_user, p_cle := null, p_job := p_job, p_prix := p_prix);
end;
$$;
revoke all on function public.enregistrer_vente_declaree(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.enregistrer_vente_declaree(uuid, uuid, numeric) to service_role;

-- ── 6. L'app : enregistrer / oublier un appareil ────────────────────────────
create or replace function public.push_enregistrer_appareil(p_jeton text, p_plateforme text, p_version text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_jeton text := btrim(coalesce(p_jeton, ''));
begin
  if v_user is null then raise exception 'Compte non connecté' using errcode = '42501'; end if;
  if p_plateforme not in ('ios', 'android') then raise exception 'plateforme inconnue'; end if;
  if length(v_jeton) < 20 or length(v_jeton) > 4096 then raise exception 'jeton invalide'; end if;
  insert into public.appareils_push (user_id, plateforme, jeton, version_app, vu_le)
  values (v_user, p_plateforme, v_jeton, left(p_version, 60), now())
  on conflict (jeton) do update set
    user_id = excluded.user_id,           -- le téléphone suit le dernier compte connecté
    plateforme = excluded.plateforme,
    version_app = excluded.version_app,
    vu_le = now(),
    dernier_echec = null,
    apns_env = case when appareils_push.user_id = excluded.user_id then appareils_push.apns_env else 'production' end;
  -- Borne : 10 appareils par compte, les plus anciens vus partent.
  delete from public.appareils_push a
   where a.user_id = v_user
     and a.id in (select b.id from public.appareils_push b where b.user_id = v_user
                   order by b.vu_le desc offset 10);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.push_enregistrer_appareil(text, text, text) from public, anon;
grant execute on function public.push_enregistrer_appareil(text, text, text) to authenticated;

create or replace function public.push_oublier_appareil(p_jeton text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Compte non connecté' using errcode = '42501'; end if;
  delete from public.appareils_push where jeton = btrim(coalesce(p_jeton, '')) and user_id = auth.uid();
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'oublies', v_n);
end;
$$;
revoke all on function public.push_oublier_appareil(text) from public, anon;
grant execute on function public.push_oublier_appareil(text) to authenticated;

-- ── 7. Le serveur : choisir ce qui part, puis noter le résultat ─────────────
-- Rend { notes: [...], attente_s } ; chaque note part en 'en_envoi'.
create or replace function public.push_ventes_a_envoyer(p_limite integer default 50)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '10s'
set lock_timeout to '2s'
as $$
declare
  v_user     uuid;
  r          record;
  v_v        record;
  v_q        integer;
  v_cles     text[];
  v_app      jsonb;
  v_rafale   integer;
  v_out      jsonb := '[]'::jsonb;
  v_n        integer := 0;
  v_attente  numeric;
begin
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus.
  update public.push_ventes
     set statut = case when essais >= 3 then 'echec' else 'a_envoyer' end,
         motif  = case when essais >= 3 then 'envoi_interrompu' else motif end
   where statut = 'en_envoi' and traite_le < now() - interval '3 minutes';
  -- Une note qui n'est pas partie en 2 h n'apprend plus rien à personne.
  update public.push_ventes set statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   where statut = 'a_envoyer' and cree_le < now() - interval '2 hours';
  -- Le journal ne garde que 30 jours (borné : 500 lignes par passage).
  delete from public.push_ventes where id in (
    select id from public.push_ventes where cree_le < now() - interval '30 days' limit 500);

  for v_user in
    select p.user_id from public.push_ventes p
     where p.statut = 'a_envoyer' and p.cree_le < now() - interval '15 seconds'
     group by p.user_id order by min(p.cree_le) limit 20
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      into v_app from public.appareils_push a where a.user_id = v_user;
    if jsonb_array_length(v_app) = 0 then
      update public.push_ventes set statut = 'sans_appareil', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer';
      continue;
    end if;

    -- Rattrapage de masse : 8 ventes (ou plus) notées en 5 minutes.
    select count(*) into v_rafale from public.push_ventes
     where user_id = v_user and origine <> 'declaree'
       and statut not in ('declaree', 'doublon') and cree_le > now() - interval '5 minutes';
    if v_rafale >= 8 then
      update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer';
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and cree_le < now() - interval '15 seconds'
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
      -- Même vente déjà notifiée, en cours d'envoi, ou déclarée par la personne.
      if exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and o.statut in ('envoyee', 'en_envoi', 'declaree')
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && v_cles) then
        update public.push_ventes set statut = 'doublon', cles = v_cles, traite_le = now() where id = r.id;
        continue;
      end if;
      update public.push_ventes
         set statut = 'en_envoi', cles = v_cles, traite_le = now(), essais = essais + 1
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id, 'appareils', v_app);
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;
  end loop;

  select extract(epoch from (min(cree_le) + interval '16 seconds' - now()))
    into v_attente from public.push_ventes where statut = 'a_envoyer';
  return jsonb_build_object('notes', v_out, 'attente_s', greatest(coalesce(v_attente, -1), -1));
end;
$$;
revoke all on function public.push_ventes_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.push_ventes_a_envoyer(integer) to service_role;

-- p : { notes: [{id, statut: envoyee|echec|a_reessayer, resultat}],
--       invalides: [jeton], ok: [appareil_id], sandbox: [appareil_id],
--       echecs: [{id: appareil_id, motif}] }
create or replace function public.push_ventes_resultat(p jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  x jsonb;
  v_purges integer := 0;
begin
  for x in select value from jsonb_array_elements(coalesce(p -> 'notes', '[]'::jsonb)) loop
    update public.push_ventes set
      statut = case x ->> 'statut'
                 when 'envoyee' then 'envoyee'
                 when 'a_reessayer' then case when essais >= 3 then 'echec' else 'a_envoyer' end
                 else 'echec' end,
      motif = nullif(x ->> 'motif', ''),
      resultat = x -> 'resultat',
      traite_le = now()
    where id = (x ->> 'id')::bigint and statut = 'en_envoi';
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
$$;
revoke all on function public.push_ventes_resultat(jsonb) from public, anon, authenticated;
grant execute on function public.push_ventes_resultat(jsonb) to service_role;

-- Les briques internes ne s'appellent pas de l'extérieur.
revoke all on function public.push_noter(uuid, text, text, bigint, bigint, uuid, text, text, text, numeric, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.push_plateforme_suivie(uuid, text) from public, anon, authenticated;
revoke all on function public.push_declaration_en_cours(uuid, bigint) from public, anon, authenticated;

-- ── 8. Le filet : une fois par minute, SEULEMENT s'il reste une note ────────
select cron.unschedule('push-ventes-1min') where exists (select 1 from cron.job where jobname = 'push-ventes-1min');
select cron.schedule('push-ventes-1min', '* * * * *', $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
    headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
    body    := '{"trigger":"push_ventes_cron"}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE EXISTS (SELECT 1 FROM public.push_ventes WHERE statut IN ('a_envoyer', 'en_envoi'));
$cron$);
