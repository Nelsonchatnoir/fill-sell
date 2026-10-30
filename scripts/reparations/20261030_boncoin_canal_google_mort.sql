-- (30/10, lot D point 2) BONCOIN (3f91c02e) : le canal Google MORT effacé du profil — nettoyage demandé par Nico.
-- Faits (journal des stores + API Google relue le 30/10 vers 10:35 par abonnements-stores-audit v2) : Premium Google
-- REVOKED + EXPIRED + remboursé le 29/10 à 10:04 (échéance Google 29/10 09:04:13Z, état SUBSCRIPTION_STATE_EXPIRED) ;
-- Premium Stripe pris le 29/10 à 18:14 (actif). Le profil gardait le jeton, le produit et la fin Google (26/11).
-- La règle (google-play-webhook v32) efface désormais le canal à l'arrêt ; ce script applique la même règle à ce
-- profil, une fois : jeton, produit et fin Google à NULL, annulation à faux. Les drapeaux NE BOUGENT PAS : is_premium
-- est celui de son Premium Stripe (vivant). Aucune écriture chez Stripe ni Google.
-- Garde : l'empreinte du jeton (sha256, 12 premiers caractères) et le client Stripe doivent être ceux relus.
-- Sauvegarde : _backup_3010_canal_google_mort. Inverse : 20261030_boncoin_canal_google_mort_INVERSE.sql
begin;
create table if not exists public._backup_3010_canal_google_mort (
  id uuid primary key, google_purchase_token text, google_product_id text, subscription_period_end text,
  subscription_cancel_at_period_end boolean, sauvegarde_le timestamptz not null default now());
revoke all on public._backup_3010_canal_google_mort from anon, authenticated;
insert into public._backup_3010_canal_google_mort (id, google_purchase_token, google_product_id, subscription_period_end, subscription_cancel_at_period_end)
select id, google_purchase_token, google_product_id, subscription_period_end::text, subscription_cancel_at_period_end
  from public.profiles
 where id = '3f91c02e-3abc-4e08-8c46-b2232005b10e'
   and left(encode(extensions.digest(google_purchase_token, 'sha256'), 'hex'), 12) = '19e1792d9731'
   and stripe_customer_id like 'cus_VWvb%'
on conflict (id) do nothing;
update public.profiles p
   set google_purchase_token = null, google_product_id = null,
       subscription_period_end = null, subscription_cancel_at_period_end = false
  from public._backup_3010_canal_google_mort b
 where p.id = b.id and p.id = '3f91c02e-3abc-4e08-8c46-b2232005b10e'
   and left(encode(extensions.digest(p.google_purchase_token, 'sha256'), 'hex'), 12) = '19e1792d9731';
select id, google_purchase_token is null as jeton_efface, google_product_id, subscription_period_end, is_premium, is_pro, is_business
  from public.profiles where id = '3f91c02e-3abc-4e08-8c46-b2232005b10e';
commit;
