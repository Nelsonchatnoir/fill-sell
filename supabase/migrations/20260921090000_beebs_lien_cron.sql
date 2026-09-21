-- ═══════════════════════════════════════════════════════════════════════════
-- LE LIEN D'UN DÉPÔT BEEBS N'ATTEND PLUS QUE LA PERSONNE OUVRE SON NAVIGATEUR
-- 2026-09-21
--
-- Un dépôt Beebs part en modération humaine : Beebs ne rend aucun lien à cet
-- instant, 339 fois sur 339. Le lien venait ensuite de la re-capture différée
-- de l'extension, qui navigue dans « Mes annonces » — donc seulement quand la
-- personne rouvre Beebs, et seulement sur la PREMIÈRE page de sa liste (197
-- annonces indexées contre 60 rendues, relevé du 19/09).
--
-- Mesuré le 21/09 : 21 dépôts du parc sont 'published' sans listing_url, dont
-- 2 sur des articles VENDUS dont le retrait attend ce lien (règle du 11/09 :
-- sans lien, on ne retire JAMAIS par le titre) — le pantalon Sandro de
-- meminiandmove, vendu le 20/09 à 22:42, et le T-shirt d'Ornella du 18/09.
--
-- beebs-lien lit l'index public de Beebs (le même que leur propre recherche)
-- et apparie chaque dépôt à son annonce par la date de création à la seconde.
-- Toutes les 5 minutes : la modération se compte en heures, mais un retrait
-- qui attend, lui, se compte en minutes.
--
-- ⛔ IDEMPOTENTE. `cron.schedule` sur un nom existant DUPLIQUE le job (c'est
--    exactement ce qui est arrivé à handler-watch-3min) : on désinscrit
--    d'abord, sans échouer si le job n'existe pas.
-- ⛔ La fonction est déployée avec --no-verify-jwt et porte sa garde
--    x-cron-secret : verify_jwt=false n'est JAMAIS « pas d'authentification »,
--    c'est « l'authentification est faite par la fonction ».
-- ═══════════════════════════════════════════════════════════════════════════
DO $cron$
BEGIN
  PERFORM cron.unschedule('beebs-lien-5min');
EXCEPTION WHEN OTHERS THEN
  NULL; -- pas encore planifié : rien à désinscrire
END;
$cron$;

SELECT cron.schedule(
  'beebs-lien-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/beebs-lien',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fs-cron-2026-tunnel"}'::jsonb,
    body    := '{"trigger":"beebs_lien_cron"}'::jsonb
  );
  $cron$
);
