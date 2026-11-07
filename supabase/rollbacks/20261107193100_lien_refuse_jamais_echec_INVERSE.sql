-- INVERSE de 20261107193100_lien_refuse_jamais_echec : la définition de PROD du 07/11 soir de
-- fail_publish_without_listing_url, mot pour mot (pg_get_functiondef, sans CR ; md5 c1b3e41d036c71cefc983b69a45015a6), puis
-- l'aide retirée. Aucune donnée à rendre : la migration n'écrit aucune ligne.
CREATE OR REPLACE FUNCTION public.fail_publish_without_listing_url(p_publie_apres timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j        record;
  v_ref    jsonb;
  v_url    text;
  n_jobs   integer := 0;
  n_rendu  integer := 0;
  n_liens  integer := 0;
  n_ailleurs integer := 0;
  v_ailleurs jsonb;
BEGIN
  FOR j IN
    SELECT id, user_id, platform, platform_listing_id, inventaire_id,
           COALESCE(published_at, created_at) AS repere
    FROM cross_post_jobs
    WHERE status = 'published'
      AND action = 'publish'
      AND listing_url IS NULL
      -- (1) L'IDENTIFIANT SUFFIT A NOMMER L'ANNONCE : un job qui l'a n'est
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
    -- (2) LE LIEN DORT PEUT-ETRE DANS LE RELEVE DU COMPTE. On ne conclut pas
    --     a l'absence avant d'avoir regarde la ou il est le plus souvent.
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
      CONTINUE;
    END IF;

    -- (2 bis) BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico).
    --     « Une annonce Beebs sans lien, c'est normal : la modération se fait,
    --     le lien arrive ensuite. » Le lien est posé ci-dessus s'il est connu ;
    --     sinon le dépôt reste tel quel — jamais « non confirmé », jamais clos.
    IF j.platform = 'beebs' THEN
      CONTINUE;
    END IF;

    -- (24/10, point 6 — Short Okaïdi de louis-seller) L'article est EN LIGNE sur cette plateforme : sous une autre
    -- annonce de la MÊME fiche, ou par la fiche jumelle d'un compte FillSell relié (boutique partagée : la plateforme
    -- refuse le doublon). Même clôture que trancher_publications_sans_lien : sans rouge, sans inviter à republier.
    -- La publication est rendue comme avant (refund_publish_unconfirmed, inchangé).
    v_ailleurs := article_en_ligne_ailleurs(j.user_id, j.platform, j.inventaire_id, ARRAY[]::text[]);
    IF v_ailleurs IS NOT NULL THEN
      v_ref := refund_publish_unconfirmed(j.id);
      IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
      UPDATE cross_post_jobs SET status = 'cancelled',
        error = CASE WHEN v_ailleurs->>'issue' = 'article_en_ligne_ailleurs'
          THEN 'Ce dépôt n''a jamais été retrouvé en ligne sur ' || initcap(j.platform) || ', mais ton article y est en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ' : rien à refaire, rien n''est vendu.'
          ELSE 'Ce dépôt n''a pas été mis en ligne par ' || initcap(j.platform) || ' : ton article y est DÉJÀ en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ', publiée par ton compte FillSell relié — ' || initcap(j.platform)
               || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'repere', j.repere, 'source', 'sans_lien_48h', 'issue', v_ailleurs->>'issue',
            'annonce_en_ligne', v_ailleurs->>'listing_id', 'refund', v_ref))
       WHERE id = j.id AND status = 'published';
      n_ailleurs := n_ailleurs + 1;
      CONTINUE;
    END IF;
    -- (3) La seulement : ni lien, ni identifiant, ni trace dans le releve.
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

  -- (09/10, chantier E) LEBONCOIN : UN DÉPÔT ACCEPTÉ (identifiant rendu au
  -- dépôt) MAIS JAMAIS VU EN LIGNE CONCLUT AU BOUT DE 72 H. La boucle ci-dessus
  -- écarte tout job qui porte son identifiant (« il peut suivre sa vente ») :
  -- un refus de modération Leboncoin ne concluait donc JAMAIS (sonde de
  -- l'extension : 1 417 passages bredouilles en 48 h sur la G-Shock de Nico,
  -- puis plus rien ; relevés d'import sur geste seulement depuis le 05/10).
  -- Preuve exigée, toutes réunies : aucun lien, jamais revue par la veille
  -- (vu_en_ligne_le), absente de TOUT relevé du compte, et la sonde de
  -- modération a lu « Mes annonces » COMPLÈTE au moins 3 fois sans elle, la
  -- dernière ≥ 2 h après le dépôt. Sinon : rien n'est écrit. Borné : 200 jobs.
  FOR j IN
    SELECT c.id, c.user_id, c.platform, c.platform_listing_id, c.inventaire_id, COALESCE(c.published_at, c.created_at) AS repere,
           c.platform_fields
      FROM cross_post_jobs c
     WHERE c.status = 'published' AND c.action IN ('publish', 'republish')
       AND c.platform = 'leboncoin'
       AND c.listing_url IS NULL AND c.vu_en_ligne_le IS NULL
       AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')   -- question déjà ouverte : réparation sur GO
       AND NULLIF(btrim(c.platform_listing_id), '') IS NOT NULL
       AND COALESCE(c.published_at, c.created_at) < now() - interval '72 hours'
       AND COALESCE((c.platform_fields #>> '{moderation_probe,misses}')::int, 0) >= 3
       AND _ts_ou_null(c.platform_fields #>> '{moderation_probe,last_miss_at}') >= COALESCE(c.published_at, c.created_at) + interval '2 hours'
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                        WHERE ap.user_id = c.user_id AND ap.platform = c.platform
                          AND ap.listing_id = ANY (ARRAY[NULLIF(btrim(c.platform_listing_id), ''),
                                                        c.platform_fields #>> '{lbc_depot,adsubmit,id}',
                                                        c.platform_fields #>> '{lbc_depot,sans_adsubmit,id}']))
     ORDER BY COALESCE(c.published_at, c.created_at)
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    -- (24/10, point 6 — Short Okaïdi de louis-seller) L'article est EN LIGNE sur cette plateforme : sous une autre
    -- annonce de la MÊME fiche, ou par la fiche jumelle d'un compte FillSell relié (boutique partagée : la plateforme
    -- refuse le doublon). Même clôture que trancher_publications_sans_lien : sans rouge, sans inviter à republier.
    -- La publication est rendue comme avant (refund_publish_unconfirmed, inchangé).
    v_ailleurs := article_en_ligne_ailleurs(j.user_id, j.platform, j.inventaire_id, ARRAY[NULLIF(btrim(j.platform_listing_id), ''), j.platform_fields #>> '{lbc_depot,adsubmit,id}', j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}']);
    IF v_ailleurs IS NOT NULL THEN
      v_ref := refund_publish_unconfirmed(j.id);
      IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
      UPDATE cross_post_jobs SET status = 'cancelled',
        error = CASE WHEN v_ailleurs->>'issue' = 'article_en_ligne_ailleurs'
          THEN 'Ce dépôt n''a jamais été retrouvé en ligne sur ' || initcap(j.platform) || ', mais ton article y est en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ' : rien à refaire, rien n''est vendu.'
          ELSE 'Ce dépôt n''a pas été mis en ligne par ' || initcap(j.platform) || ' : ton article y est DÉJÀ en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ', publiée par ton compte FillSell relié — ' || initcap(j.platform)
               || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'repere', j.repere, 'source', 'sonde_moderation_72h', 'issue', v_ailleurs->>'issue',
            'annonce_en_ligne', v_ailleurs->>'listing_id', 'refund', v_ref))
       WHERE id = j.id AND status = 'published';
      n_ailleurs := n_ailleurs + 1;
      CONTINUE;
    END IF;
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
    UPDATE cross_post_jobs SET
      status = 'failed',
      -- (27/10) Le motif dit l'absence constatée par la sonde, jamais « refusée par sa modération » (une déduction).
      error = 'Cette annonce est absente de tes annonces Leboncoin (« Mes annonces » relu en entier '
        || (j.platform_fields #>> '{moderation_probe,misses}') || ' fois depuis le dépôt), et Leboncoin n''a rien affiché à FillSell. Leboncoin refuse parfois une annonce juste après son dépôt, par exemple quand une annonce semblable est déjà en ligne : son motif est dans le mail « Votre annonce … a été refusée » qu''il t''a envoyé. '
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.',
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'repere', j.repere, 'issue', 'refus_moderation_probable', 'source', 'sonde_moderation_72h',
          'sonde', j.platform_fields -> 'moderation_probe', 'refund', v_ref))
    WHERE id = j.id AND status = 'published';
    n_jobs := n_jobs + 1;
  END LOOP;

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'quotas_rendus', n_rendu, 'liens_retrouves', n_liens, 'en_ligne_ailleurs', n_ailleurs);
END;
$function$;
REVOKE ALL ON FUNCTION public.fail_publish_without_listing_url(timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.lien_refuse_fiche_porteuse(uuid);
