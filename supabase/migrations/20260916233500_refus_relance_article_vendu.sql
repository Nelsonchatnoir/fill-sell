-- ─────────────────────────────────────────────────────────────────────────────
-- REFUS DE RELANCE D'UNE PUBLICATION DONT L'ARTICLE EST VENDU
-- (2026-09-16, GO Nico — P10 du diagnostic « le plan de retrait ne retire pas tout »)
--
-- CAS MESURÉ. Sweat 1788797665293 vendu sur Vinted le 07/09 22:53 ; son frère
-- eBay 89b51621 attendait une réponse (needs_user) au moment de la vente, n'a
-- pas été annulé, et une relance groupée du 10/09 l'a remis en file : publié
-- le 10/09 18:34, trois jours APRÈS la vente, toujours en ligne le 16/09.
-- L'orchestration de vente annule désormais aussi les needs_user (P6) ; ce
-- trigger est le filet pour tout ce qui remet un publish/republish en file —
-- clic « Relancer » de l'app, popup de l'extension, relance SQL.
--
-- RÈGLE. Passage → 'pending' d'un job publish/republish dont l'article est
-- statut='vendu' : REFUSÉ, par une exception lisible (l'UPDATE échoue, le job
-- garde son statut). Remettre l'article en stock (suppression de la vente dans
-- l'app : remettreEnStockApresVenteSupprimee) lève le refus de lui-même.
-- Hors périmètre : delete (jamais concerné), INSERT d'une publication neuve,
-- tout autre changement de statut, article sans lien (inventaire_id null).
-- Idempotent (create or replace / drop if exists), rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.cross_post_jobs_refus_relance_article_vendu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_statut text;
begin
  if new.status = 'pending'
     and old.status is distinct from 'pending'
     and coalesce(new.action, 'publish') in ('publish', 'republish')
     and new.inventaire_id is not null then
    select i.statut into v_statut from public.inventaire i where i.id = new.inventaire_id;
    if v_statut = 'vendu' then
      raise exception 'Relance refusée : cet article est vendu, il n''y a rien à publier ni à republier (article %, job %). Remets-le en stock avant de relancer.',
        new.inventaire_id, new.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cross_post_jobs_refus_relance_article_vendu on public.cross_post_jobs;
create trigger cross_post_jobs_refus_relance_article_vendu
  before update of status on public.cross_post_jobs
  for each row execute function public.cross_post_jobs_refus_relance_article_vendu();
