-- (30/10, lot D, ordre de Nico : « les 6 jetons Google morts : nettoie-les avec le même script ») Les 6 profils dont
-- l'abonnement Google est MORT chez Google — relu par abonnements-stores-audit v2 le 30/10 vers 12:05 (lecture seule) :
-- SUBSCRIPTION_STATE_EXPIRED (a858a441, e847ef68, 273e3013) ou jeton inconnu de Google, HTTP 410 (5074ab96, bee126f7,
-- 8c53f1b4). Drapeaux déjà à faux, ni client Stripe ni Apple sur ces profils : seul le canal Google mort s'efface
-- (jeton, produit, fin, annulation), comme la règle de google-play-webhook v32 le fait désormais à l'arrêt. Rien de payant.
-- Garde : l'empreinte du jeton (sha256, 12 premiers caractères) relue avant, et aucun droit sur le profil.
-- Sauvegarde : _backup_3010_canal_google_mort (la même que BONCOIN). Inverse : 20261030_jetons_google_morts_INVERSE.sql
begin;
create temporary table _morts (id uuid, empreinte text) on commit drop;
insert into _morts values
  ('a858a441-7e68-4115-9f93-2ff8997bd618', '904eeb5d01fa'), ('e847ef68-2635-4dd9-9e90-ec9e805f694c', '2c0b6fbf9b01'),
  ('273e3013-616f-42cb-9170-8135ad6d70f8', '3eaf87da371f'), ('5074ab96-3781-4410-a495-ece7f5316204', 'ead0cc49a8c1'),
  ('bee126f7-b9e2-4f97-b327-64114c86c14e', '52ad5d797313'), ('8c53f1b4-875e-43ac-8fcf-f9a5b3535ff5', 'dc79f57a7223');
insert into public._backup_3010_canal_google_mort (id, google_purchase_token, google_product_id, subscription_period_end, subscription_cancel_at_period_end)
select p.id, p.google_purchase_token, p.google_product_id, p.subscription_period_end::text, p.subscription_cancel_at_period_end
  from public.profiles p join _morts m on m.id = p.id
 where left(encode(extensions.digest(p.google_purchase_token, 'sha256'), 'hex'), 12) = m.empreinte
   and not coalesce(p.is_premium, false) and not coalesce(p.is_pro, false) and not coalesce(p.is_business, false)
on conflict (id) do nothing;
update public.profiles p
   set google_purchase_token = null, google_product_id = null, subscription_period_end = null, subscription_cancel_at_period_end = false
  from _morts m, public._backup_3010_canal_google_mort b
 where p.id = m.id and b.id = p.id
   and left(encode(extensions.digest(p.google_purchase_token, 'sha256'), 'hex'), 12) = m.empreinte
   and not coalesce(p.is_premium, false) and not coalesce(p.is_pro, false) and not coalesce(p.is_business, false);
select count(*) filter (where google_purchase_token is null) as effaces, count(*) as cibles from public.profiles where id in (select id from _morts);
commit;
