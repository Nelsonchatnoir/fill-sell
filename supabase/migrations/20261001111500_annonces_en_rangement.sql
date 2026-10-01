-- ══════════════════════════════════════════════════════════════════════════
-- RELEVÉ : PLUS D'ATTENTE MUETTE (01/10/2026)
-- ══════════════════════════════════════════════════════════════════════════
-- Depuis le 30/09 (ae57e81, 20260930203000_photo_avant_import), une annonce
-- relevée que rien ne reconnaît par identifiant attend l'empreinte de sa
-- photo avant d'être importée (rapprochement_photo_attente : passage chaque
-- minute, 30 min au plus). Mesuré sur 24 h au 01/10 : 4 min 19 s en moyenne,
-- 8 min au 9e décile, ~10 min au plus. Pendant ce temps, l'app montrait un
-- stock vide, la tuile « 8 annonces » et — pire — « 8 annonces relevées ne
-- correspondent à aucun article de ton stock » avec un bouton « Rattacher »
-- (chez mariecreativedigital : 2-3 min de stock vide sans un mot).
--
-- La table est fermée aux clients (RLS sans politique) et doit le rester :
-- cette lecture rend SEULEMENT les annonces du compte appelant encore en
-- attente — leur identifiant et leur plateforme, rien d'autre. L'app dit
-- « X annonces trouvées, rangement en cours », les retire de la file « à
-- rattacher » et relit le stock quand le rangement est fini.
-- Lecture seule : aucune règle de rattachement ne bouge, aucun doublon
-- possible de ce côté.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.annonces_en_rangement()
RETURNS TABLE (annonce_id uuid, platform text, cree_le timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.annonce_id, a.platform, a.cree_le
    FROM rapprochement_photo_attente a
   WHERE a.user_id = auth.uid()
     AND a.etat = 'attente'
   ORDER BY a.cree_le
   LIMIT 500;
$function$;

REVOKE ALL ON FUNCTION public.annonces_en_rangement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annonces_en_rangement() TO authenticated, service_role;

COMMENT ON FUNCTION public.annonces_en_rangement() IS
  '01/10 — annonces relevées du compte appelant encore en attente de leur empreinte photo (rangement en cours) ; lecture seule, auth.uid().';
