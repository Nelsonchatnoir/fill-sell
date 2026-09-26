-- ═══════════════════════════════════════════════════════════════════════════
-- UN RETRAIT NE VISE JAMAIS UNE ANNONCE DÉJÀ REMPLACÉE (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIQUÉE le 26/09 (GO Nico) — version enregistrée en base 20260926091151.
-- Jouée à blanc avant (un seul DO, annulé par exception finale), sur les
-- données réelles de Nico : cas réel rejoué → redirigé vers 3276800774 ;
-- retrait correct (Robe, LBC vivante) → intact ; deux vivantes → needs_user ;
-- relance depuis l'app d'un retrait en attente → reste en attente ; lien pas
-- encore connu → needs_user, puis lien posé → repart redirigé ; republication
-- à l'étape 'deleted' → needs_user, puis aboutie → repart redirigé ; Vinted
-- (EAT 9880722543 → 10136577761) → redirigé ; retrait Vinted correct → intact ;
-- Opla (republication en place) → intact.
-- Vérifié après application : 2 triggers actifs ; retrait_cible_vivante rend
-- « redirigee » pour l'ancienne annonce Vinted d'EAT, « intacte » pour la
-- vivante et pour l'ancienne LBC du T-shirt (plus rien de vivant à protéger).
-- CONSTAT (preuve France 0.6.69, compte de Nico, 26/09 10:38) : T-shirt blanc
-- republié sur Leboncoin (3276760708 → 3276800774, job aa22fdd4, 10:23). Le
-- retrait demandé depuis l'app à 10:38 (e5302806) portait l'ANCIEN lien :
-- l'app lisait un état des jobs d'avant la republication (son relevé des jobs
-- toutes les 20 s ne tourne que si l'onglet est visible). L'extension a fait
-- exactement ce que le job disait — « annonce déjà hors ligne », job clos
-- 'deleted' — et l'annonce vivante 3276800774 est restée EN LIGNE.
-- Risque : double vente. Mesuré sur le parc depuis le 18/09 : 1 seul cas,
-- celui-ci (réparé à la main le 26/09 11:01 par un second retrait, 4905d4de).
--
-- LA RÈGLE (Nico), pour les quatre plateformes qui republient (Vinted,
-- Leboncoin, Beebs, Opla) :
--   · un retrait qui vise une annonce déjà remplacée par une republication est
--     REDIRIGÉ vers l'annonce vivante du même article sur la même plateforme ;
--   · au moindre doute (plusieurs annonces vivantes, lien de la nouvelle
--     annonce pas encore connu, republication en cours) : le retrait n'est PAS
--     exécuté à l'aveugle — il passe en needs_user avec un motif lisible, et
--     repart tout seul dès que la situation est claire ;
--   · jamais de retrait par le titre ;
--   · un retrait correct aujourd'hui ne voit RIEN changer.
--
-- CE QUI EST « REMPLACÉE » — lu dans la base, jamais deviné :
--   la cible du retrait n'est portée par AUCUN job publié de la personne, ET
--   une republication de CET article sur CETTE plateforme l'a eue pour
--   ancienne annonce (old_platform_listing_id / old_listing_url /
--   republish_snapshot.listing_url ; Vinted : vinted_item_id[_avant]) et en a
--   créé une autre (étape 'recreated' ou nouvel identifiant) — ou est en train
--   de le faire (étape 'deleted' : l'ancienne n'existe déjà plus).
--   Opla republie EN PLACE (même identifiant) : une annonce Opla n'est jamais
--   « remplacée », rien ne change pour elle.
--
-- ⛔ SERVEUR SEUL, aucune nouvelle extension : l'extension retire ce que dit
--    `listing_url` du job ; on corrige `listing_url` avant qu'elle ne le lise.
-- ⛔ Trois portes : à la création du retrait, à toute remise en 'pending'
--    (relance depuis l'app, reprise de l'extension), et quand une
--    republication de l'article aboutit ou reçoit son lien (le retrait en
--    attente repart ; un retrait encore en file sur l'ancienne annonce est
--    redirigé).

-- ── 1. L'IDENTIFIANT D'ANNONCE D'UN LIEN, VINTED COMPRIS ────────────────────
create or replace function public.annonce_id_job(p_platform text, p_url text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(coalesce(p_platform, ''))
    when 'vinted' then substring(coalesce(p_url, '') from '/items/(\d+)')
    else public.annonce_id_depuis_url(p_platform, p_url)
  end;
$$;

-- ── 2. LE VERDICT ───────────────────────────────────────────────────────────
-- Rend { verdict: 'intacte' | 'redirigee' | 'attente', vers, raison, motif,
--        republication, cible }.
create or replace function public.retrait_cible_vivante(
  p_user uuid, p_inv bigint, p_platform text, p_url text, p_pid text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_pf       text := lower(coalesce(p_platform, ''));
  v_nom      text;
  v_cible    text;
  v_rempl    record;
  v_encours  record;
  v_ids      text[];
  v_vers     text;
  v_sans_lien integer;
  intacte    constant jsonb := jsonb_build_object('verdict', 'intacte');
begin
  if v_pf not in ('vinted', 'leboncoin', 'beebs', 'opla') or p_inv is null or p_user is null then
    return intacte;
  end if;
  v_nom := case v_pf when 'vinted' then 'Vinted' when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' else 'Opla' end;
  v_cible := coalesce(public.annonce_id_job(v_pf, p_url), nullif(btrim(p_pid), ''));
  -- Un identifiant de moins de 4 caractères ne désigne rien (règle de listing_designe).
  if v_cible is null or length(v_cible) < 4 then return intacte; end if;

  -- a) La cible est VIVANTE (un job publié la porte) : rien ne change.
  if exists (
    select 1 from public.cross_post_jobs j
     where j.user_id = p_user and j.platform = v_pf and j.status = 'published'
       and coalesce(j.action, 'publish') in ('publish', 'republish')
       and (public.annonce_id_job(v_pf, j.listing_url) = v_cible
            or nullif(btrim(j.platform_listing_id), '') = v_cible)) then
    return intacte;
  end if;

  -- b) Une republication de CET article l'a-t-elle remplacée ?
  select r.id, r.status, r.platform_fields ->> 'republish_step' as etape
    into v_rempl
    from public.cross_post_jobs r
   where r.user_id = p_user and r.inventaire_id = p_inv and r.platform = v_pf and r.action = 'republish'
     and v_cible in (
           nullif(btrim(r.platform_fields ->> 'old_platform_listing_id'), ''),
           public.annonce_id_job(v_pf, r.platform_fields ->> 'old_listing_url'),
           public.annonce_id_job(v_pf, r.platform_fields -> 'republish_snapshot' ->> 'listing_url'),
           case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id_avant'), '') end,
           case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id'), '') end)
     and (r.platform_fields ->> 'republish_step' = 'recreated'
          or coalesce(case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'new_vinted_item_id'), '') end,
                      nullif(btrim(r.platform_listing_id), ''),
                      public.annonce_id_job(v_pf, r.listing_url)) is distinct from v_cible)
   order by r.created_at desc
   limit 1;

  if v_rempl.id is null then
    -- b') …ou est-elle en train de le faire ? Étape 'deleted' : l'ancienne
    --     annonce n'existe déjà plus, la nouvelle n'existe pas encore.
    select r.id into v_encours
      from public.cross_post_jobs r
     where r.user_id = p_user and r.inventaire_id = p_inv and r.platform = v_pf and r.action = 'republish'
       and r.status in ('pending', 'processing', 'needs_user')
       and r.platform_fields ->> 'republish_step' = 'deleted'
       and v_cible in (
             nullif(btrim(r.platform_fields ->> 'old_platform_listing_id'), ''),
             public.annonce_id_job(v_pf, r.platform_fields ->> 'old_listing_url'),
             public.annonce_id_job(v_pf, r.platform_fields -> 'republish_snapshot' ->> 'listing_url'),
             public.annonce_id_job(v_pf, r.listing_url),
             case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id_avant'), '') end,
             case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id'), '') end)
     order by r.created_at desc
     limit 1;
    if v_encours.id is null then
      return intacte;                     -- pas une annonce remplacée : comportement d'avant
    end if;
    return jsonb_build_object('verdict', 'attente', 'raison', 'republication_en_cours', 'cible', v_cible,
      'republication', v_encours.id,
      'motif', format('Retrait en attente : cette annonce %s est en cours de republication (l''ancienne est déjà retirée, la nouvelle pas encore en ligne). Le retrait visera la nouvelle annonce dès qu''elle existera — rien n''est retiré à l''aveugle.', v_nom));
  end if;

  -- c) L'annonce vivante de l'article sur la plateforme : UNE seule, avec lien.
  select coalesce(array_agg(distinct x.id_annonce) filter (where x.id_annonce is not null), '{}'),
         count(*) filter (where x.id_annonce is null)
    into v_ids, v_sans_lien
    from (select coalesce(public.annonce_id_job(v_pf, j.listing_url), nullif(btrim(j.platform_listing_id), '')) as id_annonce
            from public.cross_post_jobs j
           where j.user_id = p_user and j.inventaire_id = p_inv and j.platform = v_pf and j.status = 'published'
             and coalesce(j.action, 'publish') in ('publish', 'republish')) x
   where x.id_annonce is distinct from v_cible;

  if coalesce(array_length(v_ids, 1), 0) = 0 and v_sans_lien = 0 then
    -- Rien de vivant pour cet article ici : l'ancienne est déjà hors ligne,
    -- la retirer ne peut rien abîmer. Comportement d'avant.
    return intacte;
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 1 and v_sans_lien = 0 then
    select j.listing_url into v_vers
      from public.cross_post_jobs j
     where j.user_id = p_user and j.inventaire_id = p_inv and j.platform = v_pf and j.status = 'published'
       and coalesce(j.action, 'publish') in ('publish', 'republish')
       and coalesce(public.annonce_id_job(v_pf, j.listing_url), nullif(btrim(j.platform_listing_id), '')) = v_ids[1]
       and nullif(btrim(j.listing_url), '') is not null
     order by coalesce(j.published_at, j.created_at) desc
     limit 1;
    if v_vers is not null then
      return jsonb_build_object('verdict', 'redirigee', 'cible', v_cible, 'vers', v_vers,
                                'vers_id', v_ids[1], 'republication', v_rempl.id);
    end if;
  end if;
  return jsonb_build_object('verdict', 'attente', 'cible', v_cible, 'republication', v_rempl.id,
    'raison', case when coalesce(array_length(v_ids, 1), 0) = 0 then 'lien_inconnu' else 'plusieurs_vivantes' end,
    'motif', case when coalesce(array_length(v_ids, 1), 0) = 0
      then format('Retrait en attente : cette annonce %s a été remplacée par une republication dont le lien n''est pas encore connu. Le retrait visera la nouvelle annonce dès que son lien sera repéré — rien n''est retiré à l''aveugle.', v_nom)
      else format('Retrait en attente : cette annonce %s a été remplacée par une republication, et plusieurs annonces de cet article sont en ligne sur %s. Rien n''est retiré à l''aveugle : retire la bonne depuis la fiche de l''article.', v_nom, v_nom) end);
end;
$$;
revoke all on function public.retrait_cible_vivante(uuid, bigint, text, text, text) from public, anon, authenticated;

-- ── 3. PORTE 1 ET 2 : CRÉATION DU RETRAIT, ET TOUTE REMISE EN FILE ──────────
create or replace function public.retrait_redirige_annonce_remplacee()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  v_pf jsonb;
  v_cible_url text;
begin
  if new.action is distinct from 'delete' or new.status is distinct from 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;
  begin
    v_pf := coalesce(new.platform_fields, '{}'::jsonb);
    -- Un retrait déjà mis en attente est rejugé sur sa cible D'ORIGINE.
    v_cible_url := coalesce(v_pf -> 'retrait_en_attente' ->> 'lien', new.listing_url);
    v := public.retrait_cible_vivante(new.user_id, new.inventaire_id, new.platform, v_cible_url, new.platform_listing_id);
    if v ->> 'verdict' = 'redirigee' then
      new.platform_fields := (v_pf - 'retrait_en_attente') || jsonb_build_object('retrait_redirige', jsonb_build_object(
        'le', now(), 'de', v_cible_url, 'vers', v ->> 'vers', 'republication', v ->> 'republication',
        'pose_par', 'retrait_redirige_annonce_remplacee (annonce visée déjà remplacée par une republication)'));
      new.listing_url := v ->> 'vers';
      if nullif(btrim(new.platform_listing_id), '') is not null then
        new.platform_listing_id := v ->> 'vers_id';
      end if;
      if new.error is not null and v_pf ? 'retrait_en_attente' then new.error := null; end if;
    elsif v ->> 'verdict' = 'attente' then
      new.status := 'needs_user';
      new.error := v ->> 'motif';
      new.platform_fields := v_pf || jsonb_build_object('retrait_en_attente', jsonb_build_object(
        'le', coalesce(v_pf -> 'retrait_en_attente' ->> 'le', now()::text), 'lien', v_cible_url,
        'raison', v ->> 'raison', 'republication', v ->> 'republication',
        'pose_par', 'retrait_redirige_annonce_remplacee (jamais de retrait à l''aveugle)'));
    end if;
  exception when others then
    -- Jamais un point de panne : le retrait part comme avant, la cause en WARNING.
    raise warning 'retrait_redirige_annonce_remplacee (job %) : % — retrait inchangé', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.retrait_redirige_annonce_remplacee() from public, anon, authenticated;

drop trigger if exists cross_post_jobs_retrait_annonce_remplacee on public.cross_post_jobs;
create trigger cross_post_jobs_retrait_annonce_remplacee
  before insert or update of status on public.cross_post_jobs
  for each row
  when (new.action = 'delete' and new.status = 'pending'
        and new.platform = any (array['vinted', 'leboncoin', 'beebs', 'opla']))
  execute function public.retrait_redirige_annonce_remplacee();

-- ── 4. PORTE 3 : UNE REPUBLICATION ABOUTIT OU REÇOIT SON LIEN ────────────────
-- Les retraits de l'article sur la plateforme qui attendent (needs_user posé
-- par la porte 1) ou qui sont encore en file sur l'ancienne annonce sont
-- rejugés : repassés en 'pending', la porte 1 fait le reste.
create or replace function public.retrait_rejuge_apres_republication()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d record;
  v jsonb;
  v_url text;
begin
  begin
    for d in
      select j.id, j.status, j.listing_url, j.platform_listing_id, j.platform_fields
        from public.cross_post_jobs j
       where j.user_id = new.user_id and j.inventaire_id = new.inventaire_id and j.platform = new.platform
         and j.action = 'delete'
         and ((j.status = 'needs_user' and j.platform_fields ? 'retrait_en_attente')
              or j.status = 'pending')
    loop
      v_url := coalesce(d.platform_fields -> 'retrait_en_attente' ->> 'lien', d.listing_url);
      v := public.retrait_cible_vivante(new.user_id, new.inventaire_id, new.platform, v_url, d.platform_listing_id);
      if d.status = 'needs_user' then
        if v ->> 'verdict' in ('redirigee', 'intacte') then
          -- needs_user → pending : la porte 1 redirige (ou laisse partir si
          -- plus rien de vivant n'est en jeu) au passage.
          update public.cross_post_jobs set status = 'pending', error = null
           where id = d.id and status = 'needs_user';
        end if;
      elsif v ->> 'verdict' in ('redirigee', 'attente') then
        -- En file sur l'ancienne annonce : on le rejuge en le faisant passer
        -- par la porte 1 (needs_user éphémère, puis pending).
        update public.cross_post_jobs
           set status = 'needs_user',
               platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('retrait_en_attente',
                 jsonb_build_object('le', now()::text, 'lien', v_url, 'raison', 'rejuge_apres_republication',
                                    'republication', new.id, 'pose_par', 'retrait_rejuge_apres_republication'))
         where id = d.id and status = 'pending';
        update public.cross_post_jobs set status = 'pending'
         where id = d.id and status = 'needs_user';
      end if;
    end loop;
  exception when others then
    raise warning 'retrait_rejuge_apres_republication (job %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.retrait_rejuge_apres_republication() from public, anon, authenticated;

drop trigger if exists cross_post_jobs_retrait_rejuge on public.cross_post_jobs;
create trigger cross_post_jobs_retrait_rejuge
  after update of status, listing_url, platform_listing_id on public.cross_post_jobs
  for each row
  when (new.status = 'published' and coalesce(new.action, 'publish') in ('publish', 'republish')
        and new.inventaire_id is not null
        and new.platform = any (array['vinted', 'leboncoin', 'beebs', 'opla'])
        and (old.status is distinct from new.status
             or old.listing_url is distinct from new.listing_url
             or old.platform_listing_id is distinct from new.platform_listing_id))
  execute function public.retrait_rejuge_apres_republication();
