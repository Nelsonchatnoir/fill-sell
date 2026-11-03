-- Essai à blanc de 20261103140000_armer_retrait_rattachee_apres_vente : TOUT est annulé (ROLLBACK).
begin;
set local statement_timeout = '60s';
create temp table _essai (test text, attendu text, obtenu text, ms numeric) on commit drop;

CREATE TRIGGER cross_post_jobs_inseree_sur_article_vendu
  AFTER INSERT ON public.cross_post_jobs FOR EACH ROW
  WHEN (new.status = 'published' AND COALESCE(new.action, 'publish') IN ('publish', 'republish') AND new.inventaire_id IS NOT NULL)
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();
CREATE TRIGGER cross_post_jobs_repointee_sur_article_vendu
  AFTER UPDATE OF inventaire_id ON public.cross_post_jobs FOR EACH ROW
  WHEN (new.status = 'published' AND new.inventaire_id IS NOT NULL AND new.inventaire_id IS DISTINCT FROM old.inventaire_id
        AND COALESCE(new.action, 'publish') IN ('publish', 'republish'))
  EXECUTE FUNCTION public.cross_post_jobs_publie_sur_article_vendu();

do $$
declare
  a uuid := 'aabb7fb7-867e-45cd-a3ac-98408f321c3f';   -- annonce Leboncoin prouvée d'un article vendu ailleurs, sans retrait
  b uuid := '232ab851-75e7-48bd-8fbc-3cc4efd7fb83';   -- annonce Beebs prouvée d'un article vendu ailleurs, sans retrait
  inv_a bigint; inv_b bigint; n int; t0 timestamptz; nouveau uuid := gen_random_uuid(); stock_job uuid; inv_s bigint;
begin
  select inventaire_id into inv_a from cross_post_jobs where id = a;
  select inventaire_id into inv_b from cross_post_jobs where id = b;

  -- T1 : re-pointée sur la fiche (UPDATE OF inventaire_id) → retrait armé
  update cross_post_jobs set inventaire_id = null where id = a;
  t0 := clock_timestamp();
  update cross_post_jobs set inventaire_id = inv_a where id = a;
  select count(*) into n from cross_post_jobs where inventaire_id = inv_a and platform = 'leboncoin' and action = 'delete' and created_at >= now();
  insert into _essai values ('T1 re-pointée, article vendu', '1', n::text, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));

  -- T2 : insérée déjà publiée (rattachement d'un relevé) → retrait armé
  update cross_post_jobs set status = 'cancelled' where id = b;
  t0 := clock_timestamp();
  insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields, handler_build, published_at)
    select nouveau, user_id, inventaire_id, platform, action, 'published', photo_option, title, listing_url, platform_listing_id, platform_fields, 'essai-0311', now()
      from cross_post_jobs where id = b;
  select count(*) into n from cross_post_jobs where inventaire_id = inv_b and platform = 'beebs' and action = 'delete' and created_at >= now();
  insert into _essai values ('T2 insérée publiée, article vendu', '1', n::text, round(extract(epoch from clock_timestamp() - t0) * 1000, 1));

  -- T3 : même insertion une seconde fois (deux exemplaires vivants) → aucun second retrait
  --      (un vrai relevé pose aussi sa ligne annonces_plateforme : c'est elle que compte fiche_annonces_vivantes)
  insert into annonces_plateforme (user_id, platform, listing_id, statut_plateforme, inventaire_id, vu_le)
    select user_id, platform, platform_listing_id || '9', 'en_ligne', inventaire_id, now() from cross_post_jobs where id = b;
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields, handler_build, published_at)
    select user_id, inventaire_id, platform, action, 'published', photo_option, title, listing_url || '?2', platform_listing_id || '9', platform_fields, 'essai-0311', now()
      from cross_post_jobs where id = b;
  select count(*) into n from cross_post_jobs where inventaire_id = inv_b and platform = 'beebs' and action = 'delete' and created_at >= now();
  insert into _essai values ('T3 deuxième exemplaire : pas de second retrait', '1', n::text, null);

  -- T4 : article EN STOCK → aucun retrait
  select j.id, j.inventaire_id into stock_job, inv_s from cross_post_jobs j join inventaire i on i.id = j.inventaire_id and i.statut <> 'vendu'
   where j.status = 'published' and j.action = 'publish' and j.platform = 'leboncoin' and j.created_at > now() - interval '3 days' limit 1;
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields, handler_build, published_at)
    select user_id, inventaire_id, 'depop', action, 'published', photo_option, title, 'https://www.depop.com/products/essai-0311/', 'essai-0311', platform_fields, 'essai-0311', now()
      from cross_post_jobs where id = stock_job;
  select count(*) into n from cross_post_jobs where inventaire_id = inv_s and action = 'delete' and created_at >= now();
  insert into _essai values ('T4 article en stock : aucun retrait', '0', n::text, null);

  -- T5 : coupe-circuit des réparations
  perform set_config('fillsell.sans_retrait', '1', true);
  update cross_post_jobs set inventaire_id = null where id = a;
  delete from cross_post_jobs where inventaire_id = inv_a and platform = 'leboncoin' and action = 'delete' and created_at >= now();
  update cross_post_jobs set inventaire_id = inv_a where id = a;
  select count(*) into n from cross_post_jobs where inventaire_id = inv_a and platform = 'leboncoin' and action = 'delete' and created_at >= now();
  insert into _essai values ('T5 fillsell.sans_retrait = 1 : rien', '0', n::text, null);
end $$;

select test, attendu, obtenu, case when attendu = obtenu then 'OK' else 'ROUGE' end verdict, ms from _essai;
rollback;
