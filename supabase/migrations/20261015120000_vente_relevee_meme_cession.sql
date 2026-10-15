-- ═══════════════════════════════════════════════════════════════════════════
-- (15/10, lot H) UNE VENTE VINTED DÉJÀ ENREGISTRÉE PAR SA COMMANDE CLÔT LA
-- CARTE « VENDUE » ET PASSE LA FICHE VENDUE
-- ═══════════════════════════════════════════════════════════════════════════
-- L'ops-digest du 14/10 comptait « 3 ventes prouvées sold en arriéré » : des
-- preuves d'AVANT l'armement automatique (08/10 23:40), jamais traitées par
-- choix. Deux d'entre elles (Pedro grays, Pull Lacoste, 02/10 ; Hassan Said,
-- Chaussures Strole, 27/09) avaient DÉJÀ leur vente — enregistrée par la
-- lecture des commandes Vinted (commande_ref, annonce_id = numéro exact de
-- l'annonce) —, mais la fiche était restée « en stock » : pour Vinted,
-- enregistrer_ventes_relevees rattache la vente à la fiche sans jamais passer
-- la fiche à « vendu », et vente_saisie_meme_cession n'acceptait qu'une vente
-- SAISIE (sans commande) sur une fiche déjà « vendue ». Parc (60 jours) : 7
-- fiches dans ce cas, dont 4 avec la preuve « vendu » du dressing (les seules
-- que cette règle touche).
-- Règle (les DEUX preuves ensemble, jamais une seule) :
--   · la carte « Vendue » du job Vinted (sale_signal sold, relevé du dressing,
--     jamais démentie : signal_vente_vu_en_ligne passe d'abord) ;
--   · UNE seule vente sur la fiche, venue de la commande Vinted (commande_ref)
--     sur l'annonce EXACTE du job (annonce_id = platform_listing_id) ;
--   · fiche en stock à UN exemplaire (quantité ≤ 1), jamais fusionnée ;
--   · aucun reçu pour cette annonce.
-- Alors : reçu « même cession », job « sold » (signal_vente_clore_meme_cession,
-- vente déclarée : aucun mail, aucun push), fiche « vendue » (quantité 0). 0
-- vente créée. Les copies prouvées des autres plateformes suivent par le
-- déclencheur existant (inventaire_vendu_retire_ses_copies), comme toute vente.
-- Inchangés : ventes_prouvees_tick, enregistrer_vente_atomique, l'armement du
-- 08/10 (aucune preuve d'avant n'est ENREGISTRÉE seule : ici la vente existe
-- déjà), la nappe de Bilal (aucune vente : décision de Nico).
-- Définition de départ : pg_get_functiondef EN PROD le 15/10 ~12:10.
-- Inverse : supabase/rollbacks/20261015120000_vente_relevee_meme_cession_INVERSE.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.vente_relevee_meme_cession(p_job uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j public.cross_post_jobs%ROWTYPE; i public.inventaire%ROWTYPE; v_n integer; v_id bigint; v_annonce text;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = p_job;
  IF j.id IS NULL OR j.platform IS DISTINCT FROM 'vinted' OR j.inventaire_id IS NULL
     OR coalesce(j.action, 'publish') NOT IN ('publish', 'republish') THEN RETURN NULL; END IF;
  v_annonce := nullif(btrim(j.platform_listing_id), '');
  IF v_annonce IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO i FROM public.inventaire WHERE id = j.inventaire_id AND user_id = j.user_id;
  IF i.id IS NULL OR i.fusionne_dans IS NOT NULL OR i.statut IS DISTINCT FROM 'stock'
     OR coalesce(i.quantite, 1) > 1 THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_n FROM public.ventes v WHERE v.user_id = j.user_id AND v.inventaire_id = i.id;
  IF v_n <> 1 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.ventes_operations o WHERE o.user_id = j.user_id AND o.cle = 'annonce:vinted:' || v_annonce) THEN RETURN NULL; END IF;
  SELECT v.id INTO v_id FROM public.ventes v
   WHERE v.user_id = j.user_id AND v.inventaire_id = i.id
     AND v.commande_ref IS NOT NULL AND btrim(coalesce(v.annonce_id, '')) = v_annonce
     AND (v.plateforme_code IS NULL OR v.plateforme_code = 'vinted')
   LIMIT 1;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.signal_vente_clore_vente_relevee(p_job uuid, p_vente bigint, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j public.cross_post_jobs%ROWTYPE; v_res jsonb; v_fiche boolean := false;
BEGIN
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = p_job;
  IF j.id IS NULL OR p_vente IS NULL OR public.vente_relevee_meme_cession(p_job) IS DISTINCT FROM p_vente THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'Cette vente ne correspond plus à cette annonce.');
  END IF;
  v_res := public.signal_vente_clore_meme_cession(p_job, p_vente, p_par);
  IF v_res ->> 'ok' IS DISTINCT FROM 'true' THEN RETURN v_res; END IF;
  -- Vente déclarée : aucune note, aucun mail, aucun push pour une vente qui
  -- existe déjà ; les copies prouvées suivent par inventaire_vendu_retire_ses_copies.
  PERFORM set_config('fillsell.vente_declaree', '1', true);
  UPDATE public.inventaire SET quantite = 0, statut = 'vendu'
   WHERE id = j.inventaire_id AND user_id = j.user_id AND statut = 'stock' AND coalesce(quantite, 1) <= 1;
  v_fiche := FOUND;
  PERFORM set_config('fillsell.vente_declaree', '', true);
  RETURN v_res || jsonb_build_object('inventaireUpdated', v_fiche, 'vente_relevee', p_vente,
    'reason', 'Cette vente était déjà enregistrée par ta commande Vinted : l’article passe vendu, rien n’est compté deux fois.');
END;
$function$;

REVOKE ALL ON FUNCTION public.vente_relevee_meme_cession(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.signal_vente_clore_vente_relevee(uuid, bigint, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.signaux_vente_reconcilier(p_max integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
DECLARE c record; v_vu timestamptz; v_vente bigint; v_res jsonb; n_dem integer := 0; n_fus integer := 0; n_vus integer := 0;
        n_rel integer := 0; v_ids_rel text[] := ARRAY[]::text[];
        v_ids_dem text[] := ARRAY[]::text[]; v_ids_fus text[] := ARRAY[]::text[];
        v_debut timestamptz := clock_timestamp(); v_budget boolean := false;
BEGIN
  -- Ordre tournant (graine = le créneau de 2 min) : aucune carte n'en affame une
  -- autre quand il y en a plus que le lot ; budget de 1,5 s par passage.
  FOR c IN
    SELECT j.id, j.user_id, j.platform, j.platform_listing_id, j.platform_fields
      FROM public.cross_post_jobs j
     WHERE j.status = 'published' AND (j.platform_fields ->> 'sale_signal') = 'sold'
       AND coalesce(j.action, 'publish') IN ('publish', 'republish')
     ORDER BY hashtextextended(j.id::text, floor(extract(epoch FROM now()) / 120)::bigint)
     LIMIT greatest(1, least(coalesce(p_max, 40), 200))
  LOOP
    IF clock_timestamp() - v_debut > interval '1500 milliseconds' THEN v_budget := true; EXIT; END IF;
    n_vus := n_vus + 1;
    IF c.platform = 'vinted' THEN
      v_vu := public.signal_vente_vu_en_ligne(c.user_id, c.platform_listing_id,
                public._ts_ou_null(c.platform_fields ->> 'unavailable_since'));
      IF v_vu IS NOT NULL THEN
        IF public.signal_vente_lever(c.id, 'signal_dementi_par_releve',
             jsonb_build_object('releve_le', v_vu, 'par', 'signaux_vente_reconcilier')) THEN
          n_dem := n_dem + 1; v_ids_dem := v_ids_dem || left(c.id::text, 8);
        END IF;
        CONTINUE;
      END IF;
    END IF;
    v_vente := public.vente_saisie_meme_cession(c.id);
    IF v_vente IS NOT NULL THEN
      v_res := public.signal_vente_clore_meme_cession(c.id, v_vente, 'signaux_vente_reconcilier');
      IF v_res ->> 'ok' = 'true' THEN n_fus := n_fus + 1; v_ids_fus := v_ids_fus || left(c.id::text, 8); END IF;
    ELSE
      -- (15/10, lot H) La vente déjà ENREGISTRÉE par la commande Vinted, sur
      -- l'annonce exacte, d'une fiche restée en stock : même cession.
      v_vente := public.vente_relevee_meme_cession(c.id);
      IF v_vente IS NOT NULL THEN
        v_res := public.signal_vente_clore_vente_relevee(c.id, v_vente, 'signaux_vente_reconcilier');
        IF v_res ->> 'ok' = 'true' THEN n_rel := n_rel + 1; v_ids_rel := v_ids_rel || left(c.id::text, 8); END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('vus', n_vus, 'dementis', n_dem, 'fusionnes', n_fus, 'releves', n_rel, 'budget_atteint', v_budget)
      || CASE WHEN n_rel > 0 THEN jsonb_build_object('releves_jobs', to_jsonb(v_ids_rel)) ELSE '{}'::jsonb END
      || CASE WHEN n_dem > 0 THEN jsonb_build_object('dementis_jobs', to_jsonb(v_ids_dem)) ELSE '{}'::jsonb END
      || CASE WHEN n_fus > 0 THEN jsonb_build_object('fusionnes_jobs', to_jsonb(v_ids_fus)) ELSE '{}'::jsonb END;
END;
$function$;
