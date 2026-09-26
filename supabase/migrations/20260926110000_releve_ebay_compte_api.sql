-- ═══════════════════════════════════════════════════════════════════════════
-- RELEVÉ eBAY : SEUL LE COMPTE RELIÉ PAR L'API EST TRAITÉ (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (preuve France 0.6.69, compte de Nico, 26/09 09:26) : l'API eBay de
-- Nico est reliée au compte « nelsonthecat » — publication et retrait passent
-- par le serveur sous ce compte. Le RELEVÉ, lui, lit le Hub vendeur du compte
-- connecté dans CHROME : « nicsvob_0 », un autre compte. Le relevé a lu ses
-- 6 annonces (titres anglais, publiées en août), les a capturées, et la
-- capture a réécrit 5 titres du stock en anglais (règle « on suit la
-- plateforme » de reporterCaptureSurArticle, 0.6.49).
-- Vérifié le 26/09 sur le parc (vendeur lu sur la fiche publique eBay) : parmi
-- les 15 comptes reliés qui ont un relevé eBay, Nico est le seul dont le Chrome
-- lit un autre compte ; Louis (1 annonce, fiche en erreur) n'est pas vérifiable.
--
-- LA RÈGLE (Nico) :
--   · compte avec l'API eBay branchée (ebay_accounts non révoqué) : le relevé
--     eBay ne traite QUE le compte de l'API (ebay_user_id) ;
--   · Chrome connecté à un autre compte : aucun import, aucun titre modifié,
--     aucun rattachement, aucune annonce marquée disparue — le relevé se
--     termine proprement, motif lisible en base ;
--   · identité du compte de Chrome non lisible avec certitude : même
--     traitement, on ne touche à rien ;
--   · comptes SANS API : strictement rien ne change.
--
-- ⛔ SANS NOUVELLE EXTENSION. Toutes les versions en circulation écrivent le
--    relevé de la même façon (upsert annonces_plateforme → capture → moteur
--    rapprocher_releve → PATCH final du run) ; la garde vit aux trois portes.
--
-- LA PREUVE D'IDENTITÉ — le Hub ne montre QUE les annonces du compte
-- connecté. Il suffit donc de connaître le vendeur d'UNE annonce lue pour
-- connaître le compte de Chrome. Le vendeur d'une annonce, c'est eBay qui le
-- dit (API Browse, seller.username, jeton applicatif) : table
-- ebay_vendeurs_annonces, remplie par ebay-api-worker (publication API =
-- vendeur connu d'office ; toute annonce lue au Hub et inconnue passe par
-- ebay_annonces_a_verifier, vérifiée par le worker au tick suivant).
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. compte_ebay_api(user) : LE compte relié (null = pas d'API, rien ne change) ;
--   2. les trois tables (vendeurs, file à vérifier, verdict par relevé) ;
--   3. trigger sur annonces_plateforme (lignes eBay écrites par un
--      UTILISATEUR, c'est-à-dire l'extension) :
--        · écriture de relevé : annonce du compte relié → verdict « même
--          compte », la ligne passe ; annonce d'un autre vendeur → verdict
--          « autre compte », la ligne n'est PAS écrite ; annonce inconnue →
--          mise en file, écrite seulement si l'identité est déjà prouvée par
--          une autre annonce de ce relevé ;
--        · capture : refusée (0 ligne, donc aucun article touché) si l'annonce
--          n'est pas prouvée au compte relié ou si le relevé eBay en cours est
--          bloqué ;
--   4. rapprocher_releve : un relevé eBay sans identité prouvée ne traite
--      rien (ni rattachement, ni import, ni disparition) et le dit dans le
--      run ; identité prouvée mais annonces inconnues laissées de côté → le
--      relevé est incomplet (aucune disparition datée) ;
--   5. releve_run_hors_liste (déjà lu par rapprocher_traiter_annonce,
--      rapprocher_importer, rapprochement_decider) : vrai aussi pour un relevé
--      eBay « autre compte » ;
--   6. la note « [hors-compte-ebay] … » survit au PATCH final de l'extension ;
--   7. amorçage : vendeurs connus des publications API, file des annonces eBay
--      vivantes des comptes reliés.
-- ⛔ Tant que la file n'est pas vidée par le worker, un relevé eBay d'un compte
--    relié ne touche à rien (« non prouvé ») : c'est voulu, c'est le côté sûr.
-- ⛔ Constat seulement sur l'existant : les lignes eBay déjà écrites (les 6 de
--    nicsvob_0 chez Nico) ne sont ni supprimées ni détachées ici.
--
-- JOUÉE À BLANC EN PROD LE 26/09 (un seul DO, annulé par exception finale ;
-- vérifié ensuite : 0 table, 0 fonction, 0 trigger, ancre absente) :
--   amorçage 114 vendeurs (publications API) · 782 annonces en file ;
--   A. Chrome sur nicsvob_0 → verdict autre_compte (vendeur lu nicsvob_0),
--      annonce étrangère neuve NON écrite, ligne existante inchangée, capture
--      0 ligne, moteur hors_compte_ebay (0 partout), note gardée après le
--      PATCH final ;
--   B. Chrome sur nelsonthecat → verdict meme_compte, inconnue AVANT la preuve
--      écartée, inconnue APRÈS écrite, capture 1 ligne, moteur normal mais
--      complet=false (0 disparition) ;
--   C. même compte, API révoquée → comportement d'avant (ligne écrite,
--      capture 1 ligne, aucun verdict, rien de bloqué).

-- ── 1. LE COMPTE RELIÉ ──────────────────────────────────────────────────────
create or replace function public.compte_ebay_api(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(trim(a.ebay_user_id), '')
    from public.ebay_accounts a
   where a.user_id = p_user and a.revoked_at is null;
$$;
revoke all on function public.compte_ebay_api(uuid) from public, anon, authenticated;

-- ── 2. LES TABLES ───────────────────────────────────────────────────────────
-- Le vendeur de chaque annonce eBay, tel qu'eBay le rend. Une annonce ne
-- change jamais de vendeur : une ligne posée n'a pas à être rafraîchie.
create table if not exists public.ebay_vendeurs_annonces (
  listing_id text primary key,
  vendeur    text not null,           -- seller.username (comparé sans la casse)
  vendeur_id text,                    -- seller.userId, immuable, quand eBay le rend
  source     text not null check (source in ('browse', 'publication_api')),
  vu_le      timestamptz not null default now()
);

-- Les annonces lues au Hub dont on ne connaît pas encore le vendeur.
create table if not exists public.ebay_annonces_a_verifier (
  listing_id         text primary key,
  user_id            uuid not null,
  demande_le         timestamptz not null default now(),
  tentatives         integer not null default 0,
  derniere_tentative timestamptz,
  dernier_motif      text
);

-- Le verdict d'identité de CHAQUE relevé eBay d'un compte relié.
create table if not exists public.releve_ebay_compte (
  run_id                uuid primary key references public.vinted_sync_runs(id) on delete cascade,
  user_id               uuid not null,
  compte_api            text not null,
  verdict               text not null default 'non_prouve'
                          check (verdict in ('meme_compte', 'autre_compte', 'non_prouve')),
  vendeur_lu            text,          -- premier vendeur ÉTRANGER lu
  propres               integer not null default 0,
  etrangeres            integer not null default 0,
  non_prouvees          integer not null default 0,
  non_prouvees_ecartees integer not null default 0,
  maj_le                timestamptz not null default now()
);

-- Règle du dépôt (CLAUDE.md) : GRANT à authenticated. RLS active SANS
-- politique : personne ne lit ni n'écrit ces tables en direct ; seules les
-- fonctions SECURITY DEFINER ci-dessous et le worker (service_role) y touchent.
alter table public.ebay_vendeurs_annonces enable row level security;
alter table public.ebay_annonces_a_verifier enable row level security;
alter table public.releve_ebay_compte enable row level security;
grant select, insert, update, delete on public.ebay_vendeurs_annonces to authenticated;
grant select, insert, update, delete on public.ebay_annonces_a_verifier to authenticated;
grant select, insert, update, delete on public.releve_ebay_compte to authenticated;

-- ── 3. LES PRÉDICATS ────────────────────────────────────────────────────────
create or replace function public.releve_ebay_vendeur(p_listing_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(v.vendeur) from public.ebay_vendeurs_annonces v where v.listing_id = p_listing_id;
$$;
revoke all on function public.releve_ebay_vendeur(text) from public, anon, authenticated;

-- Un relevé eBay d'un compte relié dont l'identité n'est PAS prouvée « même
-- compte » : il ne traite rien. Un relevé sans aucune ligne écrite (Hub vide,
-- Chrome ailleurs sans annonce) n'a pas de verdict : il est bloqué aussi —
-- un Hub vide d'un autre compte daterait sinon la disparition de tout.
create or replace function public.releve_ebay_run_bloque(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.vinted_sync_runs r
     where r.id = p_run_id and r.platform = 'ebay' and r.kind = 'annonces'
       and public.compte_ebay_api(r.user_id) is not null
       and not exists (select 1 from public.releve_ebay_compte c
                        where c.run_id = r.id and c.verdict = 'meme_compte'));
$$;
revoke all on function public.releve_ebay_run_bloque(uuid) from public, anon, authenticated;

-- Identité prouvée, mais des annonces inconnues ont été laissées de côté avant
-- la preuve : le relevé n'a pas tout écrit, il ne date aucune disparition.
create or replace function public.releve_ebay_run_incomplet(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.releve_ebay_compte c
                  where c.run_id = p_run_id and c.non_prouvees_ecartees > 0);
$$;
revoke all on function public.releve_ebay_run_incomplet(uuid) from public, anon, authenticated;

-- Le motif, dans le run, une seule fois.
create or replace function public.releve_ebay_noter_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  c public.releve_ebay_compte%rowtype;
  v_api text;
  v_note text;
begin
  select user_id into v_user from public.vinted_sync_runs where id = p_run_id;
  if v_user is null then return; end if;
  select * into c from public.releve_ebay_compte where run_id = p_run_id;
  if c.verdict = 'meme_compte' then return; end if;
  v_api := coalesce(c.compte_api, public.compte_ebay_api(v_user));
  if c.verdict = 'autre_compte' then
    v_note := format('[hors-compte-ebay] Chrome est connecté au compte eBay « %s », pas au compte relié « %s » : rien importé, rien rattaché, aucun article modifié, aucune disparition',
                     c.vendeur_lu, v_api);
  else
    v_note := format('[hors-compte-ebay] compte eBay de Chrome non prouvé (%s annonce(s) lue(s), aucune encore vérifiée au compte relié « %s ») : rien importé, rien rattaché, aucun article modifié, aucune disparition',
                     coalesce(c.non_prouvees, 0), v_api);
  end if;
  update public.vinted_sync_runs
     set erreur = case when coalesce(erreur, '') = '' then v_note else erreur || ' · ' || v_note end,
         updated_at = now()
   where id = p_run_id and position('[hors-compte-ebay]' in coalesce(erreur, '')) = 0;
end;
$$;
revoke all on function public.releve_ebay_noter_run(uuid) from public, anon, authenticated;

-- ── 4. LA PORTE DES LIGNES eBAY ─────────────────────────────────────────────
create or replace function public.releve_ebay_garde_annonce()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_api text;
  v_releve boolean;
  v_capture boolean;
  v_run record;
  v_vendeur text;
  v_verdict text;
  v_encours uuid;
begin
  -- Seules les écritures d'un UTILISATEUR sont gardées (l'extension écrit avec
  -- le jeton de la personne) ; le serveur (service_role : veille eBay,
  -- worker), pg_cron et les migrations passent.
  v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  if v_role <> 'authenticated' then return new; end if;
  v_api := public.compte_ebay_api(new.user_id);
  if v_api is null then return new; end if;              -- pas d'API eBay : rien ne change

  v_releve := new.run_id is not null
              and (tg_op = 'INSERT' or new.run_id is distinct from old.run_id or new.vu_le is distinct from old.vu_le);
  v_capture := tg_op = 'UPDATE' and new.capture is distinct from old.capture;

  -- ── LA CAPTURE : c'est elle qui réécrit l'article (titre, description,
  --    attributs). 0 ligne rendue = l'extension ne touche à aucun article.
  if v_capture and not v_releve then
    if public.releve_ebay_vendeur(new.listing_id) is distinct from lower(v_api) then
      return null;
    end if;
    select r.id into v_encours
      from public.vinted_sync_runs r
     where r.user_id = new.user_id and r.platform = 'ebay' and r.kind = 'annonces'
       and r.status = 'running' and r.started_at > now() - interval '2 hours'
     order by r.started_at desc limit 1;
    if v_encours is not null and public.releve_ebay_run_bloque(v_encours) then
      return null;
    end if;
    return new;
  end if;
  if not v_releve then return new; end if;               -- moteur, décisions, retraits : inchangés

  -- ── L'ÉCRITURE DE RELEVÉ ──────────────────────────────────────────────────
  select r.id, r.platform, r.kind into v_run from public.vinted_sync_runs r where r.id = new.run_id;
  if v_run.id is null or v_run.platform <> 'ebay' or v_run.kind <> 'annonces' then return new; end if;
  insert into public.releve_ebay_compte (run_id, user_id, compte_api)
  values (new.run_id, new.user_id, v_api)
  on conflict (run_id) do nothing;
  -- Un upsert en conflit passe ici DEUX fois (BEFORE INSERT puis BEFORE
  -- UPDATE) : on ne compte qu'au premier passage.
  v_vendeur := public.releve_ebay_vendeur(new.listing_id);

  if v_vendeur is null then
    insert into public.ebay_annonces_a_verifier (listing_id, user_id)
    values (new.listing_id, new.user_id)
    on conflict (listing_id) do nothing;
    select verdict into v_verdict from public.releve_ebay_compte where run_id = new.run_id for update;
    if v_verdict = 'meme_compte' then
      -- Le Hub ne montre que le compte connecté : une autre annonce de ce
      -- relevé a déjà prouvé que c'est le compte relié.
      if tg_op = 'INSERT' then
        update public.releve_ebay_compte set non_prouvees = non_prouvees + 1, maj_le = now() where run_id = new.run_id;
      end if;
      return new;
    end if;
    if tg_op = 'INSERT' then
      update public.releve_ebay_compte
         set non_prouvees = non_prouvees + 1, non_prouvees_ecartees = non_prouvees_ecartees + 1, maj_le = now()
       where run_id = new.run_id;
    end if;
    return null;
  elsif v_vendeur = lower(v_api) then
    update public.releve_ebay_compte
       set propres = propres + (tg_op = 'INSERT')::int,
           verdict = case when verdict = 'autre_compte' then verdict else 'meme_compte' end,
           maj_le = now()
     where run_id = new.run_id
    returning verdict into v_verdict;
    if v_verdict = 'autre_compte' then return null; end if;
    return new;
  else
    update public.releve_ebay_compte
       set etrangeres = etrangeres + (tg_op = 'INSERT')::int,
           verdict = 'autre_compte',
           vendeur_lu = coalesce(vendeur_lu, v_vendeur),
           maj_le = now()
     where run_id = new.run_id;
    perform public.releve_ebay_noter_run(new.run_id);
    return null;
  end if;
end;
$$;
revoke all on function public.releve_ebay_garde_annonce() from public, anon, authenticated;

drop trigger if exists releve_ebay_garde_annonce on public.annonces_plateforme;
create trigger releve_ebay_garde_annonce
  before insert or update on public.annonces_plateforme
  for each row
  when (new.platform = 'ebay')
  execute function public.releve_ebay_garde_annonce();

-- ── 5. LA NOTE SURVIT AU PATCH FINAL DE L'EXTENSION ─────────────────────────
-- L'extension réécrit `erreur` en entier à la fin du relevé, sans relire.
create or replace function public.releve_ebay_note_persistante()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text;
begin
  v_note := substring(coalesce(old.erreur, '') from '\[hors-compte-ebay\][^·]*');
  if v_note is not null and position('[hors-compte-ebay]' in coalesce(new.erreur, '')) = 0 then
    v_note := trim(v_note);
    new.erreur := case when coalesce(new.erreur, '') = '' then v_note else new.erreur || ' · ' || v_note end;
  end if;
  return new;
end;
$$;
revoke all on function public.releve_ebay_note_persistante() from public, anon, authenticated;

drop trigger if exists releve_ebay_note_persistante on public.vinted_sync_runs;
create trigger releve_ebay_note_persistante
  before update of erreur on public.vinted_sync_runs
  for each row
  when (new.platform = 'ebay' and new.kind = 'annonces')
  execute function public.releve_ebay_note_persistante();

-- ── 6. LES PORTES DU MOTEUR ─────────────────────────────────────────────────
-- rapprocher_traiter_annonce, rapprocher_importer et rapprochement_decider
-- lisent déjà releve_run_hors_liste(a.run_id) (migration 20260925214443) :
-- un relevé eBay « autre compte » y entre.
create or replace function public.releve_run_hors_liste(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_run_id is not null and (
    exists (select 1 from public.vinted_sync_runs r
             where r.id = p_run_id and r.kind = 'annonces' and public.releve_hors_liste(r.erreur))
    or exists (select 1 from public.releve_ebay_compte c
                where c.run_id = p_run_id and c.verdict <> 'meme_compte'));
$$;
revoke all on function public.releve_run_hors_liste(uuid) from public, anon, authenticated;

-- rapprocher_releve : PATCHÉE sur sa définition EN PROD (ancre exacte, une
-- seule occurrence exigée, sinon la migration échoue sans rien toucher).
do $patch$
declare
  v_def text;
  v_ancre text := $a$  IF v_complet AND COALESCE(array_length(v_vus, 1), 0) = 0$a$;
  v_ajout text := $b$  -- ⛔ eBAY RELIÉ PAR L'API (2026-09-26) : le relevé ne traite QUE le compte
  --    relié. Chrome connecté à un autre compte, ou identité non prouvée :
  --    ni rattachement, ni import, ni disparition — et le run le dit.
  IF v_pf = 'ebay' AND releve_ebay_run_bloque(p_run_id) THEN
    PERFORM releve_ebay_noter_run(p_run_id);
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_compte_ebay', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  -- Identité prouvée, mais des annonces encore inconnues ont été laissées de
  -- côté : ce relevé n'a pas tout écrit, il ne date aucune disparition.
  IF v_pf = 'ebay' AND releve_ebay_run_incomplet(p_run_id) THEN
    v_complet := false;
  END IF;
$b$;
  n integer;
begin
  v_def := pg_get_functiondef('public.rapprocher_releve(uuid)'::regprocedure);
  if position('releve_ebay_run_bloque' in v_def) > 0 then
    raise notice 'rapprocher_releve : garde eBay déjà posée, rien à faire';
    return;
  end if;
  n := (length(v_def) - length(replace(v_def, v_ancre, ''))) / length(v_ancre);
  if n <> 1 then
    raise exception 'rapprocher_releve : ancre trouvée % fois (1 attendue) — migration abandonnée, rien n''est modifié', n;
  end if;
  execute replace(v_def, v_ancre, v_ajout || v_ancre);
end
$patch$;

-- ── 7. AMORÇAGE ─────────────────────────────────────────────────────────────
-- Vendeur connu d'office : ce que le worker a publié avec le jeton du compte
-- relié, depuis sa liaison (une annonce d'avant la liaison peut appartenir à
-- un compte précédent : elle passe par la vérification).
insert into public.ebay_vendeurs_annonces (listing_id, vendeur, source)
select distinct on (x.lid) x.lid, a.ebay_user_id, 'publication_api'
  from (select j.user_id, substring(j.listing_url from '/itm/(\d{9,15})') lid, j.published_at
          from public.cross_post_jobs j
         where j.platform = 'ebay' and j.voie = 'api' and j.handler_build like 'ebay-api-worker%'
           and j.listing_url ~ '/itm/\d{9,15}') x
  join public.ebay_accounts a on a.user_id = x.user_id and a.revoked_at is null
 where x.published_at >= a.connected_at and nullif(trim(a.ebay_user_id), '') is not null
 order by x.lid, x.published_at desc
on conflict (listing_id) do nothing;

-- Tout le reste de ce que les relevés ont lu chez les comptes reliés : à
-- vérifier par le worker (Browse, jeton applicatif).
insert into public.ebay_annonces_a_verifier (listing_id, user_id)
select distinct on (ap.listing_id) ap.listing_id, ap.user_id
  from public.annonces_plateforme ap
  join public.ebay_accounts a on a.user_id = ap.user_id and a.revoked_at is null
 where ap.platform = 'ebay' and ap.disparu_le is null and ap.listing_id ~ '^\d{9,15}$'
   and not exists (select 1 from public.ebay_vendeurs_annonces v where v.listing_id = ap.listing_id)
 order by ap.listing_id, ap.vu_le desc
on conflict (listing_id) do nothing;
