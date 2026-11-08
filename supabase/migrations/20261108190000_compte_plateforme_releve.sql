-- 20261108190000 — LE COMPTE DE LA PLATEFORME RELEVÉ EST CONNU (08/11 soir, point 3 de Nico — ayadi007, « GO pour la
-- vraie racine : savoir quel compte Leboncoin est connecté »).
--
-- Constat : rien dans un relevé ne nommait le compte lu (vinted_user_id reste vide pour Leboncoin : cloud_essai_preparer_moi
-- la lit comme des comptes Vinted). Quand ayadi007 a changé de compte Leboncoin (08/11), le seul signe était l'absence de
-- continuité (règle 20261108144000, heuristique, au moins 5 annonces).
-- LA RÈGLE (tous comptes) :
-- 1. vinted_sync_runs.compte_plateforme : le compte de la plateforme qu'un relevé a lu (extension ≥ 0.6.182 : Leboncoin =
--    l'identifiant du compte du jeton de la page, celui que le relevé passe déjà à l'API dans owner.user_id).
-- 2. annonces_plateforme.compte_plateforme : le compte sur lequel l'annonce a été VUE (posé par le relevé qui la voit).
-- 3. constater_absences_releve : deux relevés de comptes différents ne forment jamais une paire ; une annonce d'un AUTRE
--    compte connu n'est jamais datée disparue par ce relevé (aucun « Vendue ? », aucun retrait ailleurs) ; une trace par
--    relevé (usage_logs releve_autre_compte). Compte inconnu d'un côté ou de l'autre : la règle d'avant, ligne pour ligne.
-- Rien n'est écrit sur une donnée existante (colonnes NULL) : les annonces se marquent au prochain relevé qui les voit.
-- Définition de constater_absences_releve réécrite depuis pg_get_functiondef EN PRODUCTION (08/11 ~18:20, md5
-- c21ea346968770991dad85ea9c36b70e = 20261108144000) : chaque ligne gardée, des lignes ajoutées.
-- Inverse : supabase/rollbacks/20261108190000_compte_plateforme_releve_INVERSE.sql.
-- Preuve (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-compte-plateforme-0811.mjs
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite.

DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.constater_absences_releve(uuid)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> 'c21ea346968770991dad85ea9c36b70e' AND position('(08/11 soir, point 3 de Nico)' IN v_d) = 0 THEN
    RAISE EXCEPTION 'constater_absences_releve a changé en prod depuis le 08/11 18:20 : repartir de pg_get_functiondef';
  END IF;
END
$garde$;

ALTER TABLE public.vinted_sync_runs ADD COLUMN IF NOT EXISTS compte_plateforme text;
ALTER TABLE public.annonces_plateforme ADD COLUMN IF NOT EXISTS compte_plateforme text;
COMMENT ON COLUMN public.vinted_sync_runs.compte_plateforme IS '(08/11) Compte de la plateforme lu par ce relevé (Leboncoin : identifiant du compte du jeton de la page). NULL = inconnu.';
COMMENT ON COLUMN public.annonces_plateforme.compte_plateforme IS '(08/11) Compte de la plateforme sur lequel l''annonce a été vue au dernier relevé qui le connaissait. NULL = inconnu.';

CREATE OR REPLACE FUNCTION public.constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
 v_cand integer:=0; v_derniere timestamptz;
 v_compte text; v_autres integer:=0;  -- (08/11 soir, point 3 de Nico) le compte de la plateforme relevé
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- (08/11 soir, point 3 de Nico — ayadi007) LE COMPTE RELEVÉ EST CONNU (vinted_sync_runs.compte_plateforme, écrit par
 -- l'extension ≥ 0.6.182 : Leboncoin = le compte du jeton de la page). Deux relevés de comptes DIFFÉRENTS ne forment
 -- jamais une paire ; une annonce d'un AUTRE compte connu n'est jamais datée disparue par ce relevé (jamais « Vendue ? ») :
 -- elle n'est pas absente, elle est ailleurs. Compte inconnu (ancien poste, relevé par la page) : la règle d'avant, à l'octet.
 v_compte := NULLIF(btrim(r.compte_plateforme), '');
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND (v_compte IS NULL OR NULLIF(btrim(s.compte_plateforme), '') IS NULL OR s.compte_plateforme = v_compte)
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 -- (08/11 soir) Les annonces d'un AUTRE compte connu, non datées : comptées, tracées une fois par relevé, jamais datées.
 IF v_compte IS NOT NULL THEN
   SELECT count(*) INTO v_autres FROM annonces_plateforme ap
    WHERE ap.user_id=r.user_id AND ap.platform=r.platform AND ap.disparu_le IS NULL
      AND NULLIF(btrim(ap.compte_plateforme), '') IS NOT NULL AND ap.compte_plateforme <> v_compte;
   IF v_autres > 0 AND NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id=r.user_id AND u.feature='releve_autre_compte'
                                     AND u.metadata->>'run'=r.id::text) THEN
     INSERT INTO usage_logs(user_id,feature,metadata) VALUES (r.user_id,'releve_autre_compte',
       jsonb_build_object('run',r.id,'platform',r.platform,'compte',v_compte,'annonces_autre_compte',v_autres));
   END IF;
 END IF;
 -- (08/11, ayadi007) UN COMPTE QUI A CHANGÉ (ou s'est vidé d'un coup) NE FAIT PAS UNE QUESTION PAR ANNONCE : au moins 5
 -- annonces que ni ce relevé ni le précédent n'ont revues, et AUCUNE annonce vue par eux n'était connue avant la dernière
 -- vue de celles-là (aucune continuité : les deux relevés lisent un autre ensemble — autre compte connecté dans Chrome,
 -- compte bloqué dont les annonces sont désactivées, tout republié d'un coup) → rien n'est daté disparu, aucun « Vendue ? »
 -- (le « Oui » d'une personne pressée retirerait ses copies ailleurs) ; une trace par relevé (usage_logs
 -- releve_compte_change), lue par l'exploitation. Une annonce revue plus tard lève tout ; sous 5, la règle d'avant.
 SELECT count(*), max(ap.vu_le) INTO v_cand, v_derniere FROM annonces_plateforme ap
  WHERE ap.user_id=r.user_id AND ap.platform=r.platform AND ap.disparu_le IS NULL
    AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
    AND ap.vu_le<precedent.started_at
    AND (v_compte IS NULL OR NULLIF(btrim(ap.compte_plateforme), '') IS NULL OR ap.compte_plateforme = v_compte);
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
     -- (08/11 soir) jamais une annonce d'un AUTRE compte connu que celui relevé
     AND (v_compte IS NULL OR NULLIF(btrim(ap.compte_plateforme), '') IS NULL OR ap.compte_plateforme = v_compte)
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
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id)
   || CASE WHEN v_autres > 0 THEN jsonb_build_object('annonces_autre_compte',v_autres,'compte',v_compte) ELSE '{}'::jsonb END;
END;
$function$;
