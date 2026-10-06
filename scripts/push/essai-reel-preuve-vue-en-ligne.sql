-- ESSAI RÉEL (06/10 soir) — migration 20261006210000 : une vraie vente Vinted
-- RÉCENTE, vue en ligne par la veille et jamais relevée, déclenche UN mail ;
-- une vente ANCIENNE n'en déclenche aucun. Compte d'essai de Nico (hoosslocal,
-- 5322fa18…), fiches et jobs d'essai à 999 €, annonces fictives ESSAI-0610-*.
-- Nettoyage : essai-reel-preuve-vue-en-ligne_NETTOYAGE.sql
do $$
declare
  u uuid := '5322fa18-c194-458b-a222-7ee4093c4968';
  jr uuid; ja uuid;
begin
  insert into inventaire (id, user_id, titre, statut, quantite, prix_vente, prix_achat, prix_achat_inconnu, vinted_item_id, plateforme)
  values (1791306100001, u, 'TEST FillSell vente récente (essai mail) - ne pas acheter', 'stock', 1, 999, null, true, 'ESSAI-0610-R', 'vinted'),
         (1791306100002, u, 'TEST FillSell vente ancienne (essai mail) - ne pas acheter', 'stock', 1, 999, null, true, 'ESSAI-0610-A', 'vinted');
  -- Deux annonces publiées il y a 5 jours (aucune preuve « publiée < 48 h »).
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, last_checked_at)
  values (u, 1791306100001, 'vinted', 'published', 'publish', 'TEST FillSell vente récente (essai mail) - ne pas acheter', 999, 'ESSAI-0610-R', now() - interval '5 days', now() - interval '3 days')
  returning id into jr;
  insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, price, platform_listing_id, published_at, last_checked_at)
  values (u, 1791306100002, 'vinted', 'published', 'publish', 'TEST FillSell vente ancienne (essai mail) - ne pas acheter', 999, 'ESSAI-0610-A', now() - interval '5 days', now() - interval '3 days')
  returning id into ja;
  -- La veille lit l'annonce « récente » EN LIGNE il y a 20 min (comme check-listing-status).
  update cross_post_jobs set last_checked_at = now() - interval '20 minutes' where id = jr;
  -- Puis la veille la voit VENDUE maintenant ; l'« ancienne » n'a plus été lue depuis 3 jours.
  update cross_post_jobs set last_checked_at = now(), platform_fields = coalesce(platform_fields, '{}'::jsonb)
    || jsonb_build_object('sale_signal', 'sold', 'unavailable_since', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) where id in (jr, ja);
  raise notice 'jobs essai : récent %, ancien %', jr, ja;
end $$;
select j.id, j.platform_listing_id, j.vu_en_ligne_le, (select json_agg(json_build_object('note', p.id, 'statut', p.statut, 'mail', p.mail_statut, 'preuve', p.preuve_recente)) from push_ventes p where p.job_id = j.id) notes
  from cross_post_jobs j where j.platform_listing_id in ('ESSAI-0610-R', 'ESSAI-0610-A');
