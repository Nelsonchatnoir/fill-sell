-- ⏳ NON APPLIQUÉE — SQL à montrer à Nico, application UNE PAR UNE après feu
-- vert explicite (jamais de db push).
--
-- Plafond quotidien d'EXÉCUTION des republications (2026-08-29, campagne
-- Vinted anti-republication du 21/07/2026 — cas nadegemarcelin78, restreinte
-- le 29/08 après 96 republications la veille).
-- La clé est lue par l'EXTENSION (qui applique le plafond : au-delà, elle
-- cesse de prendre de nouvelles republications, les pending attendent demain)
-- et par l'app (affichage « N faites aujourd'hui — les M restantes reprennent
-- demain »). Les deux ont un défaut local de 100 : tant que cette ligne n'est
-- pas posée, le comportement est identique — la clé sert à pouvoir BAISSER
-- sans déploiement.
-- 100 = filet contre l'emballement, pas une bride : le record du parc est 96
-- en une journée. Le plafond doit rester quasi inactif pour que le test de la
-- cadence irrégulière soit propre.
-- Comptage côté clients : jobs republish 'published' du jour Europe/Paris.
-- coin_config : SELECT ouvert à authenticated (policy « readable by all
-- users », 20260706100000) — aucune RPC nécessaire.
-- Idempotente : DO NOTHING (ne jamais écraser un réglage posé ensuite à la
-- main).

INSERT INTO public.coin_config (key, value)
VALUES ('republish_plafond_jour', 100)
ON CONFLICT (key) DO NOTHING;
