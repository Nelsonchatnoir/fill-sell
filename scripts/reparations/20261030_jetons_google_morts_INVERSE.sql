-- INVERSE de 20261030_jetons_google_morts.sql : remet jeton, produit, fin et annulation des 6 profils (sauvegarde).
begin;
update public.profiles p
   set google_purchase_token = b.google_purchase_token, google_product_id = b.google_product_id,
       subscription_period_end = b.subscription_period_end, subscription_cancel_at_period_end = b.subscription_cancel_at_period_end
  from public._backup_3010_canal_google_mort b
 where p.id = b.id and b.id in ('a858a441-7e68-4115-9f93-2ff8997bd618', 'e847ef68-2635-4dd9-9e90-ec9e805f694c',
   '273e3013-616f-42cb-9170-8135ad6d70f8', '5074ab96-3781-4410-a495-ece7f5316204', 'bee126f7-b9e2-4f97-b327-64114c86c14e',
   '8c53f1b4-875e-43ac-8fcf-f9a5b3535ff5');
commit;
