-- INVERSE de 20261030_boncoin_canal_google_mort.sql : remet le jeton, le produit, la fin et l'annulation sauvegardés.
begin;
update public.profiles p
   set google_purchase_token = b.google_purchase_token, google_product_id = b.google_product_id,
       subscription_period_end = b.subscription_period_end, subscription_cancel_at_period_end = b.subscription_cancel_at_period_end
  from public._backup_3010_canal_google_mort b
 where p.id = b.id;
commit;
