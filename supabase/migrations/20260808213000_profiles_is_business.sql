-- Palier Business (app.fillsell.business.sub, 59,99 €/mois) — colonne de
-- palier, patron exact d'is_pro (booléen, service-role only).
--
-- FLAGS CUMULATIFS (décision Nico du 08/08 soir) : un Business porte AUSSI
-- is_premium = true ET is_pro = true. C'est ce qui garantit que TOUS les
-- gates « is_pro = palier le plus haut » (stock illimité, quota publish,
-- republication auto, background.js, coins_awaiting_payment) couvrent
-- Business sans qu'on ait à les retoucher un par un — un avantage Pro perdu
-- par un Business serait un bug silencieux (vigilance du chantier).
-- Seuls les endroits qui RÉSOLVENT un NOM de tier (CASE is_pro → 'pro'…)
-- testent is_business EN PREMIER (migrations suivantes).
--
-- ⛔ Ne JAMAIS ajouter is_business au GRANT UPDATE client de profiles
-- (20260706400000) : même règle que is_premium/is_pro — un client pourrait
-- s'auto-promouvoir.
--
-- Idempotente (add column if not exists).

alter table public.profiles
  add column if not exists is_business boolean not null default false;

comment on column public.profiles.is_business is
  'Palier Business (app.fillsell.business.sub). CUMULATIF : is_premium et is_pro restent true aussi (décision 2026-08-08). Écrit uniquement par les fonctions de paiement en service role — hors du GRANT UPDATE client.';
