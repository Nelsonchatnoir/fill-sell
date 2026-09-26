-- ══════════════════════════════════════════════════════════════════════════════
-- RETRAITS ET REPUBLICATIONS : L'ANNONCE VENDUE, ET UN SEUL RETRAIT PAR ANNONCE
-- (2026-09-26, complément 1 — À LA CRÉATION, en renfort des gardes de SERVICE)
-- ══════════════════════════════════════════════════════════════════════════════
-- Les gardes de service sont déjà en prod depuis le 26/09 (get-pending-jobs
-- v138, update-job-status v81) : un job fautif est écarté AVANT d'atteindre
-- l'extension. Ce fichier ajoute la même règle AU MOMENT DE LA CRÉATION, pour
-- que le job fautif n'existe même pas en attente :
--
--   1. vinted_annonce_vendue(user, item) : le DERNIER relevé du dressing dit
--      'sold'. C'est la source qui savait, la veille, que les trois boutons de
--      manchettes de nerema75 étaient vendus — la fiche, elle, l'ignorait.
--
--   2. Un RETRAIT (action 'delete') créé en attente :
--      · sur une annonce Vinted VENDUE → inséré directement 'cancelled', avec
--        le motif : il n'y a rien à retirer, et la requête de suppression sur
--        une annonce vendue ne rapporte qu'un 403 anti-robot (code 106) ;
--      · alors qu'un retrait est DÉJÀ OUVERT sur la même annonce (même compte,
--        même plateforme, même annonce) → inséré 'cancelled', doublon nommé.
--      L'insert RÉUSSIT toujours : refuser la ligne ferait échouer le geste de
--      l'app qui l'arme (la suppression d'un article s'arrêterait en erreur).
--      Verrou consultatif par annonce : deux créations simultanées ne passent
--      jamais toutes les deux.
--
--   3. Une REPUBLICATION Vinted créée sur une annonce VENDUE (relevé) est
--      REFUSÉE, comme l'est déjà celle d'un article vendu (même trigger, même
--      mécanique : exception, la transaction de spend_coins_and_republish est
--      annulée, rien n'est décompté).
--
-- Corps des fonctions existantes relus EN PROD le 26/09 (pg_get_functiondef)
-- avant écriture : cross_post_jobs_refus_creation_article_vendu (ci-dessous,
-- recopié à l'identique + la condition Vinted), retrait_redirige_annonce_remplacee
-- (non modifié ; le nouveau trigger porte un nom qui le fait passer APRÈS lui,
-- pour juger la cible FINALE d'un retrait redirigé).

-- ── 1. L'annonce Vinted est-elle vendue, selon le dernier relevé ? ──────────
create or replace function public.vinted_annonce_vendue(p_user uuid, p_item text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select s.status = 'sold'
    from public.vinted_listing_snapshots s
    where s.user_id = p_user and s.vinted_item_id = p_item
    order by s.captured_at desc
    limit 1
  ), false);
$$;
revoke all on function public.vinted_annonce_vendue(uuid, text) from public, anon, authenticated;

-- ── 2. Retrait : jamais sur l'annonce vendue, jamais deux ouverts ───────────
create or replace function public.retrait_garde_vendue_et_doublon()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item   text;
  v_url    text;
  v_ident  text;
  v_autre  uuid;
begin
  if new.action is distinct from 'delete' or new.status is distinct from 'pending' then
    return new;
  end if;

  -- Jamais un point de panne : sur une erreur imprévue, le retrait est créé
  -- COMME AVANT (les gardes de service de get-pending-jobs restent derrière),
  -- et la cause part en WARNING. Refuser la ligne ferait échouer le geste de
  -- l'app (une suppression d'article s'arrêterait en erreur).
  begin

  if new.platform = 'vinted' then
    v_item := coalesce(
      case when new.platform_listing_id ~ '^\d+$' then new.platform_listing_id end,
      substring(new.listing_url from '/items/(\d+)'));
    v_ident := case when v_item is not null then 'vinted:' || v_item end;
  elsif nullif(btrim(new.platform_listing_id), '') is not null then
    v_ident := new.platform || ':' || btrim(new.platform_listing_id);
  elsif nullif(btrim(new.listing_url), '') is not null then
    v_url := regexp_replace(split_part(split_part(btrim(new.listing_url), '?', 1), '#', 1), '/$', '');
    v_ident := new.platform || ':' || v_url;
  end if;

  -- Annonce vendue : rien à retirer, aucune requête ne partira.
  if v_item is not null and public.vinted_annonce_vendue(new.user_id, v_item) then
    new.status := 'cancelled';
    new.error := 'Retrait inutile : cette annonce est vendue sur Vinted, elle n''est plus en vente. Aucune requête envoyée.';
    new.platform_fields := coalesce(new.platform_fields, '{}'::jsonb) || jsonb_build_object(
      'retrait_par', 'vendue_sur_la_plateforme',
      'retrait_non_envoye', jsonb_build_object('le', now(), 'motif', 'annonce_vendue', 'item', v_item,
        'pose_par', 'retrait_garde_vendue_et_doublon (création)'));
    return new;
  end if;

  -- Un seul retrait ouvert par annonce.
  if v_ident is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || '|' || v_ident, 0));
    select j.id into v_autre
    from public.cross_post_jobs j
    where j.user_id = new.user_id and j.platform = new.platform and j.action = 'delete'
      and j.status in ('pending', 'processing', 'needs_user')
      and j.id <> new.id
      and case
            when new.platform = 'vinted' then
              coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(j.listing_url from '/items/(\d+)')) = v_item
            when nullif(btrim(new.platform_listing_id), '') is not null then
              btrim(j.platform_listing_id) = btrim(new.platform_listing_id)
            else
              regexp_replace(split_part(split_part(btrim(j.listing_url), '?', 1), '#', 1), '/$', '') = v_url
          end
    order by j.created_at
    limit 1;
    if v_autre is not null then
      new.status := 'cancelled';
      new.error := 'Doublon : un retrait est déjà en cours pour cette annonce.';
      new.platform_fields := coalesce(new.platform_fields, '{}'::jsonb) || jsonb_build_object(
        'retrait_doublon_de', jsonb_build_object('job', v_autre, 'le', now(), 'annonce', v_ident,
          'pose_par', 'retrait_garde_vendue_et_doublon (création)'));
    end if;
  end if;

  exception when others then
    raise warning 'retrait_garde_vendue_et_doublon (job %) : % — retrait créé comme avant', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists cross_post_jobs_retrait_garde_vendue_doublon on public.cross_post_jobs;
create trigger cross_post_jobs_retrait_garde_vendue_doublon
  before insert on public.cross_post_jobs
  for each row
  when (new.action = 'delete' and new.status = 'pending')
  execute function public.retrait_garde_vendue_et_doublon();

-- ── 3. Republication Vinted refusée sur une annonce vendue (relevé) ─────────
create or replace function public.cross_post_jobs_refus_creation_article_vendu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = 'pending'
     and coalesce(new.action, 'publish') in ('publish', 'republish')
     and new.inventaire_id is not null
     and public.article_vendu(new.inventaire_id) then
    raise exception 'ARTICLE_VENDU: Cet article est vendu : il ne peut être ni publié ni republié. Si la vente n''a pas eu lieu, supprime-la dans l''app ou remets une quantité, puis recommence. Rien n''a été décompté. (article %)',
      new.inventaire_id
      using errcode = 'check_violation';
  end if;
  if new.status = 'pending'
     and new.action = 'republish'
     and new.platform = 'vinted'
     and (new.platform_fields->>'vinted_item_id') ~ '^\d+$'
     and public.vinted_annonce_vendue(new.user_id, new.platform_fields->>'vinted_item_id') then
    raise exception 'ANNONCE_VENDUE: Cette annonce est vendue sur Vinted (dernier relevé de ton dressing) : elle ne peut pas être republiée. Enregistre la vente dans l''app. Rien n''a été décompté. (annonce %)',
      new.platform_fields->>'vinted_item_id'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;
