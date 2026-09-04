-- 2026-09-04 — Republication : PAUSE DE RESPIRATION + PLAFOND PAR PALIER
--
-- Pourquoi. Le plafond unique de 45/jour (posé le 29/08 contre la campagne
-- anti-bot Vinted du 21/07) DÉMENT l'offre : 45 × 30 = 1350/mois, alors que
-- coin_config.quota_republication_premium = 1500 et
-- quota_republication_pro = 5000. Les deux quotas vendus étaient
-- inatteignables. Et 45/jour ne protège pas de ce que Vinted sanctionne
-- vraiment : /listing-restriction vise la RAFALE, pas le total d'une journée.
--
-- Nouveau régime, lu par get-pending-jobs (etatPlafondRepublish) :
--   · PAUSE : après `republish_pause_apres` republications d'affilée, la file
--     souffle `republish_pause_duree_min` minutes, puis repart seule.
--     « D'affilée » = train de republications réussies dont chaque intervalle
--     est plus court que la pause elle-même. Aucun état stocké : un PC éteint
--     3 h casse la séquence et remet le compteur à zéro — la pause ne s'ajoute
--     JAMAIS à une absence déjà subie.
--   · PLAFOND JOURNALIER PAR PALIER (filet, jour calendaire Europe/Paris) :
--       premium  50/jour → 1500/mois, exactement le quota vendu
--       pro     170/jour → 5100/mois, au-dessus des 5000 vendus
--       business 100000  → illimité en pratique (aucun palier ne l'atteint).
--     Pas de valeur sentinelle : la règle est uniforme, « le plafond est la
--     valeur de la clé », toujours un entier strictement positif. Une valeur
--     <= 0 est traitée comme une clé mal posée et retombe sur le repli — on
--     ne reproduit pas le piège de check_inventory_limit, où 0 VERROUILLE.
--
-- Free n'a PAS de clé : il garde `republish_plafond_jour` (45), inchangé. Son
-- vrai gouvernail est republication_avie_free (50 à VIE), une limite
-- COMMERCIALE qui n'a rien à voir avec ce filet technique.
--
-- `republish_plafond_jour` = 45 est CONSERVÉE et devient le REPLI : elle sert
-- quand le palier est illisible (lecture de profiles ratée) ou quand la clé du
-- palier est absente. Ne pas la supprimer : sans elle, une lecture ratée
-- retirerait le filet au lieu de le maintenir.
--
-- Idempotente : DO NOTHING — ne jamais écraser un réglage ajusté à la main
-- ensuite (même convention que 20260829130000).
-- Aucune table, aucune colonne, aucun GRANT : coin_config existe déjà et est
-- déjà lisible par `authenticated`.

INSERT INTO public.coin_config (key, value) VALUES
  ('republish_pause_apres',            50),
  ('republish_pause_duree_min',       120),
  ('republish_plafond_jour_premium',   50),
  ('republish_plafond_jour_pro',      170),
  ('republish_plafond_jour_business', 100000)
ON CONFLICT (key) DO NOTHING;

-- RETOUR ARRIÈRE (régime du 29/08 : 45/jour pour tous, aucune pause) :
--   DELETE FROM public.coin_config WHERE key IN (
--     'republish_pause_apres', 'republish_pause_duree_min',
--     'republish_plafond_jour_premium', 'republish_plafond_jour_pro',
--     'republish_plafond_jour_business');
-- Effet immédiat au poll suivant, sans redéploiement : les clés absentes
-- rendent la pause INACTIVE et tous les paliers retombent sur
-- republish_plafond_jour = 45.
