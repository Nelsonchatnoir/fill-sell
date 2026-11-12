-- SAUVEGARDE avant la migration 20261112213000_releve_jamais_depuis_notre_depot (12/11/2026, point 1a de Nico : « un
-- relevé ne complète JAMAIS une fiche à partir de notre propre dépôt »). NON EXÉCUTÉE : feu vert de Nico requis.
-- La migration n'écrit AUCUNE ligne : elle crée annonce_vient_de_notre_depot et réécrit deux fonctions
-- (fiche_completer_depuis_annonce, inventaire_attributs_avant_update). Sauvegardés : leurs définitions de prod, leurs
-- empreintes et leurs droits, juste avant ; et, pour mémoire, les témoins jamais touchés (inventaire_attributs_fusion,
-- inventaire_attributs_rang, annonce_vers_fiche, le déclencheur inventaire_attributs_fusion_trg).
-- ⛔ Garde : si l'une des deux fonctions a changé en prod depuis la lecture du 12/11 vers 22:00, RIEN n'est écrit et la
--    migration ne doit PAS être appliquée (la régénérer depuis pg_get_functiondef).
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261112_releve_jamais_depuis_notre_depot_SAUVEGARDE.sql
DO $garde$
DECLARE v1 text; v2 text;
BEGIN
  IF to_regclass('public._backup_1112_releve_jamais_depuis_notre_depot') IS NOT NULL THEN
    RAISE EXCEPTION 'sauvegarde déjà passée (table présente) : rien n''est écrit';
  END IF;
  SELECT md5(pg_get_functiondef('public.fiche_completer_depuis_annonce(uuid)'::regprocedure)) INTO v1;
  SELECT md5(pg_get_functiondef('public.inventaire_attributs_avant_update()'::regprocedure)) INTO v2;
  IF v1 IS DISTINCT FROM '041d772227b9a4a15465f7c4c7724f93' OR v2 IS DISTINCT FROM '0f714c6870080895bed1d0e9ee4035ca' THEN
    RAISE EXCEPTION 'définitions changées en prod depuis le 12/11 (% / %) : rien n''est écrit, NE PAS appliquer la migration', v1, v2;
  END IF;
  IF to_regprocedure('public.annonce_vient_de_notre_depot(bigint,uuid,text,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'annonce_vient_de_notre_depot existe déjà : la migration a-t-elle été appliquée ? rien n''est écrit';
  END IF;
END $garde$;

CREATE TABLE public._backup_1112_releve_jamais_depuis_notre_depot AS
SELECT now() AS le, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl::text AS droits,
       p.prosecdef AS security_definer, p.proconfig::text AS config,
       p.proname IN ('fiche_completer_depuis_annonce', 'inventaire_attributs_avant_update') AS reecrite
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('fiche_completer_depuis_annonce', 'inventaire_attributs_avant_update', 'inventaire_attributs_fusion',
                     'inventaire_attributs_rang', 'annonce_vers_fiche');
INSERT INTO public._backup_1112_releve_jamais_depuis_notre_depot (le, nom, args, def, md5, droits, security_definer, config, reecrite)
SELECT now(), 'declencheur:' || t.tgname, NULL, pg_get_triggerdef(t.oid), md5(pg_get_triggerdef(t.oid)), NULL, NULL, NULL, false
  FROM pg_trigger t WHERE t.tgrelid = 'public.inventaire'::regclass AND t.tgname = 'inventaire_attributs_fusion_trg';
ALTER TABLE public._backup_1112_releve_jamais_depuis_notre_depot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1112_releve_jamais_depuis_notre_depot FROM PUBLIC, anon, authenticated;

SELECT count(*) AS n, string_agg(nom || '=' || md5 || CASE WHEN reecrite THEN ' (réécrite)' ELSE ' (témoin)' END, ' ' ORDER BY nom) AS detail
  FROM public._backup_1112_releve_jamais_depuis_notre_depot;
-- Attendu : 6 — fiche_completer_depuis_annonce=041d772227b9a4a15465f7c4c7724f93 (réécrite),
--   inventaire_attributs_avant_update=0f714c6870080895bed1d0e9ee4035ca (réécrite),
--   inventaire_attributs_fusion=089e0eca23e584f532b53b8f8e19235a, inventaire_attributs_rang=6d4a013b090089d89da0c3486ffd91e8,
--   annonce_vers_fiche, declencheur:inventaire_attributs_fusion_trg (témoins).
