-- ════════════════════════════════════════════════════════════════════════════
-- LE DÉMENTI VAUT AUSSI POUR UN SIGNAL DE LA MÊME SYNCHRO (08/10/2026, correctif de 20261008110000)
-- ════════════════════════════════════════════════════════════════════════════
-- L'extension horodate le relevé du jour d'une annonce AVANT le signal de vente
-- qu'elle pose dans la même passe du dressing (Louis, 05/10 : relevé de
-- 10254055978 « active » à 16:48:34.693, signal « vendue » collé à son job à
-- 16:48:35.360). « Relevé postérieur au signal » laissait donc passer le cas
-- même qu'il fallait fermer : le démenti attendait le dressing du lendemain, et
-- la garde de vente ne refusait pas. Un relevé ACTIVE de la même synchro (elle
-- tourne encore, ou elle couvre le relevé et le signal) dément désormais aussi.
-- Une vente réelle reste « sold » au dressing : jamais démentie. La veille des
-- ventes ne tourne pas pendant une synchro du dressing (verrou de flux).
-- Inverse : supabase/rollbacks/20261008112000_vinted_dementi_meme_synchro_INVERSE.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.vinted_dressing_dement_signaux()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Les jobs SIGNALÉS des comptes du lot d'abord (quelques-uns), puis le lot :
  -- jamais une recherche de job par ligne relevée (2 647 lignes chez le plus gros).
  WITH comptes AS (
    SELECT DISTINCT n.user_id FROM nouveaux n WHERE n.status = 'active'
  ), cand AS MATERIALIZED (
    SELECT j.id, j.user_id, btrim(j.platform_listing_id) lid,
           COALESCE(_ts_ou_null(j.platform_fields ->> 'unavailable_since'),
                    _ts_ou_null(j.platform_fields ->> 'unavailable_pending_since'),
                    '-infinity'::timestamptz) signale_le
      FROM cross_post_jobs j JOIN comptes c ON c.user_id = j.user_id
     WHERE j.status = 'published' AND j.platform = 'vinted' AND j.action IN ('publish', 'republish')
       AND (j.platform_fields ? 'sale_signal' OR j.platform_fields ? 'unavailable_since' OR j.platform_fields ? 'unavailable_pending_since')
  ), dementis AS (
    SELECT c.id, max(n.captured_at) releve_le
      FROM cand c JOIN nouveaux n ON n.user_id = c.user_id AND n.vinted_item_id = c.lid AND n.status = 'active'
     -- (08/10) Le relevé est APRÈS le signal, ou de la MÊME synchro du dressing :
     -- l'extension horodate le relevé avant les signaux qu'elle pose dans la même
     -- passe (Louis, 05/10 : relevé 16:48:34.693, signal 16:48:35.360).
     WHERE (c.signale_le <= n.captured_at
            OR EXISTS (SELECT 1 FROM vinted_sync_runs r
                        WHERE r.user_id = c.user_id AND r.kind = 'dressing' AND r.status = 'running'
                          AND r.started_at <= LEAST(c.signale_le, n.captured_at)))
     GROUP BY c.id
  )
  UPDATE cross_post_jobs j
     SET platform_fields = (j.platform_fields - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price'])
         || jsonb_build_object('signal_dementi_par_dressing', jsonb_build_object(
              'le', now(), 'releve_le', d.releve_le, 'signal', j.platform_fields ->> 'sale_signal',
              'depuis', COALESCE(j.platform_fields ->> 'unavailable_since', j.platform_fields ->> 'unavailable_pending_since')))
    FROM dementis d
   WHERE j.id = d.id;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'vinted_dressing_dement_signaux : % — relevé poursuivi', SQLERRM;
  RETURN NULL;
END;
$function$;

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

COMMIT;
