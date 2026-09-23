-- ══════════════════════════════════════════════════════════════════════════════
-- « ON N'A JAMAIS RÉUSSI À RÉCUPÉRER SON LIEN » — C'ÉTAIT FAUX (2026-09-23)
-- ══════════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ. Le balayage de 3h30 a fait échouer cette nuit 5
-- publications Leboncoin de meminiandmove (Pro) avec « ton annonce n'a pas pu
-- être retrouvée en ligne — on n'a jamais réussi à récupérer son lien ». Les 5
-- annonces étaient EN LIGNE, et le relevé du compte portait leur URL complète
-- depuis des jours (annonces_plateforme, statut 'en_ligne', vu le 23/09 à
-- 08:26). Chaque job portait en plus son `platform_listing_id` et son
-- `published_at`.
--
-- LA CAUSE : la condition ne regardait QUE `listing_url IS NULL`. Or ce n'est
-- pas le LIEN qui identifie une annonce, c'est son IDENTIFIANT — la règle est
-- écrite depuis le 21/09 dans _shared/annonce-lien.ts, après le pantalon
-- Sandro laissé en ligne pour exactement la même raison. Un job qui tient son
-- identifiant peut suivre sa vente et la retirer : il n'a rien perdu.
--
-- DEUX CHANGEMENTS, ET RIEN D'AUTRE :
--   1. `platform_listing_id IS NULL` entre dans la condition. Un job qui
--      porte son identifiant n'est PLUS JAMAIS clos sur « lien jamais
--      récupéré » — la phrase serait un mensonge.
--   2. Avant d'abandonner, on va chercher le lien là où il est peut-être
--      déjà : dans le relevé du compte (annonces_plateforme). S'il y est et
--      que l'annonce est en ligne, on le POSE sur le job et on n'échoue pas.
--      C'est la seule source admise pour Leboncoin, dont l'URL porte un
--      segment de catégorie qu'on ne reconstruit jamais (cf. annonce-lien.ts).
--
-- ⛔ LE BALAYAGE NE CONCLUT QUE SUR UNE PREUVE D'ABSENCE. Un job sans
--    identifiant ET sans lien dans le relevé, après le délai, reste un
--    abandon — là, on a vraiment cherché et vraiment rien trouvé.
-- ⛔ RIEN N'EST REPUBLIÉ ICI, jamais : l'annonce est peut-être en ligne, et
--    republier en créerait une deuxième.
--
-- PORTÉE MESURÉE LE 23/09 (tout le parc) : 16 publications Leboncoin déjà
-- échouées à tort en portant leur identifiant (12 confirmées en ligne, et
-- réparées à la main le jour même), et 10 autres 'published' sans lien mais
-- AVEC identifiant, que le balayage de la nuit suivante aurait tuées.
--
-- ── ET LE MOT « PÉPITES » DISPARAÎT DES DEUX MESSAGES ───────────────────────
-- Les Pépites n'existent plus : ce sont des quotas et des limites. L'app les
-- effaçait déjà À L'AFFICHAGE (sansMentionMonnaie, src/utils/shared.js), mais
-- une phrase tronquée laissait passer « Tes Pép… ». On arrête de les écrire.
-- Ces deux fonctions étaient les deux dernières sources vivantes du mot dans
-- un texte destiné à quelqu'un.

CREATE OR REPLACE FUNCTION public.fail_publish_without_listing_url(p_publie_apres timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  j        record;
  v_ref    jsonb;
  v_url    text;
  n_jobs   integer := 0;
  n_rendu  integer := 0;
  n_liens  integer := 0;
BEGIN
  FOR j IN
    SELECT id, user_id, platform, platform_listing_id,
           COALESCE(published_at, created_at) AS repere
    FROM cross_post_jobs
    WHERE status = 'published'
      AND action = 'publish'
      AND listing_url IS NULL
      -- (1) L'IDENTIFIANT SUFFIT À NOMMER L'ANNONCE : un job qui l'a n'est
      --     jamais « sans lien ». Il peut suivre sa vente et la retirer.
      AND platform_listing_id IS NULL
      AND (p_publie_apres IS NULL OR COALESCE(published_at, created_at) >= p_publie_apres)
      AND COALESCE(published_at, created_at) < now() - (
        CASE
          WHEN platform = 'vinted' THEN interval '2 hours'
          WHEN platform = 'beebs'  THEN interval '7 days'
          ELSE interval '48 hours'
        END
      )
    ORDER BY COALESCE(published_at, created_at)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- (2) LE LIEN DORT PEUT-ÊTRE DANS LE RELEVÉ DU COMPTE. On ne conclut pas
    --     à l'absence avant d'avoir regardé là où il est le plus souvent.
    --     Rapprochement par le TITRE du job est exclu (ambigu) : on ne prend
    --     que ce que le relevé rattache déjà À CE JOB.
    SELECT ap.url INTO v_url
    FROM annonces_plateforme ap
    WHERE ap.user_id = j.user_id
      AND ap.platform = j.platform
      AND ap.job_id = j.id
      AND ap.statut_plateforme = 'en_ligne'
      AND ap.url IS NOT NULL
    LIMIT 1;

    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_au_balayage', jsonb_build_object(
            'at', now(), 'url', v_url,
            'source', 'annonces_plateforme (releve du compte)'
          )
        )
      WHERE id = j.id;
      n_liens := n_liens + 1;
      CONTINUE;   -- rien n'a échoué : l'annonce est en ligne et nommée
    END IF;

    -- (3) Là seulement : ni lien, ni identifiant, ni trace dans le relevé,
    --     après le délai. C'est une vraie absence.
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;

    UPDATE cross_post_jobs SET
      status = 'failed',
      error  =
        'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur '
        || initcap(platform)
        || ' — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. '
        || 'Cette publication ne compte pas dans tes limites. '
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

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'quotas_rendus', n_rendu, 'liens_retrouves', n_liens);
END;
$function$;

-- Le mot « Pépites » quitte les deux derniers messages qui l'écrivaient.
CREATE OR REPLACE FUNCTION public.expire_publish_reservations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r        record;
  v_cnt    integer;
  n_res    integer := 0;
  n_jobs   integer := 0;
  n_nu     integer := 0;
BEGIN
  -- ── 1. needs_user seul, à 48 h ────────────────────────────────────────────
  -- On ne touche QUE les jobs needs_user, et on ne relâche QUE leur part : la
  -- réservation peut couvrir d'autres plateformes encore en vol (cas réel
  -- 1f02c097 : ebay published, leboncoin/beebs failed, vinted needs_user).
  -- settle_publish_reservation(..., 'release') sans montant relâche le reliquat
  -- non capturé ; ici on borne au prix unitaire du job, comme partout ailleurs.
  FOR r IN
    SELECT j.id AS job_id, j.reservation_id, COALESCE(c.unit_price, 1) AS unit
    FROM cross_post_jobs j
    JOIN coin_reservations c ON c.id = j.reservation_id
    WHERE j.status = 'needs_user'
      AND c.status = 'held'
      AND j.reservation_settled_at IS NULL
      AND COALESCE(j.published_at, j.created_at) < now() - interval '48 hours'
    FOR UPDATE OF j SKIP LOCKED
  LOOP
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error  = 'Publication abandonnée : une information manquait et la question '
            || 'est restée sans réponse pendant au moins 48 heures. '
            || 'Elle ne compte pas dans tes limites — tu peux relancer '
            || 'cette publication quand tu veux depuis ton Stock.'
    WHERE id = r.job_id;
    -- Le trigger cross_post_job_settle_reservation fait le 'release' au passage
    -- en 'cancelled' : on ne le double PAS ici, sinon la part serait rendue
    -- deux fois.
    n_nu := n_nu + 1;
  END LOOP;

  -- ── 2. Filet historique à 30 jours, inchangé ──────────────────────────────
  FOR r IN
    SELECT id FROM coin_reservations
    WHERE status = 'held' AND created_at < now() - interval '30 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = COALESCE(NULLIF(error, ''),
        'Publication jamais exécutée en 30 jours — elle ne compte pas dans tes limites.')
    WHERE reservation_id = r.id AND status IN ('pending', 'processing', 'needs_user');
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    n_jobs := n_jobs + v_cnt;
    -- Reliquat éventuel (job supprimé, statut hors nomenclature) : tout relâcher.
    PERFORM settle_publish_reservation(r.id, 'release', 2147483647, 'expired');
    UPDATE coin_reservations SET expired_at = now() WHERE id = r.id;
    n_res := n_res + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reservations_expirees', n_res,
    'jobs_annules', n_jobs,
    'needs_user_48h', n_nu
  );
END;
$function$;
