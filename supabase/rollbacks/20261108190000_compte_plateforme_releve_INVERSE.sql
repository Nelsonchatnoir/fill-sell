-- INVERSE de 20261108190000_compte_plateforme_releve : la définition de prod d'avant (md5 c21ea346968770991dad85ea9c36b70e),
-- puis les deux colonnes retirées. L'extension ≥ 0.6.182 n'écrit compte_plateforme que si la colonne existe.
DO $garde$
BEGIN
  IF position('(08/11 soir, point 3 de Nico)' IN replace(pg_get_functiondef('public.constater_absences_releve(uuid)'::regprocedure), chr(13), '')) = 0 THEN
    RAISE EXCEPTION 'la migration 20261108190000 n''est pas en place : rien à défaire';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
 v_cand integer:=0; v_derniere timestamptz;
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
 -- (08/11, ayadi007) UN COMPTE QUI A CHANGÉ (ou s'est vidé d'un coup) NE FAIT PAS UNE QUESTION PAR ANNONCE : au moins 5
 -- annonces que ni ce relevé ni le précédent n'ont revues, et AUCUNE annonce vue par eux n'était connue avant la dernière
 -- vue de celles-là (aucune continuité : les deux relevés lisent un autre ensemble — autre compte connecté dans Chrome,
 -- compte bloqué dont les annonces sont désactivées, tout republié d'un coup) → rien n'est daté disparu, aucun « Vendue ? »
 -- (le « Oui » d'une personne pressée retirerait ses copies ailleurs) ; une trace par relevé (usage_logs
 -- releve_compte_change), lue par l'exploitation. Une annonce revue plus tard lève tout ; sous 5, la règle d'avant.
 SELECT count(*), max(ap.vu_le) INTO v_cand, v_derniere FROM annonces_plateforme ap
  WHERE ap.user_id=r.user_id AND ap.platform=r.platform AND ap.disparu_le IS NULL
    AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
    AND ap.vu_le<precedent.started_at;
 IF v_cand>=5 AND NOT EXISTS (SELECT 1 FROM annonces_plateforme x
      WHERE x.user_id=r.user_id AND x.platform=r.platform AND x.run_id IN (r.id, precedent.id) AND x.created_at<v_derniere) THEN
   IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id=r.user_id AND u.feature='releve_compte_change'
                    AND u.metadata->>'run'=r.id::text) THEN
     INSERT INTO usage_logs(user_id,feature,metadata) VALUES (r.user_id,'releve_compte_change',
       jsonb_build_object('run',r.id,'premier',precedent.id,'platform',r.platform,'annonces_non_revues',v_cand,'derniere_vue',v_derniere));
   END IF;
   RETURN jsonb_build_object('disparues',0,'motif','compte_change_ou_vide','annonces_non_revues',v_cand,
     'derniere_vue',v_derniere,'premier',precedent.id,'second',r.id);
 END IF;
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
     -- (22/10 soir, point 5) Un article en cours de republication n'est jamais compté disparu.
     AND public.republication_engagee(r.user_id, ap.inventaire_id, r.platform) IS NULL
     -- (31/10, décision 7a de Nico) …ni une annonce VISÉE par une republication engagée, quelle que soit sa fiche.
     AND public.republication_engagee_numero(r.user_id, r.platform, ap.listing_id) IS NULL
     -- (31/10, lot I point 6) …ni pendant qu'une remise en ligne « recréée » n'a pas encore été revue en ligne (72 h au plus).
     AND public.republication_recreee_non_confirmee(r.user_id, r.platform, ap.inventaire_id, ap.listing_id, ap.job_id) IS NULL
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
$function$;

ALTER TABLE public.vinted_sync_runs DROP COLUMN IF EXISTS compte_plateforme;
ALTER TABLE public.annonces_plateforme DROP COLUMN IF EXISTS compte_plateforme;
