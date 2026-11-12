-- SAUVEGARDE avant la migration 20261111210000_remise_en_file_compteurs (12/11/2026, correctif « a » du plan de nuit de
-- Nico : « remettre une tâche en file = remettre à zéro TOUS ses compteurs d'essais »).
-- La migration n'écrit AUCUNE ligne : elle crée public.republication_remise_en_file(pf, par, motif) et réécrit
-- public.relancer_republish (UNE ligne ajoutée, droits inchangés). Ce qui est sauvegardé : la définition de prod de
-- relancer_republish, son empreinte et ses droits, juste avant.
-- ⛔ Garde : si relancer_republish a changé en prod depuis sa lecture du 11/11 vers 20:35 (md5 ci-dessous), RIEN n'est
--    écrit et la migration ne doit PAS être appliquée (elle est faite depuis cette définition-là) ; idem si la jumelle
--    existe déjà.
-- Retour : supabase/rollbacks/20261111210000_remise_en_file_compteurs_INVERSE.sql (la définition de prod, à l'octet).
DO $garde$
DECLARE v text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'relancer_republish';
  IF v IS DISTINCT FROM '58ff40728065f2d93a99b031cffa7cc8' THEN
    RAISE EXCEPTION 'relancer_republish a changé en prod (md5 %) : rien n''est écrit, NE PAS appliquer la migration', v;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'republication_remise_en_file') THEN
    RAISE EXCEPTION 'republication_remise_en_file existe déjà : rien n''est écrit';
  END IF;
  IF to_regclass('public._backup_1112_remise_en_file_fonctions') IS NOT NULL THEN
    RAISE EXCEPTION 'sauvegarde déjà présente : rien n''est écrit';
  END IF;
END $garde$;

CREATE TABLE public._backup_1112_remise_en_file_fonctions AS
SELECT now() AS le, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl::text AS droits
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'relancer_republish';
ALTER TABLE public._backup_1112_remise_en_file_fonctions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1112_remise_en_file_fonctions FROM PUBLIC, anon, authenticated;

SELECT nom, md5, droits FROM public._backup_1112_remise_en_file_fonctions;
-- Attendu : relancer_republish, 58ff40728065f2d93a99b031cffa7cc8, {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}.
