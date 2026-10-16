-- ═══════════════════════════════════════════════════════════════════════════
-- 16/10/2026 (soir) — EFFACER CE QUE LA BÊTA A RELEVÉ SUR LE COMPTE BEEBS D'ORNELLA
-- ═══════════════════════════════════════════════════════════════════════════
-- Mission de Nico : pendant la clôture du chantier « messages + bordereaux », le Chrome de Nico était connecté
-- au compte Beebs d'Ornella (avec son accord). Consigne : « À la fin, efface de la base les conversations,
-- messages et commandes Beebs relevés sur son compte. »
-- ⛔ AUCUNE SAUVEGARDE, À DESSEIN : ce sont les messages d'une autre personne ; la consigne est de les effacer.
-- Portée : le SEUL compte FillSell de Nico (f44b5917-bccc-4431-ba41-f40571a2ed18), plateforme beebs seulement
-- (son propre compte Beebs n'a jamais été relevé : téléphone non vérifié). Les messages et réponses partent par
-- ON DELETE CASCADE avec leur conversation. `messagerie_releves` (horodatage et motif du dernier passage, aucun
-- contenu) est gardé. À relancer si un relevé a eu lieu entre ce passage et la reconnexion de Nico à SON Beebs.
-- Inverse : aucun (effacement voulu).

BEGIN;

SELECT 'avant' AS moment,
       (SELECT count(*) FROM public.messagerie_conversations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs') AS conversations,
       (SELECT count(*) FROM public.messagerie_messages m JOIN public.messagerie_conversations c ON c.id = m.conversation_id
         WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.platform = 'beebs') AS messages,
       (SELECT count(*) FROM public.messagerie_reponses WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs') AS reponses,
       (SELECT count(*) FROM public.plateforme_commandes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs') AS commandes;

DELETE FROM public.plateforme_commandes
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs';
DELETE FROM public.messagerie_conversations
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs';

SELECT 'apres' AS moment,
       (SELECT count(*) FROM public.messagerie_conversations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs') AS conversations,
       (SELECT count(*) FROM public.messagerie_reponses WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs') AS reponses,
       (SELECT count(*) FROM public.plateforme_commandes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'beebs') AS commandes;

COMMIT;
