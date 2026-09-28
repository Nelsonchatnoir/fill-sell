-- Point E : aucun verdict sur lecture partielle ou unique. GO Nico passe A à I.
SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='1s';
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
CREATE OR REPLACE FUNCTION public.releve_clos_tranche_publications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vus      integer;
  v_verdicts jsonb;
BEGIN
  -- Le rapprochement peut précéder la clôture du run : la clôture reprend
  -- les absences avec les compteurs définitifs, par lots bornés.
  IF NOT releve_preuve_absence(NEW.id) THEN RETURN NULL; END IF;
  PERFORM constater_absences_releve(NEW.id);
  IF COALESCE(NEW.erreur, '') LIKE '[incomplet]%' THEN RETURN NULL; END IF;
  IF releve_hors_liste(NEW.erreur) THEN RETURN NULL; END IF;
  IF NEW.platform = 'ebay' AND releve_ebay_run_incomplet(NEW.id) THEN RETURN NULL; END IF;
  -- (27/09) Ceinture : le run a lu MOINS que ce que la plateforme annonce
  -- (total_entries, écrit par l'extension 0.6.75) → aucun verdict.
  IF NEW.total_entries IS NOT NULL AND COALESCE(NEW.items_vus, 0) < NEW.total_entries THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_vus FROM annonces_plateforme WHERE run_id = NEW.id;
  IF v_vus = 0 AND releve_compte_avait_annonces(NEW.user_id, NEW.platform) THEN RETURN NULL; END IF;
  BEGIN
    v_verdicts := trancher_publications_sans_lien(NEW.user_id, NEW.platform, NEW.id);
    IF COALESCE((v_verdicts->>'refusees')::int, 0) + COALESCE((v_verdicts->>'en_ligne')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_tranche_publications : run % (%) → %', NEW.id, NEW.platform, v_verdicts;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_tranche_publications : run % : %', NEW.id, SQLERRM;
  END;
  -- Une absence au relevé ne clôt pas un retrait sans cible prouvée.
  -- ── REDÉPÔT INTERROMPU : LA PREUVE EST ARRIVÉE (2026-09-27, famouus-x3) ──
  -- Une republication Leboncoin retirée puis recréée en vain, arrêtée
  -- « annonce peut-être déjà partie — relevé introuvable » (get-pending-jobs),
  -- ne repartait JAMAIS toute seule : la garde ne relit que les jobs pending.
  -- Un relevé COMPLET de ce compte (gardes ci-dessus), COMMENCÉ après le
  -- retrait et après l'essai suspect, la remet en file : get-pending-jobs juge
  -- alors avec CE relevé — aucune annonce apparue → redépôt depuis la copie du
  -- job ; la même annonce, certaine → rattachée, rien redéposé ; un doute →
  -- la question revient. Jamais un redépôt sans cette preuve.
  IF NEW.platform = 'leboncoin' THEN
    BEGIN
      UPDATE cross_post_jobs j SET
        status = 'pending', error = NULL,
        platform_fields = (j.platform_fields - 'needs_user_source')
          || jsonb_build_object('recreation_relancee_par_releve', jsonb_build_object('le', now(), 'releve', NEW.id))
       WHERE j.user_id = NEW.user_id AND j.platform = 'leboncoin' AND j.action = 'republish' AND j.status = 'needs_user'
         AND j.platform_fields->>'needs_user_source' = 'recreation_deja_partie'
         AND j.platform_fields#>>'{recreation_deja_partie,verdict}' = 'releve_introuvable'
         AND j.platform_fields->>'republish_step' = 'deleted'
         AND NEW.started_at > GREATEST(
               COALESCE((j.platform_fields->>'deleted_at')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_depot_parti,at}')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_deja_partie,le}')::timestamptz, '-infinity'::timestamptz));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_tranche_publications (redépôts) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$
;
CREATE OR REPLACE FUNCTION public.releve_incomplet_reprise()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
CREATE OR REPLACE FUNCTION public.constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 FOR a IN
   SELECT ap.id,ap.listing_id,ap.inventaire_id,ap.vu_le FROM annonces_plateforme ap
   WHERE ap.user_id=r.user_id AND ap.platform=r.platform
     AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
     AND ap.vu_le<precedent.started_at
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs recent WHERE recent.user_id=r.user_id
       AND recent.inventaire_id=ap.inventaire_id AND recent.platform=r.platform
       AND recent.action IN ('publish','republish') AND recent.status='published'
       AND COALESCE(recent.published_at,recent.created_at)>precedent.started_at-interval '4 hours'
       AND listing_designe(ap.listing_id,recent.listing_url,recent.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM rapprochements q WHERE q.annonce_id=ap.id
       AND q.detail->>'absence_confirmee_revision'='20260928'
       AND (q.detail->>'derniere_vue')::timestamptz>=ap.vu_le)
   ORDER BY ap.vu_le DESC,ap.id LIMIT 25 FOR UPDATE OF ap SKIP LOCKED
 LOOP
   EXIT WHEN clock_timestamp()-debut>interval '1 second';
   UPDATE annonces_plateforme SET disparu_le=COALESCE(disparu_le,r.finished_at),updated_at=now() WHERE id=a.id;
   -- Le signal existant ouvre la question de l'app. Ce n'est ni une vente,
   -- ni une annulation du dépôt historique, ni un retrait sur une plateforme.
   UPDATE cross_post_jobs j SET platform_fields=COALESCE(j.platform_fields,'{}'::jsonb)
     || jsonb_build_object('sale_signal','unavailable','unavailable_since',r.finished_at,
          'absence_releves',jsonb_build_object('premier',precedent.id,'second',r.id,'listing_id',a.listing_id,'le',now()))
   WHERE j.inventaire_id=a.inventaire_id AND j.user_id=r.user_id AND j.platform=r.platform
     AND j.status='published' AND j.action IN ('publish','republish')
     AND j.platform_fields->>'sale_signal' IS DISTINCT FROM 'sold'
     AND listing_designe(a.listing_id,j.listing_url,j.platform_listing_id);
   INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
   VALUES(r.user_id,a.id,a.inventaire_id,'aucune','auto',0,
     jsonb_build_object('absence_confirmee_revision','20260928','derniere_vue',a.vu_le,'premier',precedent.id,'second',r.id));
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id);
END;
$function$
;
