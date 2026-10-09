-- INVERSE de 20261009180000_une_vente_par_article : remet EXACTEMENT les deux définitions
-- EN PROD du 09/10 soir (pg_get_functiondef, lues avant application).
-- npx supabase db query --linked -f scripts/reparations/20261009_inverse_une_vente_par_article.sql
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
 v_alerte timestamptz; v_fin_ebay timestamptz; v_vu_ebay timestamptz; v_revue_le timestamptz;
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
  -- (09/10, Marta) SANS PREUVE DE VENTE, une annonce que la plateforme montre
  -- ENCORE EN LIGNE n'est pas vendue. « Plus en ligne — Vendue ? » posée à tort
  -- (enchère eBay en cours lue « terminée » par le veilleur : 920016444915, fin
  -- le 14/10) enregistrait une vente « Ailleurs » d'un seul appui. Font foi les
  -- lectures de la plateforme, jamais un titre :
  --  · eBay : une date de fin À VENIR (fin_ebay), ou le veilleur qui a vu
  --    l'annonce en vente APRÈS l'alerte (quantite_ebay) ;
  --  · toute plateforme relevée (hors Vinted, qui a ses gardes ci-dessus) : la
  --    ligne d'annonce vue EN LIGNE par un relevé APRÈS l'alerte — mêmes
  --    conditions que alerte_lever_revues_plateformes.
  -- Une preuve « sold » n'est jamais retenue ici ; une vente enregistrée depuis
  -- la fiche (sans annonce, p_job nul) non plus : c'est le chemin proposé.
  IF NOT coalesce(v_proof,false) THEN
   v_alerte:=_ts_ou_null(j.platform_fields->>'unavailable_since');
   IF j.platform='ebay' THEN
    v_fin_ebay:=_ts_ou_null(j.platform_fields#>>'{fin_ebay,fin}');
    IF v_fin_ebay>now() THEN
     RETURN v_none||jsonb_build_object('code','annonce_en_ligne','reason',
      'Cette annonce est toujours en ligne sur eBay (fin prévue le '||to_char(v_fin_ebay AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')
      ||') : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.');
    END IF;
    v_vu_ebay:=_ts_ou_null(j.platform_fields#>>'{quantite_ebay,vu_le}');
    IF v_alerte IS NOT NULL AND v_vu_ebay>v_alerte AND coalesce(j.platform_fields#>>'{quantite_ebay,terminee}','')<>'true' THEN
     RETURN v_none||jsonb_build_object('code','annonce_en_ligne','reason',
      'eBay montre cette annonce en vente (lue le '||to_char(v_vu_ebay AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')
      ||') : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.');
    END IF;
   END IF;
   IF v_alerte IS NOT NULL AND j.platform<>'vinted' AND nullif(btrim(j.platform_listing_id),'') IS NOT NULL THEN
    SELECT max(a.vu_le) INTO v_revue_le FROM annonces_plateforme a
     WHERE a.user_id=p_user AND a.platform=j.platform AND a.listing_id=btrim(j.platform_listing_id)
       AND a.statut_plateforme='en_ligne' AND a.disparu_le IS NULL AND a.vu_le>v_alerte;
    IF v_revue_le IS NOT NULL THEN
     RETURN v_none||jsonb_build_object('code','annonce_en_ligne','reason',
      'Cette annonce a été revue en ligne sur '||CASE j.platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'ebay' THEN 'eBay'
        WHEN 'beebs' THEN 'Beebs' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE j.platform END
      ||' le '||to_char(v_revue_le AT TIME ZONE 'Europe/Paris','DD/MM à HH24:MI')
      ||', après l’alerte : aucune vente n’est enregistrée. Si l’article est vendu ailleurs, enregistre la vente depuis sa fiche.');
    END IF;
   END IF;
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
     WHEN 'beebs' THEN 'Beebs' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE 'Ailleurs' END ELSE v_pf END;
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
  IF p_platform IS NULL OR p_platform NOT IN ('vinted','leboncoin','ebay','opla','depop') THEN
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
        -- (09/10, Jocabroc) IDENTIFIANT SEULEMENT, TITRE VIDE. Seules les bandes
        -- « job » et « job_clos » sont retenues ci-dessous, et rapprocher_classer
        -- ne les rend que par l'identifiant, AVANT de lire le titre. Le titre
        -- n'ajoutait qu'une comparaison à toute la boutique dont le verdict était
        -- JETÉ : sur un gros compte, 8 s dépassées, l'appel entier annulé, aucune
        -- commande jamais écrite. Avec un titre vide la fonction s'arrête juste
        -- après ses deux recherches par identifiant : même résultat, sans le coût.
        v_verdict := rapprocher_classer(v_user, p_platform, coalesce(v_listing,''),
                                        coalesce(v_url,''), '', v_prix, ARRAY[]::text[]);
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
