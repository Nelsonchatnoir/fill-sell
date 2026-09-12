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
--   entre deux republications abouties consécutives. C'est le REPLI de la
--   formule de capacité (republish_planifiee_espacement, 3/5) quand le
--   compte n'a pas assez d'historique propre (< 10 intervalles).
--   ⚠️ MESURE FIGÉE À LA MAIN — D'OÙ VIENT 354 :
--     date de la mesure : 2026-09-12, 11h Paris ;
--     fenêtre : 30 jours glissants, jobs republish 'published' du parc
--     entier, intervalles entre deux aboutis consécutifs d'un même compte,
--     < 2 h (au-delà : nuit ou pause), 1 752 intervalles ;
--     résultat : médiane 5,9 min = 354 s (p10 3,1 min, p90 18,1 min).
--   À RECALER : une fois par mois (le 1er, avec les autres relevés du
--   digest), ET après tout changement de cadence de l'extension
--   (POLL_INTERVAL_MINUTES, JOB_DELAY_MS, REPUBLISH_ESPACEMENT_MS,
--   l'attente retrait → recréation) — c'est la cadence de l'extension qui
--   fait ce nombre, pas Vinted. La requête de recalage, à rejouer telle
--   quelle et à poser par UPDATE (updated_at = now()) :
--     WITH s AS (
--       SELECT extract(epoch FROM (published_at - lag(published_at)
--                OVER (PARTITION BY user_id ORDER BY published_at))) AS ecart
--       FROM public.cross_post_jobs
--       WHERE action = 'republish' AND status = 'published'
--         AND published_at > now() - interval '30 days')
--     SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY ecart)), count(*)
--     FROM s WHERE ecart > 0 AND ecart < 7200;
--   Jamais une constante optimiste dans le code : la clé est le seul
--   endroit où ce nombre vit.
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
