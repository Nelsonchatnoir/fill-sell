-- ══════════════════════════════════════════════════════════════════════════════
-- UN ARTICLE VENDU NE RESTE JAMAIS EN VENTE AILLEURS (2026-09-26, dossier Joséphine)
-- ══════════════════════════════════════════════════════════════════════════════
-- LE CONSTAT (Joe0410, Pro, deux mails du 26/09) :
--   · Écharpe Kid Cool et Polo Scott vendus sur Leboncoin le 06/09 : elle clique
--     « Vendu » dans l'app le soir même. Les annonces Vinted et Beebs sont
--     restées EN VENTE jusqu'au 21/09.
--   · Jeans Celio 40 (…001) vendu le 07/09 (« Vendu » dans l'app) : sa copie
--     Leboncoin était encore ACHETABLE le 26/09.
--   · T-shirt Gentleman Farmer vendu sur Leboncoin le 07/09 : FillSell l'a
--     REPUBLIÉ sur Vinted le 09/09.
-- LA CAUSE : le bouton « Vendu » d'une carte de stock (confirmSell, App.jsx) et
-- la vente vocale (confirmSellDirect) passent la fiche en 'vendu' SANS toucher
-- à aucune annonce — un simple avertissement « retire-la toi-même ». Et une
-- vente prouvée par la plateforme (relevé Vinted « vendue », Leboncoin
-- « Article vendu ») n'allume qu'un bandeau : tant que personne ne clique, les
-- copies ailleurs restent achetables. Mesuré le 26/09 : 321 preuves de vente
-- non confirmées sur 73 comptes, dont 19 avec une copie encore publiée
-- ailleurs ; 4 étaient réellement achetables (eBay, Beebs, Opla ×2).
--
-- LA RÈGLE (Nico, 26/09) : un article vendu, sur n'importe quelle plateforme,
-- ne reste JAMAIS en vente ailleurs, et n'est jamais republié.
--
-- CE FICHIER, en cinq pièces :
--   1. armer_retrait_job(job, chemin, délai) — UN retrait normal (même forme
--      que armRemovals, App.jsx) pour l'annonce que porte un job publié.
--   2. armer_retraits_copies(article, chemin, sauf_job, sauf_plateforme,
--      délai) — un retrait par annonce encore en ligne de l'article, plus son
--      annonce Vinted connue par la fiche seule (import du dressing).
--   3. TRIGGER inventaire : la fiche DEVIENT vendue (statut 'vendu' ou
--      quantité ≤ 0, quel que soit le chemin : « Vendu », bandeau, vocal, relevé
--      du dressing, consume_one_unit) → toutes ses copies sont retirées.
--      Délai de 10 min avant exécution : le temps que la ligne de vente arrive
--      (pièce 5) et qu'un « Vendu » cliqué par erreur soit annulé — supprimer
--      la vente remet la fiche en stock, et le trigger existant
--      inventaire_vente_annulee_retraits annule alors ces retraits.
--   4. TRIGGER cross_post_jobs :
--      a. preuve POSITIVE de vente posée sur une annonce (sale_signal 'sold') →
--         les copies des AUTRES plateformes sont retirées tout de suite (pièce
--         unique seulement : sur un lot, une unité vendue ne retire rien) ;
--      b. une publication qui ABOUTIT sur un article vendu (ou signalé vendu
--         ailleurs) → son annonce est retirée aussitôt (job en vol au moment
--         de la vente, relance manuelle — le Beebs du 13/09).
--   5. TRIGGER ventes : la plateforme où l'article a été VENDU garde son
--      annonce (on ne retire pas l'annonce vendue elle-même : sur Vinted, la
--      requête de suppression d'une annonce vendue est refusée par l'anti-robot).
--   + un retrait Vinted RÉUSSI ferme la fiche côté Vinted (disparu_le,
--     vinted_status 'closed') : l'app ne dit plus « en ligne sur Vinted ».
--
-- ⛔ CE QUI NE CHANGE PAS : les publications en file d'un article vendu ne sont
--    pas annulées ici — la doctrine du 25/09 (RETENUES en needs_user par
--    get-pending-jobs, jamais annulées) reste la seule. Les lots (quantité > 1)
--    ne retirent rien tant qu'il reste des unités. Aucun job d'une annonce que
--    la plateforme dit vendue (relevé Vinted, sale_signal) n'est retiré.
-- ⛔ ÉCHAPPATOIRE pour un script de maintenance : `set local
--    fillsell.sans_retrait = '1'` (le même que le filet de suppression).
-- ⛔ JAMAIS BLOQUANT : chaque trigger avale ses erreurs en WARNING — une vente,
--    un relevé, une publication ne doivent jamais échouer à cause d'un retrait.
--
-- Fonctions existantes relues EN PROD le 26/09 avant écriture
-- (pg_get_functiondef) : inventaire_arme_retraits_avant_suppression (forme du
-- retrait serveur, vinted_account_id), retrait_garde_vendue_et_doublon,
-- inventaire_vente_annulee_retraits, inventaire_statut_quantite_coherents,
-- republish_refund_on_terminal (un job publié annulé n'est jamais remboursé :
-- published_at posé), cross_post_job_settle_reservation (réservation déjà
-- soldée à la publication), cross_post_jobs_retrait_ferme_annonce, article_vendu,
-- vinted_annonce_vendue, consume_one_unit.

-- ── 1. Un retrait pour l'annonce d'un job publié ─────────────────────────────
create or replace function public.armer_retrait_job(
  p_job_id uuid,
  p_chemin text,
  p_delai interval default interval '0'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j        public.cross_post_jobs%rowtype;
  v_item   text;
  v_url    text;
  v_ident  text;
  v_sans_lien boolean;
  v_pf     jsonb;
  v_del    uuid;
  v_compte text;
begin
  select * into j from public.cross_post_jobs where id = p_job_id;
  if not found or j.inventaire_id is null
     or coalesce(j.action, 'publish') not in ('publish', 'republish')
     or j.status is distinct from 'published' then
    return null;
  end if;
  -- L'annonce que la plateforme dit vendue ne se retire pas.
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;

  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if j.platform = 'vinted' then
    v_item := coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(v_url from '/items/(\d+)'));
    if v_item is not null and public.vinted_annonce_vendue(j.user_id, v_item) then
      return null;
    end if;
  end if;
  v_sans_lien := v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null;

  -- Un seul retrait ouvert par annonce (même règle que la garde à la création).
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and d.status in ('pending', 'processing', 'needs_user')
       and (v_sans_lien
            or public.listing_designe(coalesce(j.platform_listing_id, v_item, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return null;
  end if;

  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'depot', j.id,
            'pose_par', 'armer_retrait_job (serveur)'));
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  -- Beebs sans lien = dépôt en vérification (même forme qu'orchestrateSale) :
  -- get-pending-jobs recopie le lien dès qu'il arrive, ou clôt au bout de 7 j.
  if j.platform = 'beebs' and v_sans_lien then
    v_pf := v_pf || jsonb_build_object('retrait_attend_lien', jsonb_build_object(
              'depuis', now(), 'motif', 'depot_beebs_en_verification_a_la_vente'));
  end if;
  if j.platform = 'vinted' then
    select nullif(btrim(i.vinted_account_id::text), '') into v_compte
      from public.inventaire i where i.id = j.inventaire_id;
    if v_compte is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', v_compte);
    end if;
  end if;
  if p_delai is not null and p_delai > interval '0' then
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  end if;

  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id into v_del;

  -- Le dépôt RESTE 'published' — même état que le retrait par logo (armRemoveJob)
  -- et que le filet de suppression : l'annonce est en ligne tant que le retrait
  -- n'a pas abouti, et c'est l'extension qui clôt le dépôt APRÈS la suppression.
  -- Ainsi une vente annulée dans les 10 min (retraits annulés par
  -- inventaire_vente_annulee_retraits) laisse le dépôt exactement comme avant.
  -- On éteint seulement la question « retirer ? » et on nomme le retrait :
  -- orchestrateSale (bandeau) lit retrait_arme et ne repose pas la question.
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;

  return v_del;
end;
$$;
revoke all on function public.armer_retrait_job(uuid, text, interval) from public, anon, authenticated;

-- ── 2. Toutes les copies en ligne d'un article ───────────────────────────────
create or replace function public.armer_retraits_copies(
  p_inventaire_id bigint,
  p_chemin text,
  p_sauf_job uuid default null,
  p_sauf_plateforme text default null,
  p_delai interval default interval '0'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv   public.inventaire%rowtype;
  v_pub   record;
  v_del   uuid;
  v_n     integer := 0;
  v_pl    text[] := '{}';
  v_url   text;
  v_pf    jsonb;
begin
  select * into v_inv from public.inventaire where id = p_inventaire_id;
  if not found or v_inv.fusionne_dans is not null then
    return jsonb_build_object('armes', 0);
  end if;

  -- a. Chaque annonce portée par un job publié (la plus récente par plateforme,
  --    comme le filet de suppression).
  for v_pub in
    select distinct on (j.platform) j.id, j.platform
      from public.cross_post_jobs j
     where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
       and coalesce(j.action, 'publish') in ('publish', 'republish')
       and j.status = 'published'
       and (p_sauf_job is null or j.id <> p_sauf_job)
       and (p_sauf_plateforme is null or j.platform <> p_sauf_plateforme)
     order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc
  loop
    v_del := public.armer_retrait_job(v_pub.id, p_chemin, p_delai);
    if v_del is not null then
      v_n := v_n + 1;
      v_pl := v_pl || v_pub.platform;
    end if;
  end loop;

  -- b. L'annonce Vinted que seule la FICHE connaît (import du dressing sans job
  --    publié, ~4 % des annonces actives mesurées le 26/09) : vue ACTIVE au
  --    dernier relevé, jamais vendue, aucun retrait ouvert dessus.
  if v_inv.vinted_item_id ~ '^\d+$'
     and v_inv.disparu_le is null
     and v_inv.vinted_status = 'active'
     and (p_sauf_plateforme is distinct from 'vinted')
     and not ('vinted' = any (v_pl))
     and not public.vinted_annonce_vendue(v_inv.user_id, v_inv.vinted_item_id)
     and not exists (
       select 1 from public.cross_post_jobs d
        where d.user_id = v_inv.user_id and d.platform = 'vinted' and d.action = 'delete'
          and d.status in ('pending', 'processing', 'needs_user')
          and coalesce(case when d.platform_listing_id ~ '^\d+$' then d.platform_listing_id end,
                       substring(d.listing_url from '/items/(\d+)')) = v_inv.vinted_item_id)
     and not exists (
       select 1 from public.cross_post_jobs p
        where p.user_id = v_inv.user_id and p.inventaire_id = p_inventaire_id
          and p.platform = 'vinted' and p.status = 'published'
          and coalesce(p.action, 'publish') in ('publish', 'republish'))
  then
    -- Le domaine de la boutique (vinted.fr, vinted.it…) : celui de ses jobs.
    select substring(j.listing_url from '^(https://[^/]+)/items/') into v_url
      from public.cross_post_jobs j
     where j.user_id = v_inv.user_id and j.platform = 'vinted'
       and j.listing_url ~ '^https://[^/]+/items/'
     order by j.created_at desc limit 1;
    v_pf := jsonb_build_object('arme_par', jsonb_build_object(
              'chemin', p_chemin, 'le', now(), 'depot', null, 'annonce_de_la_fiche', v_inv.vinted_item_id,
              'pose_par', 'armer_retraits_copies (serveur)'));
    if nullif(btrim(v_inv.vinted_account_id::text), '') is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', btrim(v_inv.vinted_account_id::text));
    end if;
    if p_delai is not null and p_delai > interval '0' then
      v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
    end if;
    insert into public.cross_post_jobs
      (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
    values
      (v_inv.user_id, v_inv.id, 'vinted', 'delete', 'pending', 'original', v_inv.titre,
       coalesce(v_url, 'https://www.vinted.fr') || '/items/' || v_inv.vinted_item_id,
       v_inv.vinted_item_id, v_pf);
    v_n := v_n + 1;
    v_pl := v_pl || 'vinted'::text;
  end if;

  -- Journal d'audit, même ligne que les chemins de l'app (journalRetraits.js).
  if v_n > 0 then
    insert into public.usage_logs (user_id, feature, metadata)
    values (v_inv.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin,
      'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_pl) as p),
      'n_annonces', v_n,
      'n_articles', 1,
      'article_id', v_inv.id::text));
  end if;

  return jsonb_build_object('armes', v_n, 'plateformes', to_jsonb(v_pl));
end;
$$;
revoke all on function public.armer_retraits_copies(bigint, text, uuid, text, interval) from public, anon, authenticated;

-- ── 3. La fiche DEVIENT vendue → ses copies partent ──────────────────────────
create or replace function public.inventaire_vendu_retire_ses_copies()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return new;
  end if;
  if new.fusionne_dans is not null then
    return new;
  end if;
  -- Transition seulement : « pas vendu » → « vendu » (article_vendu : statut
  -- 'vendu' OU quantité ≤ 0). Un lot qui perd une unité n'est pas concerné.
  if old.statut = 'vendu' or (old.quantite is not null and old.quantite <= 0) then
    return new;
  end if;
  if not (new.statut = 'vendu' or (new.quantite is not null and new.quantite <= 0)) then
    return new;
  end if;
  begin
    -- Relevé du dressing qui voit l'annonce Vinted VENDUE : c'est elle, la
    -- vente — on ne la retire pas.
    perform public.armer_retraits_copies(
      new.id, 'vente_article_serveur', null,
      case when new.vinted_status = 'sold' then 'vinted' end,
      interval '10 minutes');
  exception when others then
    raise warning 'inventaire_vendu_retire_ses_copies (article %) : % — vente poursuivie', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists inventaire_vendu_retire_ses_copies on public.inventaire;
create trigger inventaire_vendu_retire_ses_copies
  after update of statut, quantite on public.inventaire
  for each row execute function public.inventaire_vendu_retire_ses_copies();

-- ── 4a. Preuve POSITIVE de vente sur une annonce → les autres plateformes ────
create or replace function public.cross_post_jobs_preuve_vente_retire_copies()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_q   integer;
  v_fus bigint;
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return new;
  end if;
  begin
    select i.quantite, i.fusionne_dans into v_q, v_fus
      from public.inventaire i where i.id = new.inventaire_id;
    if not found or v_fus is not null then
      return new;
    end if;
    -- Lot : une unité vendue ne dit rien des autres.
    if coalesce(v_q, 1) > 1 then
      return new;
    end if;
    perform public.armer_retraits_copies(new.inventaire_id, 'preuve_vente_serveur', new.id, new.platform, interval '0');
  exception when others then
    raise warning 'cross_post_jobs_preuve_vente_retire_copies (job %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists cross_post_jobs_preuve_vente_retire_copies on public.cross_post_jobs;
create trigger cross_post_jobs_preuve_vente_retire_copies
  after update of platform_fields on public.cross_post_jobs
  for each row
  when (new.inventaire_id is not null
        and new.status = 'published'
        and coalesce(new.action, 'publish') in ('publish', 'republish')
        and (new.platform_fields ->> 'sale_signal') = 'sold'
        and (old.platform_fields ->> 'sale_signal') is distinct from 'sold')
  execute function public.cross_post_jobs_preuve_vente_retire_copies();

-- ── 4b. Une publication qui aboutit sur un article vendu → retirée ───────────
create or replace function public.cross_post_jobs_publie_sur_article_vendu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vendu boolean;
begin
  if coalesce(current_setting('fillsell.sans_retrait', true), '') = '1' then
    return new;
  end if;
  begin
    v_vendu := public.article_vendu(new.inventaire_id);
    if not v_vendu then
      -- Vente prouvée AILLEURS mais pas encore confirmée (pièce unique).
      select exists (
        select 1 from public.cross_post_jobs s
          join public.inventaire i on i.id = s.inventaire_id
         where s.inventaire_id = new.inventaire_id and s.id <> new.id
           and s.status = 'published'
           and coalesce(s.action, 'publish') in ('publish', 'republish')
           and (s.platform_fields ->> 'sale_signal') = 'sold'
           and coalesce(i.quantite, 1) <= 1
           and i.fusionne_dans is null)
        into v_vendu;
    end if;
    if v_vendu then
      if public.armer_retrait_job(new.id, 'publie_apres_vente_serveur', interval '0') is not null then
        insert into public.usage_logs (user_id, feature, metadata)
        values (new.user_id, 'retrait_annonces', jsonb_build_object(
          'chemin', 'publie_apres_vente_serveur', 'plateformes', jsonb_build_array(new.platform),
          'n_annonces', 1, 'n_articles', 1, 'article_id', new.inventaire_id::text, 'job_publie', new.id));
      end if;
    end if;
  exception when others then
    raise warning 'cross_post_jobs_publie_sur_article_vendu (job %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists cross_post_jobs_publie_sur_article_vendu on public.cross_post_jobs;
create trigger cross_post_jobs_publie_sur_article_vendu
  after update of status on public.cross_post_jobs
  for each row
  when (new.status = 'published'
        and old.status is distinct from 'published'
        and coalesce(new.action, 'publish') in ('publish', 'republish')
        and new.inventaire_id is not null)
  execute function public.cross_post_jobs_publie_sur_article_vendu();

-- ── 5. La plateforme de la VENTE garde son annonce ──────────────────────────
-- Les retraits armés par la pièce 3 attendent 10 min : la ligne de vente
-- (confirmSell l'écrit juste après la fiche) dit où l'article est parti, et
-- l'annonce de CETTE plateforme n'est pas retirée — c'est elle qui est vendue.
-- Vente non reliée à la fiche (app d'avant le correctif du 26/09) : on la
-- rattache à l'article dont un retrait serveur vient d'être armé sous le même
-- titre — un seul candidat, sinon on ne devine pas.
create or replace function public.ventes_garde_annonce_de_la_vente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_brut text;
  v_pf   text;
  v_inv  bigint;
  v_nb   integer;
begin
  begin
    v_brut := lower(coalesce(nullif(btrim(new.plateforme_code), ''), new.plateforme, ''));
    v_pf := case
      when v_brut like '%vinted%' then 'vinted'
      when v_brut like '%leboncoin%' or v_brut in ('lbc', 'le bon coin') then 'leboncoin'
      when v_brut like '%beebs%' then 'beebs'
      when v_brut like '%ebay%' then 'ebay'
      when v_brut like '%opla%' then 'opla'
      else null end;
    if v_pf is null then
      return new;
    end if;
    v_inv := new.inventaire_id;
    if v_inv is null and nullif(btrim(coalesce(new.titre, '')), '') is not null then
      select count(distinct d.inventaire_id), min(d.inventaire_id) into v_nb, v_inv
        from public.cross_post_jobs d
        join public.inventaire i on i.id = d.inventaire_id
       where d.user_id = new.user_id and d.action = 'delete' and d.status = 'pending'
         and d.platform_fields -> 'arme_par' ->> 'chemin' = 'vente_article_serveur'
         and d.created_at > now() - interval '15 minutes'
         and lower(btrim(i.titre)) = lower(btrim(new.titre));
      if coalesce(v_nb, 0) <> 1 then
        return new;
      end if;
    end if;
    if v_inv is null then
      return new;
    end if;
    update public.cross_post_jobs d
       set status = 'cancelled',
           error = 'Retrait inutile : l''article a été vendu sur cette plateforme — l''annonce vendue n''est pas touchée.',
           platform_fields = coalesce(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
             'retrait_non_envoye', jsonb_build_object('le', now(), 'motif', 'plateforme_de_la_vente',
               'vente', new.id, 'pose_par', 'ventes_garde_annonce_de_la_vente'))
     where d.user_id = new.user_id and d.inventaire_id = v_inv
       and d.platform = v_pf and d.action = 'delete' and d.status = 'pending'
       and d.platform_fields -> 'arme_par' ->> 'chemin' = 'vente_article_serveur'
       and d.created_at > now() - interval '15 minutes';
  exception when others then
    raise warning 'ventes_garde_annonce_de_la_vente (vente %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists ventes_garde_annonce_de_la_vente on public.ventes;
create trigger ventes_garde_annonce_de_la_vente
  after insert on public.ventes
  for each row execute function public.ventes_garde_annonce_de_la_vente();

-- ── + Retrait Vinted réussi → la fiche n'est plus « en ligne sur Vinted » ────
-- Cas relevés le 26/09 : Écharpe, Polo, T-shirt (Joséphine), T-shirt blanc
-- (Nico) — retrait Vinted 'deleted', fiche restée vinted_status 'active'.
-- 'closed' = fermée sans vente sur Vinted (vocabulaire du wardrobe, déjà lu
-- par l'app : la revue des disparus ne repose pas la question). Une annonce
-- que Vinted dit vendue garde 'sold'.
create or replace function public.cross_post_jobs_retrait_vinted_ferme_fiche()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item text;
begin
  begin
    v_item := coalesce(case when new.platform_listing_id ~ '^\d+$' then new.platform_listing_id end,
                       substring(new.listing_url from '/items/(\d+)'));
    if v_item is null or new.inventaire_id is null then
      return new;
    end if;
    update public.inventaire i
       set disparu_le = coalesce(i.disparu_le, now()),
           vinted_status = case when i.vinted_status = 'sold' then i.vinted_status else 'closed' end
     where i.id = new.inventaire_id and i.user_id = new.user_id and i.vinted_item_id = v_item;
  exception when others then
    raise warning 'cross_post_jobs_retrait_vinted_ferme_fiche (job %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists cross_post_jobs_retrait_vinted_ferme_fiche on public.cross_post_jobs;
create trigger cross_post_jobs_retrait_vinted_ferme_fiche
  after update of status on public.cross_post_jobs
  for each row
  when (new.action = 'delete' and new.platform = 'vinted'
        and new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function public.cross_post_jobs_retrait_vinted_ferme_fiche();

revoke all on function public.inventaire_vendu_retire_ses_copies() from public, anon, authenticated;
revoke all on function public.cross_post_jobs_preuve_vente_retire_copies() from public, anon, authenticated;
revoke all on function public.cross_post_jobs_publie_sur_article_vendu() from public, anon, authenticated;
revoke all on function public.ventes_garde_annonce_de_la_vente() from public, anon, authenticated;
revoke all on function public.cross_post_jobs_retrait_vinted_ferme_fiche() from public, anon, authenticated;
