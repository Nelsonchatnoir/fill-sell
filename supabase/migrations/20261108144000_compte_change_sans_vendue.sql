-- 20261108144000 — Un compte Leboncoin qui change (ou se vide d'un coup) ne fait pas 117 « Vendue ? » (08/11, ayadi007)
--
-- Constat (prod, 08/11, lecture seule) : le compte Leboncoin d'ayadi007 est bloqué (ses annonces s'affichent « désactivée »
-- ou 410) ; il en connecte un autre dans Chrome. Les relevés du jour lisent 0 annonce (non probants : rien n'est daté). Une
-- publication part à 12:12 sur le compte connecté (3304749074) et 8 sont en file : dès que deux relevés probants liront
-- ce nouveau compte, constater_absences_releve datera disparues les 117 annonces de l'ancien compte, vues le 07/11 à 20:59,
-- et posera « Plus en ligne — Vendue ? » sur chacune de leurs fiches (sale_signal 'unavailable'). Un « Oui, vendue »
-- retire les copies Vinted d'articles qu'il possède encore. Rien dans un relevé Leboncoin ne nomme le compte lu (la
-- colonne vinted_user_id reste vide pour Leboncoin ; l'extension ne l'écrit pas) : le seul signe est l'absence de
-- continuité entre ce que les deux relevés lisent et ce qui était connu.
--
-- LA RÈGLE (tous comptes, plateformes à relevé d'annonces ; Beebs a déjà sa sortie) : quand au moins 5 annonces non
-- disparues n'ont été revues ni par ce relevé ni par le précédent, ET qu'aucune annonce vue par ces deux relevés n'existait
-- avant la dernière vue de celles-là, rien n'est daté disparu et aucune question n'est posée ; le relevé rend
-- motif 'compte_change_ou_vide' et laisse une trace (usage_logs releve_compte_change, une par relevé). Sous 5 annonces, ou
-- dès qu'une annonce connue est revue (continuité : même compte), la règle d'avant joue, ligne pour ligne.
-- Mesure de coût : un count sur les annonces du compte et de la plateforme (index annonces_plateforme_user_pf_idx).
-- Définition réécrite depuis pg_get_functiondef EN PRODUCTION (08/11, md5 d36984b5c0fc70a5251059b5703f0404) : chaque
-- ligne gardée, deux variables et un bloc ajoutés. Inverse :
-- supabase/rollbacks/20261108144000_compte_change_sans_vendue_INVERSE.sql.
-- ⚠ 20261107193200 (appliquée) garde le md5 de cette fonction dans SA garde : elle ne se rejoue plus après celle-ci (attendu).
-- Preuve (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-ayadi-0811.mjs
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite, après le feu vert.

DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.constater_absences_releve(uuid)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> 'd36984b5c0fc70a5251059b5703f0404' AND position('(08/11, ayadi007)' IN v_d) = 0 THEN
    RAISE EXCEPTION 'constater_absences_releve a changé en prod depuis le 08/11 : repartir de pg_get_functiondef';
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
$function$
;
