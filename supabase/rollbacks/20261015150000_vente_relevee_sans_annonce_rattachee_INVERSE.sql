-- INVERSE de 20261015150000_vente_relevee_sans_annonce_rattachee.sql : ventes_prouvees_tick tel qu'EN PROD le 15/10 ~17:00
-- (pg_get_functiondef), puis retrait des deux fonctions ajoutées. Les rattachements déjà faits restent (une vente
-- rattachée par la règle se lit dans usage_logs feature = 'vente_relevee_rattachee' ; la défaire = remettre
-- inventaire_id / annonce_id à NULL sur la vente, la fiche et le job : jamais en masse, une par une).

CREATE OR REPLACE FUNCTION public.ventes_prouvees_tick(p_max integer DEFAULT 25, p_budget_ms integer DEFAULT 4000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_debut   timestamptz := clock_timestamp();
  v_epoch   integer;
  v_depuis  timestamptz;
  v_max     integer := greatest(1, least(coalesce(p_max, 25), 100));
  v_budget  interval := make_interval(secs => greatest(500, least(coalesce(p_budget_ms, 4000), 15000)) / 1000.0);
  c         record;
  r         jsonb;
  v_issue   text;
  n_cand    integer := 0;
  n_ok      integer := 0;
  n_ref     integer := 0;
  n_rep     integer := 0;
  v_hors_budget boolean := false;
  v_detail  jsonb := '[]'::jsonb;
  v_reco    jsonb := NULL;
BEGIN
  SELECT value INTO v_epoch FROM coin_config WHERE key = 'ventes_prouvees_auto_depuis';
  IF coalesce(v_epoch, 0) <= 0 THEN
    RETURN jsonb_build_object('issue', 'coupe');            -- coupé : rien lu, rien écrit
  END IF;
  -- Deux passages simultanés (cron + rattrapage, ou un cron en retard) : le
  -- second ne fait rien. Le verrou tombe avec la transaction.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('ventes_prouvees_tick', 0)) THEN
    RETURN jsonb_build_object('issue', 'deja_en_cours');
  END IF;
  v_depuis := to_timestamp(v_epoch);
  FOR c IN SELECT * FROM ventes_prouvees_a_enregistrer(v_depuis, v_max) LOOP
    n_cand := n_cand + 1;
    IF clock_timestamp() - v_debut > v_budget THEN
      v_hors_budget := true; n_rep := n_rep + 1;               -- au passage suivant
      CONTINUE;
    END IF;
    r := enregistrer_vente_prouvee(c.job_id);
    v_issue := r ->> 'issue';
    IF v_issue = 'enregistree' THEN n_ok := n_ok + 1;
    ELSIF v_issue IN ('refusee', 'erreur') THEN n_ref := n_ref + 1;
    ELSE n_rep := n_rep + 1;
    END IF;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'job', c.job_id, 'user', left(c.user_id::text, 8), 'inv', c.inventaire_id, 'pf', c.platform,
      'preuve', c.preuve, 'preuve_le', c.preuve_le, 'issue', v_issue, 'raison', r ->> 'reason',
      'ventes', r -> 'ventes_ids', 'retraits', r -> 'retraitsArmes'));
  END LOOP;
  -- (15/10) Les cartes « Vendue » qui ne peuvent plus aboutir se règlent seules :
  -- signal démenti par le relevé, ou même cession qu'une vente saisie. Isolé :
  -- un échec ici ne coûte jamais le passage des ventes prouvées.
  BEGIN
    v_reco := public.signaux_vente_reconcilier(40);
  EXCEPTION WHEN OTHERS THEN
    v_reco := jsonb_build_object('erreur', left(SQLERRM, 200));
  END;
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, budget_atteint, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'fait',
          n_cand, n_ok, n_ref, n_rep, v_hors_budget,
          CASE WHEN n_cand > 0 OR coalesce((v_reco ->> 'dementis')::int, 0) + coalesce((v_reco ->> 'fusionnes')::int, 0) > 0 OR v_reco ? 'erreur'
               THEN v_detail || CASE WHEN v_reco IS NOT NULL THEN jsonb_build_array(jsonb_build_object('reconciliation', v_reco)) ELSE '[]'::jsonb END END);
  DELETE FROM ventes_prouvees_passages
   WHERE id IN (SELECT id FROM ventes_prouvees_passages WHERE debut < now() - interval '14 days' ORDER BY id LIMIT 500);
  RETURN jsonb_build_object('issue', 'fait', 'candidates', n_cand, 'enregistrees', n_ok, 'refusees', n_ref,
                            'reportees', n_rep, 'budget_atteint', v_hors_budget, 'reconciliation', v_reco,
                            'duree_ms', (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer);
EXCEPTION WHEN OTHERS THEN
  -- Jamais un échec muet : le passage raté est tracé (la veille le voit).
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'erreur',
          n_cand, 0, 0, 0, jsonb_build_object('erreur', left(SQLERRM, 300)));
  RETURN jsonb_build_object('issue', 'erreur', 'erreur', left(SQLERRM, 300));
END;
$function$
;

REVOKE ALL ON FUNCTION public.ventes_prouvees_tick(integer, integer) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.ventes_relevees_sans_annonce_rattacher(integer, integer, uuid);
DROP FUNCTION IF EXISTS public.ventes_relevees_sans_annonce_candidats(uuid);
