-- Inverse de 20261024130000_beebs_commande_ref_courte : le corps relu en prod le 23/10 à 22:19, tel quel
-- (md5 c56da0af221148679fd559f95ac28041). Les droits ne changent pas.
BEGIN;
CREATE OR REPLACE FUNCTION public.commandes_beebs_noter(p_rows jsonb, p_user uuid DEFAULT NULL::uuid, p_lecture jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_user uuid;
  v_ecrit boolean;
  v_row jsonb;
  v_ref text;
  v_statut text;
  v_classe text;
  v_date timestamptz;
  v_produits jsonb;
  v_id text;
  v_jobs uuid[];
  v_job uuid;
  v_pf jsonb;
  v_stock boolean;
  v_lecture jsonb := '{}'::jsonb;
  v_bilan jsonb;
  c_recues int := 0; c_prouvees int := 0; c_deja int := 0; c_doute int := 0; c_sans_job int := 0;
  c_forme int := 0; c_annulees int := 0; c_levees int := 0; c_annulee_apres int := 0; c_inconnu int := 0;
  c_fiche_vendue int := 0; c_produits int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user IS NOT NULL AND p_user <> auth.uid() THEN
    RAISE EXCEPTION 'utilisateur non autorisé';
  END IF;
  v_user := coalesce(auth.uid(), p_user);
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  -- Fail-closed : interrupteur absent ou illisible = fantôme (rien écrit sur les jobs).
  v_ecrit := coalesce((SELECT c.value FROM coin_config c WHERE c.key = 'ventes_beebs_commandes'), 0) = 1;

  IF jsonb_typeof(p_lecture) = 'object' THEN
    SELECT coalesce(jsonb_object_agg(k, (p_lecture ->> k)::int), '{}'::jsonb) INTO v_lecture
      FROM unnest(ARRAY['liens', 'illisibles', 'requetes']) k
     WHERE coalesce(p_lecture ->> k, '') ~ '^[0-9]{1,6}$';
  END IF;

  IF jsonb_typeof(p_rows) = 'array' THEN
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LIMIT 10 LOOP
      c_recues := c_recues + 1;
      IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN c_forme := c_forme + 1; CONTINUE; END IF;
      v_ref := btrim(coalesce(v_row ->> 'ref', ''));
      IF v_ref !~ '^[A-Za-z0-9_-]{6,80}$' THEN c_forme := c_forme + 1; CONTINUE; END IF;
      v_statut := left(btrim(coalesce(v_row ->> 'statut', v_row ->> 'etat_plateforme', '')), 60);
      v_classe := public.beebs_commande_classe(v_statut);
      v_date := coalesce(_ts_ou_null(v_row ->> 'date'), _ts_ou_null(v_row ->> 'vendue_le'));
      v_produits := CASE WHEN jsonb_typeof(v_row -> 'produits') = 'array' THEN v_row -> 'produits'
                         WHEN nullif(btrim(coalesce(v_row ->> 'annonce_ref', '')), '') IS NOT NULL
                           THEN jsonb_build_array(v_row ->> 'annonce_ref')
                         ELSE '[]'::jsonb END;

      IF v_classe = 'annulee' THEN
        c_annulees := c_annulees + 1;
        -- La preuve posée par CETTE source pour CETTE commande est levée (job encore publié).
        FOR v_job IN SELECT j.id FROM cross_post_jobs j
                      WHERE j.user_id = v_user AND j.platform = 'beebs' AND j.status = 'published'
                        AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_beebs'
                        AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref LOOP
          IF NOT v_ecrit THEN c_levees := c_levees + 1;
          ELSIF signal_vente_lever(v_job, 'commande_beebs_annulee', jsonb_build_object('commande', v_ref, 'statut', v_statut)) THEN
            c_levees := c_levees + 1;
          END IF;
        END LOOP;
        -- Déjà enregistrée comme vente : rien n'est défait ici (comptée, à décider).
        c_annulee_apres := c_annulee_apres + (SELECT count(*) FROM cross_post_jobs j
          WHERE j.user_id = v_user AND j.platform = 'beebs' AND j.status = 'sold'
            AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_beebs'
            AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref)::int;
        CONTINUE;
      END IF;
      IF v_classe <> 'vente' THEN c_inconnu := c_inconnu + 1; CONTINUE; END IF;

      FOR v_id IN SELECT btrim(x) FROM jsonb_array_elements_text(v_produits) x LIMIT 10 LOOP
        c_produits := c_produits + 1;
        IF v_id !~ '^[0-9]{6,}$' THEN c_forme := c_forme + 1; CONTINUE; END IF;
        -- Le job de CE compte qui porte CE numéro, exactement — jamais un titre.
        SELECT array_agg(j.id) INTO v_jobs FROM cross_post_jobs j
         WHERE j.user_id = v_user AND j.platform = 'beebs' AND j.status = 'published'
           AND coalesce(j.action, 'publish') IN ('publish', 'republish')
           AND btrim(coalesce(j.platform_listing_id, '')) = v_id;
        IF coalesce(array_length(v_jobs, 1), 0) = 0 THEN
          -- Déjà vendue par un autre chemin (job « sold » au même numéro) : rien à faire.
          IF EXISTS (SELECT 1 FROM cross_post_jobs j WHERE j.user_id = v_user AND j.platform = 'beebs'
                      AND j.status = 'sold' AND btrim(coalesce(j.platform_listing_id, '')) = v_id) THEN
            c_deja := c_deja + 1;
          ELSE
            c_sans_job := c_sans_job + 1;
          END IF;
          CONTINUE;
        END IF;
        IF array_length(v_jobs, 1) > 1 THEN c_doute := c_doute + 1; CONTINUE; END IF;
        v_job := v_jobs[1];
        SELECT j.platform_fields, (i.id IS NOT NULL AND i.statut = 'stock' AND i.fusionne_dans IS NULL)
          INTO v_pf, v_stock
          FROM cross_post_jobs j LEFT JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id
         WHERE j.id = v_job;
        IF coalesce(v_pf ->> 'sale_signal', '') = 'sold' AND v_pf #>> '{sale_evidence,listing_id}' = v_id
           AND v_pf #>> '{sale_evidence,platform}' = 'beebs' THEN
          c_deja := c_deja + 1; CONTINUE;                         -- preuve déjà là : aucune réécriture
        END IF;
        IF NOT coalesce(v_stock, false) THEN c_fiche_vendue := c_fiche_vendue + 1; CONTINUE; END IF;
        c_prouvees := c_prouvees + 1;
        IF v_ecrit THEN
          UPDATE cross_post_jobs c
             SET platform_fields = coalesce(c.platform_fields, '{}'::jsonb) || jsonb_build_object(
                   'sale_signal', 'sold',
                   -- La date de la COMMANDE : une vente ancienne n'envoie jamais de mail (push_trg_job, 24 h).
                   'unavailable_since', coalesce(c.platform_fields ->> 'unavailable_since',
                                                 to_char(coalesce(v_date, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
                   'sale_evidence', jsonb_build_object('platform', 'beebs', 'listing_id', v_id, 'state', 'sold', 'exact', true,
                     'source', 'commande_beebs', 'commande', v_ref, 'statut', v_statut, 'lu_le', now(), 'par', 'page_ventes_beebs'))
           WHERE c.id = v_job AND c.status = 'published';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  v_bilan := jsonb_build_object('mode', CASE WHEN v_ecrit THEN 'ecrit' ELSE 'fantome' END,
    'recues', c_recues, 'produits', c_produits, 'prouvees_ou_auraient', c_prouvees, 'deja', c_deja, 'doute', c_doute,
    'sans_job', c_sans_job, 'fiche_deja_vendue', c_fiche_vendue, 'forme_inconnue', c_forme, 'statut_inconnu', c_inconnu,
    'annulees', c_annulees, 'preuves_levees', c_levees, 'annulee_apres_vente', c_annulee_apres) || v_lecture;
  IF c_recues > 0 OR NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v_user AND u.feature = 'ventes_beebs_commandes'
                                    AND u.created_at > now() - interval '6 hours') THEN
    INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v_user, 'ventes_beebs_commandes', v_bilan);
  END IF;
  RETURN v_bilan;
END;
$function$;
REVOKE ALL ON FUNCTION public.commandes_beebs_noter(jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commandes_beebs_noter(jsonb, uuid, jsonb) TO authenticated, service_role;
COMMIT;
