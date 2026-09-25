-- ═══════════════════════════════════════════════════════════════════════════
-- UN ARTICLE VENDU N'EST JAMAIS PUBLIÉ NI REPUBLIÉ (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════════════
-- MEMINIANDMOVE (Pro), robe Oh Polly 1789926947675004 :
--   10:45  vente déclarée depuis l'app → consume_one_unit : statut 'vendu',
--          quantite 0, retraits LBC/Vinted/Opla armés ;
--   19:44  la vente est SUPPRIMÉE depuis l'app → remettreEnStockApresVenteSupprimee
--          remet statut 'stock'… et laisse quantite = 0 ;
--   20:57  nouvelle publication Vinted depuis le stepper — aucune garde ne la
--          refuse (spend_coins_and_publish ne regarde pas la fiche) ;
--   21:00  en ligne (10133591321). Risque de double vente.
--
-- LA RÈGLE (Nico, 25/09) : un article est VENDU quand statut = 'vendu' OU
-- quantite ≤ 0 ; il ne peut alors être ni publié ni republié.
--   1. article_vendu() : la règle, en UN endroit ;
--   2. garde de CRÉATION : tout nouveau job publish/republish à exécuter
--      (status 'pending') sur un article vendu est refusé. Toutes les voies
--      de création passent par l'INSERT (spend_coins_and_publish,
--      spend_coins_and_republish, balayages automatiques) : l'exception
--      annule la transaction, débit compris. Les deux balayages attrapent
--      déjà les exceptions de spend_coins_and_republish (même chemin que
--      republish_maintenance_guard) : un article vendu n'arrête jamais un
--      balayage. Les imports du relevé (jobs insérés 'published'/'sold')
--      ne sont PAS concernés ;
--   3. la garde de RELANCE existante couvre aussi quantite ≤ 0 ;
--   4. cohérence statut / quantité sur inventaire :
--      · quantité qui TOMBE à 0 (depuis > 0) → statut 'vendu' ;
--      · vente annulée (statut vendu → stock) avec quantite ≤ 0 → quantite 1 :
--        c'est l'inverse exact de la dernière unité consommée par
--        consume_one_unit (1 → 0). Sans ça, « supprimer la vente » laissait
--        un article « en stock » à 0 unité — l'état de la robe Oh Polly.
-- La garde de SERVICE vit dans get-pending-jobs (v137+).
-- Mesuré le 25/09 : 1 seule fiche « stock » à quantite ≤ 0 sur tout le parc
-- (la robe) ; 4 jobs en file sur des articles vendus ; aucune fonction ne
-- met quantite à 0 hors consume_one_unit (qui pose 'vendu' en même temps).

-- 1. La règle ------------------------------------------------------------------
create or replace function public.article_vendu(p_inventaire_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.inventaire i
    where i.id = p_inventaire_id
      and (i.statut = 'vendu' or (i.quantite is not null and i.quantite <= 0))
  );
$$;

-- 2. Garde de création -----------------------------------------------------------
create or replace function public.cross_post_jobs_refus_creation_article_vendu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'pending'
     and coalesce(new.action, 'publish') in ('publish', 'republish')
     and new.inventaire_id is not null
     and public.article_vendu(new.inventaire_id) then
    raise exception 'ARTICLE_VENDU: Cet article est vendu : il ne peut être ni publié ni republié. Si la vente n''a pas eu lieu, supprime-la dans l''app ou remets une quantité, puis recommence. Rien n''a été décompté. (article %)',
      new.inventaire_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists cross_post_jobs_refus_creation_article_vendu on public.cross_post_jobs;
create trigger cross_post_jobs_refus_creation_article_vendu
  before insert on public.cross_post_jobs
  for each row execute function public.cross_post_jobs_refus_creation_article_vendu();

-- 3. Garde de relance : la même règle (quantite ≤ 0 comprise) ---------------------
create or replace function public.cross_post_jobs_refus_relance_article_vendu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'pending'
     and old.status is distinct from 'pending'
     and coalesce(new.action, 'publish') in ('publish', 'republish')
     and new.inventaire_id is not null
     and public.article_vendu(new.inventaire_id) then
    raise exception 'Relance refusée : cet article est vendu, il n''y a rien à publier ni à republier (article %, job %). Remets-le en stock avant de relancer.',
      new.inventaire_id, new.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- 4. Statut et quantité cohérents ------------------------------------------------
create or replace function public.inventaire_statut_quantite_coherents()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Vente annulée : la dernière unité revient (inverse de consume_one_unit).
  if old.statut = 'vendu' and new.statut = 'stock'
     and coalesce(new.quantite, 1) <= 0 then
    new.quantite := 1;
  -- Quantité tombée à 0 : l'article est vendu.
  elsif new.statut is distinct from 'vendu'
     and new.quantite is not null and new.quantite <= 0
     and coalesce(old.quantite, 1) > 0 then
    new.statut := 'vendu';
  end if;
  return new;
end;
$$;

drop trigger if exists inventaire_statut_quantite_coherents on public.inventaire;
create trigger inventaire_statut_quantite_coherents
  before update of statut, quantite on public.inventaire
  for each row execute function public.inventaire_statut_quantite_coherents();
