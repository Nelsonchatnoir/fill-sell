-- ═══════════════════════════════════════════════════════════════════════════
-- 19/11/2026 — CLOUD OFFERT LIÉ AU BUSINESS, compte faf5021a (ordre de Nico, 19/11 midi)
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision de Nico : le Cloud est OFFERT à ce compte « à vie tant que son abonnement Business est actif » ; il s'arrête
-- avec le Business (résiliation arrivée à terme, impayé ; IP au repos si une plateforme a été connectée). Ce n'est pas un
-- essai : pas de date de fin, pas de relance Cloud, pas de facture Cloud, rien au MRR Cloud.
-- Fait du 19/11 12:03 : la personne a pris elle-même « Business + Cloud » chez Stripe (cloud_canal stripe, cloud_ref =
-- son abonnement, cloud_formule business_cloud) ; son abonnement est remis sur le prix Business (étape Stripe, à part).
-- Ce script pose le canal « offert » + la marque beta_flags.cloud_offert = 'business' (règle : cloud-option.js,
-- cloudOffertSelonPalier, branchée dans stripe-webhook ; verrou selftest:cloud-offert-business) AVANT la remise du prix,
-- pour que le recalcul Stripe ne coupe RIEN : is_cloud reste vrai, cloud_voie, poste, IP 87 et plateformes intacts.
-- Sauvegarde AVANT écriture : public._backup_1911_cloud_offert_business. Inverse : 20261119_cloud_offert_business_faf5021a_INVERSE.sql.
-- Gardes : le compte est Business, son Cloud est encore celui pris chez Stripe le 19/11 (cloud_ref relu) ; sinon rien.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1911_cloud_offert_business AS
  SELECT id, is_cloud, cloud_canal, cloud_ref, cloud_formule, cloud_periode_fin, cloud_arret_fin_periode, beta_flags, now() AS sauve_le
    FROM public.profiles WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
ALTER TABLE public._backup_1911_cloud_offert_business ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1911_cloud_offert_business FROM PUBLIC, anon, authenticated;
UPDATE public.profiles
   SET is_cloud = true,
       cloud_canal = 'offert',
       cloud_ref = NULL,
       cloud_formule = NULL,
       cloud_periode_fin = NULL,
       cloud_arret_fin_periode = false,
       beta_flags = COALESCE(beta_flags, '{}'::jsonb) || '{"cloud_offert": "business"}'::jsonb
 WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
   AND is_business IS TRUE
   AND cloud_canal = 'stripe'
   AND cloud_ref = 'sub_1UHPhUQZRA77vrWJC7Khqxuq';
SELECT is_cloud, cloud_canal, cloud_ref, cloud_formule, cloud_periode_fin, cloud_voie, beta_flags ->> 'cloud_offert' AS offert_lie,
       public.cloud_etat(id) ->> 'etat' AS etat, (public.cloud_etat(id) ->> 'actif')::boolean AS actif
  FROM public.profiles WHERE id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
COMMIT;
