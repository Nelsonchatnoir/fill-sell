-- ═══════════════════════════════════════════════════════════════════════════
-- (15/10, P16) LES ÉCHECS PASSAGERS NE SONT PLUS DES PHOTOS ILLISIBLES
-- ═══════════════════════════════════════════════════════════════════════════
-- Toute URL de photo_empreintes_echecs est « illisible » pour le moteur de
-- rapprochement (rapprochement_v3_empreintes_compactes) et pour
-- fusion_photo_tick : sa fiche part sans photo, la paire devient
-- « titre_sans_photo ». Relevé du 15/10 : 498 « HTTP 429 » (tous de NOTRE
-- stockage, sous des rafales de 100 appels de 6 photos — ferreirasab : 139),
-- 47 « Cannot access 'ImageType' before initialization » (décodeur pas prêt),
-- 3 « error sending request » (réseau). La règle (empreintes-urls v7,
-- _shared/empreinte-telechargement.ts : EchecPassager) ne les note plus ; ces
-- lignes-ci sortent de la table pour que les appelants redemandent les photos,
-- par leurs chemins bornés habituels. Les vrais échecs (404, 415, hôte hors
-- liste, trop de pixels, image illisible) restent.
-- Sauvegarde : _backup_1510_empreintes_echecs_passagers (fermée à anon et
-- authenticated). Inverse : 20261015_empreintes_echecs_passagers_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_1510_empreintes_echecs_passagers AS
  SELECT * FROM public.photo_empreintes_echecs WHERE false;
REVOKE ALL ON public._backup_1510_empreintes_echecs_passagers FROM anon, authenticated;
ALTER TABLE public._backup_1510_empreintes_echecs_passagers ENABLE ROW LEVEL SECURITY;
INSERT INTO public._backup_1510_empreintes_echecs_passagers
  SELECT e.* FROM public.photo_empreintes_echecs e
   WHERE e.motif ~* '^HTTP (408|425|429|5[0-9][0-9])\y|error sending request|connection (reset|closed|refused)|timed? ?out|AbortError|aborted|Cannot access ''[A-Za-z]+'' before initialization|décodeur WebP : HTTP'
     AND NOT EXISTS (SELECT 1 FROM public._backup_1510_empreintes_echecs_passagers b WHERE b.url = e.url);
DELETE FROM public.photo_empreintes_echecs e
 USING public._backup_1510_empreintes_echecs_passagers b
 WHERE b.url = e.url AND b.motif = e.motif;
SELECT (SELECT count(*) FROM public._backup_1510_empreintes_echecs_passagers) sauvegardees,
       (SELECT count(*) FROM public.photo_empreintes_echecs) restantes_dans_la_table;
COMMIT;
