-- (30/10, lot D, décision de Nico : « on teste ce soir en réel sur mon compte, avec l'essai de 7 jours, puis
-- résiliation ») Nico quitte l'option OFFERTE pour que le vrai parcours web s'ouvre (create-checkout-session refuse
-- un nouveau paiement à qui a déjà l'option par un autre canal). Le drapeau témoin (beta_flags.cloud) RESTE.
-- Son navigateur Cloud s'éteint jusqu'au début de l'essai Stripe (cloud_etat redevient « aucun »).
-- À lancer juste avant le test. Inverse : 20261030_cloud_nico_offert_vers_essai_stripe_INVERSE.sql
BEGIN;
UPDATE public.profiles SET is_cloud = NULL, cloud_canal = NULL
 WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND cloud_canal = 'offert';
SELECT is_cloud, cloud_canal, beta_flags ->> 'cloud' AS temoin, public.cloud_etat(id) ->> 'etat' AS etat,
       cloud_essai_debut, cloud_cgu_version FROM public.profiles WHERE id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
COMMIT;
