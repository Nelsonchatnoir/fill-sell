-- ═══════════════════════════════════════════════════════════════════════════
-- « RENVOYER LE LIEN D'EXTENSION » : UNE DEMANDE N'EST JAMAIS BLOQUÉE (01/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Depuis le 25/09 (20260925203401), un seul extension_link par personne : le
-- bouton « M'envoyer le lien » répondait 200 « throttle » sans rien envoyer à
-- qui avait déjà reçu un lien un jour, et l'app affichait « Lien envoyé à … ».
-- Cas domagalajessica (01/10 11:13) : dernier lien reçu le 13/08, rien parti.
-- Mesuré : 16 comptes, 25 demandes sans envoi depuis le 25/09 22:30.
--
-- Règle de Nico (01/10) : une demande explicite part toujours ; seule une
-- limite anti-rafale (un envoi par minute et par compte) la retient, et l'app
-- le dit. send-extension-link journalise APRÈS l'envoi réel (dedup
-- 'journal') : cet index d'unicité, qui interdisait un second lien à vie,
-- disparaît.
-- Retour arrière : supabase/rollbacks/20261001133000_lien_extension_redemande.sql
-- ═══════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';
DROP INDEX IF EXISTS public.email_logs_extension_link_unique;
