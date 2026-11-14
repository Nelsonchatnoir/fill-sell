CREATE OR REPLACE FUNCTION public.commandes_vinted_noter(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_row    jsonb;
  v_ref    text;
  v_statut text;
  v_paye   boolean;
  v_le     timestamptz;
  v_prix   numeric;
  v_n      integer;
  v_r      jsonb;
  v_job    uuid;
  c_recues integer := 0; c_composees integer := 0; c_annulees integer := 0; c_levees integer := 0;
  c_non_payees integer := 0; c_anciennes integer := 0; c_deja integer := 0; c_eclatees integer := 0; c_doute integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'utilisateur inconnu'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('recues', 0); END IF;
  -- (18/10 soir, Louis — une boutique = un compte) Les commandes lues par un poste ouvert (identité fraîche de
  -- CE poste) sur une boutique Vinted d'un AUTRE compte FillSell ne s'enregistrent pas ici : ni vente, ni mail.
  -- Le compte de cette boutique les lit lui-même. Identité du poste inconnue : comme avant.
  IF public.boutique_vinted_autre_compte(v_user, public.vinted_boutique_du_poste(v_user)) THEN
    RETURN jsonb_build_object('recues', jsonb_array_length(p_rows), 'composees', 0, 'refusees', jsonb_array_length(p_rows),
                              'motif', 'boutique_autre_compte');
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LIMIT 10 LOOP
    c_recues := c_recues + 1;
    v_ref := nullif(btrim(coalesce(v_row ->> 'ref', '')), '');
    IF v_ref IS NULL OR v_ref !~ '^[0-9]{1,24}$' THEN CONTINUE; END IF;
    v_statut := nullif(btrim(coalesce(v_row ->> 'statut', '')), '');
    v_paye := CASE WHEN lower(coalesce(v_row ->> 'paye', '')) IN ('true', 't', '1') THEN true
                   WHEN lower(coalesce(v_row ->> 'paye', '')) IN ('false', 'f', '0') THEN false END;
    v_le := _ts_ou_null(v_row ->> 'date');
    v_prix := CASE WHEN (v_row ->> 'prix') ~ '^[0-9]+([.][0-9]+)?$' THEN (v_row ->> 'prix')::numeric END;
    v_n := vinted_lot_composer(v_user, v_ref, v_row -> 'item_ids', v_statut, v_paye, v_prix,
                               v_row ->> 'devise', v_le, v_row -> 'articles', 'veille');
    IF v_n = 0 THEN CONTINUE; END IF;
    c_composees := c_composees + 1;
    IF vinted_commande_annulee(v_statut) THEN
      c_annulees := c_annulees + 1;
      FOR v_job IN SELECT j.id FROM cross_post_jobs j
                    WHERE j.user_id = v_user AND j.platform = 'vinted' AND j.status = 'published'
                      AND j.platform_fields #>> '{sale_evidence,source}' = 'commande_vinted'
                      AND j.platform_fields #>> '{sale_evidence,commande}' = v_ref LOOP
        IF signal_vente_lever(v_job, 'commande_vinted_annulee', jsonb_build_object('commande', v_ref, 'statut', v_statut)) THEN
          c_levees := c_levees + 1;
        END IF;
      END LOOP;
      UPDATE vinted_commandes_articles x SET decision = 'commande_annulee', decide_le = now(), maj_le = now()
       WHERE x.user_id = v_user AND x.commande_ref = v_ref AND x.vente_id IS NULL
         AND x.decision IS DISTINCT FROM 'commande_annulee';
      CONTINUE;
    END IF;
    IF NOT coalesce(v_paye, false) THEN c_non_payees := c_non_payees + 1; CONTINUE; END IF;
    IF v_le IS NULL OR v_le < now() - interval '48 hours' THEN c_anciennes := c_anciennes + 1; CONTINUE; END IF;
    v_r := vente_vinted_lot_eclater(v_user, v_ref, 'veille');
    IF v_r ->> 'issue' = 'eclatee' THEN c_eclatees := c_eclatees + 1;
    ELSIF v_r ->> 'issue' IN ('deja_eclatee', 'deja_relevee') THEN c_deja := c_deja + 1;
    ELSIF v_r ->> 'issue' = 'en_doute' THEN c_doute := c_doute + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('recues', c_recues, 'composees', c_composees, 'annulees', c_annulees,
    'preuves_levees', c_levees, 'non_payees', c_non_payees, 'anciennes', c_anciennes, 'deja', c_deja,
    'eclatees', c_eclatees, 'en_doute', c_doute);
END;
$function$
