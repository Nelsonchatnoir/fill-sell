-- ═══════════════════════════════════════════════════════════════════════════
-- 16/10/2026 — BÊTA MESSAGERIE : EXTRAIT DES 2 CONVERSATIONS eBAY DE NICO
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 3e relevé (ebay-messagerie v2) a remplacé l'extrait par l'OBJET du mail
-- eBay (aucun texte relu ce passage) — corrigé en v3 (l'extrait ne vient que
-- d'un texte lu, sinon la base garde le précédent). Ici : l'extrait est
-- recalculé depuis le dernier message stocké de chaque conversation eBay du
-- compte de Nico. Rien d'autre n'est touché.
-- INVERSE : sans objet (l'extrait se recalcule au prochain message).
BEGIN;
UPDATE public.messagerie_conversations c
   SET dernier_extrait = (
         SELECT CASE WHEN char_length(t) > 140 THEN left(t, 139) || '…' ELSE t END
           FROM (SELECT btrim(regexp_replace(m.texte, '\s+', ' ', 'g')) AS t
                   FROM public.messagerie_messages m
                  WHERE m.conversation_id = c.id AND m.texte IS NOT NULL
                  ORDER BY m.envoye_le DESC LIMIT 1) d),
       maj_le = now()
 WHERE c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND c.platform = 'ebay';
SELECT count(*) AS conversations, count(dernier_extrait) AS avec_extrait
  FROM public.messagerie_conversations
 WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND platform = 'ebay';
COMMIT;
