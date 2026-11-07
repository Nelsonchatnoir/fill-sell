-- Définitions de PROD du 07/11 soir (pg_get_functiondef / pg_get_triggerdef, sans CR) lues par la garde et par
-- republication_annonce_partie — chargées par scripts/preuve-republication-partie-declaration-constat.mjs (md5 vérifiés).
CREATE OR REPLACE FUNCTION public._ts_ou_null(p text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION public.listing_designe(p_listing text, p_url text, p_pid text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Un identifiant explicite contradictoire interdit le repli sur l'URL.
  -- On lit le segment d'annonce, jamais un nombre dans le titre ou la requête.
  SELECT length(btrim(coalesce(p_listing,''))) >= 4 AND
    CASE WHEN nullif(btrim(p_pid),'') IS NOT NULL THEN btrim(p_listing)=btrim(p_pid)
    ELSE btrim(p_listing)=coalesce(
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/items/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/ad/[^/]+/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/itm/(?:[^/]+/)?([0-9]+)(?:/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/p/([0-9]+)(?:-|/|$)'),
      substring(split_part(split_part(p_url,'?',1),'#',1) FROM '/(?:product|article)/(art_[A-Za-z0-9_-]+)(?:/|$)'), '') END;
$function$;

CREATE OR REPLACE FUNCTION public.retrait_meme_annonce(p_platform text, p_id_a text, p_url_a text, p_id_b text, p_url_b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH n AS (
    SELECT nullif(btrim(p_id_a), '') ia, nullif(btrim(p_id_b), '') ib,
           nullif(regexp_replace(split_part(split_part(btrim(coalesce(p_url_a, '')), '?', 1), '#', 1), '/$', ''), '') ua,
           nullif(regexp_replace(split_part(split_part(btrim(coalesce(p_url_b, '')), '?', 1), '#', 1), '/$', ''), '') ub)
  SELECT coalesce(
       (n.ia IS NOT NULL AND n.ia = n.ib)
    OR (n.ua IS NOT NULL AND n.ua = n.ub)
    OR (n.ia ~ '^[0-9]+$' AND n.ub IS NOT NULL AND n.ub ~ ('(^|[^0-9])' || n.ia || '([^0-9]|$)'))
    OR (n.ib ~ '^[0-9]+$' AND n.ua IS NOT NULL AND n.ua ~ ('(^|[^0-9])' || n.ib || '([^0-9]|$)')), false)
  FROM n;
$function$;

CREATE OR REPLACE FUNCTION public.retraits_clos_par_declaration_retiree()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    UPDATE public.cross_post_jobs d
       SET status = 'cancelled',
           error = 'Rien à retirer : tu as indiqué avoir retiré cette annonce toi-même.',
           platform_fields = coalesce(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
             'clos_par_declaration', jsonb_build_object('le', now(), 'job_declare', NEW.id, 'statut_avant', d.status))
     WHERE d.user_id = NEW.user_id AND d.platform = NEW.platform AND d.action = 'delete'
       AND d.status IN ('pending', 'needs_user', 'failed')
       AND public.retrait_meme_annonce(NEW.platform, d.platform_listing_id, d.listing_url, NEW.platform_listing_id, NEW.listing_url)
       AND NOT EXISTS (SELECT 1 FROM public.inventaire_doublons q
                        WHERE q.user_id = d.user_id AND q.preuves ? 'retraits_oui'
                          AND (q.preuves -> 'retraits_oui') ? d.id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'retraits_clos_par_declaration_retiree (job %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $function$;

SET check_function_bodies = off;  -- constater_absences_releve : lue par la garde (md5) seulement, jamais exécutée ici
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

RESET check_function_bodies;
CREATE TRIGGER cross_post_jobs_declaration_retiree_ferme_retraits AFTER UPDATE OF status, error ON public.cross_post_jobs FOR EACH ROW WHEN (((new.status = 'cancelled'::text) AND (COALESCE(new.action, 'publish'::text) = ANY (ARRAY['publish'::text, 'republish'::text])) AND (new.error = ANY (ARRAY['Réponse dans l''app : « je l''ai retirée moi-même » — pas une vente'::text, 'Annonce retirée par le vendeur (confirmé dans l''app)'::text])) AND ((old.status IS DISTINCT FROM new.status) OR (old.error IS DISTINCT FROM new.error)))) EXECUTE FUNCTION retraits_clos_par_declaration_retiree();
