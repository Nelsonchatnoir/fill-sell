BEGIN; SET LOCAL statement_timeout='5s';
CREATE TEMP TABLE vinted_sync_runs (LIKE public.vinted_sync_runs INCLUDING DEFAULTS);
CREATE TEMP TABLE cross_post_jobs (LIKE public.cross_post_jobs INCLUDING DEFAULTS);
CREATE TEMP TABLE annonces_plateforme (LIKE public.annonces_plateforme INCLUDING DEFAULTS);
CREATE FUNCTION pg_temp.releve_hors_liste(text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION pg_temp.releve_ebay_run_bloque(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION pg_temp.releve_ebay_run_incomplet(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION pg_temp.releve_cause_utilisateur(text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE FUNCTION pg_temp.plateforme_ecartee_pour(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
CREATE OR REPLACE FUNCTION pg_temp.releve_preuve_absence(p_run uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_temp', 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE;
BEGIN
  SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
  IF r.id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid()<>r.user_id)
     OR r.status<>'done' OR r.kind<>'annonces'
     OR COALESCE(r.items_vus,0)<=0 OR r.finished_at IS NULL
     OR COALESCE(r.erreur,'') LIKE '[incomplet]%'
     OR releve_hors_liste(r.erreur)
     OR (r.total_entries IS NOT NULL AND r.items_vus<r.total_entries)
     THEN RETURN false; END IF;
  IF r.platform='ebay' AND (releve_ebay_run_bloque(r.id) OR releve_ebay_run_incomplet(r.id)) THEN RETURN false; END IF;
  RETURN true;
END;
$function$
;
CREATE OR REPLACE FUNCTION pg_temp.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_temp', 'public'
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
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' ELSE p_platform END;
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
CREATE OR REPLACE FUNCTION pg_temp.releve_incomplet_reprise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_temp', 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  BEGIN
    -- Complet et réussi : rien à reprendre.
    IF NEW.status = 'done' AND COALESCE(NEW.erreur, '') NOT LIKE '[incomplet]%'
       AND (NEW.total_entries IS NULL OR COALESCE(NEW.items_vus,0)>=NEW.total_entries)
       AND (NEW.platform<>'ebay' OR NOT releve_ebay_run_incomplet(NEW.id)) THEN RETURN NULL; END IF;
    IF releve_cause_utilisateur(NEW.erreur) THEN RETURN NULL; END IF;
    IF plateforme_ecartee_pour(NEW.user_id, NEW.platform) THEN RETURN NULL; END IF;
    -- Déjà une lecture en file ou en cours : elle fera foi.
    IF EXISTS (SELECT 1 FROM vinted_sync_runs r
                WHERE r.user_id = NEW.user_id AND r.kind = 'annonces' AND r.platform = NEW.platform
                  AND r.status IN ('queued', 'running') AND r.id <> NEW.id) THEN
      RETURN NULL;
    END IF;
    -- Deux reprises au plus par 6 h et par plateforme : au-delà, le relevé
    -- reste dit incomplet (jamais conclu), et le prochain passage normal le
    -- refera.
    SELECT count(*) INTO v_n FROM vinted_sync_runs r
     WHERE r.user_id = NEW.user_id AND r.kind = 'annonces' AND r.platform = NEW.platform
       AND r.declencheur = 'reprise' AND r.queued_at > now() - interval '6 hours';
    IF v_n >= 2 THEN RETURN NULL; END IF;
    INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
    VALUES (NEW.user_id, 'annonces', NEW.platform, 'queued', 'reprise', now());
    RAISE LOG 'releve_incomplet_reprise : run % (% %) → reprise %/2', NEW.id, NEW.platform, NEW.status, v_n + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_incomplet_reprise : run % : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$
;
CREATE TRIGGER test_reprise AFTER UPDATE ON pg_temp.vinted_sync_runs FOR EACH ROW EXECUTE FUNCTION pg_temp.releve_incomplet_reprise();
DO $test$
DECLARE u uuid:='00000000-0000-4000-8000-000000000001';
 a uuid:='00000000-0000-4000-8000-000000000011'; b uuid:='00000000-0000-4000-8000-000000000012';
 j uuid:='00000000-0000-4000-8000-000000000021'; r jsonb;
BEGIN
 INSERT INTO pg_temp.cross_post_jobs(id,user_id,platform,action,status,title,platform_listing_id,published_at)
 VALUES(j,u,'leboncoin','publish','published','Test','123456789',now()-interval '2 days');
 INSERT INTO pg_temp.vinted_sync_runs(id,user_id,platform,kind,status,started_at,finished_at,items_vus,total_entries)
 VALUES(a,u,'leboncoin','annonces','done',now()-interval '2 hours',now()-interval '1 hour',1,1);
 r:=pg_temp.trancher_publications_sans_lien(u,'leboncoin',a);
 IF (SELECT platform_fields->>'sale_signal' FROM pg_temp.cross_post_jobs WHERE id=j) IS NOT NULL THEN RAISE EXCEPTION 'verdict sur lecture unique'; END IF;
 INSERT INTO pg_temp.vinted_sync_runs(id,user_id,platform,kind,status,started_at,finished_at,items_vus,total_entries)
 VALUES(b,u,'leboncoin','annonces','done',now()-interval '30 minutes',now(),1,2);
 r:=pg_temp.trancher_publications_sans_lien(u,'leboncoin',b);
 IF (SELECT platform_fields->>'sale_signal' FROM pg_temp.cross_post_jobs WHERE id=j) IS NOT NULL THEN RAISE EXCEPTION 'verdict sur lecture partielle'; END IF;
 UPDATE pg_temp.vinted_sync_runs SET items_vus=0,total_entries=0,erreur='[vide]' WHERE id=b;
 IF pg_temp.releve_preuve_absence(b) THEN RAISE EXCEPTION 'vide probant'; END IF;
 UPDATE pg_temp.vinted_sync_runs SET items_vus=1,total_entries=2,erreur=NULL WHERE id=b;
 IF NOT EXISTS(SELECT 1 FROM pg_temp.vinted_sync_runs WHERE user_id=u AND status='queued' AND declencheur='reprise')
 THEN RAISE EXCEPTION 'partiel done non relancé'; END IF;
 UPDATE pg_temp.vinted_sync_runs SET items_vus=2,total_entries=2 WHERE id=b;
 r:=pg_temp.trancher_publications_sans_lien(u,'leboncoin',b);
 IF (SELECT platform_fields->>'sale_signal' FROM pg_temp.cross_post_jobs WHERE id=j) IS DISTINCT FROM 'unavailable'
 OR (SELECT status FROM pg_temp.cross_post_jobs WHERE id=j)<>'published' THEN RAISE EXCEPTION 'deux cycles : question attendue sans refus'; END IF;
 UPDATE pg_temp.cross_post_jobs SET platform='beebs',platform_fields='{}' WHERE id=j;
 UPDATE pg_temp.vinted_sync_runs SET platform='beebs' WHERE id IN(a,b);
 r:=pg_temp.trancher_publications_sans_lien(u,'beebs',b);
 IF (SELECT platform_fields->>'sale_signal' FROM pg_temp.cross_post_jobs WHERE id=j) IS NOT NULL THEN RAISE EXCEPTION 'modération Beebs jugée'; END IF;
END;
$test$;
SELECT 'lecture unique, partielle, vide, reprise automatique, question après deux cycles et Beebs : OK' resultat;
ROLLBACK;
