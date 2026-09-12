-- ═══════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE — 3bis : LE MODULE EST UNE FONCTIONNALITÉ PRO
-- 2026-09-12, 15h40 — même correction que la 4bis, côté fonctions de la 3/5.
-- ═══════════════════════════════════════════════════════════════════════════
-- Les trois fonctions de la 3/5 qui portent un gate de palier acceptaient
-- « premium, pro, business » (l'orientation du matin, annulée par Nico à
-- 15h30 : la republication automatique reste réservée au PRO). Resserrage à
-- « pro, business » — business porte is_pro, flags cumulatifs — dans :
--   · republish_planifiee_reglage  : un réglage posé par un non-Pro est
--     INVALIDE ('palier') → actif = false, le sweep l'ignore ;
--   · republish_planifiee_etat     : `autorise` = pro/business seulement ;
--   · republish_planifiee_regler   : un non-Pro reçoit 'auto_reserve_pro'
--     (même code que le RPC), rien n'est écrit.
-- Patch par ANCRE (comme la 4bis) : on relit chaque définition en prod, on
-- exige le texte exact, on ne remplace que lui, sinon EXCEPTION et rien n'est
-- écrit. Idempotent (déjà resserré → NOTICE). Sans effet observable
-- aujourd'hui : 0 compte avec un réglage, interrupteur republish_planifiee_
-- actif à 0, l'app n'appelle pas encore ces fonctions.
-- Le fichier 20260912130200 est corrigé en miroir pour qu'un rejeu
-- reproduise l'état de prod.
DO $do$
DECLARE d text; ancre text; remplacement text; n integer := 0;
BEGIN
  -- 1. republish_planifiee_reglage
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
  WHERE n2.nspname = 'public' AND p.proname = 'republish_planifiee_reglage';
  IF d IS NULL THEN RAISE EXCEPTION 'republish_planifiee_reglage introuvable'; END IF;
  ancre := 'IF v_palier NOT IN (''premium'', ''pro'', ''business'') THEN v_invalide := ''palier''; END IF;';
  remplacement := 'IF v_palier NOT IN (''pro'', ''business'') THEN v_invalide := ''palier''; END IF;';
  IF position(remplacement in d) > 0 THEN
    RAISE NOTICE 'republish_planifiee_reglage : déjà resserré';
  ELSIF position(ancre in d) = 0 THEN
    RAISE EXCEPTION 'republish_planifiee_reglage : ancre introuvable — rien n''est écrit';
  ELSE
    EXECUTE replace(d, ancre, remplacement); n := n + 1;
  END IF;

  -- 2. republish_planifiee_etat
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
  WHERE n2.nspname = 'public' AND p.proname = 'republish_planifiee_etat';
  IF d IS NULL THEN RAISE EXCEPTION 'republish_planifiee_etat introuvable'; END IF;
  ancre := '''autorise'', v_palier IN (''premium'', ''pro'', ''business''),';
  remplacement := '''autorise'', v_palier IN (''pro'', ''business''),';
  IF position(remplacement in d) > 0 THEN
    RAISE NOTICE 'republish_planifiee_etat : déjà resserré';
  ELSIF position(ancre in d) = 0 THEN
    RAISE EXCEPTION 'republish_planifiee_etat : ancre introuvable — rien n''est écrit';
  ELSE
    EXECUTE replace(d, ancre, remplacement); n := n + 1;
  END IF;

  -- 3. republish_planifiee_regler
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
  WHERE n2.nspname = 'public' AND p.proname = 'republish_planifiee_regler';
  IF d IS NULL THEN RAISE EXCEPTION 'republish_planifiee_regler introuvable'; END IF;
  ancre := 'IF v_palier NOT IN (''premium'', ''pro'', ''business'') THEN' || E'\n' ||
           '    RETURN jsonb_build_object(''ok'', false, ''reason'', ''auto_reserve_pro'');';
  remplacement := 'IF v_palier NOT IN (''pro'', ''business'') THEN' || E'\n' ||
           '    RETURN jsonb_build_object(''ok'', false, ''reason'', ''auto_reserve_pro'');';
  IF position(remplacement in d) > 0 THEN
    RAISE NOTICE 'republish_planifiee_regler : déjà resserré';
  ELSIF position(ancre in d) = 0 THEN
    RAISE EXCEPTION 'republish_planifiee_regler : ancre introuvable — rien n''est écrit';
  ELSE
    EXECUTE replace(d, ancre, remplacement); n := n + 1;
  END IF;

  RAISE NOTICE '3bis : % fonction(s) resserrée(s) à pro/business', n;
END
$do$;

-- Contrôle :
--   SELECT p.proname,
--          pg_get_functiondef(p.oid) LIKE '%(''pro'', ''business'')%' AS pro_seul,
--          pg_get_functiondef(p.oid) NOT LIKE '%(''premium'', ''pro'', ''business'')%' AS premium_absent
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('republish_planifiee_reglage','republish_planifiee_etat','republish_planifiee_regler');
