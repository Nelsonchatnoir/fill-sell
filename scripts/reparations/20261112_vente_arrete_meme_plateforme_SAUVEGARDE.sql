-- SAUVEGARDE avant la migration 20261112140000_vente_arrete_meme_plateforme (12/11/2026, point 2 de Nico : une vente
-- arrête aussi les tâches non publiées de SA plateforme).
-- La migration n'écrit AUCUNE ligne : elle réécrit une fonction (enregistrer_vente_atomique). Ce qui est sauvegardé : sa
-- définition de prod (commentaires compris, en base seulement), son empreinte et ses droits, juste avant ; et, pour mémoire,
-- l'empreinte de deux témoins jamais touchés (armer_retrait_job_pour, retrait_job_prouve).
-- ⛔ Garde : si la fonction a changé en prod depuis la lecture du 12/11/2026 vers 11:20 (md5 ci-dessous), RIEN n'est écrit et
--    la migration ne doit PAS être appliquée (elle est faite depuis cette définition-là).
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261112_vente_arrete_meme_plateforme_SAUVEGARDE.sql
-- Retour : supabase/rollbacks/20261112140000_vente_arrete_meme_plateforme_INVERSE.sql (le code de prod, jeton pour jeton) ;
-- la définition exacte, commentaires compris, reste dans public._backup_1112_vente_arrete_meme_plateforme.
DO $garde$
DECLARE v text;
BEGIN
  SELECT md5(pg_get_functiondef('public.enregistrer_vente_atomique(uuid,text,bigint,uuid,numeric,numeric,integer,integer,text)'::regprocedure)) INTO v;
  IF v IS DISTINCT FROM 'd0efd535b771fefdf0ab8220ebac80bc' THEN
    RAISE EXCEPTION 'enregistrer_vente_atomique a changé en prod depuis le 12/11 11:20 (%) : rien n''est écrit, NE PAS appliquer la migration', v;
  END IF;
END $garde$;

CREATE TABLE public._backup_1112_vente_arrete_meme_plateforme AS
SELECT now() AS le, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def, md5(pg_get_functiondef(p.oid)) AS md5, p.proacl::text AS droits,
       p.prosecdef AS security_definer, p.proconfig::text AS config,
       p.proname = 'enregistrer_vente_atomique' AS reecrite
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('enregistrer_vente_atomique', 'armer_retrait_job_pour', 'retrait_job_prouve');
ALTER TABLE public._backup_1112_vente_arrete_meme_plateforme ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1112_vente_arrete_meme_plateforme FROM PUBLIC, anon, authenticated;

SELECT count(*) AS n, string_agg(nom || '=' || md5 || CASE WHEN reecrite THEN ' (réécrite)' ELSE ' (témoin)' END, ' ' ORDER BY nom) AS detail
  FROM public._backup_1112_vente_arrete_meme_plateforme;
-- Attendu : 3 — enregistrer_vente_atomique=d0efd535b771fefdf0ab8220ebac80bc (réécrite), plus les deux témoins.
