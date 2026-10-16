-- ═══════════════════════════════════════════════════════════════════════════
-- 16/10/2026 — BÊTA MESSAGERIE : 4 MESSAGES eBAY ÉCRITS AVEC LE HTML BRUT
-- ═══════════════════════════════════════════════════════════════════════════
-- Premier relevé réel (ebay-messagerie v1, 15:28 Paris, compte de Nico seul) :
-- `Content` de GetMyMessages est du HTML (≈ 4 000 caractères de <head>/<style>
-- avant le <body>) ; v1 le gardait tel quel, coupé à 4 000 → le style, jamais le
-- message. Corrigé dans _shared/messagerie-ebay.js (texteDuHtml), ebay-messagerie v2.
-- Ici : ces messages sont EFFACÉS pour être relus (le relevé ne relit que les
-- messages absents de la base). Seules lignes visées : eBay, compte de Nico,
-- texte qui commence par une balise.
-- Pas de sauvegarde du contenu (texte de messages = donnée minimale, jamais copiée).
-- INVERSE : relancer le relevé (ebay-messagerie, mode releve) — les messages
-- reviennent d'eBay, cette fois en texte.
BEGIN;
SELECT count(*) AS a_effacer
  FROM public.messagerie_messages m JOIN public.messagerie_conversations c ON c.id = m.conversation_id
 WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.platform = 'ebay' AND m.texte ~ '^\s*<';
DELETE FROM public.messagerie_messages m USING public.messagerie_conversations c
 WHERE c.id = m.conversation_id AND c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
   AND c.platform = 'ebay' AND m.texte ~ '^\s*<';
COMMIT;
