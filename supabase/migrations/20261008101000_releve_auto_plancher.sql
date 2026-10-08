-- ════════════════════════════════════════════════════════════════════════════
-- LE VEILLEUR NE REDEMANDE PAS UN RELEVÉ QUI NE PEUT RIEN APPRENDRE (08/10/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Version RÉVISÉE (feu vert de Nico pour une règle qui vise la cause, pas pour
-- un plancher aveugle de 6 h : le veilleur ne doit jamais retarder ce qui
-- mène à une vente). Le nom du fichier est resté celui de la première version,
-- jamais appliquée.
--
-- LES RAFALES (7 jours) : 438 relevés « veilleur », dont 44310spgl (Opla) 166
-- et choupette06 (Beebs) 14 dans la nuit du 07/10. À chaque ronde, UNE annonce
-- lue « indisponible » demande un relevé complet de « Mes annonces »
-- (extension, demanderRelevePourRattachement), sans regarder si un relevé a
-- déjà répondu. Deux causes :
--   · Opla (44310spgl) : le relevé de l'extension écrit « en ligne » une
--     annonce que la personne a DÉPUBLIÉE (status « draft ») — l'oracle public
--     dit « draft », le veilleur lit donc « indisponible », à juste titre. Le
--     relevé dément l'alerte, la lecture suivante la repose : sans fin (112
--     alertes Opla démenties par un relevé, 1 sur Leboncoin, 0 ailleurs).
--   · Beebs (choupette06) : 9 annonces vraiment disparues depuis le 27/09. Une
--     absence n'est JAMAIS conclue sur Beebs (constater_absences_releve) : les
--     relevés ne pouvaient rien apprendre.
--
-- CE QU'UN RELEVÉ DU VEILLEUR APPORTE À UNE VENTE : rien d'autre que le
-- CONSTAT D'ABSENCE (deux relevés complets → question « Vendue ? ») ;
-- l'enregistrement automatique d'une vente exige une preuve positive lue sur
-- la page (enregistrer_ventes_prouvees, sale_evidence), l'API eBay ou une
-- commande — et il ATTEND qu'aucun relevé ne tourne sur le compte. Une
-- annonce relevée « vendue » ne crée qu'une notification.
--
-- LA RÈGLE (veilleur seulement, relevés « annonces ») : on regarde les
-- annonces suivies lues « indisponibles » depuis le début du dernier relevé
-- COMPLET (releve_preuve_absence) de la plateforme :
--   · vue EN LIGNE par ce relevé :
--       - déjà démentie une fois (revue_en_ligne_par_releve) et toujours vue en
--         ligne → rien (fausse alerte connue, annonce inchangée) ;
--       - sinon → le relevé PART tout de suite (disparition nouvelle) ;
--   · vue par ce relevé sous un autre statut (désactivée, vendue, inconnu) →
--     rien : son état est déjà connu ;
--   · ABSENTE de ce relevé :
--       - Beebs → rien (une absence n'y conclut jamais rien) ;
--       - absence déjà constatée (disparu_le) → rien ;
--       - sinon → le relevé PART tout de suite (il constate l'absence et ouvre
--         la question « Vendue ? »).
--   Aucun relevé complet, ou aucune annonce suivie à l'origine de la demande →
--   le relevé part (jamais un refus à l'aveugle). AUCUN PLANCHER DE TEMPS.
-- Refus silencieux (RETURN NULL) compté dans releves_auto_refuses (motif) :
-- l'extension crée le run AVANT de lire la plateforme, un refus ne coûte
-- aucune requête chez elle — sans nouveau zip.
--
-- REJEU (7 jours, sur ce que chaque relevé a réellement apporté) : 438 → 144 ;
-- 44310spgl Opla 166 → 50 (dont 45 « absente » du 02 au 04/10, sans accès à
-- Opla, et 5 constats d'absence) ; choupette06 Beebs 14 → 0. Les 113 relevés
-- du veilleur qui ont constaté une absence sont tous gardés : aucune question
-- « Vendue ? » plus tardive, aucune vente enregistrée plus tard (36 ventes
-- hors Vinted de la période, vérifiées une à une).
-- Mesure : une lecture des jobs signalés du compte sur la plateforme (index
-- user_id) et de leurs annonces, par demande du veilleur.
-- Inverse : supabase/rollbacks/20261008101000_releve_auto_plancher_INVERSE.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.releves_auto_refuses (
  user_id           uuid NOT NULL,
  platform          text NOT NULL,
  declencheur       text NOT NULL,
  motif             text NOT NULL DEFAULT 'deja_verifie',
  jour              date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Paris')::date),
  n                 integer NOT NULL DEFAULT 0,
  premier_le        timestamptz NOT NULL DEFAULT now(),
  dernier_le        timestamptz NOT NULL DEFAULT now(),
  dernier_releve_le timestamptz,
  exemple           jsonb,
  PRIMARY KEY (user_id, platform, declencheur, motif, jour)
);
COMMENT ON TABLE public.releves_auto_refuses IS
  'Relevés du veilleur refusés par garde_releve_veilleur_cause : chaque annonce à l''origine de la demande est déjà vérifiée par le dernier relevé complet (fausse alerte connue, état connu, absence Beebs ou déjà constatée). Une ligne par compte, plateforme, motif et jour (08/10).';
ALTER TABLE public.releves_auto_refuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.releves_auto_refuses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.releves_auto_refuses TO service_role;

-- La décision, lisible seule (rejeu, ops) : jamais d'écriture.
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
REVOKE ALL ON FUNCTION public.releve_veilleur_decision(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.releve_veilleur_decision(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.garde_releve_veilleur_cause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d jsonb;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'annonces'
     OR COALESCE(NEW.declencheur, '') <> 'veilleur'
     OR NEW.status NOT IN ('queued', 'running') THEN
    RETURN NEW;
  END IF;
  BEGIN
    d := releve_veilleur_decision(NEW.user_id, NEW.platform);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'garde_releve_veilleur_cause (%/%) : % — relevé laissé partir', NEW.user_id, NEW.platform, SQLERRM;
    RETURN NEW;
  END;
  IF COALESCE((d ->> 'part')::boolean, true) THEN RETURN NEW; END IF;
  INSERT INTO releves_auto_refuses AS x (user_id, platform, declencheur, motif, n, dernier_releve_le, exemple)
  VALUES (NEW.user_id, NEW.platform, NEW.declencheur, COALESCE(d ->> 'motif', 'deja_verifie'), 1,
          NULLIF(d ->> 'dernier_releve_le', '')::timestamptz, d)
  ON CONFLICT (user_id, platform, declencheur, motif, jour) DO UPDATE
     SET n = x.n + 1, dernier_le = now(), dernier_releve_le = EXCLUDED.dernier_releve_le, exemple = EXCLUDED.exemple;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.garde_releve_veilleur_cause() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS garde_releve_veilleur_cause ON public.vinted_sync_runs;
CREATE TRIGGER garde_releve_veilleur_cause
  BEFORE INSERT ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_releve_veilleur_cause();

COMMIT;
