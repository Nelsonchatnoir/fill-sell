-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE — 4bis : L'AUTO RESTE RÉSERVÉE AU PRO
-- 2026-09-12, 15h30 — correction Nico (le point 6 du matin, « ouvrir l'auto à
-- Premium », était une erreur d'orientation ; la republication automatique
-- est une fonctionnalité PRO, comme avant).
-- ═══════════════════════════════════════════════════════════════════════════
-- La 4/5 (20260912130300) a changé TROIS choses dans spend_coins_and_republish.
-- Celle-ci n'en défait qu'UNE : le gate de la voie auto redevient
--   IF v_prof.is_pro IS NOT TRUE THEN … 'auto_reserve_pro'
-- exactement le texte d'avant la 4/5 (sauvegarde public.sauvegarde_fn_spend_
-- republish_1209). La voie PLANIFIÉE (plafond du réglage, minuit local, par
-- boutique) et la voie HISTORIQUE (inchangée) restent telles quelles.
--
-- POURQUOI UN PATCH CIBLÉ et pas « retour arrière complet + 4 corrigée » :
-- le DO ci-dessous relit la définition EN PROD, exige l'ancre exacte du gate
-- posé par la 4/5 (sinon EXCEPTION, rien n'est écrit) et ne remplace que ces
-- trois lignes. Aucune autre ligne ne peut changer par accident, et on ne
-- repasse pas par un état intermédiaire (l'ancienne définition sans voie
-- planifiée) pendant que le sweep témoin tourne. Idempotent : déjà patché →
-- NOTICE, rien d'écrit.
-- Retour arrière : la commande unique depuis la sauvegarde (définition
-- d'AVANT la 4/5, qui n'a jamais eu l'ouverture Premium).
DO $do$
DECLARE d text; ancre text; remplacement text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname = 'spend_coins_and_republish';
  IF d IS NULL THEN RAISE EXCEPTION 'spend_coins_and_republish introuvable'; END IF;
  IF d LIKE '%IF v_prof.is_pro IS NOT TRUE THEN%' AND d NOT LIKE '%IF v_tier NOT IN (''premium'', ''pro'', ''business'') THEN%' THEN
    RAISE NOTICE 'spend_coins_and_republish : gate PRO déjà en place, rien à faire';
    RETURN;
  END IF;
  ancre :=
    '    -- (1) Ouverture à Premium (12/09) : l''auto est réservée aux ABONNÉS.' || E'\n' ||
    '    -- Code de refus CONSERVÉ (''auto_reserve_pro'') — cf. bandeau.' || E'\n' ||
    '    IF v_tier NOT IN (''premium'', ''pro'', ''business'') THEN';
  IF position(ancre in d) = 0 THEN
    RAISE EXCEPTION 'spend_coins_and_republish : ancre du gate 4/5 introuvable — rien n''est écrit';
  END IF;
  remplacement :=
    '    -- (1) L''auto RESTE RÉSERVÉE AU PRO (correction Nico 12/09 15h30 : l''ouverture' || E'\n' ||
    '    -- aux abonnés de la 4/5 était une erreur d''orientation). Gate IDENTIQUE à' || E'\n' ||
    '    -- celui d''avant la 4/5 ; code de refus inchangé.' || E'\n' ||
    '    IF v_prof.is_pro IS NOT TRUE THEN';
  d := replace(d, ancre, remplacement);
  EXECUTE d;
END
$do$;

-- Contrôle :
--   SELECT pg_get_functiondef(p.oid) LIKE '%IF v_prof.is_pro IS NOT TRUE THEN%'
--      AND pg_get_functiondef(p.oid) NOT LIKE '%NOT IN (''premium'', ''pro'', ''business'')%'
--      AND pg_get_functiondef(p.oid) LIKE '%VOIE PLANIFIÉE%'
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'spend_coins_and_republish';
