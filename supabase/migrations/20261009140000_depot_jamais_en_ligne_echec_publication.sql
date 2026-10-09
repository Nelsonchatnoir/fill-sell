-- ═══════════════════════════════════════════════════════════════════════════
-- 20261009140000 — UN DÉPÔT JAMAIS VU EN LIGNE EST UN ÉCHEC DE PUBLICATION,
-- JAMAIS UNE « VENTE POSSIBLE » (09/10, chantier E)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas : Nico, « Casio G-Shock GA-2100 noir » (job db924956, inventaire
-- 1790885795579), déposée sur Leboncoin le 07/10 à 09:02:30 (201 created,
-- ad_id 3283733957). REFUSÉE par le contrôle automatisé de Leboncoin à
-- 09:02:36 (mail no.reply@leboncoin.fr « Votre annonce "Casio G-Shock GA-2100
-- noir" a été refusée … ne respecte pas nos règles de diffusion » ; page
-- publique lue sans session : HTTP 410 « Cette annonce est désactivée »). Sa
-- photo est À L'OCTET PRÈS la photo 1 de la fiche Casio 1785444834689, déjà en
-- ligne sur Leboncoin (3271694340, même dhash) : un doublon.
-- Chez nous : jamais vue en ligne (aucun lien, aucun relevé, 4 relevés
-- complets 10/10 sans elle, sonde : 1 417 lectures complètes de « Mes
-- annonces » sans elle), puis le 08/10 à 16:48 trancher_publications_sans_lien
-- (point E du 28/09) l'a passée « unavailable » → bandeau « Vendue ? ».
--
-- CE QUE FAIT CETTE MIGRATION (définitions relues EN PROD le 09/10,
-- md5 trancher b02ce8f7776d6556eee4eb48da29570e, fail cc025ead4bee9ae33a794608398ad98e) :
--  1. trancher_publications_sans_lien : un dépôt JAMAIS vu en ligne, absent de
--     deux relevés complets après la grâce → 'failed' + motif + publication
--     rendue (ou 'cancelled' sans rouge si l'article est en ligne sous une autre
--     annonce DE LA MÊME FICHE). Un dépôt vu en ligne un jour garde la question.
--  2. fail_publish_without_listing_url (cron 10, 03:30) : la même conclusion,
--     sans relevé, au bout de 72 h, sur la preuve de la sonde de modération
--     (≥ 3 lectures complètes de « Mes annonces » sans elle). Borné : 200 jobs.
-- Rien d'autre : aucun stock, aucune vente, aucun retrait, aucun mail.
-- ⛔ Une question « Vendue ? » DÉJÀ OUVERTE (unavailable_since) n'est jamais
--    convertie ici, ni par un relevé ni par le cron : c'est une réparation,
--    sur GO de Nico seulement (audit du 09/10 : Nadia ×3, Tech-t ×1).
-- Les 4 bandeaux « Vendue ? » déjà ouverts sur des dépôts jamais vus (Nadia ×3,
-- Tech-t ×1) ne sont PAS touchés ici : réparation séparée, sur GO de Nico
-- (scripts/reparations/20261009_depots_jamais_en_ligne_question_vers_echec.sql).
-- Appliquer : npx supabase db query --linked -f <ce fichier> PUIS
--             npx supabase migration repair --linked --status applied 20261009140000

CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été mis en ligne par ' || v_nom || ' (refusé à la vérification ou retiré), mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    v_msg := v_nom || ' n''a jamais mis cette annonce en ligne : elle a été refusée par sa modération (ou retirée avant sa mise en ligne). '
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne : ' || v_nom || ' refuse les doublons. '
           ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. '
      || 'Absente de tes annonces aux relevés du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || '.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees, 'en_ligne', n_en_ligne, 'en_attente', n_attente);
END;
$function$;

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
BEGIN
  FOR j IN
    SELECT id, user_id, platform, platform_listing_id,
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
    SELECT c.id, c.platform, c.platform_listing_id, COALESCE(c.published_at, c.created_at) AS repere,
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
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
    UPDATE cross_post_jobs SET
      status = 'failed',
      error = 'Leboncoin n''a jamais mis cette annonce en ligne : elle a été refusée par sa modération (ou retirée avant sa mise en ligne). '
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. '
        || 'Absente de « Mes annonces » à ' || (j.platform_fields #>> '{moderation_probe,misses}') || ' vérifications complètes depuis le dépôt.',
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'repere', j.repere, 'issue', 'refus_moderation_probable', 'source', 'sonde_moderation_72h',
          'sonde', j.platform_fields -> 'moderation_probe', 'refund', v_ref))
    WHERE id = j.id AND status = 'published';
    n_jobs := n_jobs + 1;
  END LOOP;

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'quotas_rendus', n_rendu, 'liens_retrouves', n_liens);
END;
$function$;
