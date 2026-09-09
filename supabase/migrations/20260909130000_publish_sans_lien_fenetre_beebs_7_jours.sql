-- ═══════════════════════════════════════════════════════════════════════════
-- « Publié sans lien » : fenêtre PAR PLATEFORME — Beebs passe de 48 h à 7 jours
-- 2026-09-09 — ⛔ NON APPLIQUÉE EN PROD : à jouer À LA MAIN, après GO de Nico
-- (règle du projet : jamais de `db push`, une migration à la fois, effet
-- vérifié). Idempotente : CREATE OR REPLACE, aucune donnée touchée, la
-- planification cron (publish-sans-lien-echec-daily, jobid 10, 03 h 30 UTC)
-- reste strictement inchangée.
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (09/09) : 15 dépôts Beebs du dimanche 06/09 (18 h 11 → 00 h 23,
-- extension 0.6.19, 4 vendeurs) ont été requalifiés en échec par le balayage
-- de 03 h 30 — 48 h révolues — alors que les 15 articles sont toujours en
-- vente et qu'aucune URL n'a jamais été lue. Sur Beebs l'annonce part en
-- MODÉRATION HUMAINE (« il sera mis en ligne dès qu'il aura été vérifié par
-- notre équipe ») : un week-end suffit à dépasser 48 h. Côté extension, la
-- re-capture était de surcroît AFFAMÉE (10 jobs, les plus récents d'abord —
-- Joséphine avait de 80 à 142 jobs plus récents que chacun des siens) ;
-- corrigée le même jour dans background.js (recoverMissingListingUrls).
--
-- ⚠️ VALEUR DUPLIQUÉE : LISTING_URL_RECOVERY_MAX_AGE_MS (background.js) porte
-- les mêmes durées par plateforme. Si l'une bouge, l'autre doit bouger.
--
-- Au 09/09 12 h, 34 jobs Beebs sont encore `published` sans URL (14 du 07/09,
-- 19 du 08/09, ET 1 du 10/08) : sans cette migration, les 14 du 07/09 tombent
-- au balayage du 10/09 03 h 30, les 19 suivants la nuit d'après.

CREATE OR REPLACE FUNCTION public.fail_publish_without_listing_url(
  p_publie_apres timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  j        record;
  v_ref    jsonb;
  n_jobs   integer := 0;
  n_rendu  integer := 0;
BEGIN
  FOR j IN
    SELECT id, platform, COALESCE(published_at, created_at) AS repere
    FROM cross_post_jobs
    WHERE status = 'published'
      AND action = 'publish'
      AND listing_url IS NULL
      AND (p_publie_apres IS NULL OR COALESCE(published_at, created_at) >= p_publie_apres)
      AND COALESCE(published_at, created_at) < now() - (
        CASE
          -- vinted : l'URL vient de la réponse serveur ou de la redirection,
          -- dans le même passage — rien ne peut la remplir après coup.
          WHEN platform = 'vinted' THEN interval '2 hours'
          -- beebs : modération humaine, week-ends compris (2026-09-09).
          WHEN platform = 'beebs'  THEN interval '7 days'
          -- leboncoin / ebay : indexation de « Mes annonces » / du Hub.
          ELSE interval '48 hours'
        END
      )
    ORDER BY COALESCE(published_at, created_at)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;

    UPDATE cross_post_jobs SET
      status = 'failed',
      error  =
        'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur '
        || initcap(platform)
        || ' — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. '
        || 'Tes Pépites de publication t''ont été rendues. '
        || '⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur ' || initcap(platform)
        || ' : si elle y est déjà, republier en créerait une deuxième.',
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'listing_url_abandon', jsonb_build_object(
          'at', now(),
          'repere', j.repere,
          'refund', v_ref
        )
      )
    WHERE id = j.id;
    n_jobs := n_jobs + 1;
  END LOOP;

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'pepites_rendues', n_rendu);
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_publish_without_listing_url(timestamptz) FROM public, anon, authenticated;
