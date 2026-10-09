-- INVERSE de la migration 20261009140000 : les définitions EN PROD relues le 09/10 avant application
-- (md5 trancher b02ce8f7776d6556eee4eb48da29570e, fail cc025ead4bee9ae33a794608398ad98e).
-- À lancer seulement sur décision : npx supabase db query --linked -f <ce fichier>
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
    SELECT id, platform_listing_id, platform_fields, COALESCE(published_at, created_at) AS publie
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

    -- Deux cycles complets après la grâce commune. L'absence ne prouve
    -- ni une vente ni un refus de modération : elle ouvre une question.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
      || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
        'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
          'identifiants',to_jsonb(v_ids),'le',now()))
      WHERE id=j.id;
    n_attente:=n_attente+1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees, 'en_ligne', n_en_ligne, 'en_attente', n_attente);
END;
$function$
;
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

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'quotas_rendus', n_rendu, 'liens_retrouves', n_liens);
END;
$function$
;
