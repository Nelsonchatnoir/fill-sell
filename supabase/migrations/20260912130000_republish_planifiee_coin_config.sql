-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE (créneaux) — 1/5 : réglages coin_config
-- 2026-09-12, décisions Nico (réponses au dossier du matin).
-- ═══════════════════════════════════════════════════════════════════════════
-- · republish_plafond_jour_premium : 170 → 50.
--   Le 170 lu en prod le 12/09 n'est ni celui de la migration 20260904120000
--   (50) ni celui de la mémoire du 04/09 (50) : posé à la main, updated_at
--   non touché, aucune trace. Décision Nico : « c'était une erreur, pas une
--   décision » → retour à 50. Quota mensuel premium (1500) inchangé.
--   ⚠️ UPDATE VOULU, à l'inverse du DO NOTHING habituel : c'est précisément
--   le réglage manuel qu'on corrige. Conditionné à « value <> 50 » pour
--   rester idempotent sans réécrire updated_at à chaque rejeu.
--   Effet immédiat au poll suivant (get-pending-jobs lit la clé à chaque
--   calcul de retenue) : un Premium qui a déjà passé 50 aujourd'hui voit sa
--   file retenue jusqu'à minuit Paris — c'est le régime voulu.
--
-- · republish_espacement_parc_sec : espacement médian mesuré sur le PARC
--   entre deux republications abouties consécutives (mesure du 12/09 sur
--   30 jours : 1 752 intervalles < 2 h, médiane 5,9 min = 354 s). C'est le
--   REPLI de la formule de capacité (republish_planifiee_espacement, 3/5)
--   quand le compte n'a pas assez d'historique propre (< 10 intervalles).
--   Jamais une constante optimiste dans le code : à recaler ici, à la main,
--   quand la cadence du parc bouge.
--
-- · republish_planifiee_actif : interrupteur GLOBAL de la branche planifiée
--   du sweep serveur (5/5). 0 = la branche ne crée AUCUN job (les réglages
--   s'écrivent, l'app affiche l'état, l'historique reste vide). ÉTEINT À LA
--   POSE, comme republish_auto_serveur_actif : une clé oubliée n'allume
--   jamais un automate. À passer à 1 quand l'app est servie.
--
-- Pro (170 / 5000) et Business (illimité) : inchangés.
-- Idempotente. Retour arrière : UPDATE … SET value = 170 sur la clé premium
-- (les deux autres clés sont inertes tant que le code 3/5 et 5/5 n'est pas
-- en place, et le sweep planifié ne lit pas une clé absente comme « 1 »).

UPDATE public.coin_config SET value = 50, updated_at = now()
WHERE key = 'republish_plafond_jour_premium' AND value <> 50;

INSERT INTO public.coin_config (key, value) VALUES
  ('republish_espacement_parc_sec', 354),
  ('republish_planifiee_actif',       0)
ON CONFLICT (key) DO NOTHING;

-- Contrôle :
--   SELECT key, value, updated_at FROM public.coin_config
--   WHERE key IN ('republish_plafond_jour_premium','republish_espacement_parc_sec','republish_planifiee_actif');
