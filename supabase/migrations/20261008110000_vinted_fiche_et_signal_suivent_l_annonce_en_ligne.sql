-- ════════════════════════════════════════════════════════════════════════════
-- VINTED : LA FICHE ET LE SIGNAL DE VENTE SUIVENT L'ANNONCE EN LIGNE (08/10/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- LE CAS (louis@ttfamily.fr, 14 fiches à quantité, toutes remises en vente) :
-- « 12 adaptateurs Jaune » (1789898056278, quantité 9997) : 10238384500 vendue
-- le 05/10, remise en vente → 10254055978 (05/10) ; le 06/10 à 15:02, Louis
-- confirme « Vendue » sur 14 bandeaux en 30 s → 14 ventes, 14 remises → 14
-- annonces neuves le 06/10 après-midi. Le 07/10 au soir (dressing complet,
-- 123/123) : 4 des annonces « vendues » le 06/10 sont TOUJOURS EN LIGNE
-- (10254055978, 10251765273, 10248443064, 10254091481), 7 ont disparu du
-- dressing sans y être vendues, et 10 des 14 annonces neuves aussi.
--
-- LES CAUSES (synchro du dressing de l'extension, toutes versions) :
--  1. Le signal de vente part sur le MAUVAIS job. Une annonce vendue
--     (10238384500) dont le job est déjà « sold » est cherchée par son id
--     parmi les jobs PUBLIÉS — absente —, puis par la FICHE : le job publié de
--     la fiche est celui de la NOUVELLE annonce (10254055978), qui reçoit
--     sale_signal « sold » (05/10 16:48:35) alors que la même synchro la voit
--     « active » 9 s plus tard. L'app affiche « 🎉 Vendue sur Vinted ! », le
--     clic enregistre la vente (preuve = ce signal) et arme la remise en vente :
--     un doublon sur Vinted.
--  2. La fiche recule vers l'ANCIENNE annonce. update-job-status recale la
--     fiche sur l'annonce neuve à la publication ; la synchro suivante écrit,
--     par la fiche du job, l'id et le statut « sold » de l'ancienne annonce
--     (PATCH léger, rattrapage par job). La fiche dit « vendue » quand
--     l'article est en ligne.
--  3. La remise en vente ne vérifie que la fiche (reculée) : jamais que
--     l'annonce dite vendue a quitté Vinted.
-- Le mécanisme n'existe que pour Vinted : la fiche ne porte d'identifiant
-- d'annonce (vinted_item_id / vinted_status) que pour Vinted ; ailleurs, la
-- vente est lue par annonce (annonces_plateforme, job par identifiant exact).
--
-- CE QUI CHANGE (l'extension ne change pas) :
--  1. vinted_dressing_dement_signaux : une annonce que la synchro relève
--     ACTIVE efface le signal « vendue »/« plus en ligne » posé AVANT sur le job
--     publié de CETTE annonce (marqueur signal_dementi_par_dressing). Une vente
--     réelle reste « sold » au dressing : elle n'est jamais démentie.
--  2. inventaire_vinted_suit_annonce_en_ligne : la fiche ne revient jamais vers
--     une annonce PLUS ANCIENNE qui n'est pas en ligne ; vers une plus ancienne
--     EN LIGNE seulement quand la récente ne l'est plus (statut, disparition, ou
--     absente du dressing depuis 26 h).
--  3. enregistrer_vente_atomique (chemin « job », Vinted) : refuse une vente
--     sur une annonce que le dressing a revue en ligne après son signal, et sur
--     une annonce remplacée par une autre annonce EN LIGNE de la même fiche.
--     « Oui, enregistrer la vente » n'enregistre plus ces ventes-là.
--  4. remises_en_vente_tick : pas de remise tant que l'annonce « vendue » est
--     encore en ligne après la vente (Vinted : dressing ; ailleurs : relevé) —
--     reprise dans 6 h. Jamais un doublon.
--  5. push_ventes_a_envoyer : une note de vente née d'un JOB n'annonce rien si
--     le signal a été retiré ; Vinted attend 2 min que le dressing ait pu le
--     démentir (aucun mail « vendu » faux).
-- Mesure : 1 = un déclencheur PAR INSTRUCTION (une jointure par lot de relevés,
-- jamais une ligne par ligne) ; 2 = une comparaison d'ids par ligne écrite ;
-- 3-5 = une lecture indexée de plus par vente / remise / note.
-- Inverse : supabase/rollbacks/20261008110000_vinted_fiche_et_signal_suivent_l_annonce_en_ligne_INVERSE.sql

BEGIN;

-- ── 1. Le dressing dément un signal posé sur une annonce qu'il voit en ligne ──
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
     WHERE c.signale_le <= n.captured_at
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
REVOKE ALL ON FUNCTION public.vinted_dressing_dement_signaux() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vinted_dressing_dement_signaux_ins ON public.vinted_listing_snapshots;
DROP TRIGGER IF EXISTS vinted_dressing_dement_signaux_maj ON public.vinted_listing_snapshots;
CREATE TRIGGER vinted_dressing_dement_signaux_ins
  AFTER INSERT ON public.vinted_listing_snapshots
  REFERENCING NEW TABLE AS nouveaux
  FOR EACH STATEMENT EXECUTE FUNCTION public.vinted_dressing_dement_signaux();
CREATE TRIGGER vinted_dressing_dement_signaux_maj
  AFTER UPDATE ON public.vinted_listing_snapshots
  REFERENCING NEW TABLE AS nouveaux
  FOR EACH STATEMENT EXECUTE FUNCTION public.vinted_dressing_dement_signaux();

-- ── 2. La fiche ne recule jamais vers une annonce plus ancienne qui n'est pas en ligne ──
CREATE OR REPLACE FUNCTION public.inventaire_vinted_suit_annonce_en_ligne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old text := NULLIF(btrim(COALESCE(OLD.vinted_item_id, '')), '');
  v_new text := NULLIF(btrim(COALESCE(NEW.vinted_item_id, '')), '');
  v_vue boolean;
BEGIN
  IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN RETURN NEW; END IF;
  IF v_old !~ '^\d+$' OR v_new !~ '^\d+$' OR v_new::numeric > v_old::numeric THEN RETURN NEW; END IF;  -- plus récente : la fiche la suit
  -- Une annonce PLUS ANCIENNE ne reprend la fiche que si elle est EN LIGNE et
  -- que la récente ne l'est plus (statut, disparition, absente du dressing).
  IF COALESCE(NEW.vinted_status, '') = 'active' THEN
    IF COALESCE(OLD.vinted_status, '') <> 'active' OR OLD.disparu_le IS NOT NULL THEN RETURN NEW; END IF;
    SELECT EXISTS (SELECT 1 FROM vinted_listing_snapshots s
                    WHERE s.user_id = NEW.user_id AND s.vinted_item_id = v_old AND s.status = 'active'
                      AND s.captured_at > now() - interval '26 hours') INTO v_vue;
    IF NOT v_vue THEN RETURN NEW; END IF;
  END IF;
  -- La synchro écrivait l'ancienne annonce (vendue) par-dessus la récente : on
  -- garde la récente et son état (les compteurs de l'écriture sont ceux de
  -- l'ancienne).
  NEW.vinted_item_id := OLD.vinted_item_id;
  NEW.vinted_status := OLD.vinted_status;
  NEW.vinted_view_count := OLD.vinted_view_count;
  NEW.vinted_favourite_count := OLD.vinted_favourite_count;
  NEW.listed_at_guess := OLD.listed_at_guess;
  NEW.disparu_le := OLD.disparu_le;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.inventaire_vinted_suit_annonce_en_ligne() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inventaire_vinted_suit_annonce_en_ligne ON public.inventaire;
CREATE TRIGGER inventaire_vinted_suit_annonce_en_ligne
  BEFORE UPDATE OF vinted_item_id ON public.inventaire
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_vinted_suit_annonce_en_ligne();

-- ── 3. La vente : jamais sur une annonce en ligne ou remplacée (définition EN PROD du 08/10 + garde) ──
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
   IF v_snap.status='active' AND v_snap.captured_at>=coalesce(_ts_ou_null(j.platform_fields->>'unavailable_since'),j.published_at,j.created_at) THEN
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

-- ── 4. La remise en vente : jamais un doublon (définition EN PROD du 08/10 + garde) ──
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

-- ── 5. Les mails et push de vente : un signal retiré n'annonce rien (définition EN PROD du 08/10 + garde) ──
CREATE OR REPLACE FUNCTION public.push_ventes_a_envoyer(p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
AS $function$
declare
  v_user     uuid;
  r          record;
  v_v        record;
  v_q        integer;
  v_cles     text[];
  v_app      jsonb;
  v_prof     record;
  v_rafale   integer;
  v_out      jsonb := '[]'::jsonb;
  v_n        integer := 0;
  v_attente  numeric;
begin
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus — par canal.
  -- Une note déjà décidée (part_le) ne repasse jamais par la décision : elle
  -- repart par la boucle des relances, plus bas, canal par canal.
  update public.push_ventes
     set statut = case when essais >= 3 then 'echec' else 'a_envoyer' end,
         motif  = case when essais >= 3 then 'envoi_interrompu' else motif end
   where statut = 'en_envoi' and traite_le < now() - interval '3 minutes';
  update public.push_ventes
     set mail_statut = case when mail_essais >= 3 then 'echec' else 'a_envoyer' end,
         mail_motif  = case when mail_essais >= 3 then 'envoi_interrompu' else mail_motif end
   where mail_statut = 'en_envoi' and mail_traite_le < now() - interval '3 minutes';
  -- Une note jamais décidée en 2 h n'apprend plus rien à personne.
  update public.push_ventes set statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   where statut = 'a_envoyer' and part_le is null and cree_le < now() - interval '2 hours';
  -- Le journal ne garde que 30 jours (borné : 500 lignes par passage).
  delete from public.push_ventes where id in (
    select id from public.push_ventes where cree_le < now() - interval '30 days' limit 500);

  for v_user in
    select x.user_id from (
      select p.user_id, min(p.cree_le) as d from public.push_ventes p
       where p.statut = 'a_envoyer' and p.part_le is null and p.cree_le < now() - interval '15 seconds'
       group by p.user_id
      union all
      select p.user_id, min(coalesce(p.mail_traite_le, p.traite_le, p.cree_le)) from public.push_ventes p
       where p.part_le is not null and (p.statut = 'a_envoyer' or p.mail_statut = 'a_envoyer')
       group by p.user_id
    ) x group by x.user_id order by min(x.d) limit 20
  loop
    -- Un seul appel décide pour un compte ; l'autre passe (il reviendra).
    if not pg_try_advisory_xact_lock(hashtextextended('push_ventes:' || v_user::text, 0)) then
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      into v_app from public.appareils_push a where a.user_id = v_user;
    select p.email, coalesce(p.lang, 'fr') as lang into v_prof from public.profiles p where p.id = v_user;

    -- Relances d'une vente déjà décidée « part » : chaque canal en attente
    -- repart seul ; la décision n'est jamais refaite.
    for r in
      select * from public.push_ventes
       where user_id = v_user and part_le is not null
         and (statut = 'a_envoyer' or mail_statut = 'a_envoyer')
       order by id
       for update skip locked
    loop
      update public.push_ventes set
        statut = case when statut = 'a_envoyer'
                      then case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end
                      else statut end,
        essais = essais + case when statut = 'a_envoyer' and jsonb_array_length(v_app) > 0 then 1 else 0 end,
        traite_le = case when statut = 'a_envoyer' then now() else traite_le end,
        mail_statut = case when mail_statut = 'a_envoyer' then 'en_envoi' else mail_statut end,
        mail_essais = mail_essais + case when mail_statut = 'a_envoyer' then 1 else 0 end,
        mail_traite_le = case when mail_statut = 'a_envoyer' then now() else mail_traite_le end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id,
        'appareils', case when r.statut = 'a_envoyer' then v_app else '[]'::jsonb end,
        'push', r.statut = 'a_envoyer' and jsonb_array_length(v_app) > 0,
        'mail', r.mail_statut = 'a_envoyer', 'email', v_prof.email, 'lang', v_prof.lang);
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;

    -- Rattrapage de masse : 8 VENTES DISTINCTES (ou plus) en 5 minutes. Une
    -- même vente vue par plusieurs chemins (signal de la veille, relevé,
    -- commande) partage au moins une clé : elle ne compte qu'UNE fois.
    select count(*) into v_rafale from public.push_ventes p
     where p.user_id = v_user and p.origine not in ('declaree', 'essai')
       and p.statut not in ('declaree', 'doublon') and p.cree_le > now() - interval '5 minutes'
       and not exists (
         select 1 from public.push_ventes o
          where o.user_id = v_user and o.id < p.id
            and o.origine not in ('declaree', 'essai') and o.statut not in ('declaree', 'doublon')
            and o.cree_le > now() - interval '5 minutes'
            and o.cles && p.cles);
    if v_rafale >= 8 then
      update public.push_ventes set statut = 'ignoree', motif = 'rattrapage_de_masse', traite_le = now()
       where user_id = v_user and statut = 'a_envoyer' and part_le is null;
      continue;
    end if;

    for r in
      select * from public.push_ventes
       where user_id = v_user and statut = 'a_envoyer' and part_le is null
         and cree_le < now() - interval '15 seconds'
       order by id
       for update skip locked
    loop
      v_cles := r.cles;
      -- Le relevé Vinted pose la commande d'abord, l'annonce ensuite : on relit.
      if r.vente_id is not null then
        select v.annonce_id, v.inventaire_id into v_v from public.ventes v where v.id = r.vente_id;
        if found then
          if v_v.annonce_id is not null and r.plateforme is not null then
            v_cles := v_cles || ('annonce:' || r.plateforme || ':' || v_v.annonce_id);
          end if;
          if v_v.inventaire_id is not null then
            select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = v_v.inventaire_id;
            if coalesce(v_q, 1) <= 1 then v_cles := v_cles || ('fiche:' || v_v.inventaire_id::text); end if;
          end if;
        end if;
      end if;
      -- Une commande sans annonce ni fiche attend son second temps (3 min au plus).
      if not exists (select 1 from unnest(v_cles) k where k like 'annonce:%' or k like 'fiche:%' or k like 'job:%')
         and r.cree_le > now() - interval '3 minutes' then
        continue;
      end if;
      v_cles := array(select distinct k from unnest(v_cles) k);
      -- (08/10, Louis) Le signal de vente d'un JOB doit tenir au moment de
      -- décider : la synchro du dressing dément en quelques secondes une vente
      -- collée au mauvais job (vinted_dressing_dement_signaux). Vinted attend
      -- donc 2 minutes ; un signal retiré n'annonce rien (ni push, ni mail).
      if r.origine = 'job' and r.plateforme = 'vinted' and r.cree_le > now() - interval '2 minutes' then
        continue;
      end if;
      if r.origine = 'job' and r.job_id is not null and not exists (
           select 1 from public.cross_post_jobs jj where jj.id = r.job_id
              and (jj.status = 'sold' or jj.platform_fields ->> 'sale_signal' = 'sold')) then
        update public.push_ventes set statut = 'ignoree', motif = 'signal_dementi', traite_le = now() where id = r.id;
        continue;
      end if;
      -- Même vente déjà annoncée (push ou mail), ou déclarée par la personne.
      if exists (select 1 from public.push_ventes o
                  where o.user_id = v_user and o.id <> r.id
                    and (o.part_le is not null or o.statut in ('envoyee', 'en_envoi', 'declaree'))
                    and o.cree_le > now() - interval '3 days'
                    and o.cles && v_cles) then
        update public.push_ventes set statut = 'doublon', cles = v_cles, traite_le = now() where id = r.id;
        continue;
      end if;
      -- Décidée : elle part. Le push seulement s'il y a un téléphone ; le mail toujours.
      update public.push_ventes
         set part_le = now(), cles = v_cles, traite_le = now(),
             statut = case when jsonb_array_length(v_app) > 0 then 'en_envoi' else 'sans_appareil' end,
             essais = essais + case when jsonb_array_length(v_app) > 0 then 1 else 0 end,
             mail_statut = case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 'sans_adresse' else 'en_envoi' end,
             mail_traite_le = now(),
             mail_essais = mail_essais + case when nullif(btrim(coalesce(v_prof.email, '')), '') is null then 0 else 1 end
       where id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', r.titre,
        'prix', r.prix, 'devise', r.devise, 'inventaire_id', r.inventaire_id,
        'vente_id', r.vente_id, 'appareils', v_app, 'push', jsonb_array_length(v_app) > 0,
        'mail', nullif(btrim(coalesce(v_prof.email, '')), '') is not null,
        'email', v_prof.email, 'lang', v_prof.lang);
      v_n := v_n + 1;
      exit when v_n >= p_limite;
    end loop;
    exit when v_n >= p_limite;
  end loop;

  select extract(epoch from (min(cree_le) + interval '16 seconds' - now()))
    into v_attente from public.push_ventes where statut = 'a_envoyer' and part_le is null;
  return jsonb_build_object('notes', v_out, 'attente_s', greatest(coalesce(v_attente, -1), -1));
end;
$function$;

COMMIT;
