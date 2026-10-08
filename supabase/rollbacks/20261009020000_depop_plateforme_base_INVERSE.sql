-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261009020000_depop_plateforme_base.sql (09/10/2026)
-- ⛔ À n'appliquer qu'après avoir RETIRÉ toute ligne 'depop' (jobs, annonces,
--    relevés) : les contraintes d'avant les refuseraient (NOT VALID ci-dessous
--    pour ne pas échouer, mais aucune ligne Depop ne doit rester vivante).
--   npx supabase db query --linked -f supabase/rollbacks/20261009020000_depop_plateforme_base_INVERSE.sql
-- Rend les 29 fonctions EXACTEMENT telles que lues en prod le 09/10.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS garde_depop_acces_jobs ON public.cross_post_jobs;
DROP TRIGGER IF EXISTS garde_depop_acces_annonces ON public.annonces_plateforme;
DROP TRIGGER IF EXISTS garde_depop_acces_releves ON public.vinted_sync_runs;
DROP TRIGGER IF EXISTS garde_depop_acces_creneaux ON public.republish_creneaux;
DROP TRIGGER IF EXISTS garde_depop_acces_catalogue ON public.platform_category_aspects;
ALTER TABLE public.cross_post_jobs DROP CONSTRAINT cross_post_jobs_platform_check;
ALTER TABLE public.cross_post_jobs ADD CONSTRAINT cross_post_jobs_platform_check
  CHECK (platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'ebay'::text, 'vestiaire'::text, 'opla'::text])) NOT VALID;
ALTER TABLE public.annonces_plateforme DROP CONSTRAINT annonces_plateforme_platform_check;
ALTER TABLE public.annonces_plateforme ADD CONSTRAINT annonces_plateforme_platform_check
  CHECK (platform = ANY (ARRAY['leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text])) NOT VALID;
ALTER TABLE public.vinted_sync_runs DROP CONSTRAINT vinted_sync_runs_platform_chk;
ALTER TABLE public.vinted_sync_runs ADD CONSTRAINT vinted_sync_runs_platform_chk
  CHECK (platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text])) NOT VALID;
ALTER TABLE public.republish_creneaux DROP CONSTRAINT republish_creneaux_platform_chk;
ALTER TABLE public.republish_creneaux ADD CONSTRAINT republish_creneaux_platform_chk
  CHECK (platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'opla'::text])) NOT VALID;
ALTER TABLE public.platform_category_aspects DROP CONSTRAINT platform_category_aspects_platform_check;
ALTER TABLE public.platform_category_aspects ADD CONSTRAINT platform_category_aspects_platform_check
  CHECK (platform = ANY (ARRAY['vinted'::text, 'leboncoin'::text, 'beebs'::text, 'ebay'::text, 'opla'::text])) NOT VALID;

-- alerte_lever_revues_plateformes(uuid,text)
CREATE OR REPLACE FUNCTION public.alerte_lever_revues_plateformes(p_user uuid DEFAULT NULL::uuid, p_platform text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids    uuid[];
  n_levees integer := 0;
BEGIN
  SELECT COALESCE(array_agg(j.id), ARRAY[]::uuid[]) INTO v_ids
    FROM cross_post_jobs j
   WHERE j.status = 'published'
     AND j.platform IN ('leboncoin', 'ebay', 'beebs', 'opla')
     AND (p_user IS NULL OR j.user_id = p_user)
     AND (p_platform IS NULL OR j.platform = p_platform)
     AND j.platform_fields ? 'unavailable_since'
     AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'                  -- 1
     AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM annonces_plateforme a
        WHERE a.user_id = j.user_id AND a.platform = j.platform
          AND a.listing_id = btrim(j.platform_listing_id)                             -- 5
          AND a.statut_plateforme = 'en_ligne'                                        -- 2
          AND a.disparu_le IS NULL                                                    -- 3
          AND a.vu_le > (j.platform_fields ->> 'unavailable_since')::timestamptz);    -- 4
  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'levees', 0);
  END IF;
  UPDATE cross_post_jobs SET
    platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price',
                                              'alerte_masquee_pour', 'alerte_masquee_le'])
      || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('at', now(), 'par', 'alerte_lever_revues_plateformes'))
   WHERE id = ANY (v_ids) AND status = 'published';
  GET DIAGNOSTICS n_levees = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'levees', n_levees);
END
$function$;

-- annonce_id_depuis_url(text,text)
CREATE OR REPLACE FUNCTION public.annonce_id_depuis_url(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(COALESCE(p_platform, ''))
    WHEN 'leboncoin' THEN substring(COALESCE(p_url, '') from '/(\d{6,})(?:[/?#]|$)')
    WHEN 'beebs'     THEN substring(COALESCE(p_url, '') from '/p/(\d+)(?:[-/?#]|$)')
    WHEN 'opla'      THEN substring(COALESCE(p_url, '') from '(art_[A-Za-z0-9_-]+)')
    WHEN 'ebay'      THEN substring(COALESCE(p_url, '') from '/itm/(?:[^/?#]*/)?(\d{9,})')
    ELSE NULL END
$function$;

-- annonces_en_rangement()
CREATE OR REPLACE FUNCTION public.annonces_en_rangement()
 RETURNS TABLE(annonce_id uuid, platform text, cree_le timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT x.annonce_id, x.platform, x.cree_le FROM (
    SELECT a.id annonce_id, a.platform, COALESCE(a.vu_le, a.created_at) cree_le
      FROM annonces_plateforme a
     WHERE a.user_id = auth.uid() AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.proposition IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
       AND EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = a.user_id AND c.etat <> 'termine')
    UNION ALL
    SELECT w.annonce_id, w.platform, w.cree_le
      FROM rapprochement_photo_attente w
     WHERE w.user_id = auth.uid() AND w.etat = 'attente'
  ) x
  ORDER BY x.cree_le
  LIMIT 2000;
$function$;

-- cross_post_jobs_rattacher_republication()
CREATE OR REPLACE FUNCTION public.cross_post_jobs_rattacher_republication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pf      text := lower(COALESCE(NEW.platform, ''));
  v_neuf    text;
  v_ancien  text;
  v_titre   text;
BEGIN
  IF NEW.action <> 'republish' OR NEW.status <> 'published' THEN RETURN NEW; END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'opla') THEN RETURN NEW; END IF;

  BEGIN
    v_neuf := COALESCE(NULLIF(trim(NEW.platform_listing_id), ''),
                       annonce_id_depuis_url(v_pf, NEW.listing_url));
    IF v_neuf IS NULL THEN RETURN NEW; END IF;

    -- L'ancienne : celle que CE job a retirée. Opla ne supprime rien (PATCH en
    -- place) — l'ancien et le nouveau y sont le même identifiant, et la
    -- comparaison ci-dessous l'écarte d'elle-même.
    v_ancien := COALESCE(
      NULLIF(trim(NEW.platform_fields ->> 'old_platform_listing_id'), ''),
      annonce_id_depuis_url(v_pf, NEW.platform_fields ->> 'old_listing_url'));

    IF v_ancien IS NOT NULL AND v_ancien <> v_neuf THEN
      UPDATE annonces_plateforme
         SET disparu_le = COALESCE(disparu_le, now()), updated_at = now()
       WHERE user_id = NEW.user_id AND platform = v_pf AND listing_id = v_ancien;
    END IF;

    SELECT i.titre INTO v_titre FROM inventaire i WHERE i.id = NEW.inventaire_id;

    INSERT INTO annonces_plateforme
      (user_id, platform, listing_id, url, titre, prix, statut_plateforme,
       inventaire_id, job_id, source_rapprochement, proposition, vu_le, disparu_le)
    VALUES
      (NEW.user_id, v_pf, v_neuf, NEW.listing_url, COALESCE(NEW.title, v_titre), NEW.price,
       'en_ligne', NEW.inventaire_id, NEW.id, 'job', NULL, now(), NULL)
    ON CONFLICT (user_id, platform, listing_id) DO UPDATE SET
      url                  = COALESCE(EXCLUDED.url, annonces_plateforme.url),
      titre                = COALESCE(EXCLUDED.titre, annonces_plateforme.titre),
      prix                 = COALESCE(EXCLUDED.prix, annonces_plateforme.prix),
      statut_plateforme    = 'en_ligne',
      inventaire_id        = EXCLUDED.inventaire_id,
      job_id               = EXCLUDED.job_id,
      source_rapprochement = 'job',
      proposition          = NULL,
      vu_le                = now(),
      disparu_le           = NULL,
      updated_at           = now();
  EXCEPTION WHEN OTHERS THEN
    -- Une anomalie de rattachement ne perd jamais une publication.
    RAISE WARNING 'rattachement republication job % (%): %', NEW.id, v_pf, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- demander_sync_plateforme(text)
CREATE OR REPLACE FUNCTION public.demander_sync_plateforme(p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ext  timestamptz;
  v_ver  text;
  v_min  integer;
  v_code integer;
  v_actif record;
  v_fini timestamptz;
  v_id   uuid;
  v_api  boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  IF NOT sync_multi_ouverte_pour(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_expose');
  END IF;
  -- (27/09) « Je ne vends pas sur X » : aucun relevé, même demandé à la main.
  IF plateforme_ecartee_pour(v_user, v_pf) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plateforme_ecartee');
  END IF;
  -- (04/10) eBay relié officiellement : le serveur lit le compte par l'API.
  v_api := v_pf = 'ebay' AND compte_ebay_api(v_user) IS NOT NULL;
  IF NOT v_api THEN
    SELECT extension_last_seen_at, extension_version INTO v_ext, v_ver FROM profiles WHERE id = v_user;
    IF v_ext IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'extension_jamais_vue');
    END IF;
    SELECT value INTO v_min FROM coin_config WHERE key = 'sync_multi_extension_min';
    v_min := COALESCE(v_min, 642);
    v_code := CASE WHEN v_ver ~ '^\d+\.\d+\.\d+' THEN
        (split_part(v_ver, '.', 1))::integer * 10000 + (split_part(v_ver, '.', 2))::integer * 100
        + (regexp_replace(split_part(v_ver, '.', 3), '\D.*$', ''))::integer ELSE 0 END;
    IF v_min > 0 AND v_code < v_min THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'extension_trop_ancienne', 'version', v_ver, 'minimum', v_min);
    END IF;
  END IF;
  PERFORM purger_sync_queue_perimee(v_user);
  SELECT id, status INTO v_actif FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status IN ('queued', 'running')
  ORDER BY COALESCE(queued_at, started_at) DESC LIMIT 1;
  IF v_actif.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', CASE WHEN v_actif.status = 'running' THEN 'sync_en_cours' ELSE 'deja_en_attente' END, 'run_id', v_actif.id);
  END IF;
  SELECT max(finished_at) INTO v_fini FROM vinted_sync_runs
  WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status = 'done';
  IF v_fini IS NOT NULL AND v_fini > now() - interval '15 minutes' THEN
    -- (08/10) Pas un refus : la plateforme vient d'être lue, le rangement repart.
    PERFORM rapprochement_demander(v_user, 'recent:' || v_pf);
    PERFORM rapprochement_relancer(v_user);
    RETURN jsonb_build_object('ok', true, 'reason', 'recent', 'dernier', v_fini);
  END IF;
  INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
  VALUES (v_user, 'annonces', v_pf, 'queued', 'app', now())
  RETURNING id INTO v_id;
  IF v_api THEN
    -- (08/10) Le relevé par l'API part tout de suite, jamais par l'extension.
    BEGIN
      PERFORM net.http_post(
        url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/ebay-releve-api',
        body := jsonb_build_object('quotidien', false, 'user_id', v_user),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
        timeout_milliseconds := 120000);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'demander_sync_plateforme(ebay api, %) : %', v_user, SQLERRM;
    END;
  END IF;
  RETURN jsonb_build_object('ok', true, 'reason', 'queued', 'run_id', v_id, 'par_api', v_api);
END;
$function$;

-- enregistrer_vente_atomique(uuid,text,bigint,uuid,numeric,numeric,integer,integer,text)
CREATE OR REPLACE FUNCTION public.enregistrer_vente_atomique(p_user uuid, p_cle text, p_inventaire bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_prix numeric DEFAULT NULL::numeric, p_frais numeric DEFAULT 0, p_quantite integer DEFAULT 1, p_quantite_attendue integer DEFAULT NULL::integer, p_plateforme text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '1500ms'
 SET statement_timeout TO '5s'
AS $function$
DECLARE
 j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE; copie record;
 v_inv bigint:=p_inventaire; v_cle text; precedent jsonb; v_resultat jsonb;
 v_prix numeric; v_pa numeric; v_benef numeric; v_pct numeric; v_frais numeric:=coalesce(p_frais,0);
 v_pf text:=p_plateforme; v_code text; v_libelle text; v_q integer:=coalesce(p_quantite,1); v_restant integer;
 v_vente bigint; v_ids bigint[]:='{}'; v_historique bigint; v_n integer;
 v_retraits integer:=0; v_annules integer:=0; v_proof boolean:=false;
 v_snap record;
 v_none jsonb:=jsonb_build_object('ok',false,'venteCreated',false,'inventaireUpdated',false,
  'siblingsCancelled',0,'pendingRemoval',0,'retraitsArmes',0,'emailSent',false,'venteNotee',false);
BEGIN
 IF p_user IS NULL OR (auth.uid() IS NOT NULL AND auth.uid()<>p_user) THEN
  RAISE EXCEPTION 'Compte non autorisé' USING ERRCODE='42501'; END IF;
 IF p_job IS NOT NULL THEN
  SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user;
  IF j.id IS NULL OR coalesce(j.action,'publish') NOT IN ('publish','republish') THEN
   RETURN v_none||jsonb_build_object('reason','Annonce introuvable pour cette vente.'); END IF;
  v_inv:=j.inventaire_id;
  v_cle:=CASE WHEN nullif(btrim(j.platform_listing_id),'') IS NOT NULL
    THEN 'annonce:'||j.platform||':'||btrim(j.platform_listing_id) ELSE 'job:'||j.id::text END;
  v_q:=1;
 ELSE
  IF nullif(btrim(p_cle),'') IS NULL OR length(p_cle)>150 OR v_inv IS NULL THEN
   RETURN v_none||jsonb_build_object('reason','La référence de cette confirmation de vente manque.'); END IF;
  v_cle:='manuel:'||p_cle;
 END IF;
 -- Tous les chemins prennent d'abord le verrou de la fiche, puis des jobs.
 -- Deux plateformes de la même fiche ne peuvent pas consommer en parallèle.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||':'||coalesce(v_inv::text,v_cle),0));
 SELECT o.resultat INTO precedent FROM ventes_operations o WHERE o.user_id=p_user AND o.cle=v_cle;
 IF FOUND THEN RETURN precedent||jsonb_build_object('rejouee',true,'venteCreated',false,'inventaireUpdated',false); END IF;
 IF v_inv IS NOT NULL THEN
  SELECT * INTO i FROM inventaire WHERE id=v_inv AND user_id=p_user FOR UPDATE;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
   RETURN v_none||jsonb_build_object('reason','La fiche de cet exemplaire doit être confirmée avant d’enregistrer la vente.'); END IF;
 END IF;
 IF p_job IS NOT NULL THEN
  SELECT * INTO j FROM cross_post_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
  IF j.inventaire_id IS DISTINCT FROM v_inv THEN RAISE EXCEPTION 'La fiche a changé ; réessaie.'; END IF;
  IF nullif(j.platform_fields->>'vente_operation_cle','') IS NOT NULL THEN
   SELECT o.resultat INTO precedent FROM ventes_operations o
    WHERE o.user_id=p_user AND o.cle=j.platform_fields->>'vente_operation_cle';
   IF FOUND THEN RETURN precedent||jsonb_build_object('rejouee',true,'venteCreated',false,'inventaireUpdated',false); END IF;
  END IF;
  IF j.status='sold' THEN
   -- Ancienne vente sans reçu : ne jamais reconsommer ni inventer son lien.
   RETURN v_none||jsonb_build_object('reason','Cette ancienne vente doit être vérifiée dans tes ventes avant toute nouvelle confirmation. Aucun stock n’a été recompté.'); END IF;
  IF j.status<>'published' THEN RETURN v_none||jsonb_build_object('reason','Cette annonce n’est plus à confirmer comme vendue.'); END IF;
  -- (08/10, Louis) VINTED : une annonce que la synchro du dressing a revue EN
  -- LIGNE après son signal n'est pas vendue ; une annonce remplacée par une
  -- autre annonce EN LIGNE de la même fiche non plus (« Vendue ? » sur une
  -- copie disparue : 14 ventes déclarées le 06/10, 4 annonces toujours en ligne).
  IF j.platform='vinted' AND nullif(btrim(j.platform_listing_id),'') IS NOT NULL THEN
   SELECT s.status, s.captured_at INTO v_snap FROM vinted_listing_snapshots s
    WHERE s.user_id=p_user AND s.vinted_item_id=btrim(j.platform_listing_id) ORDER BY s.captured_at DESC LIMIT 1;
   IF v_snap.status='active' AND (v_snap.captured_at>=coalesce(_ts_ou_null(j.platform_fields->>'unavailable_since'),j.published_at,j.created_at)
      -- (08/10) ou relevé de la MÊME synchro du dressing que le signal (horodaté juste avant lui)
      OR EXISTS(SELECT 1 FROM vinted_sync_runs r WHERE r.user_id=p_user AND r.kind='dressing'
        AND r.started_at<=LEAST(v_snap.captured_at,_ts_ou_null(j.platform_fields->>'unavailable_since'))
        AND coalesce(r.finished_at,now())>=GREATEST(v_snap.captured_at,_ts_ou_null(j.platform_fields->>'unavailable_since')))) THEN
    RETURN v_none||jsonb_build_object('reason','Cette annonce est toujours en ligne sur Vinted (relevé du dressing du '
      ||to_char(v_snap.captured_at AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')||') : aucune vente n’est enregistrée.');
   END IF;
   IF coalesce(j.platform_fields->>'sale_signal','')<>'sold' AND i.id IS NOT NULL
      AND nullif(btrim(i.vinted_item_id),'') IS NOT NULL AND btrim(i.vinted_item_id)<>btrim(j.platform_listing_id)
      AND coalesce(i.vinted_status,'')='active' AND i.disparu_le IS NULL
      AND EXISTS(SELECT 1 FROM vinted_listing_snapshots s WHERE s.user_id=p_user AND s.vinted_item_id=btrim(i.vinted_item_id)
                  AND s.status='active' AND s.captured_at>now()-interval '26 hours') THEN
    RETURN v_none||jsonb_build_object('reason','Cet article est en ligne sur Vinted sous une autre annonce ('||btrim(i.vinted_item_id)
      ||') : celle-ci a été remplacée, ce n’est pas une vente.');
   END IF;
  END IF;
  IF NOT retrait_job_prouve(j.id) OR (v_inv IS NOT NULL AND fiche_annonces_vivantes(v_inv,j.platform)>1) THEN
   RETURN v_none||jsonb_build_object('reason','Plusieurs exemplaires sont possibles. Confirme la fiche de cette annonce avant d’enregistrer sa vente.'); END IF;
  v_proof:=coalesce(j.platform_fields->>'sale_signal','')='sold';
  IF NOT v_proof AND j.platform='vinted' AND nullif(j.platform_listing_id,'') IS NOT NULL THEN
   SELECT s.status='sold' INTO v_proof FROM vinted_listing_snapshots s
    WHERE s.user_id=p_user AND s.vinted_item_id=j.platform_listing_id ORDER BY s.captured_at DESC LIMIT 1;
  END IF;
  v_pf:=CASE WHEN coalesce(v_proof,false) THEN j.platform ELSE 'ailleurs' END;
  v_prix:=coalesce(p_prix,j.price); v_frais:=0;
 ELSE
  v_prix:=p_prix;
 END IF;
 -- (02/10 soir, point 8) La plateforme de la vente se compare par son CODE
 -- (« vinted »), jamais par son libellé (« Vinted ») : l'annonce de la
 -- plateforme vendue n'était jamais passée « vendue », et les ventes n'avaient
 -- pas de plateforme_code. Le libellé reste celui de l'écran.
 v_code:=coalesce(plateforme_normalisee(v_pf),'ailleurs');
 IF v_code='autre' THEN v_code:='ailleurs'; END IF;
 v_libelle:=CASE WHEN p_job IS NOT NULL OR v_pf IS NULL OR v_pf=v_code THEN
   CASE v_code WHEN 'vinted' THEN 'Vinted' WHEN 'ebay' THEN 'eBay' WHEN 'leboncoin' THEN 'Leboncoin'
     WHEN 'beebs' THEN 'Beebs' WHEN 'opla' THEN 'Opla' ELSE 'Ailleurs' END ELSE v_pf END;
 IF v_prix IS NULL OR v_prix<=0 OR v_prix::text IN ('NaN','Infinity','-Infinity') OR v_frais<0 OR v_frais::text IN ('NaN','Infinity','-Infinity')
    OR v_q<1 OR v_q>1000 THEN RETURN v_none||jsonb_build_object('reason','Vérifie le prix, les frais et la quantité vendue.'); END IF;
 IF v_inv IS NOT NULL THEN
  IF i.statut='vendu' OR coalesce(i.quantite,1)<v_q THEN
   RETURN v_none||jsonb_build_object('reason','Ce stock a déjà été vendu ou modifié. Actualise-le avant de confirmer.'); END IF;
  IF p_job IS NULL AND (p_quantite_attendue IS NULL OR coalesce(i.quantite,1) IS DISTINCT FROM p_quantite_attendue) THEN
   RETURN v_none||jsonb_build_object('reason','La quantité en stock a changé. Actualise-la avant de confirmer la vente.'); END IF;
  -- Une vente historique potentiellement identique n'est jamais recomptée.
  -- Les ventes des opérations précédentes sont distinguées par leur reçu.
  IF EXISTS(SELECT 1 FROM ventes v WHERE v.user_id=p_user AND v.inventaire_id=v_inv
    AND (p_job IS NULL OR v.created_at>=coalesce(j.published_at,j.created_at))
    AND NOT EXISTS(SELECT 1 FROM ventes_operations o WHERE o.user_id=p_user AND o.inventaire_id=v_inv
      AND o.resultat->'ventes_ids' @> to_jsonb(ARRAY[v.id])) LIMIT 1) THEN
   RETURN v_none||jsonb_build_object('reason','Une vente est déjà liée à cette fiche. Vérifie-la dans tes ventes pour éviter de la compter deux fois.'); END IF;
  v_pa:=CASE WHEN i.prix_achat_inconnu THEN NULL ELSE i.prix_achat END;
  v_benef:=CASE WHEN v_pa IS NOT NULL THEN v_prix-v_pa-coalesce(i.purchase_costs,0)-v_frais END;
  v_pct:=v_benef/v_prix*100; v_restant:=coalesce(i.quantite,1)-v_q;
 END IF;
 -- Le reçu et toutes les écritures suivantes disparaissent ensemble en cas d'erreur.
 INSERT INTO ventes_operations(user_id,cle,inventaire_id,job_id,resultat) VALUES(p_user,v_cle,v_inv,p_job,'{}');
 IF p_job IS NOT NULL THEN
  UPDATE cross_post_jobs SET status='sold',sold_at=now(),last_checked_at=now(),
   platform_fields=coalesce(platform_fields,'{}')||jsonb_build_object('vente_operation_cle',v_cle)
   WHERE id=j.id;
 END IF;
 FOR v_n IN 1..v_q LOOP
  INSERT INTO ventes(user_id,inventaire_id,titre,prix_achat,prix_vente,benefice,marque,type,description,
    emplacement,date,plateforme,plateforme_code,annonce_id,quantite,statut,selling_fees)
   VALUES(p_user,v_inv,coalesce(j.title,i.titre),v_pa,v_prix,v_benef,i.marque,i.type,i.description,
    i.emplacement,(now() AT TIME ZONE 'Europe/Paris')::date,v_libelle,v_code,
    CASE WHEN p_job IS NOT NULL THEN nullif(btrim(j.platform_listing_id),'') END,1,'vendu',v_frais) RETURNING id INTO v_vente;
  v_ids:=array_append(v_ids,v_vente);
 END LOOP;
 IF v_inv IS NOT NULL THEN
  IF v_restant>0 THEN
   UPDATE inventaire SET quantite=v_restant WHERE id=v_inv;
   LOOP
    v_historique:=(extract(epoch FROM clock_timestamp())*1000)::bigint+(random()*9999)::int;
    EXIT WHEN NOT EXISTS(SELECT 1 FROM inventaire WHERE id=v_historique);
   END LOOP;
   INSERT INTO inventaire(id,user_id,titre,prix_achat,prix_achat_inconnu,purchase_costs,prix_vente,margin,margin_pct,
    selling_fees,statut,quantite,marque,type,description,emplacement,plateforme,date)
   VALUES(v_historique,p_user,i.titre,v_pa,v_pa IS NULL,0,v_prix,v_benef,v_pct,v_frais,'vendu',v_q,
    i.marque,i.type,i.description,i.emplacement,v_libelle,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  ELSE
   UPDATE inventaire SET quantite=CASE WHEN p_job IS NULL THEN v_q ELSE 0 END,
    statut='vendu',prix_vente=v_prix,margin=v_benef,margin_pct=v_pct,
    selling_fees=v_frais,plateforme=v_libelle,date=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE id=v_inv;
  END IF;
  FOR copie IN SELECT c.id,c.status,c.platform FROM cross_post_jobs c
    WHERE c.user_id=p_user AND c.inventaire_id=v_inv AND c.id IS DISTINCT FROM p_job
      AND c.action IN ('publish','republish') AND c.status IN ('pending','processing','needs_user','published')
      AND (p_job IS NULL OR c.platform IS DISTINCT FROM j.platform)
      -- Une vente partielle ne clôt que l'annonce explicitement vendue.
      -- Les autres annonces gardent leur stock et leur propre futur reçu.
      AND (v_restant=0 OR (p_job IS NULL AND c.platform=v_code AND c.status='published'))
      AND retrait_job_prouve(c.id) AND fiche_annonces_vivantes(v_inv,c.platform)<2
    ORDER BY c.id LIMIT 25 FOR UPDATE OF c
  LOOP
   UPDATE cross_post_jobs SET platform_fields=coalesce(platform_fields,'{}')||jsonb_build_object('vente_operation_cle',v_cle) WHERE id=copie.id;
   IF p_job IS NULL AND copie.platform=v_code AND copie.status='published' THEN
    -- La personne a nommé la plateforme de cette vente. La seule annonce
    -- prouvée de cet exemplaire y est soldée, jamais retirée.
    UPDATE cross_post_jobs SET status='sold',sold_at=now() WHERE id=copie.id;
   ELSIF copie.status='published' THEN
    IF armer_retrait_job(copie.id,'vente_copie_prouvee','0 seconds') IS NOT NULL THEN v_retraits:=v_retraits+1; END IF;
   ELSE
    UPDATE cross_post_jobs SET status='cancelled',error='Cet exemplaire a été vendu ; cette publication est arrêtée.' WHERE id=copie.id;
    v_annules:=v_annules+1;
   END IF;
  END LOOP;
 END IF;
 IF p_job IS NOT NULL THEN
  INSERT INTO usage_logs(user_id,feature,metadata) VALUES(p_user,'vente_a_annoncer',
   jsonb_build_object('job_id',j.id,'inventaire_id',v_inv::text,'plateforme',v_code,'plateforme_annonce',j.platform,
    'titre',coalesce(j.title,i.titre),'prix_vente',v_prix,'benefice',v_benef,'retraits_a_cliquer',0,
    'retrait_beebs_auto',v_retraits,'vendu_le',now()));
 END IF;
 v_resultat:=v_none||jsonb_build_object('ok',true,'venteCreated',true,'inventaireUpdated',v_inv IS NOT NULL,
  'siblingsCancelled',v_annules,'retraitsArmes',v_retraits,'venteNotee',p_job IS NOT NULL,
  'ventes_ids',to_jsonb(v_ids),'restant',v_restant,'rejouee',false);
 UPDATE ventes_operations SET resultat=v_resultat WHERE user_id=p_user AND cle=v_cle;
 RETURN v_resultat;
END;
$function$;

-- enregistrer_ventes_relevees(text,jsonb,uuid)
CREATE OR REPLACE FUNCTION public.enregistrer_ventes_relevees(p_platform text, p_rows jsonb, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_row    jsonb;
  v_ref    text; v_titre text; v_prix numeric; v_devise text; v_vendu timestamptz;
  v_statut text; v_classe text; v_listing text; v_url text;
  v_frais  numeric; v_lot boolean;
  v_inv    bigint; v_bande text; v_verdict jsonb;
  v_adopte bigint; v_nb_adoptables int;
  v_insere boolean; v_cle text;
  v_pa numeric; v_pai boolean; v_pc numeric; v_benef numeric; v_pct numeric;
  v_st text; v_pv numeric;
  v_meme boolean; v_rel_id bigint; v_rel_inv bigint; v_manu bigint;
  c_recues int := 0; c_sans_ref int := 0; c_annulees int := 0; c_en_cours int := 0;
  c_creees int := 0; c_adoptees int := 0; c_deja int := 0;
  c_rattachees int := 0; c_lots int := 0; c_inv_completes int := 0;
  c_fusionnees int := 0;
  c_supprimees int := 0;
  v_rel record; v_q_fiche int; v_autres_cmd boolean;
  v_inconnus jsonb := '{}'::jsonb;
BEGIN
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','ebay','opla') THEN
    RAISE EXCEPTION 'plateforme non relevable: %', coalesce(p_platform,'(null)');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) LOOP
    c_recues := c_recues + 1;
    v_ref     := nullif(btrim(coalesce(v_row ->> 'ref', '')), '');
    v_statut  := coalesce(v_row ->> 'statut', '');
    v_titre   := nullif(btrim(coalesce(v_row ->> 'titre', '')), '');
    v_prix    := nullif(v_row ->> 'prix', '')::numeric;
    v_devise  := nullif(btrim(coalesce(v_row ->> 'devise', '')), '');
    v_vendu   := nullif(v_row ->> 'vendu_le', '')::timestamptz;
    v_listing := nullif(btrim(coalesce(v_row ->> 'listing_id', '')), '');
    v_url     := nullif(btrim(coalesce(v_row ->> 'url', '')), '');
    v_frais   := nullif(v_row ->> 'frais', '')::numeric;
    v_lot     := coalesce((v_row ->> 'lot')::boolean, false);

    IF v_ref IS NULL THEN c_sans_ref := c_sans_ref + 1; CONTINUE; END IF;

    -- (04/10) UNE VENTE SUPPRIMÉE PAR LA PERSONNE NE REVIENT JAMAIS : même
    -- commande sur la même plateforme, ou — pour une vente supprimée qui
    -- n'avait pas de commande — même annonce.
    IF EXISTS (SELECT 1 FROM ventes_supprimees s
                WHERE s.user_id = v_user AND s.plateforme_code = p_platform
                  AND (s.commande_ref = v_ref
                       OR (s.commande_ref IS NULL AND v_listing IS NOT NULL AND s.annonce_id = v_listing))) THEN
      c_supprimees := c_supprimees + 1;
      CONTINUE;
    END IF;

    v_classe := ventes_statut_classe(p_platform, v_statut);
    IF v_classe = 'annulee' THEN c_annulees := c_annulees + 1; CONTINUE; END IF;
    IF v_classe = 'en_cours' THEN c_en_cours := c_en_cours + 1; CONTINUE; END IF;
    IF v_classe <> 'vente' THEN
      v_cle := left(coalesce(nullif(v_statut,''), '(vide)'), 40);
      v_inconnus := jsonb_set(v_inconnus, ARRAY[v_cle],
                              to_jsonb(coalesce((v_inconnus ->> v_cle)::int, 0) + 1));
      CONTINUE;
    END IF;

    v_inv := NULL; v_bande := NULL;
    IF v_lot THEN
      c_lots := c_lots + 1;
      v_bande := 'lot';
    ELSE
      IF v_listing IS NOT NULL THEN
        IF p_platform = 'vinted' THEN
          SELECT i.id INTO v_inv FROM inventaire i
           WHERE i.user_id = v_user AND i.vinted_item_id = v_listing AND i.fusionne_dans IS NULL
           ORDER BY i.id DESC LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT ap.inventaire_id INTO v_inv FROM annonces_plateforme ap
           WHERE ap.user_id = v_user AND ap.platform = p_platform
             AND ap.listing_id = v_listing AND ap.inventaire_id IS NOT NULL
             AND public.retrait_job_prouve(ap.job_id)
           ORDER BY ap.updated_at DESC NULLS LAST LIMIT 1;
        END IF;
        IF v_inv IS NULL THEN
          SELECT j.inventaire_id INTO v_inv FROM cross_post_jobs j
           WHERE j.user_id = v_user AND j.platform = p_platform AND j.inventaire_id IS NOT NULL
             AND j.action IN ('publish', 'republish') AND public.retrait_job_prouve(j.id)
             AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
           ORDER BY coalesce(j.published_at, j.created_at) DESC LIMIT 1;
        END IF;
        IF v_inv IS NOT NULL THEN v_bande := 'identifiant'; END IF;
      END IF;

      IF v_inv IS NULL AND v_titre IS NOT NULL
         AND NOT coalesce((v_row ->> 'id_attendu')::boolean, false) THEN
        v_verdict := rapprocher_classer(v_user, p_platform, coalesce(v_listing,''),
                                        coalesce(v_url,''), v_titre, v_prix, ARRAY[]::text[]);
        v_bande := v_verdict ->> 'bande';
        IF v_bande IN ('job','job_clos') THEN
          v_inv := nullif(v_verdict ->> 'inventaire_id','')::bigint;
        ELSE
          v_inv := NULL;
        END IF;
      END IF;
    END IF;
    IF v_inv IS NOT NULL THEN
      -- Même verrou que la confirmation manuelle : le relevé ne peut pas
      -- insérer une deuxième vente pendant la confirmation de la première.
      PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text||':'||v_inv::text,0));
      PERFORM 1 FROM inventaire WHERE id=v_inv AND user_id=v_user FOR UPDATE;
      c_rattachees := c_rattachees + 1;
    END IF;

    v_pa := NULL; v_pai := NULL; v_pc := 0; v_benef := NULL; v_pct := NULL;
    IF v_inv IS NOT NULL THEN
      SELECT i.prix_achat, i.prix_achat_inconnu, coalesce(i.purchase_costs,0)
        INTO v_pa, v_pai, v_pc FROM inventaire i WHERE i.id = v_inv;
      IF coalesce(v_pai,false) THEN v_pa := NULL; END IF;
      IF v_pa IS NOT NULL AND v_prix IS NOT NULL THEN
        v_benef := v_prix - v_pa - v_pc - coalesce(v_frais,0);
        IF v_prix > 0 THEN v_pct := (v_benef / v_prix) * 100; END IF;
      END IF;
    END IF;

    v_adopte := NULL;
    IF v_inv IS NOT NULL AND v_listing IS NOT NULL AND NOT v_lot THEN
      -- Un reçu lie cette vente à CET identifiant d'annonce, y compris une
      -- copie dont la confirmation est arrivée par une autre plateforme.
      SELECT v.id INTO v_adopte FROM ventes_operations o
      JOIN ventes v ON v.id=(o.resultat#>>'{ventes_ids,0}')::bigint AND v.user_id=v_user
      WHERE o.user_id=v_user AND o.inventaire_id=v_inv
        AND jsonb_array_length(o.resultat->'ventes_ids')=1
        AND (v.commande_ref IS NULL OR v.commande_ref=v_ref)
        AND (o.cle='annonce:'||p_platform||':'||v_listing OR EXISTS(
          SELECT 1 FROM cross_post_jobs j WHERE j.user_id=v_user AND j.inventaire_id=v_inv
            AND j.platform=p_platform AND listing_designe(v_listing,j.listing_url,j.platform_listing_id)
            AND j.platform_fields->>'vente_operation_cle'=o.cle))
      ORDER BY o.cree_le DESC LIMIT 1;
    END IF;
    -- (02/10 soir, point 9) La ligne que le relevé a DÉJÀ posée pour cette
    -- commande (premier temps Vinted : liste sans numéro d'annonce).
    v_rel := NULL;
    SELECT v.* INTO v_rel FROM ventes v
     WHERE v.user_id = v_user AND v.plateforme_code = p_platform AND v.commande_ref = v_ref;
    -- LA VENTE SAISIE DE LA MÊME CESSION (02/10 soir, point 9 — règle de Nico :
    -- « le relevé ne crée jamais une deuxième vente pour un article qui a déjà
    -- une vente enregistrée pour cette même cession ; il complète l'existante »).
    -- Preuve : la fiche, désignée par le NUMÉRO d'annonce (v_inv ci-dessus),
    -- porte UNE seule vente sans commande, de cette plateforme ou sans
    -- plateforme ; aucune autre commande n'y est déjà relevée ; et la fiche est
    -- à pièce unique (quantité ≤ 1, jamais une revente en plusieurs exemplaires).
    -- Jamais le titre. Sans preuve, deux lignes restent (la vente reste
    -- « à compléter », visible).
    IF v_adopte IS NULL AND v_inv IS NOT NULL AND NOT v_lot THEN
      SELECT coalesce(i.quantite, 1) INTO v_q_fiche FROM inventaire i WHERE i.id = v_inv;
      SELECT EXISTS (SELECT 1 FROM ventes v WHERE v.user_id = v_user AND v.inventaire_id = v_inv
                       AND v.commande_ref IS NOT NULL AND v.commande_ref <> v_ref) INTO v_autres_cmd;
      SELECT count(*) INTO v_nb_adoptables FROM ventes v
       WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
         AND v.id IS DISTINCT FROM v_rel.id
         AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform;
      IF v_nb_adoptables = 1 AND NOT v_autres_cmd AND coalesce(v_q_fiche, 1) <= 1 THEN
        SELECT v.id INTO v_adopte FROM ventes v
         WHERE v.user_id = v_user AND v.inventaire_id = v_inv AND v.commande_ref IS NULL
           AND v.id IS DISTINCT FROM v_rel.id
           AND coalesce(plateforme_normalisee(coalesce(v.plateforme_code, v.plateforme)), p_platform) = p_platform
         LIMIT 1;
      END IF;
    END IF;

    IF v_adopte IS NOT NULL THEN
      -- (02/10 soir, point 9) CE QUE LA PERSONNE A SAISI PRIME : prix de vente,
      -- prix d'achat, date et bénéfice saisis ne bougent pas ; le relevé ne
      -- remplit que ce qui est vide (date réelle vendu_le, plateforme, commande,
      -- numéro d'annonce, frais). La ligne que le relevé avait posée pour cette
      -- commande est FUSIONNÉE dans la vente gardée (trace complète dans
      -- usage_logs 'vente_fusionnee'), puis supprimée — AVANT de poser la
      -- commande sur la vente gardée : plus jamais la collision 23505 qui
      -- faisait échouer tout le relevé.
      IF v_rel.id IS NOT NULL AND v_rel.id <> v_adopte THEN
        INSERT INTO usage_logs (user_id, feature, metadata)
        VALUES (v_user, 'vente_fusionnee', jsonb_build_object(
          'gardee', v_adopte, 'fusionnee', to_jsonb(v_rel), 'motif', 'releve_dans_vente_saisie',
          'plateforme', p_platform, 'commande', v_ref, 'annonce', v_listing, 'inventaire_id', v_inv,
          'par', 'enregistrer_ventes_relevees'));
        DELETE FROM ventes WHERE id = v_rel.id AND user_id = v_user;
        c_fusionnees := c_fusionnees + 1;
      END IF;
      UPDATE ventes v SET
        commande_ref       = v_ref,
        plateforme_code    = p_platform,
        plateforme_origine = coalesce(v.plateforme_origine, v.plateforme),
        plateforme         = coalesce(v.plateforme, p_platform),
        vendu_le           = coalesce(v.vendu_le, v_vendu, v_rel.vendu_le),
        date               = coalesce(v.date, (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_rel.date),
        prix_vente         = coalesce(v.prix_vente, v_prix, v_rel.prix_vente),
        prix_achat         = coalesce(v.prix_achat, v_pa),
        benefice           = coalesce(v.benefice,
                               CASE WHEN coalesce(v.prix_vente, v_prix) IS NOT NULL AND coalesce(v.prix_achat, v_pa) IS NOT NULL
                                    THEN coalesce(v.prix_vente, v_prix) - coalesce(v.prix_achat, v_pa) - v_pc
                                         - coalesce(v.frais_plateforme, v_frais, 0) END),
        devise             = coalesce(v.devise, v_devise, v_rel.devise),
        frais_plateforme   = coalesce(v.frais_plateforme, v_frais, v_rel.frais_plateforme),
        titre              = coalesce(nullif(btrim(v.titre),''), v_titre),
        inventaire_id      = coalesce(v.inventaire_id, v_inv),
        annonce_id         = coalesce(v.annonce_id, v_listing),
        releve_le          = now()
      WHERE v.id = v_adopte;
      c_adoptees := c_adoptees + 1;
    ELSE
      INSERT INTO ventes (
        user_id, titre, prix_vente, prix_achat, benefice, date, vendu_le,
        plateforme, plateforme_code, plateforme_origine, commande_ref,
        source, releve_le, devise, frais_plateforme, selling_fees,
        inventaire_id, quantite, statut, annonce_id
      ) VALUES (
        v_user, v_titre, v_prix, v_pa, v_benef,
        (v_vendu AT TIME ZONE 'Europe/Paris')::date, v_vendu,
        p_platform, p_platform, NULL, v_ref,
        'releve', now(), v_devise, v_frais, coalesce(v_frais, 0),
        v_inv, 1, 'vendu', CASE WHEN v_lot THEN NULL ELSE v_listing END
      )
      ON CONFLICT (user_id, plateforme_code, commande_ref)
        WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL
      DO UPDATE SET
        vendu_le         = coalesce(ventes.vendu_le, EXCLUDED.vendu_le),
        date             = coalesce(ventes.date, EXCLUDED.date),
        prix_vente       = coalesce(ventes.prix_vente, EXCLUDED.prix_vente),
        devise           = coalesce(ventes.devise, EXCLUDED.devise),
        frais_plateforme = coalesce(ventes.frais_plateforme, EXCLUDED.frais_plateforme),
        titre            = coalesce(nullif(btrim(ventes.titre),''), EXCLUDED.titre),
        inventaire_id    = coalesce(ventes.inventaire_id, EXCLUDED.inventaire_id),
        -- (02/10 soir) la fiche arrive au second temps : son prix d'achat et
        -- le bénéfice viennent avec (jamais un écrasement d'une valeur posée).
        prix_achat       = coalesce(ventes.prix_achat, EXCLUDED.prix_achat),
        benefice         = coalesce(ventes.benefice, EXCLUDED.benefice),
        annonce_id       = coalesce(ventes.annonce_id, EXCLUDED.annonce_id),
        releve_le        = now()
      RETURNING (xmax = 0) INTO v_insere;
      IF v_insere THEN c_creees := c_creees + 1; ELSE c_deja := c_deja + 1; END IF;

      -- (02/10 soir, point 9) L'ancien « passage détail » SUPPRIMAIT la vente
      -- saisie par la personne et gardait les valeurs du relevé : retiré. La
      -- même cession est désormais fusionnée DANS la vente saisie (plus haut).
    END IF;

    IF v_inv IS NOT NULL AND v_prix IS NOT NULL THEN
      SELECT i.statut, i.prix_vente INTO v_st, v_pv FROM inventaire i WHERE i.id = v_inv;
      IF v_st = 'vendu' AND v_pv IS NULL THEN
        UPDATE inventaire i SET prix_vente = v_prix,
               margin = coalesce(i.margin, v_benef), margin_pct = coalesce(i.margin_pct, v_pct)
         WHERE i.id = v_inv AND i.statut = 'vendu' AND i.prix_vente IS NULL;
        c_inv_completes := c_inv_completes + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'plateforme', p_platform, 'recues', c_recues, 'creees', c_creees,
    'adoptees', c_adoptees, 'deja_connues', c_deja, 'rattachees', c_rattachees,
    'lots', c_lots, 'annulees', c_annulees, 'en_cours', c_en_cours,
    'sans_ref', c_sans_ref, 'statuts_inconnus', v_inconnus,
    'articles_completes', c_inv_completes, 'saisies_fusionnees', c_fusionnees,
    'supprimees_par_la_personne', c_supprimees);
END;
$function$;

-- identifiant_annonce_depuis_lien(text,text)
CREATE OR REPLACE FUNCTION public.identifiant_annonce_depuis_lien(p_platform text, p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_platform
    WHEN 'vinted'    THEN substring(p_url from '/items/([0-9]+)')
    WHEN 'beebs'     THEN substring(p_url from '/p/([0-9]+)(?:[-/?#]|$)')
    WHEN 'ebay'      THEN substring(p_url from '/itm/(?:[^/?#]*/)?([0-9]{9,})')
    WHEN 'leboncoin' THEN substring(p_url from '/([0-9]{6,})(?:\.htm)?(?:[/?#]|$)')
    WHEN 'opla'      THEN substring(p_url from '(art_[A-Za-z0-9_-]+)')
  END;
$function$;

-- plateforme_ecartee_message(text)
CREATE OR REPLACE FUNCTION public.plateforme_ecartee_message(p_platform text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT 'En pause : tu as indiqué ne pas vendre sur '
    || CASE lower(p_platform) WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay'
                              WHEN 'opla' THEN 'Opla' WHEN 'vinted' THEN 'Vinted' ELSE p_platform END
    || '. Rien ne part sur cette plateforme. Pour la reprendre, réactive-la dans Réglages › Plateformes : '
    || 'cette publication repartira d''elle-même.';
$function$;

-- plateforme_ecarter(text,boolean)
CREATE OR REPLACE FUNCTION public.plateforme_ecarter(p_platform text, p_ecarter boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf   text := lower(COALESCE(NULLIF(trim(p_platform), ''), ''));
  v_ps   jsonb; v_liste jsonb; v_n integer := 0; v_jobs integer := 0;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF v_pf NOT IN ('vinted', 'leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_platform');
  END IF;
  SELECT COALESCE(platform_settings, '{}'::jsonb) INTO v_ps FROM profiles WHERE id = v_user FOR UPDATE;
  v_liste := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_liste FROM jsonb_array_elements(v_liste) e WHERE (e #>> '{}') <> v_pf;
  IF p_ecarter THEN v_liste := v_liste || to_jsonb(v_pf); END IF;
  UPDATE profiles SET platform_settings = v_ps || jsonb_build_object('plateformes_ecartees', v_liste) WHERE id = v_user;
  IF p_ecarter THEN
    UPDATE vinted_sync_runs
       SET status = 'cancelled', finished_at = now(), updated_at = now(),
           erreur = 'plateforme écartée par l''utilisateur (« je ne vends pas sur ' || v_pf || ' »)'
     WHERE user_id = v_user AND status = 'queued'
       AND ((kind = 'annonces' AND platform = v_pf) OR (kind = 'dressing' AND v_pf = 'vinted'));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    -- Les publications et republications en attente passent EN PAUSE, avec la
    -- phrase qui dit pourquoi et comment reprendre. Les retraits continuent.
    UPDATE cross_post_jobs j SET
      status = 'needs_user',
      error = plateforme_ecartee_message(v_pf),
      platform_fields = COALESCE(j.platform_fields, '{}'::jsonb) || jsonb_build_object(
        'needs_user_source', 'plateforme_ecartee',
        'plateforme_ecartee', jsonb_build_object('le', now(), 'statut_avant', j.status,
                                                 'source_avant', j.platform_fields -> 'needs_user_source'))
     WHERE j.user_id = v_user AND j.platform = v_pf
       AND j.action IN ('publish', 'republish') AND j.status = 'pending';
    GET DIAGNOSTICS v_jobs = ROW_COUNT;
  ELSE
    -- Réactivée : ce qui avait été mis en pause par l'abandon repart tel quel.
    UPDATE cross_post_jobs j SET
      status = COALESCE(NULLIF(j.platform_fields #>> '{plateforme_ecartee,statut_avant}', ''), 'pending'),
      error = NULL,
      platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb) - 'needs_user_source' - 'plateforme_ecartee')
        || CASE WHEN jsonb_typeof(j.platform_fields #> '{plateforme_ecartee,source_avant}') = 'string'
                THEN jsonb_build_object('needs_user_source', j.platform_fields #> '{plateforme_ecartee,source_avant}')
                ELSE '{}'::jsonb END
        || jsonb_build_object('plateforme_reprise_le', now())
     WHERE j.user_id = v_user AND j.platform = v_pf
       AND j.status = 'needs_user' AND j.platform_fields ->> 'needs_user_source' = 'plateforme_ecartee';
    GET DIAGNOSTICS v_jobs = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'plateforme', v_pf, 'ecartee', p_ecarter, 'ecartees', v_liste,
                            'demandes_annulees', v_n, 'jobs_en_pause_ou_repris', v_jobs);
END;
$function$;

-- plateforme_normalisee(text)
CREATE OR REPLACE FUNCTION public.plateforme_normalisee(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p is null or btrim(p) = '' then null
    when lower(p) like '%vinted%' then 'vinted'
    when lower(p) like '%leboncoin%' or lower(btrim(p)) in ('lbc', 'le bon coin') then 'leboncoin'
    when lower(p) like '%beebs%' then 'beebs'
    when lower(p) like '%ebay%' then 'ebay'
    when lower(p) like '%opla%' then 'opla'
    when lower(p) like '%ailleurs%' or lower(p) like '%main propre%' then 'ailleurs'
    else 'autre'
  end;
$function$;

-- plateformes_verite(uuid)
CREATE OR REPLACE FUNCTION public.plateformes_verite(p_user uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_s jsonb; v_ps jsonb; v_ext timestamptz; v_ver text;
  v_decl jsonb; v_ecart jsonb;
  v_ebay_api timestamptz;
  v_out jsonb := '{}'::jsonb;
  pf text;
  v_facts jsonb; v_best jsonb;
  r record; v_dep timestamptz;
  v_sonde_v text; v_sonde_ts timestamptz; v_http text; v_hub text; v_mur text;
  v_etat text; v_source text; v_depuis timestamptz; v_motif text; v_action text; v_action2 text;
  v_declaree boolean; v_ecartee boolean;
  -- Postes de l'extension (2026-09-24) : la permission d'hôte opla.co se juge
  -- PAR POSTE (profiles.extension_postes), jamais par la sonde.
  v_postes jsonb; v_poste_ok_le timestamptz; v_poste_ko_le timestamptz;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT extension_sessions, COALESCE(platform_settings, '{}'::jsonb), extension_last_seen_at, extension_version, COALESCE(extension_postes, '{}'::jsonb)
    INTO v_s, v_ps, v_ext, v_ver, v_postes FROM profiles WHERE id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'profil_introuvable'); END IF;
  v_decl  := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_vendeur')  = 'array' THEN v_ps -> 'plateformes_vendeur'  ELSE '[]'::jsonb END;
  v_ecart := CASE WHEN jsonb_typeof(v_ps -> 'plateformes_ecartees') = 'array' THEN v_ps -> 'plateformes_ecartees' ELSE '[]'::jsonb END;
  -- ebay_accounts est REVOKE pour authenticated (jetons OAuth) : lue par une
  -- fonction DEFINER qui ne rend QUE la date (2026-09-24). Avant, ce SELECT
  -- direct échouait « permission denied » sous l'app et sous le trigger du
  -- premier relevé : 2 128 échecs en 24 h, aucun relevé planifié à l'inscription.
  v_ebay_api := ebay_compte_relie_le(p_user);
  -- Le dernier poste vu AVEC l'accès Opla, et le dernier vu SANS (2026-09-24).
  -- 48 h : la fenêtre de postesVivants (_shared/poste-extension.ts). Une entrée
  -- illisible ne fait jamais tomber le verdict : on ne sait rien, c'est tout.
  BEGIN
    SELECT max((v ->> 'le')::timestamptz) FILTER (WHERE v ->> 'opla_acces' = 'true'),
           max((v ->> 'le')::timestamptz) FILTER (WHERE v ->> 'opla_acces' = 'false')
      INTO v_poste_ok_le, v_poste_ko_le
      FROM jsonb_each(CASE WHEN jsonb_typeof(v_postes) = 'object' THEN v_postes ELSE '{}'::jsonb END) AS e(k, v)
     WHERE jsonb_typeof(v) = 'object' AND NULLIF(v ->> 'le', '') IS NOT NULL
       AND (v ->> 'le')::timestamptz > now() - interval '48 hours';
  EXCEPTION WHEN OTHERS THEN v_poste_ok_le := NULL; v_poste_ko_le := NULL; END;
  FOREACH pf IN ARRAY ARRAY['vinted', 'leboncoin', 'ebay', 'beebs', 'opla'] LOOP
    v_facts := '[]'::jsonb; v_best := NULL;
    v_declaree := v_decl ? pf; v_ecartee := v_ecart ? pf;
    v_etat := NULL; v_source := NULL; v_depuis := NULL; v_motif := NULL; v_action := NULL; v_action2 := NULL;
    IF pf = 'vinted' THEN
      SELECT status, erreur, finished_at, started_at, items_vus INTO r FROM vinted_sync_runs
       WHERE user_id = p_user AND kind = 'dressing' AND status IN ('done', 'failed')
       ORDER BY COALESCE(finished_at, started_at) DESC NULLS LAST LIMIT 1;
      IF FOUND THEN
        IF r.status = 'done' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'connectee', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_reussi', 'items', r.items_vus);
        ELSIF COALESCE(r.erreur, '') ~* 'cause403|aucune session vinted|session vinted.{0,40}401|session_absente' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_connecter', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_mur_connexion');
        END IF;
      END IF;
    ELSE
      SELECT status, erreur, finished_at, started_at, items_vus INTO r FROM vinted_sync_runs
       WHERE user_id = p_user AND kind = 'annonces' AND platform = pf AND status IN ('done', 'failed', 'absente')
       ORDER BY COALESCE(finished_at, started_at) DESC NULLS LAST LIMIT 1;
      IF FOUND THEN
        IF r.status = 'done' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'connectee', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_reussi', 'items', r.items_vus);
        ELSIF pf = 'opla' AND COALESCE(r.erreur, '') ~* 'acc[èe]s opla non accord' THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_autoriser', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_opla_non_autorise');
        ELSIF pf = 'opla' AND COALESCE(r.erreur, '') ~* 'session opla refus[ée]+ \(HTTP 401\)' THEN
          -- (2026-09-24) L'API d'Opla a répondu 401 DANS L'ONGLET pendant le
          -- relevé : la permission était là (l'onglet s'est ouvert), c'est la
          -- session qui est fermée → « Me connecter », jamais « à autoriser ».
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_connecter', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_session_refusee');
        ELSIF r.status = 'absente' OR (COALESCE(r.items_vus, 0) = 0 AND COALESCE(r.erreur, '') ~* 'page de connexion') THEN
          v_facts := v_facts || jsonb_build_object('src', 'releve', 'etat', 'a_connecter', 'at', COALESCE(r.finished_at, r.started_at), 'motif', 'releve_mur_connexion',
                                                   'mur', CASE WHEN r.erreur ~* '\[mur:upgrade\]' THEN 'upgrade' WHEN r.erreur ~* '\[mur:reauth\]' THEN 'reauth' ELSE NULL END);
        END IF;
      END IF;
    END IF;
    SELECT COALESCE(published_at, created_at) INTO v_dep FROM cross_post_jobs
     WHERE user_id = p_user AND platform = pf AND status = 'published' AND action IN ('publish', 'republish')
       AND handler_build IS DISTINCT FROM 'releve-annonces'
       AND COALESCE(published_at, created_at) > now() - interval '72 hours'
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT 1;
    IF FOUND THEN
      v_facts := v_facts || jsonb_build_object('src', 'depot', 'etat', 'connectee', 'at', v_dep, 'motif', 'depot_reussi');
    END IF;
    v_sonde_v := v_s ->> pf; v_http := v_s -> 'http' ->> pf; v_hub := v_s ->> 'ebay_hub'; v_mur := v_s ->> 'ebay_hub_mur';
    BEGIN
      v_sonde_ts := NULLIF(COALESCE(v_s -> 'checked_at_par_plateforme' ->> pf, v_s ->> 'checked_at'), '')::timestamptz;
    EXCEPTION WHEN OTHERS THEN v_sonde_ts := NULL; END;
    IF v_sonde_ts IS NOT NULL THEN
      IF pf = 'ebay' THEN
        IF v_hub = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'hub_vendeur_ouvert');
        ELSIF v_sonde_v = 'false' OR v_hub = 'false' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'sonde_deconnectee', 'mur', v_mur);
        END IF;
      ELSIF pf = 'opla' THEN
        IF v_sonde_v = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'sonde_connectee');
        ELSIF v_sonde_v = 'false' AND v_http = 'login_redirect_observee' THEN
          -- (2026-09-24) Seule la PAGE prouve une session fermée : ce code est
          -- posé par noterSessionDeconnectee quand l'onglet a VU la page de
          -- connexion. Un `false` avec un code numérique (le 401 de la sonde du
          -- service worker, écrit par les extensions ≤ 0.6.64) ne produit
          -- AUCUN fait : il ne prouve ni « à autoriser », ni « fermée ».
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'page_connexion_vue');
        END IF;
      ELSE
        IF v_sonde_v = 'true' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'connectee', 'at', v_sonde_ts, 'motif', 'sonde_connectee');
        ELSIF v_sonde_v = 'false' THEN
          v_facts := v_facts || jsonb_build_object('src', 'sonde', 'etat', 'a_connecter', 'at', v_sonde_ts, 'motif', 'sonde_deconnectee');
        END IF;
      END IF;
    END IF;
    -- (2026-09-24) OPLA : LA PERMISSION SE JUGE PAR POSTE. Un poste vu AVEC
    -- l'accès (48 h) efface tout « a_autoriser » plus ancien que cette preuve
    -- — « Autoriser Opla » ne s'affiche jamais à un compte dont un poste a
    -- l'accès. Aucun poste avec accès, et un poste vu SANS → « à autoriser »,
    -- daté de cette observation.
    IF pf = 'opla' THEN
      BEGIN
        IF v_poste_ok_le IS NOT NULL THEN
          SELECT COALESCE(jsonb_agg(f), '[]'::jsonb) INTO v_facts FROM jsonb_array_elements(v_facts) f
           WHERE NOT (f ->> 'etat' = 'a_autoriser' AND (f ->> 'at')::timestamptz <= v_poste_ok_le);
        ELSIF v_poste_ko_le IS NOT NULL THEN
          v_facts := v_facts || jsonb_build_object('src', 'poste', 'etat', 'a_autoriser', 'at', v_poste_ko_le, 'motif', 'poste_sans_acces');
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    SELECT f INTO v_best FROM jsonb_array_elements(v_facts) f
     ORDER BY (f ->> 'at')::timestamptz DESC NULLS LAST,
              CASE f ->> 'src' WHEN 'releve' THEN 0 WHEN 'depot' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_ecartee THEN
      v_etat := 'ecartee'; v_source := 'utilisateur'; v_motif := 'je_ne_vends_pas_ici';
    ELSIF pf = 'ebay' AND v_ebay_api IS NOT NULL THEN
      v_etat := 'connectee'; v_source := 'api'; v_depuis := v_ebay_api; v_motif := 'compte_relie_api';
    ELSIF v_best IS NULL THEN
      v_etat := 'inconnue'; v_motif := CASE WHEN v_ext IS NULL THEN 'extension_jamais_vue' ELSE 'pas_encore_verifiee' END;
    ELSE
      v_etat := v_best ->> 'etat'; v_source := v_best ->> 'src'; v_motif := v_best ->> 'motif';
      v_depuis := (v_best ->> 'at')::timestamptz;
    END IF;
    -- (2026-09-27, GO Nico) UNE PREUVE DE PLUS DE 7 JOURS NE VAUT PLUS « CONNECTÉE ».
    -- ltouze : « connectée » sur un relevé du 13/09 pendant que la sonde
    -- répondait 403 depuis deux jours. Un relevé, un dépôt ou une sonde de plus
    -- de 7 jours dit ce qui ÉTAIT vrai, pas ce qui l'est : l'état devient
    -- « à vérifier » (motif preuve_perimee), la date de la preuve reste lisible.
    -- Ne touche ni « écartée » ni eBay relié par l'API (source api), ni les
    -- murs (« à connecter » / « à autoriser » restent affichés tels quels) ; le
    -- parcage « connexion » et les relances lisent extension_sessions, pas ceci.
    IF v_etat = 'connectee' AND v_source IN ('releve', 'depot', 'sonde')
       AND v_depuis IS NOT NULL AND v_depuis < now() - interval '7 days' THEN
      v_etat := 'a_verifier'; v_motif := 'preuve_perimee';
    END IF;
    v_action := CASE v_etat
      WHEN 'a_connecter' THEN CASE WHEN pf = 'ebay' THEN 'relier_ebay' ELSE 'connexion' END
      WHEN 'a_autoriser' THEN CASE WHEN pf = 'opla' THEN 'autoriser_opla' ELSE 'connexion' END
      ELSE NULL END;
    -- Compte eBay relié par l'API mais session eBay FERMÉE dans Chrome
    -- (sonde false) : l'état reste « connectée », et « Me connecter » est
    -- proposé en action secondaire — le relevé passe par le navigateur (2026-09-24).
    v_action2 := CASE WHEN v_etat = 'a_connecter' AND pf = 'ebay' THEN 'connexion'
                      WHEN pf = 'ebay' AND v_source = 'api' AND v_sonde_v = 'false' THEN 'connexion'
                      ELSE NULL END;
    v_out := v_out || jsonb_build_object(pf, jsonb_strip_nulls(jsonb_build_object(
      'etat', v_etat, 'action', v_action, 'action_secondaire', v_action2,
      'source', v_source, 'depuis', v_depuis, 'motif', v_motif,
      'mur', v_best ->> 'mur',
      'declaree', v_declaree, 'ecartee', v_ecartee,
      'sonde', v_sonde_v, 'http', v_http, 'sonde_le', v_sonde_ts,
      'postes', CASE WHEN pf = 'opla' THEN NULLIF(jsonb_strip_nulls(jsonb_build_object('acces_vu_le', v_poste_ok_le, 'sans_acces_vu_le', v_poste_ko_le)), '{}'::jsonb) ELSE NULL END,
      'faits', v_facts)));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'calcule_le', now(), 'extension_vue_le', v_ext, 'extension_version', v_ver,
                            'plateformes', v_out);
END;
$function$;

-- profiles_session_revue_bonne()
CREATE OR REPLACE FUNCTION public.profiles_session_revue_bonne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pf text;
  v_le text;
BEGIN
  BEGIN
    FOREACH v_pf IN ARRAY ARRAY['vinted', 'leboncoin', 'beebs', 'opla'] LOOP
      IF (NEW.extension_sessions->>v_pf) = 'true' THEN
        v_le := NEW.extension_sessions->'checked_at_par_plateforme'->>v_pf;
        IF v_le IS NOT NULL AND v_le IS DISTINCT FROM (OLD.extension_sessions->'checked_at_par_plateforme'->>v_pf) THEN
          PERFORM relancer_jobs_connexion(NEW.id, v_pf, 'sonde', _ts_ou_null(v_le));
        END IF;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Jamais un point de panne de l'écriture de la sonde.
    RAISE WARNING 'profiles_session_revue_bonne (%) : %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END
$function$;

-- rapprochement_fin_run()
CREATE OR REPLACE FUNCTION public.rapprochement_fin_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM rapprochement_comptes c WHERE c.user_id = NEW.user_id AND c.etat <> 'termine')
       OR EXISTS (SELECT 1 FROM annonces_plateforme a
                   WHERE a.user_id = NEW.user_id AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
                     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla'))
       -- (08/10, complément) des fiches du dressing Vinted nées depuis la
       -- dernière passe, dans un compte qui a des imports d'autres plateformes
       OR (EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = NEW.user_id AND v.origine = 'vinted_sync' AND v.fusionne_dans IS NULL
                     AND v.created_at > rapprochement_v3_vinted_depuis(NEW.user_id))
           AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = NEW.user_id AND r.origine LIKE 'releve\_%'
                          AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
                OR EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = NEW.user_id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                             AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%')))
       -- (08/10 soir) des fiches créées à la main nées depuis la dernière passe,
       -- dans un compte qui a des fiches Vinted
       OR (EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = NEW.user_id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                     AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > rapprochement_v3_fiches_main_depuis(NEW.user_id))
           AND EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = NEW.user_id AND v.fusionne_dans IS NULL AND v.statut = 'stock'
                         AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync'))) THEN
      PERFORM rapprochement_demander(NEW.user_id, 'fin_run:' || COALESCE(NEW.platform, NEW.kind));
      PERFORM rapprochement_relancer(NEW.user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'rapprochement_fin_run (%) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

-- rapprochement_v3_lire(uuid)
CREATE OR REPLACE FUNCTION public.rapprochement_v3_lire(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '90s'
AS $function$
DECLARE v_fiches jsonb; v_annonces jsonb; v_fusions jsonb; v_doublons jsonb;
        v_depuis timestamptz := rapprochement_v3_vinted_depuis(p_user); v_vinted jsonb; v_vinted_max timestamptz; v_vinted_reste boolean;
        v_main_depuis timestamptz := rapprochement_v3_fiches_main_depuis(p_user); v_main jsonb := '[]'::jsonb; v_main_max timestamptz; v_main_reste boolean := false;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id::text, 'titre', i.titre, 'prix', i.prix_vente, 'statut', i.statut, 'origine', i.origine,
      'marque', COALESCE(NULLIF(trim(i.marque), ''), CASE WHEN jsonb_typeof(i.attributs -> 'marque') = 'object' THEN i.attributs -> 'marque' ->> 'v' ELSE i.attributs ->> 'marque' END),
      'taille', CASE WHEN jsonb_typeof(i.attributs -> 'taille') = 'object' THEN i.attributs -> 'taille' ->> 'v' ELSE i.attributs ->> 'taille' END,
      'photos', COALESCE((SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
                  SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
                   LIMIT 6) z WHERE z.u ~ '^https://'), '[]'::jsonb),
      'a_verifier', i.a_verifier IS NOT NULL,
      'a_verifier_auto', i.a_verifier IS NOT NULL AND COALESCE(i.a_verifier ->> 'source', '') IN ('moteur', 'rattrapage_0710', 'rapprochement_v3'),
      'created_at', i.created_at, 'quantite', COALESCE(i.quantite, 1), 'vinted_item_id', i.vinted_item_id
    )), '[]'::jsonb)
    INTO v_fiches
    FROM inventaire i
   WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu');

  WITH runs AS (
    SELECT r.id, releve_run_hors_liste(r.id) hors_liste, releve_est_geste(r.declencheur) geste,
           (r.platform = 'ebay' AND releve_ebay_run_bloque(r.id)) ebay_bloque
      FROM vinted_sync_runs r
     WHERE r.id IN (SELECT DISTINCT a.run_id FROM annonces_plateforme a WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.run_id IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'platform', a.platform, 'listing_id', a.listing_id, 'url', a.url, 'titre', a.titre, 'prix', a.prix,
      'photo_url', a.photo_url,
      'photos', (
        -- les photos de la fiche rapatriée (notre stockage) quand il y en a, sinon la
        -- capture (Leboncoin : la grande image, jamais la vignette), sinon la couverture
        SELECT COALESCE(
          (SELECT jsonb_agg(z.u ORDER BY z.o) FROM (
             SELECT CASE WHEN jsonb_typeof(e) = 'string' THEN e #>> '{}' WHEN jsonb_typeof(e) = 'object' THEN COALESCE(e ->> 'url', e ->> 'original') END u, o
               FROM inventaire i2, jsonb_array_elements(CASE WHEN jsonb_typeof(i2.photos) = 'array' THEN i2.photos ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE i2.id = a.inventaire_id AND i2.origine = 'releve_' || a.platform
                AND (i2.photos -> 0) #>> '{}' LIKE '%/storage/v1/object/public/listing-photos/%'
              LIMIT 6) z WHERE z.u ~ '^https://'),
          (SELECT jsonb_agg(regexp_replace(z.u, 'rule=ad-(thumb|small|medium)', 'rule=ad-large') ORDER BY z.o) FROM (
             SELECT e #>> '{}' u, o FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.capture -> 'photos') = 'array' THEN a.capture -> 'photos' ELSE '[]'::jsonb END) WITH ORDINALITY x(e, o)
              WHERE jsonb_typeof(e) = 'string' LIMIT 6) z WHERE z.u ~ '^https://'),
          CASE WHEN a.photo_url ~ '^https://' THEN jsonb_build_array(regexp_replace(a.photo_url, 'rule=ad-(thumb|small|medium)', 'rule=ad-large')) ELSE '[]'::jsonb END)),
      'taille', a.capture ->> 'taille', 'marque', a.capture ->> 'marque',
      'inventaire_id', a.inventaire_id::text,
      'ignoree', a.ignoree_le IS NOT NULL,
      'ignoree_par_utilisateur', a.ignoree_le IS NOT NULL AND EXISTS (SELECT 1 FROM rapprochements r WHERE r.annonce_id = a.id AND r.decision = 'ignore' AND r.par = 'utilisateur'),
      'proposition_motif', a.proposition ->> 'motif',
      'source', a.source_rapprochement, 'run_id', a.run_id,
      'en_ligne', a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL,
      'hors_liste', COALESCE(ru.hors_liste, false), 'ebay_bloque', COALESCE(ru.ebay_bloque, false), 'geste', COALESCE(ru.geste, false),
      'derniere_par', d.par, 'derniere_decision', d.decision, 'derniere_motif', d.motif
    )), '[]'::jsonb)
    INTO v_annonces
    FROM annonces_plateforme a
    LEFT JOIN runs ru ON ru.id = a.run_id
    LEFT JOIN LATERAL (SELECT r.par, r.decision, r.detail ->> 'motif' motif FROM rapprochements r
                        WHERE r.annonce_id = a.id AND r.decision IN ('attache', 'import', 'ignore')
                        ORDER BY r.created_at DESC LIMIT 1) d ON true
   WHERE a.user_id = p_user AND a.disparu_le IS NULL AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla')
     AND NOT (a.url IS NOT NULL AND annonce_lien_notification(a.url));

  SELECT COALESCE(jsonb_agg(jsonb_build_object('garde', f.garde::text, 'absorbe', f.absorbe::text, 'par', f.par, 'defaite', f.defait_le IS NOT NULL)), '[]'::jsonb)
    INTO v_fusions FROM inventaire_fusions f WHERE f.user_id = p_user;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'garde', d.garde::text, 'absorbe', d.absorbe::text, 'statut', d.statut, 'motif', d.motif,
                                                 'decide_par', d.decide_par, 'source', d.source,
                                                 'auto', d.decide_par IS NULL AND COALESCE(d.source, '') = 'releve' AND d.motif IS DISTINCT FROM 'copie_non_prouvee')), '[]'::jsonb)
    INTO v_doublons FROM inventaire_doublons d WHERE d.user_id = p_user AND d.statut IN ('proposee', 'refusee', 'fusionnee');

  -- (08/10, complément) les fiches du dressing Vinted nées depuis la dernière
  -- passe : jugées contre les imports déjà au stock (rien à juger sans import).
  -- 200 par passe au plus (une fonction edge n'a que 2 s de CPU) : la date de la
  -- 200e, et toutes celles de la même date (un lot du dressing partage la sienne) ;
  -- la suite part à la passe d'après (vinted_reste).
  SELECT max(x.created_at) INTO v_vinted_max FROM (
    SELECT i.created_at FROM inventaire i
     WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis
     ORDER BY i.created_at LIMIT 200) x;
  v_vinted_reste := v_vinted_max IS NOT NULL AND EXISTS (
    SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_vinted_max);
  SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_vinted FROM inventaire i
   WHERE i.user_id = p_user AND i.origine = 'vinted_sync' AND i.created_at > v_depuis AND i.created_at <= v_vinted_max
     AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
     AND (EXISTS (SELECT 1 FROM inventaire r WHERE r.user_id = p_user AND r.origine LIKE 'releve\_%'
                   AND r.fusionne_dans IS NULL AND r.statut IN ('stock', 'vendu'))
          -- (08/10 soir) … ou contre les fiches créées à la main (règle de Nico)
          OR EXISTS (SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                       AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%'));

  -- (08/10 soir) les fiches créées à la main nées depuis la dernière passe :
  -- jugées contre les fiches Vinted (rien à juger sans fiche Vinted). 200 par
  -- passe, la suite à la passe d'après (fiches_main_reste).
  IF EXISTS (SELECT 1 FROM inventaire v WHERE v.user_id = p_user AND v.fusionne_dans IS NULL AND v.statut = 'stock'
               AND (v.vinted_item_id IS NOT NULL OR v.origine = 'vinted_sync')) THEN
    SELECT max(x.created_at) INTO v_main_max FROM (
      SELECT i.created_at FROM inventaire i
       WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis
       ORDER BY i.created_at LIMIT 200) x;
    v_main_reste := v_main_max IS NOT NULL AND EXISTS (
      SELECT 1 FROM inventaire i WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_max);
    SELECT COALESCE(jsonb_agg(i.id::text ORDER BY i.created_at), '[]'::jsonb) INTO v_main FROM inventaire i
     WHERE i.user_id = p_user AND i.vinted_item_id IS NULL AND COALESCE(i.origine, '') <> 'vinted_sync' AND COALESCE(i.origine, '') NOT LIKE 'releve\_%' AND i.created_at > v_main_depuis AND i.created_at <= v_main_max
       AND i.fusionne_dans IS NULL AND i.statut = 'stock';
  END IF;

  RETURN jsonb_build_object(
    'fiches_main_actif', true, 'fiches_main_a_juger', v_main, 'fiches_main_juge_jusqu_a', v_main_max,
    'fiches_main_depuis', v_main_depuis, 'fiches_main_reste', COALESCE(v_main_reste, false),
    'vinted_a_juger', v_vinted, 'vinted_juge_jusqu_a', v_vinted_max, 'vinted_depuis', v_depuis, 'vinted_reste', COALESCE(v_vinted_reste, false),
    'user_id', p_user, 'fiches', v_fiches, 'annonces', v_annonces, 'fusions', v_fusions, 'doublons', v_doublons,
    'dette_beebs', releve_dette_beebs(p_user),
    'import_ouvert', COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1,
    'geste_recent', EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.kind IN ('annonces', 'dressing')
                             AND releve_est_geste(s.declencheur) AND COALESCE(s.queued_at, s.started_at) > now() - interval '2 hours'),
    'lu_le', now());
END;
$function$;

-- rapprocher_rattraper(uuid,text,boolean,boolean,numeric)
CREATE OR REPLACE FUNCTION public.rapprocher_rattraper(p_user uuid, p_platform text, p_simulation boolean DEFAULT true, p_second_releve_requis boolean DEFAULT true, p_budget_secondes numeric DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vus text[]; v_id uuid; v_res text; v_import_ouvert boolean;
  v_debut timestamptz := clock_timestamp();
  v_issues jsonb := '{}'::jsonb;
  n_examinees integer := 0; n_restantes integer := 0;
  v_inv_avant integer; v_inv_apres integer; v_ratt_avant integer; v_ratt_apres integer;
BEGIN
  IF p_platform NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus
    FROM annonces_plateforme WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL;
  SELECT count(*) INTO v_inv_avant FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL;
  SELECT count(*) INTO v_ratt_avant FROM annonces_plateforme
   WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL AND inventaire_id IS NOT NULL;
  BEGIN
    FOR v_id IN
      SELECT a.id FROM annonces_plateforme a
      WHERE a.user_id = p_user AND a.platform = p_platform
        AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
      -- Les annonces SANS proposition d'abord : une proposition déjà posée n'a
      -- rien à gagner à repasser avant celles qui n'ont encore rien.
      ORDER BY (a.proposition IS NOT NULL), a.vu_le, a.created_at
    LOOP
      n_examinees := n_examinees + 1;
      IF clock_timestamp() - v_debut > make_interval(secs => p_budget_secondes::double precision) THEN
        n_restantes := n_restantes + 1; CONTINUE;
      END IF;
      v_res := rapprocher_traiter_annonce(v_id, v_vus, v_import_ouvert, true, p_second_releve_requis);
      v_issues := jsonb_set(v_issues, ARRAY[v_res], to_jsonb(COALESCE((v_issues ->> v_res)::integer, 0) + 1));
    END LOOP;
    SELECT count(*) INTO v_inv_apres FROM inventaire WHERE user_id = p_user AND fusionne_dans IS NULL;
    SELECT count(*) INTO v_ratt_apres FROM annonces_plateforme
     WHERE user_id = p_user AND platform = p_platform AND disparu_le IS NULL AND inventaire_id IS NOT NULL;
    IF p_simulation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'rapprocher_rattraper:simulation';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'rapprocher_rattraper:simulation' THEN RAISE; END IF;
  END;
  RETURN jsonb_build_object('ok', true, 'simulation', p_simulation, 'user_id', p_user, 'platform', p_platform,
                            'import_ouvert', v_import_ouvert, 'second_releve_requis', p_second_releve_requis,
                            'examinees', n_examinees, 'restantes', n_restantes, 'issues', v_issues,
                            'inventaire_avant', v_inv_avant, 'inventaire_apres', v_inv_apres,
                            'rattachees_avant', v_ratt_avant, 'rattachees_apres', v_ratt_apres,
                            'duree_ms', round(extract(epoch FROM (clock_timestamp() - v_debut)) * 1000));
END;
$function$;

-- rapprocher_releve(uuid)
CREATE OR REPLACE FUNCTION public.rapprocher_releve(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_user uuid; v_pf text; v_vus text[];
  n_prop integer := 0; n_disp integer := 0;
  v_complet boolean;
  v_verdicts jsonb := NULL;
  v_questions jsonb;
  v_vide_non_probant boolean := false;
  v_dette_beebs boolean := false;
BEGIN
  SELECT * INTO v_run FROM vinted_sync_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_run.user_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  v_user := v_run.user_id; v_pf := v_run.platform;
  IF v_pf NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN RETURN jsonb_build_object('ok', false, 'reason', 'plateforme'); END IF;
  SELECT COALESCE(array_agg(listing_id), ARRAY[]::text[]) INTO v_vus FROM annonces_plateforme WHERE run_id = p_run_id;
  v_complet := releve_preuve_absence(p_run_id);
  IF releve_hors_liste(v_run.erreur) THEN
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_liste', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  IF v_pf = 'ebay' AND releve_ebay_run_bloque(p_run_id) THEN
    PERFORM releve_ebay_noter_run(p_run_id);
    RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'hors_compte_ebay', true,
                              'relevees', COALESCE(array_length(v_vus, 1), 0), 'verdicts', NULL,
                              'par_job', 0, 'auto', 0, 'proposees', 0, 'sans_candidat', 0,
                              'importees', 0, 'import_refusees', 0, 'ecartees_notification', 0,
                              'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                              'disparues', 0, 'complet', false, 'vide_non_probant', false);
  END IF;
  IF v_pf = 'ebay' AND releve_ebay_run_incomplet(p_run_id) THEN
    v_complet := false;
  END IF;
  IF v_complet AND COALESCE(array_length(v_vus, 1), 0) = 0
     AND releve_compte_avait_annonces(v_user, v_pf) THEN
    v_complet := false;
    v_vide_non_probant := true;
  END IF;
  v_dette_beebs := v_pf = 'beebs' AND releve_dette_beebs(v_user);
  IF v_dette_beebs THEN
    v_questions := jsonb_build_object('ok', true, 'examinees', 0, 'questions_posees', 0, 'retenue_beebs', true);
  ELSE
    v_questions := revoir_questions_releve(v_user, v_pf, 1);
  END IF;
  n_prop := COALESCE((v_questions ->> 'questions_posees')::integer, 0);

  IF v_complet THEN
    n_disp := COALESCE((constater_absences_releve(p_run_id) ->> 'disparues')::integer, 0);
  END IF;
  IF v_complet THEN
    BEGIN
      v_verdicts := trancher_publications_sans_lien(v_user, v_pf, p_run_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'trancher_publications_sans_lien(%) : %', p_run_id, SQLERRM;
      v_verdicts := jsonb_build_object('ok', false, 'erreur', SQLERRM);
    END;
  END IF;

  -- (07/10) Le rapprochement du relevé part au moteur du compte.
  PERFORM rapprochement_demander(v_user, 'releve:' || v_pf);
  PERFORM rapprochement_relancer(v_user);

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', v_pf, 'relevees', COALESCE(array_length(v_vus, 1), 0),
                            'verdicts', v_verdicts,
                            'par_job', 0, 'auto', 0, 'proposees', n_prop, 'sans_candidat', 0,
                            'importees', 0, 'import_refusees', 0,
                            'ecartees_notification', 0,
                            'restantes', 0, 'budget_epuise', false, 'sautees', 0,
                            'disparues', n_disp, 'complet', v_complet,
                            'vide_non_probant', v_vide_non_probant,
                            'retenues_beebs', 0, 'rapprochement', 'serveur');
END;
$function$;

-- relancer_jobs_connexion_echus()
CREATE OR REPLACE FUNCTION public.relancer_jobs_connexion_echus()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r       record;
  v_pf    jsonb;
  v_rc    jsonb;
  v_k     integer;
  v_at    timestamptz;
  v_label text;
  v_quoi  text;
  v_fait  integer := 0;
BEGIN
  -- Un job needs_user parqué « connexion » par la classification (pas-de-rouge)
  -- rejoint l'ATTENTE DE SESSION : même message « En attente de ta connexion
  -- à … » (une vraie déconnexion reste affichée), mais nouvel essai seul après
  -- 3 min, puis au barème court (6, 10 min) puis horaire — et relance immédiate
  -- dès qu'une sonde ou un relevé prouve la session. Trois conversions au plus
  -- par job : au-delà, il reste needs_user, affiché comme avant.
  FOR r IN
    SELECT c.id, c.platform, c.action, c.error, c.inventaire_id, COALESCE(c.platform_fields, '{}'::jsonb) AS pf
      FROM cross_post_jobs c
     WHERE c.status = 'needs_user'
       AND c.platform IN ('vinted', 'leboncoin', 'beebs', 'opla')
       AND c.created_at > now() - interval '30 days'
       AND c.platform_fields->>'needs_user_source' = 'connexion'
       AND c.platform_fields->'pas_de_rouge'->>'motif' = 'connexion'
       AND c.error !~* '(anti-?robot|datadome)'
       AND NOT (c.platform_fields ? 'blocage_antirobot')
       AND NOT (c.platform_fields ? 'attente_antirobot_compte')
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_pf := r.pf;
      IF v_pf ? 'needsUserField' THEN CONTINUE; END IF;
      v_rc := CASE WHEN jsonb_typeof(v_pf->'reprise_differee') = 'object' THEN v_pf->'reprise_differee' ELSE '{}'::jsonb END;
      v_k := COALESCE(NULLIF(v_rc->>'n', '')::integer, 0);
      IF v_k >= 3 THEN CONTINUE; END IF;
      -- Le moment du parcage ; inconnu → on ne devine pas, on ne touche pas.
      v_at := _ts_ou_null(v_pf->'pas_de_rouge'->>'at');
      IF v_at IS NULL OR v_at < now() - interval '2 days' THEN CONTINUE; END IF;
      -- Déjà converti pour CE parcage.
      IF _ts_ou_null(v_rc->>'parcage') IS NOT DISTINCT FROM v_at THEN CONTINUE; END IF;
      IF r.inventaire_id IS NOT NULL AND COALESCE(r.action, 'publish') IN ('publish', 'republish')
         AND article_vendu(r.inventaire_id) THEN
        CONTINUE;
      END IF;
      v_label := CASE r.platform WHEN 'vinted' THEN 'Vinted' WHEN 'leboncoin' THEN 'Leboncoin'
                                 WHEN 'beebs' THEN 'Beebs' ELSE 'Opla' END;
      v_quoi := CASE COALESCE(r.action, 'publish') WHEN 'delete' THEN 'le retrait de l''annonce'
                                                    WHEN 'republish' THEN 'la republication' ELSE 'la publication' END;
      v_pf := v_pf - 'needs_user_source' - 'next_action_after'
                   - 'needs_user_actif_ms' - 'needs_user_tick_le' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
                   - 'needsUserBoucle' - 'needsUserResolved' - 'error_technique' - 'processing_since';
      v_pf := v_pf || jsonb_build_object(
        'attente_session', jsonb_build_object(
          'platform', r.platform, 'depuis', v_at, 'derniere', v_at, 'observations', 1,
          'motif', left(COALESCE(r.error, ''), 300),
          'reconnu_par', 'classification « connexion » (pas-de-rouge)',
          'pose_par', 'relancer_jobs_connexion_echus'),
        -- (27/09) 3, puis 6, puis 10 min : le barème court, conversion après conversion.
        'next_action_after', (v_at + (CASE v_k WHEN 0 THEN interval '3 minutes' WHEN 1 THEN interval '6 minutes' ELSE interval '10 minutes' END))::text,
        'reprise_differee', jsonb_build_object('le', now(), 'n', v_k + 1, 'parcage', v_at));
      IF COALESCE(r.action, 'publish') = 'publish' THEN
        v_pf := v_pf || jsonb_build_object('verifier_doublon_avant_publication', true);
      END IF;
      UPDATE cross_post_jobs SET
        status = 'pending',
        error = 'En attente de ta connexion à ' || v_label || ' dans Chrome : ' || v_quoi
                || ' repartira toute seule dès que tu seras reconnecté(e).',
        platform_fields = v_pf
       WHERE id = r.id AND status = 'needs_user';
      IF FOUND THEN v_fait := v_fait + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'relancer_jobs_connexion_echus (job %) : %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_fait;
END
$function$;

-- relancer_jobs_connexion(uuid,text,text,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.relancer_jobs_connexion(p_user uuid, p_platform text, p_preuve text, p_preuve_le timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r        record;
  v_pf     jsonb;
  v_parque timestamptz;
  v_rc     jsonb;
  v_n      integer;
  v_i      integer := 0;
  v_pas    interval;
  v_fait   integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_platform NOT IN ('vinted', 'leboncoin', 'beebs', 'opla') THEN
    RETURN 0;
  END IF;
  v_pas := CASE WHEN p_platform = 'vinted' THEN interval '90 seconds' ELSE interval '45 seconds' END;
  FOR r IN
    SELECT c.id, c.status, c.action, c.inventaire_id, COALESCE(c.platform_fields, '{}'::jsonb) AS pf
      FROM cross_post_jobs c
     WHERE c.user_id = p_user AND c.platform = p_platform
       AND c.created_at > now() - interval '30 days'
       AND (
         (c.status = 'pending' AND c.platform_fields ? 'attente_session'
            AND c.error ~* '^En attente de ta connexion à ')
         OR (c.status = 'needs_user'
            -- Jamais un blocage anti-robot : le relancer, c'est re-taper la porte.
            AND c.error !~* '(anti-?robot|datadome)'
            AND NOT (c.platform_fields ? 'blocage_antirobot')
            AND NOT (c.platform_fields ? 'attente_antirobot_compte')
            AND (c.platform_fields->>'needs_user_source' = 'session_vinted'
                 OR c.platform_fields->'pas_de_rouge'->>'motif' = 'connexion'
                 OR c.error ~* '^(Connexion|Reconnexion) \S+ requise'))
       )
     ORDER BY c.created_at
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_pf := r.pf;
      -- Une question de champ attend une réponse : ce n'est pas un mur de connexion.
      IF v_pf ? 'needsUserField' THEN CONTINUE; END IF;
      -- La preuve doit être POSTÉRIEURE au parcage.
      v_parque := GREATEST(
        _ts_ou_null(v_pf->'attente_session'->>'derniere'),
        _ts_ou_null(v_pf->'attente_session'->>'depuis'),
        _ts_ou_null(v_pf->'pas_de_rouge'->>'at'),
        _ts_ou_null(v_pf->>'needs_user_vu_le'),
        _ts_ou_null(v_pf->'reprise_connexion'->>'le'));
      IF p_preuve_le IS NOT NULL AND v_parque IS NOT NULL AND p_preuve_le <= v_parque THEN CONTINUE; END IF;
      -- Anti-boucle : 6 relances au plus par 24 h.
      v_rc := CASE WHEN jsonb_typeof(v_pf->'reprise_connexion') = 'object' THEN v_pf->'reprise_connexion' ELSE '{}'::jsonb END;
      v_n := CASE WHEN _ts_ou_null(v_rc->>'depuis') > now() - interval '24 hours'
                  THEN COALESCE(NULLIF(v_rc->>'n', '')::integer, 0) ELSE 0 END;
      IF v_n >= 6 THEN CONTINUE; END IF;
      -- Jamais un article vendu.
      IF r.inventaire_id IS NOT NULL AND COALESCE(r.action, 'publish') IN ('publish', 'republish')
         AND article_vendu(r.inventaire_id) THEN
        CONTINUE;
      END IF;

      v_pf := v_pf - 'needs_user_source' - 'next_action_after' - 'attente_session'
                   - 'needs_user_actif_ms' - 'needs_user_tick_le' - 'needs_user_vu_le' - 'needs_user_vu_erreur'
                   - 'needsUserAttempts' - 'needsUserBoucle' - 'needsUserResolved' - 'error_technique'
                   - 'processing_since';
      v_pf := v_pf || jsonb_build_object('reprise_connexion', jsonb_build_object(
        'le', now(), 'preuve', p_preuve, 'preuve_le', p_preuve_le,
        'depuis', CASE WHEN v_n = 0 THEN now()::text ELSE v_rc->>'depuis' END,
        'n', v_n + 1, 'etait', r.status));
      IF COALESCE(r.action, 'publish') = 'publish' THEN
        v_pf := v_pf || jsonb_build_object('verifier_doublon_avant_publication', true);
      END IF;
      IF v_i > 0 THEN
        v_pf := v_pf || jsonb_build_object('next_action_after', (now() + v_pas * v_i)::text);
      END IF;

      UPDATE cross_post_jobs SET status = 'pending', error = NULL, platform_fields = v_pf
       WHERE id = r.id AND status = r.status;
      IF FOUND THEN v_fait := v_fait + 1; v_i := v_i + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'relancer_jobs_connexion (job %) : %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_fait;
END
$function$;

-- releve_veilleur_decision(uuid,text)
CREATE OR REPLACE FUNCTION public.releve_veilleur_decision(p_user uuid, p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  L vinted_sync_runs%ROWTYPE;
  c record;
  n_cand integer := 0;
  v_motifs jsonb := '{}'::jsonb;
  v_part text := NULL;
  v_ex jsonb := '[]'::jsonb;
  v_m text;
BEGIN
  IF p_platform NOT IN ('leboncoin', 'beebs', 'ebay', 'opla') THEN
    RETURN jsonb_build_object('part', true, 'motif', 'plateforme_hors_regle');
  END IF;
  -- Le dernier relevé COMPLET de la plateforme (celui qui peut prouver une absence).
  SELECT s.* INTO L FROM vinted_sync_runs s
   WHERE s.user_id = p_user AND s.kind = 'annonces' AND s.platform = p_platform AND s.status = 'done'
     AND s.started_at > now() - interval '30 days' AND releve_preuve_absence(s.id)
   ORDER BY s.started_at DESC LIMIT 1;
  IF L.id IS NULL THEN
    RETURN jsonb_build_object('part', true, 'motif', 'aucun_releve_complet');
  END IF;
  FOR c IN
    SELECT j.id, j.platform_fields ? 'revue_en_ligne_par_releve' dementie,
           a.id annonce, a.vu_le, a.statut_plateforme, a.disparu_le
      FROM cross_post_jobs j
      LEFT JOIN annonces_plateforme a
        ON a.user_id = j.user_id AND a.platform = j.platform AND a.listing_id = btrim(j.platform_listing_id)
     WHERE j.user_id = p_user AND j.platform = p_platform
       AND j.status = 'published' AND j.action IN ('publish', 'republish')
       AND COALESCE(j.platform_fields ->> 'sale_signal', '') <> 'sold'
       AND COALESCE((j.platform_fields ->> 'unavailable_pending_since')::timestamptz,
                     (j.platform_fields ->> 'unavailable_since')::timestamptz) > L.started_at
  LOOP
    n_cand := n_cand + 1;
    IF c.annonce IS NOT NULL AND c.vu_le >= L.started_at THEN
      IF c.statut_plateforme = 'en_ligne' AND c.disparu_le IS NULL THEN
        v_m := CASE WHEN c.dementie THEN 'fausse_alerte_connue' ELSE NULL END;
        IF v_m IS NULL THEN v_part := 'disparition_nouvelle'; END IF;
      ELSE
        v_m := 'etat_deja_connu';
      END IF;
    ELSE
      IF p_platform = 'beebs' THEN v_m := 'absence_beebs';
      ELSIF c.disparu_le IS NOT NULL THEN v_m := 'absence_deja_constatee';
      ELSE v_m := NULL; v_part := COALESCE(v_part, 'absence_a_constater');
      END IF;
    END IF;
    IF v_m IS NOT NULL THEN v_motifs := v_motifs || jsonb_build_object(v_m, COALESCE((v_motifs ->> v_m)::int, 0) + 1); END IF;
    IF jsonb_array_length(v_ex) < 3 THEN v_ex := v_ex || jsonb_build_array(jsonb_build_object('job', c.id, 'motif', COALESCE(v_m, v_part))); END IF;
  END LOOP;
  IF n_cand = 0 THEN
    RETURN jsonb_build_object('part', true, 'motif', 'sans_annonce_signalee', 'dernier_releve', L.id);
  END IF;
  IF v_part IS NOT NULL THEN
    RETURN jsonb_build_object('part', true, 'motif', v_part, 'annonces', n_cand, 'dernier_releve', L.id, 'exemples', v_ex);
  END IF;
  RETURN jsonb_build_object('part', false, 'motif', 'deja_verifie', 'annonces', n_cand, 'motifs', v_motifs,
                            'dernier_releve', L.id, 'dernier_releve_le', L.started_at, 'exemples', v_ex);
END;
$function$;

-- releves_vides_signales()
CREATE OR REPLACE FUNCTION public.releves_vides_signales()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_pf text;
  v_etat jsonb;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RETURN v_out; END IF;
  FOREACH v_pf IN ARRAY ARRAY['leboncoin', 'beebs', 'ebay', 'opla'] LOOP
    v_etat := releve_vide_etat(v_user, v_pf);
    IF COALESCE((v_etat ->> 'arret')::boolean, false) THEN
      v_out := v_out || jsonb_build_array(v_etat);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$function$;

-- remises_en_vente_tick(integer,uuid)
CREATE OR REPLACE FUNCTION public.remises_en_vente_tick(p_limite integer DEFAULT 20, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_cpu numeric;
  r record; j cross_post_jobs%ROWTYPE; i inventaire%ROWTYPE;
  v_op jsonb; v_place jsonb; v_motif text; v_report timestamptz; v_nouveau uuid;
  v_vu timestamptz; v_api boolean; v_sortie bigint; v_prix integer;
  v_faites integer := 0; v_abandons integer := 0; v_reports integer := 0;
BEGIN
  SELECT pct INTO v_cpu FROM veille_cpu WHERE pct IS NOT NULL ORDER BY le DESC LIMIT 1;
  IF v_cpu IS NOT NULL AND v_cpu > 50 THEN
    RETURN jsonb_build_object('issue', 'saute_cpu', 'cpu', v_cpu);
  END IF;
  SELECT value INTO v_sortie FROM coin_config WHERE key = 'opla_sortie_le';
  SELECT value INTO v_prix FROM coin_config WHERE key = 'price_per_platform';

  FOR r IN
    SELECT * FROM remises_en_vente
     WHERE statut = 'a_faire' AND prochain_essai <= now()
       AND (p_user IS NULL OR user_id = p_user)
     ORDER BY prochain_essai
     LIMIT GREATEST(1, LEAST(p_limite, 50))
     FOR UPDATE SKIP LOCKED
  LOOP
    v_motif := NULL; v_report := NULL; v_nouveau := NULL;
    SELECT * INTO j FROM cross_post_jobs WHERE id = r.job_vendu;
    SELECT * INTO i FROM inventaire WHERE id = r.inventaire_id AND user_id = r.user_id;
    v_op := NULL;
    IF j.id IS NOT NULL AND NULLIF(j.platform_fields->>'vente_operation_cle', '') IS NOT NULL THEN
      SELECT o.resultat INTO v_op FROM ventes_operations o
       WHERE o.user_id = r.user_id AND o.cle = j.platform_fields->>'vente_operation_cle';
    END IF;

    IF j.id IS NULL OR j.status <> 'sold' THEN
      v_motif := 'annonce_plus_vendue';            -- vente annulée, job revenu
    ELSIF v_op IS NULL OR (v_op->>'ok') IS DISTINCT FROM 'true' THEN
      v_motif := 'vente_non_enregistree';          -- signal sans reçu : on ne sait pas
    ELSIF COALESCE(NULLIF(v_op->>'restant', '')::integer, 0) <= 0 THEN
      v_motif := 'plus_de_stock';                  -- dernière unité : rien à remettre
    ELSIF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
      v_motif := 'fiche_absente';
    ELSIF i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0 THEN
      v_motif := 'plus_de_stock';
    ELSIF r.platform NOT IN ('vinted', 'beebs', 'opla', 'leboncoin', 'ebay') THEN
      v_motif := 'plateforme_non_geree';
    ELSIF r.platform IN ('leboncoin', 'ebay')
      AND (COALESCE(j.platform_fields->>'source', '') = 'releve'
           OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      -- (06/10 soir) eBay : une annonce importée n'est « vendue » que si eBay
      -- la dit ÉPUISÉE (ebay-api-worker, sale_evidence.exact) — elle n'est plus
      -- en ligne ; la fiche qui garde du stock doit être remise en vente.
      AND NOT (r.platform = 'ebay' AND (
            COALESCE(j.platform_fields #>> '{sale_evidence,exact}', '') = 'true'
         OR (COALESCE(j.platform_fields #>> '{quantite_ebay,exacte}', '') = 'true'
             AND COALESCE(NULLIF(j.platform_fields #>> '{quantite_ebay,disponible}', '')::numeric, 1) <= 0))) THEN
      v_motif := 'annonce_importee_a_quantite';    -- peut rester en ligne avec son stock
    ELSIF r.platform = 'opla' AND COALESCE(v_sortie, 0) > 0 AND now() >= to_timestamp(v_sortie) THEN
      v_motif := 'opla_sortie';
    ELSIF COALESCE(v_prix, 0) > 0 THEN
      v_motif := 'publication_payante';            -- jamais de débit sans le geste de la personne
    -- (08/10, Louis) L'annonce « vendue » est encore EN LIGNE après la vente
    -- (dressing Vinted, relevé des autres plateformes) : une remise ferait un
    -- doublon. On revient dans 6 h (la vente annulée ou l'annonce partie, elle
    -- repart d'elle-même).
    ELSIF (r.platform = 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND (
             SELECT s.status = 'active' AND s.captured_at > COALESCE(j.sold_at, now())
               FROM vinted_listing_snapshots s
              WHERE s.user_id = r.user_id AND s.vinted_item_id = btrim(j.platform_listing_id)
              ORDER BY s.captured_at DESC LIMIT 1))
       OR (r.platform <> 'vinted' AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL AND EXISTS (
             SELECT 1 FROM annonces_plateforme a
              WHERE a.user_id = r.user_id AND a.platform = r.platform AND a.listing_id = btrim(j.platform_listing_id)
                AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL AND a.vu_le > COALESCE(j.sold_at, now()))) THEN
      v_motif := 'annonce_vendue_encore_en_ligne'; v_report := now() + interval '6 hours';
    ELSIF EXISTS (
        SELECT 1 FROM cross_post_jobs c
         WHERE c.user_id = r.user_id AND c.inventaire_id = r.inventaire_id AND c.platform = r.platform
           AND c.id <> j.id AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
           AND (c.status IN ('pending', 'processing', 'needs_user')
                OR (c.status = 'published' AND NOT EXISTS (
                      SELECT 1 FROM cross_post_jobs d
                       WHERE d.user_id = c.user_id AND d.inventaire_id = c.inventaire_id
                         AND d.platform = c.platform AND d.action = 'delete' AND d.status = 'deleted'
                         AND CASE WHEN annonce_id_de_job(d.platform_listing_id, d.listing_url) IS NOT NULL
                                   AND annonce_id_de_job(c.platform_listing_id, c.listing_url) IS NOT NULL
                                  THEN annonce_id_de_job(d.platform_listing_id, d.listing_url)
                                     = annonce_id_de_job(c.platform_listing_id, c.listing_url)
                                  ELSE d.created_at > COALESCE(c.published_at, c.created_at) END))))
      OR EXISTS (
        SELECT 1 FROM annonces_plateforme a
         WHERE a.user_id = r.user_id AND a.inventaire_id = r.inventaire_id AND a.platform = r.platform
           AND a.statut_plateforme IN ('en_ligne', 'en_verification')
           AND a.disparu_le IS NULL AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
           AND a.listing_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
           AND COALESCE(a.vu_le, a.created_at) > COALESCE(j.sold_at, now()))
      OR (r.platform = 'vinted' AND i.vinted_item_id IS NOT NULL
          AND i.vinted_item_id IS DISTINCT FROM NULLIF(btrim(j.platform_listing_id), '')
          AND i.disparu_le IS NULL AND COALESCE(i.vinted_status, 'active') NOT IN ('sold', 'closed')) THEN
      v_motif := 'deja_en_vente';
    -- Fiche jumelle encore en doute (« Est-ce le même article ? ») déjà en
    -- ligne sur la plateforme : même garde que spend_coins_and_publish
    -- (jumeau_en_ligne). Reportée : la personne peut trancher « deux articles ».
    ELSIF EXISTS (
        SELECT 1 FROM inventaire_doublons d
          JOIN inventaire t ON t.id = CASE WHEN d.garde = r.inventaire_id THEN d.absorbe ELSE d.garde END
         WHERE d.user_id = r.user_id AND d.statut = 'proposee' AND r.inventaire_id IN (d.garde, d.absorbe)
           AND (EXISTS (SELECT 1 FROM cross_post_jobs c
                         WHERE c.user_id = r.user_id AND c.inventaire_id = t.id AND c.platform = r.platform
                           AND COALESCE(c.action, 'publish') IN ('publish', 'republish')
                           AND c.status IN ('pending', 'processing', 'needs_user', 'published'))
                OR (r.platform = 'vinted' AND t.vinted_item_id IS NOT NULL AND t.disparu_le IS NULL
                    AND COALESCE(t.vinted_status, 'active') NOT IN ('sold', 'closed')
                    AND COALESCE(t.statut, '') <> 'vendu'))) THEN
      v_motif := 'jumeau_en_ligne'; v_report := now() + interval '12 hours';
    END IF;

    IF v_motif IS NULL AND EXISTS (SELECT 1 FROM platform_health h WHERE h.platform = r.platform AND h.paused) THEN
      v_motif := 'plateforme_en_pause'; v_report := now() + interval '1 hour';
    END IF;
    IF v_motif IS NULL THEN
      SELECT p.extension_last_seen_at, COALESCE(p.ebay_voie_api, false) INTO v_vu, v_api
        FROM profiles p WHERE p.id = r.user_id;
      IF NOT (v_vu > now() - interval '7 days' OR (r.platform = 'ebay' AND v_api)) THEN
        v_motif := 'poste_absent'; v_report := now() + interval '6 hours';
      END IF;
    END IF;
    IF v_motif IS NULL THEN
      v_place := remise_en_vente_place(r.user_id);
      IF (v_place->>'place') IS DISTINCT FROM 'true' THEN
        v_motif := v_place->>'motif';
        v_report := NULLIF(v_place->>'reprise', '')::timestamptz;
        IF v_report IS NULL THEN v_report := 'infinity'; END IF;  -- quota à vie : n'est plus tenté
      END IF;
    END IF;

    IF v_motif IS NULL THEN
      BEGIN
        INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, status, action, photo_option,
                                     title, description, price, photos, platform_fields)
        VALUES (r.user_id, r.inventaire_id, r.platform, 'pending', 'publish', COALESCE(j.photo_option, 'original'),
                j.title, j.description, j.price, j.photos,
                remise_en_vente_champs(j.platform_fields) || jsonb_build_object('remise_en_vente',
                  jsonb_build_object('apres_vente_job', j.id, 'annonce_vendue', NULLIF(btrim(j.platform_listing_id), ''),
                                     'vente', j.platform_fields->>'vente_operation_cle',
                                     'restant', (v_op->>'restant')::integer, 'le', now())))
        RETURNING id INTO v_nouveau;
      EXCEPTION
        WHEN unique_violation THEN v_motif := 'deja_en_vente';
        WHEN OTHERS THEN v_motif := 'refus_creation: ' || left(SQLERRM, 160);
      END;
    END IF;

    IF v_nouveau IS NOT NULL THEN
      UPDATE remises_en_vente SET statut = 'faite', motif = NULL, job_cree = v_nouveau,
             essais = essais + 1, traite_le = now() WHERE id = r.id;
      INSERT INTO usage_logs (user_id, feature, metadata)
      VALUES (r.user_id, 'remise_en_vente', jsonb_build_object('plateforme', r.platform,
        'inventaire_id', r.inventaire_id::text, 'job_vendu', j.id, 'job_cree', v_nouveau,
        'restant', (v_op->>'restant')::integer));
      v_faites := v_faites + 1;
    ELSIF v_report IS NOT NULL AND v_report <> 'infinity' THEN
      UPDATE remises_en_vente SET motif = v_motif, essais = essais + 1, prochain_essai = v_report,
             traite_le = now() WHERE id = r.id;
      v_reports := v_reports + 1;
    ELSE
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = v_motif, essais = essais + 1,
             traite_le = now() WHERE id = r.id;
      v_abandons := v_abandons + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('issue', 'tour', 'faites', v_faites, 'reportees', v_reports,
                            'abandonnees', v_abandons, 'cpu', v_cpu);
END;
$function$;

-- retrait_cible_vivante(uuid,bigint,text,text,text)
CREATE OR REPLACE FUNCTION public.retrait_cible_vivante(p_user uuid, p_inv bigint, p_platform text, p_url text, p_pid text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pf       text := lower(coalesce(p_platform, ''));
  v_nom      text;
  v_cible    text;
  v_rempl    record;
  v_encours  record;
  v_ids      text[];
  v_vers     text;
  v_sans_lien integer;
  intacte    constant jsonb := jsonb_build_object('verdict', 'intacte');
begin
  if v_pf not in ('vinted', 'leboncoin', 'beebs', 'opla') or p_inv is null or p_user is null then
    return intacte;
  end if;
  v_nom := case v_pf when 'vinted' then 'Vinted' when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' else 'Opla' end;
  v_cible := coalesce(public.annonce_id_job(v_pf, p_url), nullif(btrim(p_pid), ''));
  -- Un identifiant de moins de 4 caractères ne désigne rien (règle de listing_designe).
  if v_cible is null or length(v_cible) < 4 then return intacte; end if;

  -- a) La cible est VIVANTE (un job publié la porte) : rien ne change.
  if exists (
    select 1 from public.cross_post_jobs j
     where j.user_id = p_user and j.platform = v_pf and j.status = 'published'
       and coalesce(j.action, 'publish') in ('publish', 'republish')
       and (public.annonce_id_job(v_pf, j.listing_url) = v_cible
            or nullif(btrim(j.platform_listing_id), '') = v_cible)) then
    return intacte;
  end if;

  -- b) Une republication de CET article l'a-t-elle remplacée ?
  select r.id, r.status, r.platform_fields ->> 'republish_step' as etape,
    coalesce(nullif(btrim(r.platform_fields->>'new_vinted_item_id'),''),
      nullif(btrim(r.platform_listing_id),''),public.annonce_id_job(v_pf,r.listing_url)) as nouvel_identifiant
    into v_rempl
    from public.cross_post_jobs r
   where r.user_id = p_user and r.inventaire_id = p_inv and r.platform = v_pf and r.action = 'republish'
     and v_cible in (
           nullif(btrim(r.platform_fields ->> 'old_platform_listing_id'), ''),
           public.annonce_id_job(v_pf, r.platform_fields ->> 'old_listing_url'),
           public.annonce_id_job(v_pf, r.platform_fields -> 'republish_snapshot' ->> 'listing_url'),
           case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id_avant'), '') end,
           case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id'), '') end)
     and (r.platform_fields ->> 'republish_step' = 'recreated'
          or coalesce(case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'new_vinted_item_id'), '') end,
                      nullif(btrim(r.platform_listing_id), ''),
                      public.annonce_id_job(v_pf, r.listing_url)) is distinct from v_cible)
   order by r.created_at desc
   limit 1;

  if v_rempl.id is null then
    -- b') …ou est-elle en train de le faire ? Étape 'deleted' : l'ancienne
    --     annonce n'existe déjà plus, la nouvelle n'existe pas encore.
    select r.id into v_encours
      from public.cross_post_jobs r
     where r.user_id = p_user and r.inventaire_id = p_inv and r.platform = v_pf and r.action = 'republish'
       and r.status in ('pending', 'processing', 'needs_user')
       and r.platform_fields ->> 'republish_step' = 'deleted'
       and v_cible in (
             nullif(btrim(r.platform_fields ->> 'old_platform_listing_id'), ''),
             public.annonce_id_job(v_pf, r.platform_fields ->> 'old_listing_url'),
             public.annonce_id_job(v_pf, r.platform_fields -> 'republish_snapshot' ->> 'listing_url'),
             public.annonce_id_job(v_pf, r.listing_url),
             case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id_avant'), '') end,
             case when v_pf = 'vinted' then nullif(btrim(r.platform_fields ->> 'vinted_item_id'), '') end)
     order by r.created_at desc
     limit 1;
    if v_encours.id is null then
      return intacte;                     -- pas une annonce remplacée : comportement d'avant
    end if;
    return jsonb_build_object('verdict', 'attente', 'raison', 'republication_en_cours', 'cible', v_cible,
      'republication', v_encours.id,
      'motif', format('Retrait en attente : cette annonce %s est en cours de republication (l''ancienne est déjà retirée, la nouvelle pas encore en ligne). Le retrait visera la nouvelle annonce dès qu''elle existera — rien n''est retiré à l''aveugle.', v_nom));
  end if;

  -- c) L'annonce vivante de l'article sur la plateforme : UNE seule, avec lien.
  select coalesce(array_agg(distinct x.id_annonce) filter (where x.id_annonce is not null), '{}'),
         count(*) filter (where x.id_annonce is null)
    into v_ids, v_sans_lien
    from (select coalesce(public.annonce_id_job(v_pf, j.listing_url), nullif(btrim(j.platform_listing_id), '')) as id_annonce
            from public.cross_post_jobs j
           where j.user_id = p_user and j.inventaire_id = p_inv and j.platform = v_pf and j.status = 'published'
             and coalesce(j.action, 'publish') in ('publish', 'republish')
             and public.retrait_job_prouve(j.id)
             and public.listing_designe(v_rempl.nouvel_identifiant,j.listing_url,j.platform_listing_id)) x
   where x.id_annonce is distinct from v_cible;

  if coalesce(array_length(v_ids, 1), 0) = 0 and v_sans_lien = 0 then
    -- Rien de vivant pour cet article ici : l'ancienne est déjà hors ligne,
    -- la retirer ne peut rien abîmer. Comportement d'avant.
    return intacte;
  end if;
  if coalesce(array_length(v_ids, 1), 0) = 1 and v_sans_lien = 0 then
    select j.listing_url into v_vers
      from public.cross_post_jobs j
     where j.user_id = p_user and j.inventaire_id = p_inv and j.platform = v_pf and j.status = 'published'
       and coalesce(j.action, 'publish') in ('publish', 'republish')
             and public.retrait_job_prouve(j.id)
             and public.listing_designe(v_rempl.nouvel_identifiant,j.listing_url,j.platform_listing_id)
       and coalesce(public.annonce_id_job(v_pf, j.listing_url), nullif(btrim(j.platform_listing_id), '')) = v_ids[1]
       and nullif(btrim(j.listing_url), '') is not null
     order by coalesce(j.published_at, j.created_at) desc
     limit 1;
    if v_vers is not null then
      return jsonb_build_object('verdict', 'redirigee', 'cible', v_cible, 'vers', v_vers,
                                'vers_id', v_ids[1], 'republication', v_rempl.id);
    end if;
  end if;
  return jsonb_build_object('verdict', 'attente', 'cible', v_cible, 'republication', v_rempl.id,
    'raison', case when coalesce(array_length(v_ids, 1), 0) = 0 then 'lien_inconnu' else 'plusieurs_vivantes' end,
    'motif', case when coalesce(array_length(v_ids, 1), 0) = 0
      then format('Retrait en attente : cette annonce %s a été remplacée par une republication dont le lien n''est pas encore connu. Le retrait visera la nouvelle annonce dès que son lien sera repéré — rien n''est retiré à l''aveugle.', v_nom)
      else format('Retrait en attente : cette annonce %s a été remplacée par une republication, et plusieurs annonces de cet article sont en ligne sur %s. Rien n''est retiré à l''aveugle : retire la bonne depuis la fiche de l''article.', v_nom, v_nom) end);
end;
$function$;

-- spend_coins_and_republish(bigint,text,text,numeric,text)
CREATE OR REPLACE FUNCTION public.spend_coins_and_republish(p_inventaire_id bigint, p_vinted_item_id text, p_source text DEFAULT 'manuel'::text, p_prix_republication numeric DEFAULT NULL::numeric, p_platform text DEFAULT 'vinted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_item     text := NULLIF(trim(p_vinted_item_id), '');
  v_platform text := lower(COALESCE(NULLIF(trim(p_platform), ''), 'vinted'));
  v_price    integer;
  v_wallet   coin_wallets%ROWTYPE;
  v_from_inc integer := 0;
  v_from_pur integer := 0;
  v_tier     text;
  v_prof     record;
  v_plafond  integer;
  v_faits    integer;
  v_qfree    jsonb;
  v_cycle    timestamptz;
  v_titre    text;
  v_prix     numeric;
  v_job_id   uuid;
  -- Voie planifiée (12/09)
  v_regl       jsonb;
  v_minuit     timestamptz;
  v_boutique   text;
  v_plafond_b  integer;
  v_faits_b    integer;
  -- Multiplateforme (17/09)
  v_multi      integer;
  v_min        integer;
  v_code       integer;
  v_statut     text;
  v_src        cross_post_jobs%ROWTYPE;
  v_pf_src     jsonb;
  v_photos_n   integer;
  -- 19/09 : les photos RÉELLEMENT redéposées (fiche article en repli du job
  -- source — cf. le bloc commenté plus bas).
  v_photos     jsonb;
  -- Multiplateforme automatique (18/09) : l'enveloppe de compte
  v_faits_cpt   integer;
  v_plafond_cpt integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthorized');
  END IF;
  -- (02/10, sortie d'Opla) À partir de la bascule (interrupteur coin_config
  -- `opla_sortie_le`, secondes epoch ; 0 = sortie désactivée ; absente = le
  -- 10/10/2026 à 00:00 Paris, la même règle que _shared/opla-sortie.js), plus
  -- aucune republication Opla, pour personne : refusée ICI, avant toute
  -- écriture — aucun job, rien de compté. Avant la bascule : comme avant.
  IF v_platform = 'opla' AND COALESCE((SELECT value FROM coin_config WHERE key = 'opla_sortie_le'), 1791583200) > 0
     AND now() >= to_timestamp(COALESCE((SELECT value FROM coin_config WHERE key = 'opla_sortie_le'), 1791583200)) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'opla_arrete', 'platform', v_platform,
      'message', 'Opla n''est plus disponible dans FillSell.');
  END IF;
  IF v_platform NOT IN ('vinted', 'leboncoin', 'beebs', 'opla') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_platform', 'platform', v_platform);
  END IF;
  IF v_platform = 'vinted' AND (v_item IS NULL OR v_item !~ '^\d+$') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item');
  END IF;
  IF p_source NOT IN ('manuel', 'auto') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_source');
  END IF;
  -- ── L'AUTO S'OUVRE AUX QUATRE PLATEFORMES (18/09) ─────────────────────────
  -- Ce qui la gardait Vinted-only n'était pas une limite technique : c'était
  -- « conçu, pas livré » (docs § 7 du 17/09). Le module planifié sait désormais
  -- nommer sa plateforme ; la porte devient donc l'interrupteur de CETTE
  -- plateforme, fail-closed (clé absente = fermée), et non plus le nom 'vinted'.
  IF p_source = 'auto' AND NOT republish_planifiee_pf_ouverte(v_platform) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'plateforme_fermee', 'platform', v_platform);
  END IF;
  -- ── PAS D'AUTO PENDANT LA PAUSE ANTI-ROBOT VINTED (2026-09-27, ltouze) ────
  -- Vinted a mis le compte en vérification anti-robot (marqueur
  -- attente_antirobot_compte posé par get-pending-jobs) : une republication
  -- AUTOMATIQUE ou planifiée ne s'ajoute plus à la file tant que la pause
  -- tient — le créneau suivant la recréera. Une republication demandée par la
  -- personne ('manuel') n'est jamais refusée ici : elle attend son tour, et
  -- repart au rythme habituel à la levée. Rien n'est décompté sur ce refus.
  IF p_source = 'auto' AND v_platform = 'vinted' AND compte_en_pause_antirobot(v_user) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'pause_antirobot', 'platform', v_platform);
  END IF;
  IF p_prix_republication IS NOT NULL AND p_prix_republication < 1 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_price');
  END IF;

  SELECT is_premium, is_pro, is_business, is_comped, extension_last_seen_at, extension_version,
         lang, platform_settings
  INTO v_prof FROM profiles WHERE id = v_user;

  IF v_prof.extension_last_seen_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_required',
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Republishing requires the free FillSell Chrome extension on a computer. Nothing was used from your plan.'
        ELSE 'Pour republier, il faut l''extension Chrome gratuite FillSell sur un ordinateur. Rien n''a été décompté.'
      END);
  END IF;
  IF v_prof.extension_last_seen_at < now() - interval '7 days' THEN
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'extension_stale',
      'derniere_activite', v_prof.extension_last_seen_at,
      'message', CASE WHEN COALESCE(v_prof.lang, 'fr') = 'en'
        THEN 'Your FillSell extension hasn''t been seen for over a week. Open Chrome on your computer to wake it up, then try again. Nothing was used from your plan.'
        ELSE 'Ton extension FillSell ne s''est pas manifestée depuis plus d''une semaine. Ouvre Chrome sur ton ordinateur pour la réveiller, puis relance. Rien n''a été décompté.'
      END
    );
  END IF;

  IF version_cle(v_prof.extension_version) IS NULL
     OR version_cle(v_prof.extension_version) < version_cle('0.5.0') THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                              'version', v_prof.extension_version);
  END IF;

  -- ── MULTIPLATEFORME (17/09) : porte, borne de build, source ────────────────
  IF v_platform <> 'vinted' THEN
    SELECT value INTO v_multi FROM coin_config WHERE key = 'republication_multi_ouverte';
    IF COALESCE(v_multi, 0) <> 1 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republication_multi_fermee', 'platform', v_platform);
    END IF;
    SELECT value INTO v_min FROM coin_config WHERE key = 'republication_multi_extension_min';
    v_min := COALESCE(v_min, 642);
    -- Même encodage que lbc_pro_extension_min / opla_extension_min :
    -- major×10000 + minor×100 + patch ; version illisible = 0.
    v_code := CASE
      WHEN v_prof.extension_version ~ '^\d+\.\d+\.\d+' THEN
        (split_part(v_prof.extension_version, '.', 1))::integer * 10000
        + (split_part(v_prof.extension_version, '.', 2))::integer * 100
        + (regexp_replace(split_part(v_prof.extension_version, '.', 3), '\D.*$', ''))::integer
      ELSE 0 END;
    IF v_min > 0 AND v_code < v_min THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'extension_trop_ancienne',
                                'version', v_prof.extension_version, 'minimum', v_min, 'platform', v_platform);
    END IF;

    SELECT i.statut INTO v_statut FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
    IF v_statut IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_item', 'platform', v_platform);
    END IF;
    IF v_statut = 'vendu' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_vendu', 'platform', v_platform);
    END IF;

    -- La source : le dernier dépôt FillSell EN LIGNE sur cette plateforme.
    SELECT j.* INTO v_src FROM cross_post_jobs j
    WHERE j.user_id = v_user AND j.inventaire_id = p_inventaire_id
      AND j.platform = v_platform AND j.action IN ('publish', 'republish')
      AND j.status = 'published' AND NULLIF(trim(j.listing_url), '') IS NOT NULL
    ORDER BY COALESCE(j.published_at, j.created_at) DESC
    LIMIT 1;
    IF v_src.id IS NULL THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'annonce_introuvable', 'platform', v_platform);
    END IF;

    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status IN ('pending', 'processing', 'needs_user')
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours', 'platform', v_platform);
    END IF;
    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform = v_platform AND j.inventaire_id = p_inventaire_id
        AND j.status = 'published'
        AND j.published_at > now() - interval '24 hours'
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h', 'platform', v_platform);
    END IF;

    -- ── LES PHOTOS VIENNENT DE LA FICHE QUAND LE JOB SOURCE N'EN A PAS ──────
    -- (19/09/2026 — bug report louis@ttfamily.fr : « quelle que soit la
    -- plateforme : Sans photo, la republication ne peut pas aboutir ».)
    -- Cette branche comptait les photos du JOB SOURCE. Or un article IMPORTÉ
    -- par un relevé a bien son annonce en ligne et son listing_url — donc un
    -- job source trouvable — mais ce job est écrit par le relevé avec
    -- photos = NULL : le relevé recense des annonces, il ne rapatrie pas de
    -- photos dans le job. La fiche article, elle, EN A. Résultat : refus
    -- « Sans photo » sur un article qui en affiche cinq, et rien de
    -- republiable pour qui est arrivé par un relevé.
    -- La branche Vinted de cette même fonction lisait déjà inventaire.photos ;
    -- c'est la branche multiplateforme du 17/09 qui a divergé. On les aligne.
    -- Mesuré avant correctif : 210 annonces sur 13 comptes ont un job source
    -- sans photo, dont 209 avec des photos sur la fiche.
    --
    -- ⚠️ Le repli sert AUSSI à l'insert plus bas : garder v_src.photos là-bas
    -- aurait produit un job de republication à zéro photo, refusé par le
    -- handler au lieu de l'être ici — un échec déplacé, pas réparé.
    -- inventaire.photos coexiste en deux formes (chaînes nues du relevé et de
    -- la sync, objets {type,url} de nos pipelines) : on normalise en objets,
    -- ordre PRÉSERVÉ (la 1re photo reste la principale), entrées sans URL
    -- écartées.
    v_photos := CASE WHEN jsonb_typeof(v_src.photos) = 'array' AND jsonb_array_length(v_src.photos) > 0
                     THEN v_src.photos ELSE NULL END;
    IF v_photos IS NULL THEN
      SELECT COALESCE(jsonb_agg(
               CASE WHEN jsonb_typeof(a.val) = 'string'
                    THEN jsonb_build_object('url', a.val #>> '{}',
                           'type', CASE WHEN a.ord = 1 THEN 'original' ELSE 'photo_' || (a.ord - 1) END)
                    ELSE a.val END
               ORDER BY a.ord), '[]'::jsonb) INTO v_photos
      FROM inventaire i,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ELSE '[]'::jsonb END)
              WITH ORDINALITY AS a(val, ord)
      WHERE i.id = p_inventaire_id AND i.user_id = v_user
        AND COALESCE(NULLIF(trim(CASE WHEN jsonb_typeof(a.val) = 'string'
                                      THEN a.val #>> '{}' ELSE a.val->>'url' END), ''), '') <> '';
    END IF;
    v_photos_n := CASE WHEN jsonb_typeof(v_photos) = 'array' THEN jsonb_array_length(v_photos) ELSE 0 END;
    IF v_photos_n = 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo', 'platform', v_platform);
    END IF;
  END IF;

  v_tier := palier_de(v_user);

  IF p_source = 'auto' THEN
    -- (1) L'auto RESTE RÉSERVÉE AU PRO (correction Nico 12/09 15h30 : l'ouverture
    -- aux abonnés de la 4/5 était une erreur d'orientation). Gate IDENTIQUE à
    -- celui d'avant la 4/5 ; code de refus inchangé.
    -- (05/10) « au moins Pro » par le palier unique (palier_au_moins) : un
    -- Business offert sans is_pro (ornellaracano) était refusé à chaque passage.
    IF NOT palier_au_moins(v_user, 'pro') THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'auto_reserve_pro');
    END IF;

    v_regl := republish_planifiee_reglage(v_user, v_platform);
    IF v_regl IS NOT NULL AND COALESCE((v_regl ->> 'actif')::boolean, false) THEN
      -- (2) VOIE PLANIFIÉE, PAR PLATEFORME. Trois bornes, dans cet ordre :
      --   a. le plafond du réglage de CETTE plateforme (≤ palier), compté sur
      --      le jour LOCAL de SON fuseau ;
      --   b. l'ENVELOPPE DE COMPTE : la somme des quatre plateformes ne dépasse
      --      pas le plafond du palier (décision Nico 18/09). 170 × 30 = 5 100 ≈
      --      quota_republication_pro = 5 000 : le plafond du palier a été
      --      calibré comme une enveloppe de compte, pas comme un budget par
      --      plateforme. Quatre plafonds pleins brûleraient le mois en 8 jours ;
      --   c. le plafond de boutique, sur Vinted — le global prime toujours.
      v_plafond := (v_regl ->> 'plafond_jour')::integer;
      v_minuit  := republish_minuit_local(COALESCE(v_regl ->> 'fuseau', 'Europe/Paris'));
      SELECT count(*) FILTER (WHERE platform = v_platform), count(*)
      INTO v_faits, v_faits_cpt
      FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= v_minuit;
      IF v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint',
                                  'plafond', v_plafond, 'platform', v_platform);
      END IF;
      v_plafond_cpt := republish_plafond_palier(v_tier);
      IF v_faits_cpt >= v_plafond_cpt THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_compte_atteint',
                                  'plafond', v_plafond_cpt, 'faites', v_faits_cpt,
                                  'platform', v_platform);
      END IF;

      IF v_platform = 'vinted' THEN
        SELECT NULLIF(trim(i.vinted_account_id), '') INTO v_boutique
        FROM inventaire i WHERE i.id = p_inventaire_id AND i.user_id = v_user;
        IF v_boutique IS NOT NULL THEN
          v_plafond_b := LEAST(v_plafond, GREATEST(1, COALESCE(
            NULLIF(v_regl -> 'plafond_boutique' ->> v_boutique, '')::integer, v_plafond)));
          SELECT count(*) INTO v_faits_b
          FROM cross_post_jobs j JOIN inventaire i ON i.id = j.inventaire_id
          WHERE j.user_id = v_user AND j.action = 'republish' AND j.platform = 'vinted'
            AND j.platform_fields->>'republish_source' = 'auto'
            AND j.created_at >= v_minuit
            AND i.vinted_account_id = v_boutique;
          IF v_faits_b >= v_plafond_b THEN
            RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_boutique_atteint',
                                      'plafond', v_plafond_b, 'boutique', v_boutique);
          END IF;
        END IF;
      END IF;
    ELSIF v_platform = 'vinted' THEN
      -- (3) VOIE HISTORIQUE, INCHANGÉE, ET VINTED SEUL : l'ancien moteur
      -- republish_auto n'a jamais existé ailleurs. Plafond technique 45/jour
      -- (borne 50) anti-bannissement Vinted, réglage republish_auto.plafond_jour.
      v_plafond := LEAST(50, GREATEST(1, COALESCE(
        NULLIF(v_prof.platform_settings->'vinted'->'republish_auto'->>'plafond_jour', '')::integer, 10)));
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish'
        AND platform_fields->>'republish_source' = 'auto'
        AND created_at >= date_trunc('day', now());
      IF v_faits >= v_plafond THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
      END IF;
    ELSE
      -- Auto demandée sur une plateforme dont le module n'est pas actif. Il n'y
      -- a pas de voie historique hors Vinted, et on n'en invente pas une : rien
      -- ne part, rien n'est débité.
      RETURN jsonb_build_object('allowed', false, 'reason', 'module_inactif', 'platform', v_platform);
    END IF;
  END IF;

  -- ── Bascule 02/09 : plafonds de republication par palier ─────────────────
  -- (toutes plateformes confondues : une republication est une republication)
  IF v_tier = 'free' THEN
    -- (05/10, décision Nico) 50 PAR MOIS (quota_republication_free), même
    -- cycle que quota_annonces_free. Le code de refus ne change pas : l'app
    -- ouvre la même modale ; il dit en plus la date de remise à zéro.
    v_qfree := quota_republication_free_etat(v_user);
    IF (v_qfree ->> 'plafond') IS NOT NULL AND (v_qfree ->> 'restantes')::integer <= 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_free',
                                'mode', 'mensuel',
                                'plafond', (v_qfree ->> 'plafond')::integer,
                                'faites', (v_qfree ->> 'faites')::integer, 'restantes', 0,
                                'remise_le', v_qfree -> 'remise_le');
    END IF;
  ELSIF v_tier IN ('premium', 'pro') THEN
    SELECT value INTO v_plafond FROM coin_config WHERE key = 'quota_republication_' || v_tier;
    IF v_plafond IS NOT NULL AND v_plafond > 0 THEN
      SELECT COALESCE(max(created_at), date_trunc('month', now())) INTO v_cycle
      FROM coin_ledger WHERE user_id = v_user AND kind IN ('grant_monthly','grant_upgrade');
      SELECT count(*) INTO v_faits FROM cross_post_jobs
      WHERE user_id = v_user AND action = 'republish' AND created_at >= v_cycle
        AND NOT (COALESCE(platform_fields, '{}'::jsonb) ? 'opla_sortie');
      IF v_faits >= v_plafond THEN
        IF p_source = 'auto' THEN
          RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_auto_atteint', 'plafond', v_plafond);
        END IF;
        RETURN jsonb_build_object('allowed', false, 'reason', 'plafond_republication_mensuel',
                                  'plafond', v_plafond, 'faites', v_faits);
      END IF;
    END IF;
  END IF;

  IF v_platform = 'vinted' THEN
    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform_fields->>'vinted_item_id' = v_item
        AND j.status IN ('pending', 'processing', 'needs_user')
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'republish_en_cours');
    END IF;

    IF EXISTS (
      SELECT 1 FROM cross_post_jobs j
      WHERE j.user_id = v_user AND j.action = 'republish'
        AND j.platform_fields->>'vinted_item_id' = v_item
        AND j.status = 'published'
        AND j.published_at > now() - interval '24 hours'
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cadence_24h');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM inventaire i
      WHERE i.id = p_inventaire_id AND i.user_id = v_user
        AND i.photos IS NOT NULL AND jsonb_array_length(i.photos) > 0
    ) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'article_sans_photo');
    END IF;
  END IF;

  SELECT titre INTO v_titre FROM inventaire
  WHERE id = p_inventaire_id AND user_id = v_user;

  SELECT value INTO v_price FROM coin_config WHERE key = 'price_republish';
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'price_not_configured');
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_wallets (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    IF v_wallet.next_grant_at IS NULL OR v_wallet.next_grant_at <= now() THEN
      PERFORM upgrade_monthly_grant(v_user, v_tier, null, 'lazy');
      SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = v_user FOR UPDATE;
    END IF;
    IF v_wallet.included_balance + v_wallet.purchased_balance < v_price THEN
      -- `derniere_erreur` vit dans {vinted,republish_auto} : c'est le reglage de
      -- l'ANCIEN moteur Vinted, lu par les extensions 0.6.x. Une auto refusee
      -- sur Leboncoin n'a rien a y ecrire (18/09).
      IF p_source = 'auto' AND v_platform = 'vinted' THEN
        UPDATE profiles SET platform_settings = jsonb_set(
          COALESCE(platform_settings, '{}'::jsonb),
          '{vinted,republish_auto}',
          COALESCE(platform_settings #> '{vinted,republish_auto}', '{}'::jsonb)
            || jsonb_build_object(
                 'derniere_erreur', 'pepites_insuffisantes',
                 'derniere_erreur_le', now()::text),
          true)
        WHERE id = v_user;
      END IF;
      RETURN jsonb_build_object('allowed', false, 'reason', 'insufficient_coins',
        'price', v_price, 'balance', v_wallet.included_balance + v_wallet.purchased_balance);
    END IF;
    v_from_inc := LEAST(v_wallet.included_balance, v_price);
    v_from_pur := v_price - v_from_inc;
    UPDATE coin_wallets SET
      included_balance  = included_balance  - v_from_inc,
      purchased_balance = purchased_balance - v_from_pur,
      updated_at        = now()
    WHERE user_id = v_user;
  END IF;

  IF p_source = 'auto' AND v_platform = 'vinted'
     AND v_prof.platform_settings #> '{vinted,republish_auto}' ? 'derniere_erreur' THEN
    UPDATE profiles SET platform_settings = jsonb_set(
      platform_settings,
      '{vinted,republish_auto}',
      (platform_settings #> '{vinted,republish_auto}') - 'derniere_erreur' - 'derniere_erreur_le')
    WHERE id = v_user;
  END IF;

  v_prix := p_prix_republication;

  IF v_platform = 'vinted' THEN
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                 title, price, listing_url, platform_fields)
    VALUES (
      v_user, p_inventaire_id, 'vinted', 'republish', 'pending', 'original',
      v_titre, v_prix,
      'https://www.vinted.fr/items/' || v_item,
      jsonb_build_object(
        'republish_step', 'a_capturer',
        'vinted_item_id', v_item,
        'pepites_debitees', v_price,
        'republish_source', p_source
      )
      || CASE WHEN v_prix IS NOT NULL
              THEN jsonb_build_object('prix_republication', v_prix)
              ELSE '{}'::jsonb END
    ) RETURNING id INTO v_job_id;
  ELSE
    -- Copie du job source, clés transitoires retirées : tout ce qu'il faut pour
    -- redéposer, rien de ce qui racontait la vie du dépôt d'origine.
    v_pf_src := COALESCE(v_src.platform_fields, '{}'::jsonb)
      - ARRAY['needsUserField', 'needsUserFields', 'needsUserResolved', 'needsUserAttempts', 'needsUserBoucle',
              'boucle_needs_user', 'needs_user_tick_le', 'needs_user_source', 'processing_since', 'next_action_after',
              'stale_recoveries', 'attente_session', 'blocage_antirobot', 'porte_pro_lbc', 'erreurs_archivees',
              'work_window_state', 'last_diagnostic', 'lbc_depot', 'lbc_depot_non_finalise', 'depot_non_confirme_requalifie',
              'verifier_doublon_avant_publication', 'unavailable_since', 'unavailable_pending_since', 'sale_signal',
              'detected_price', 'removed_by_user', 'republished_pending', 'delete_trace', 'delete_confirmed_by',
              'delete_dry_run_trace', 'listing_url_abandon', 'retrait_attend_lien', 'removal_url_missing',
              'republish_step', 'republish_source', 'republish_snapshot', 'republish_platform', 'republish_source_job_id',
              'republish_recreation', 'recreated_at', 'deleted_at', 'deleted_at_client', 'deleted_at_serveur',
              'horloge_client_ecart_s', 'suppression_verdict', 'old_listing_url', 'old_platform_listing_id',
              'recreation_retries', 'pepites_debitees', 'pepite_remboursee', 'prix_republication', 'orphan_alerted_at',
              'deleted_hang_count', 'introuvable_indetermine', 'attente_boutique', 'republish_creneau_id',
              'republish_sweep_at', 'republish_moteur', 'republish_planifie', 'republish_prevol', 'republish_etat_reel'];
    INSERT INTO cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option,
                                 title, description, price, photos, listing_url, platform_listing_id, platform_fields)
    VALUES (
      v_user, p_inventaire_id, v_platform, 'republish', 'pending', COALESCE(v_src.photo_option, 'original'),
      COALESCE(v_src.title, v_titre), v_src.description, COALESCE(v_prix, v_src.price), v_photos,
      v_src.listing_url, v_src.platform_listing_id,
      v_pf_src || jsonb_build_object(
        'republish_step', 'a_capturer',
        'republish_source', p_source,
        'republish_platform', v_platform,
        'republish_source_job_id', v_src.id,
        'pepites_debitees', v_price,
        'republish_snapshot', jsonb_build_object(
          'version', 2,
          'plateforme', v_platform,
          'source_job_id', v_src.id,
          'titre', COALESCE(v_src.title, v_titre),
          'prix', COALESCE(v_prix, v_src.price),
          'listing_url', v_src.listing_url,
          'platform_listing_id', v_src.platform_listing_id,
          'photos', v_photos_n,
          'captured_at', now())
      )
      || CASE WHEN v_prix IS NOT NULL
              THEN jsonb_build_object('prix_republication', v_prix)
              ELSE '{}'::jsonb END
    ) RETURNING id INTO v_job_id;
  END IF;

  IF v_price > 0 THEN
    INSERT INTO coin_ledger (user_id, delta, included_after, purchased_after, kind, metadata)
    VALUES (v_user, -v_price,
            v_wallet.included_balance - v_from_inc,
            v_wallet.purchased_balance - v_from_pur,
            'spend_republish',
            jsonb_build_object('vinted_item_id', v_item, 'job_id', v_job_id, 'platform', v_platform));
  END IF;

  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'republish', jsonb_build_object(
    'coins', v_price, 'vinted_item_id', v_item, 'source', p_source,
    'plan', v_tier, 'platform', v_platform
  ));

  RETURN jsonb_build_object(
    'allowed', true, 'price', v_price, 'job_id', v_job_id, 'platform', v_platform,
    'included_after',  CASE WHEN v_price > 0 THEN v_wallet.included_balance - v_from_inc ELSE NULL END,
    'purchased_after', CASE WHEN v_price > 0 THEN v_wallet.purchased_balance - v_from_pur ELSE NULL END
  );
END;
$function$;

-- synchro_avancement()
CREATE OR REPLACE FUNCTION public.synchro_avancement()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_runs jsonb := '[]'::jsonb; r record; v jsonb;
  v_restant_releves numeric := 0; v_restant_vinted numeric := 0; v_restant_rap numeric := 0;
  v_total numeric := 0; v_fait numeric := 0; v_volume numeric; v_attendu numeric; v_ecoule numeric;
  c rapprochement_comptes%ROWTYPE; v_en_attente integer := 0; v_nouvelles integer := 0; v_a_verifier integer := 0;
  v_actif boolean := false; v_vague timestamptz;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT * INTO c FROM rapprochement_comptes WHERE user_id = v_user;
  v_vague := now() - interval '2 hours';
  FOR r IN
    SELECT DISTINCT ON (CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END)
           CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END pf, s.kind, s.status, s.items_vus, s.total_entries,
           s.queued_at, s.started_at, s.finished_at, s.progres_le
      FROM vinted_sync_runs s
     WHERE s.user_id = v_user AND s.kind IN ('annonces', 'dressing')
       AND COALESCE(s.queued_at, s.started_at) > v_vague AND releve_est_geste(s.declencheur)
     ORDER BY CASE WHEN s.kind = 'dressing' THEN 'vinted' ELSE s.platform END, COALESCE(s.queued_at, s.started_at) DESC
  LOOP
    SELECT to_jsonb(x) INTO v FROM synchro_vitesses x WHERE x.platform = r.pf;
    v_volume := COALESCE(r.total_entries, (SELECT s2.items_vus FROM vinted_sync_runs s2
                                             WHERE s2.user_id = v_user AND s2.status IN ('done', 'incomplete')
                                               AND (CASE WHEN s2.kind = 'dressing' THEN 'vinted' ELSE s2.platform END) = r.pf
                                             ORDER BY s2.finished_at DESC NULLS LAST LIMIT 1), 100);
    v_attendu := COALESCE((v ->> 's_base')::numeric, 20) + COALESCE((v ->> 's_par_annonce')::numeric, 0.5) * v_volume;
    v_ecoule := CASE WHEN r.status = 'running' THEN extract(epoch FROM now() - COALESCE(r.started_at, now())) ELSE 0 END;
    v_total := v_total + v_attendu;
    IF r.status = 'queued' THEN
      IF r.pf = 'vinted' THEN v_restant_vinted := greatest(v_restant_vinted, v_attendu); ELSE v_restant_releves := v_restant_releves + v_attendu; END IF;
      v_actif := true;
    ELSIF r.status = 'running' THEN
      IF r.pf = 'vinted' THEN v_restant_vinted := greatest(v_restant_vinted, greatest(5, v_attendu - v_ecoule));
      ELSE v_restant_releves := v_restant_releves + greatest(5, v_attendu - v_ecoule); END IF;
      v_fait := v_fait + least(v_attendu * 0.95, v_ecoule);
      v_actif := true;
    ELSE
      v_fait := v_fait + v_attendu;
    END IF;
    v_runs := v_runs || jsonb_build_array(jsonb_build_object(
      'platform', r.pf, 'status', r.status, 'lues', r.items_vus, 'annoncees', r.total_entries, 'volume', v_volume,
      'debut', r.started_at, 'fin', r.finished_at, 'attendu_s', round(v_attendu)));
  END LOOP;

  IF c.user_id IS NOT NULL AND c.etat <> 'termine' THEN
    SELECT count(*) INTO v_en_attente FROM annonces_plateforme a
     WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla');
    v_nouvelles := 0;
    -- v3 : les photos (≈ 25/s en parallèle) puis une passe de quelques secondes
    v_restant_rap := 8 + COALESCE(c.photos_manquantes, 0) / 25.0
                   + v_en_attente * COALESCE(c.ms_decision::numeric / NULLIF(c.traitees, 0), 20) / 1000.0;
    v_actif := true;
  END IF;
  SELECT (SELECT count(*) FROM inventaire i
           WHERE i.user_id = v_user AND i.a_verifier IS NOT NULL AND i.statut = 'stock' AND i.fusionne_dans IS NULL)
       + (SELECT count(*) FROM annonces_plateforme a
           WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
             AND a.proposition IS NOT NULL)
    INTO v_a_verifier;

  RETURN jsonb_build_object(
    'ok', true, 'actif', v_actif, 'releves', v_runs,
    'rapprochement', CASE WHEN c.user_id IS NULL THEN NULL ELSE jsonb_build_object(
        'etat', c.etat, 'demande_le', c.demande_le, 'debut_le', c.debut_le, 'fin_le', c.fin_le,
        'en_attente', v_en_attente, 'nouvelles', v_nouvelles, 'traitees', c.traitees,
        'photos_manquantes', c.photos_manquantes, 'bilan', c.bilan) END,
    'a_verifier', v_a_verifier,
    'secondes_restantes', round(greatest(v_restant_vinted, v_restant_releves) + v_restant_rap),
    'avancement', CASE WHEN v_total + v_restant_rap <= 0 THEN 1
                       ELSE round(least(1, v_fait / (v_fait + greatest(v_restant_vinted, v_restant_releves) + v_restant_rap))::numeric, 3) END);
END;
$function$;

-- synchro_relancer_rangement()
CREATE OR REPLACE FUNCTION public.synchro_relancer_rangement()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_user uuid := auth.uid(); v_n integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized'); END IF;
  SELECT count(*) INTO v_n FROM annonces_plateforme a
   WHERE a.user_id = v_user AND a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
     AND a.platform IN ('leboncoin', 'beebs', 'ebay', 'opla');
  PERFORM rapprochement_demander(v_user, 'recent:vinted');
  PERFORM rapprochement_relancer(v_user);
  RETURN jsonb_build_object('ok', true, 'en_attente', v_n);
END;
$function$;

-- trancher_publications_sans_lien(uuid,text,uuid)
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
$function$;

-- ventes_garde_annonce_de_la_vente()
CREATE OR REPLACE FUNCTION public.ventes_garde_annonce_de_la_vente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_brut text;
  v_pf   text;
  v_inv  bigint;
  v_nb   integer;
begin
  begin
    v_brut := lower(coalesce(nullif(btrim(new.plateforme_code), ''), new.plateforme, ''));
    v_pf := case
      when v_brut like '%vinted%' then 'vinted'
      when v_brut like '%leboncoin%' or v_brut in ('lbc', 'le bon coin') then 'leboncoin'
      when v_brut like '%beebs%' then 'beebs'
      when v_brut like '%ebay%' then 'ebay'
      when v_brut like '%opla%' then 'opla'
      else null end;
    if v_pf is null then
      return new;
    end if;
    v_inv := new.inventaire_id;
    -- Sans lien de fiche explicite, aucune vente ne désigne un autre article.
    if v_inv is null then
      return new;
    end if;
    update public.cross_post_jobs d
       set status = 'cancelled',
           error = 'Retrait inutile : l''article a été vendu sur cette plateforme — l''annonce vendue n''est pas touchée.',
           platform_fields = coalesce(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
             'retrait_non_envoye', jsonb_build_object('le', now(), 'motif', 'plateforme_de_la_vente',
               'vente', new.id, 'pose_par', 'ventes_garde_annonce_de_la_vente'))
     where d.user_id = new.user_id and d.inventaire_id = v_inv
       and d.platform = v_pf and d.action = 'delete' and d.status = 'pending'
       and d.platform_fields -> 'arme_par' ->> 'chemin' = 'vente_article_serveur'
       and d.created_at > now() - interval '15 minutes';
  exception when others then
    raise warning 'ventes_garde_annonce_de_la_vente (vente %) : %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- ventes_statut_classe(text,text)
CREATE OR REPLACE FUNCTION public.ventes_statut_classe(p_platform text, p_statut text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_platform
    WHEN 'vinted' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'completed' THEN 'vente' WHEN 'failed' THEN 'annulee' ELSE 'inconnu' END
    WHEN 'leboncoin' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'done' THEN 'vente' WHEN 'cancelled' THEN 'annulee'
      WHEN 'in_progress' THEN 'en_cours' ELSE 'inconnu' END
    WHEN 'opla' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'shipped' THEN 'vente' WHEN 'delivered' THEN 'vente' WHEN 'completed' THEN 'vente'
      WHEN 'accepted' THEN 'en_cours' WHEN 'waiting_for_shipment' THEN 'en_cours'
      WHEN 'cancelled' THEN 'annulee' WHEN 'refused' THEN 'annulee' WHEN 'failed' THEN 'annulee'
      ELSE 'inconnu' END
    WHEN 'ebay' THEN CASE lower(coalesce(p_statut,''))
      WHEN 'paid' THEN 'vente' WHEN 'partially_refunded' THEN 'vente'
      WHEN 'fully_refunded' THEN 'annulee' WHEN 'cancelled' THEN 'annulee'
      ELSE 'inconnu' END
    ELSE 'inconnu' END;
$function$;

DROP FUNCTION IF EXISTS public.garde_depop_acces();
DROP FUNCTION IF EXISTS public.garde_depop_acces_catalogue();
DROP FUNCTION IF EXISTS public.depop_autorise(uuid);
COMMIT;
