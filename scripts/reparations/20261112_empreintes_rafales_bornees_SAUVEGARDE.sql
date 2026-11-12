-- SAUVEGARDE avant la migration 20261112160000_empreintes_rafales_bornees (12/11/2026, point 5, GO de Nico : pas plus de 10
-- appels d'empreintes à la fois).
-- La migration n'écrit AUCUNE ligne : elle réécrit une fonction (rapprochement_v3_empreinter). Sauvegardés : sa définition de
-- prod, son empreinte et ses droits, juste avant ; et, pour mémoire, le témoin jamais touché fusion_photo_tick.
-- ⛔ Garde : si la fonction a changé en prod depuis la lecture du 12/11/2026 vers 15:10, RIEN n'est écrit et la migration ne
--    doit PAS être appliquée.
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261112_empreintes_rafales_bornees_SAUVEGARDE.sql
DO $garde$
DECLARE v text;
BEGIN
  SELECT md5(pg_get_functiondef('public.rapprochement_v3_empreinter(text[],integer,integer)'::regprocedure)) INTO v;
  IF v IS DISTINCT FROM '84047aafee4b325fa6f5a91db3665f3b' THEN
    RAISE EXCEPTION 'rapprochement_v3_empreinter a changé en prod depuis le 12/11 15:10 (%) : rien n''est écrit, NE PAS appliquer la migration', v;
  END IF;
END $garde$;

CREATE TABLE public._backup_1112_empreintes_rafales_bornees AS
SELECT now() AS le, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl::text AS droits,
       p.prosecdef AS security_definer, p.proconfig::text AS config,
       p.proname = 'rapprochement_v3_empreinter' AS reecrite
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('rapprochement_v3_empreinter', 'fusion_photo_tick');
ALTER TABLE public._backup_1112_empreintes_rafales_bornees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1112_empreintes_rafales_bornees FROM PUBLIC, anon, authenticated;

SELECT count(*) AS n, string_agg(nom || '=' || md5 || CASE WHEN reecrite THEN ' (réécrite)' ELSE ' (témoin)' END, ' ' ORDER BY nom) AS detail
  FROM public._backup_1112_empreintes_rafales_bornees;
-- Attendu : 2 — fusion_photo_tick=736ca78603646997859c418bafd88acf (témoin)
--   rapprochement_v3_empreinter=84047aafee4b325fa6f5a91db3665f3b (réécrite).
