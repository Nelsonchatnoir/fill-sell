-- ═══════════════════════════════════════════════════════════════════════════
-- UN SEUL MAIL « LIEN DE L'EXTENSION » PAR PERSONNE (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════════════
-- Amandine LC (inscrite à 21:08) : welcome 21:08, extension_link 21:17 ET
-- 21:25 — deux taps « M'envoyer le lien », qu'un limiteur de 60 s laissait
-- passer. Règle (Nico) : un seul extension_link par personne.
--
-- send-extension-link refuse désormais tout second lien (lecture de
-- email_logs) et pose sa ligne AVANT l'envoi (dedup 'reservation'). Cet index
-- ferme la dernière porte : deux appels SIMULTANÉS — le second reçoit 23505
-- et n'envoie rien.
--
-- ⛔ Pourquoi pas email_logs_one_shot_unique : 202 lignes extension_link en
--    trop dans l'historique (931 personnes, jusqu'à 6 chacune, depuis le
--    09/08) — l'index ne pourrait pas se créer sans effacer du journal.
--    D'où un index DÉDIÉ, limité aux envois postérieurs à la bascule
--    (dernier envoi relevé : 25/09 19:50:24Z). Les personnes qui ont déjà un
--    lien plus ancien sont arrêtées par la garde de la fonction.

create unique index if not exists email_logs_extension_link_unique
  on public.email_logs (user_id)
  where email_type = 'extension_link'
    and sent_at >= '2026-09-25 20:30:00+00';
