-- ═══════════════════════════════════════════════════════════════════════════
-- LES VENTES PROUVÉES S'ENREGISTRENT DE NOUVEAU SEULES (08/10/2026, audit)
-- ═══════════════════════════════════════════════════════════════════════════
-- NON APPLIQUÉE — feu vert de Nico. Appliquer d'abord 20261008233000 (l'index,
-- CONCURRENTLY, seul), puis celle-ci : `db query --linked -f` puis
-- `migration repair --linked --status applied 20261008233100`.
--
-- LE CONSTAT (audit du 08/10, recontrôlé) : la règle « une vente vue sur
-- l'identifiant exact s'enregistre automatiquement » (GO de Nico, 28/09,
-- `enregistrer_ventes_prouvees`) n'a tourné en prod que de 16:42 à 16:46 le
-- 28/09 : son appel, posé dans get-pending-jobs à CHAQUE poll de CHAQUE
-- extension (59a24fc), a été retiré par précaution pendant l'incident de
-- latence (125599d, docs/INCIDENT_ASTRA_2026-09-28_LATENCE.md : « le lien
-- causal exact n'est PAS démontré » ; les pointes ont continué après le
-- retrait, imputées ensuite au balayage des doublons, cron 17), et rien ne l'a
-- remplacé. Depuis, une vente Vinted vue « sold » attend le clic de la
-- personne : 91 ventes prouvées non enregistrées (24 comptes) le 08/10 au soir,
-- copies laissées en ligne ailleurs.
--
-- CE QUI CHANGE :
--  1. Un appelant BORNÉ, hors de tout poll : le cron SQL `ventes-prouvees-2min`
--     (minutes impaires) appelle `ventes_prouvees_tick()`. SQL pur : pas de
--     pg_net, pas de délai de 5 s, le vrai statut est dans cron.job_run_details.
--     Un verrou (pg_try_advisory_xact_lock) : deux passages simultanés → le
--     second ne fait rien. Au plus 25 annonces et 4 s par passage.
--  2. La sélection (`ventes_prouvees_a_enregistrer`) ne lit QUE les annonces
--     publiées qui portent le signal « sold » (index partiel de 20261008233000 :
--     118 lignes pour tout le parc le 08/10), jamais un compte entier.
--  3. SEULE une preuve « sold » enregistre une vente : le DERNIER relevé du
--     dressing de CETTE annonce Vinted dit « sold » (pris après sa mise en
--     ligne), ou la page de CETTE annonce a été lue « vendue » sur son
--     identifiant exact (sale_evidence, toute plateforme). Jamais
--     « unavailable », jamais une annonce introuvable ou disparue, jamais un
--     signal démenti par le dressing (Louis, 06/10 : 20261008110000 à 112000).
--  4. L'enregistrement passe par `enregistrer_vente_atomique` INCHANGÉE (ses
--     gardes du 08/10 : annonce revue en ligne, remplacée, plusieurs
--     exemplaires, vente déjà liée, reçu `ventes_operations` = idempotence), et
--     donc par la chaîne de retrait EXISTANTE : retraits des copies prouvées
--     dans la même transaction, puis `inventaire_vendu_retire_ses_copies`
--     (retraits + questions « Déjà vendu ? »). Aucun second chemin.
--  5. Seules les preuves arrivées APRÈS l'application comptent
--     (coin_config `ventes_prouvees_auto_depuis`, posé à l'instant de
--     l'application) : l'arriéré (preuves d'avant) n'est JAMAIS traité par le
--     cron — il attend le rattrapage, sur décision de Nico
--     (scripts/reparations/20261008_rattrapage_ventes_prouvees.mjs).
--     Couper : `UPDATE coin_config SET value = 0 WHERE key = 'ventes_prouvees_auto_depuis';`
--     (journalisé ; le cron ne fait plus rien, sans écrire une ligne).
--  6. Un refus d'une garde est mémorisé (`ventes_prouvees_refus`) et réexaminé
--     6 h plus tard (15 min après une erreur) : jamais rejoué à chaque passage,
--     jamais perdu.
--  7. La veille : `ventes_prouvees_veille()` (passages, preuves en retard,
--     arriéré, refus) — lue par l'ops-digest et par veille-cpu, qui prévient
--     support@ si le cron ne tourne plus depuis 10 min ou si une preuve attend
--     depuis plus de 30 min (une alerte par heure au plus).
--
-- MESURE (règle du 04/10) : sélection SANS l'index (borne haute, parc entier,
-- EXPLAIN ANALYZE le 08/10) dans le rapport `docs/enquetes/ventes-prouvees-0810/` ;
-- avec l'index, une lecture de l'index partiel. Écritures : une ligne de
-- passage toutes les 2 min (purge à 14 jours), plus ce qu'écrit une vente.
-- Inverse : supabase/rollbacks/20261008233100_ventes_prouvees_automatiques_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';

-- ── 0. L'armement : les preuves arrivées à partir de MAINTENANT ─────────────
WITH ins AS (
  INSERT INTO public.coin_config (key, value, updated_at)
  VALUES ('ventes_prouvees_auto_depuis', extract(epoch FROM now())::integer, now())
  ON CONFLICT (key) DO NOTHING RETURNING key, value)
INSERT INTO public.coin_config_journal (key, avant, apres, par)
SELECT key, NULL, value, 'migration 20261008233100' FROM ins;

-- ── 1. Tables de travail (service role seulement : RLS sans policy) ────────
CREATE TABLE IF NOT EXISTS public.ventes_prouvees_passages (
  id             bigserial PRIMARY KEY,
  debut          timestamptz NOT NULL DEFAULT now(),
  fin            timestamptz,
  duree_ms       integer,
  issue          text NOT NULL CHECK (issue IN ('fait', 'erreur')),
  candidates     integer NOT NULL DEFAULT 0,
  enregistrees   integer NOT NULL DEFAULT 0,
  refusees       integer NOT NULL DEFAULT 0,
  reportees      integer NOT NULL DEFAULT 0,
  budget_atteint boolean NOT NULL DEFAULT false,
  detail         jsonb
);
CREATE INDEX IF NOT EXISTS ventes_prouvees_passages_debut ON public.ventes_prouvees_passages (debut DESC);
ALTER TABLE public.ventes_prouvees_passages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ventes_prouvees_passages FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.ventes_prouvees_refus (
  job_id          uuid PRIMARY KEY,
  user_id         uuid NOT NULL,
  inventaire_id   bigint,
  preuve_le       timestamptz,
  raison          text NOT NULL,
  essais          integer NOT NULL DEFAULT 1,
  premier_le      timestamptz NOT NULL DEFAULT now(),
  le              timestamptz NOT NULL DEFAULT now(),
  reessayer_apres timestamptz NOT NULL
);
ALTER TABLE public.ventes_prouvees_refus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ventes_prouvees_refus FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.ventes_prouvees_alertes (
  id     bigserial PRIMARY KEY,
  le     timestamptz NOT NULL DEFAULT now(),
  nature text NOT NULL,
  detail jsonb,
  envoi  jsonb
);
ALTER TABLE public.ventes_prouvees_alertes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ventes_prouvees_alertes FROM anon, authenticated;

-- ── 2. La sélection : les annonces « vendues » PROUVÉES, pas encore enregistrées ──
-- p_depuis : seules les preuves arrivées à partir de cet instant ('-infinity' :
-- toutes, pour le rattrapage et la veille) ; p_job : une seule annonce
-- (re-vérification juste avant l'écriture) ; p_ignorer_refus : la veille et la
-- re-vérification voient aussi les annonces dont le refus est mémorisé.
-- Le rattrapage à blanc lit CE texte tel quel (entre les deux marqueurs).
CREATE OR REPLACE FUNCTION public.ventes_prouvees_a_enregistrer(
  p_depuis timestamptz, p_limite integer DEFAULT 25, p_user uuid DEFAULT NULL,
  p_job uuid DEFAULT NULL, p_ignorer_refus boolean DEFAULT false)
 RETURNS TABLE(job_id uuid, user_id uuid, inventaire_id bigint, platform text, listing_id text,
               preuve text, preuve_le timestamptz, prix numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $candidates$
  SELECT c.id, c.user_id, c.inventaire_id, c.platform, btrim(c.platform_listing_id), p.preuve, p.preuve_le,
         coalesce(CASE WHEN c.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                       THEN (c.platform_fields ->> 'detected_price')::numeric END, c.price)
    FROM cross_post_jobs c
    JOIN inventaire i ON i.id = c.inventaire_id AND i.user_id = c.user_id
    CROSS JOIN LATERAL (
      SELECT x.preuve, x.preuve_le FROM (
        -- Vinted : le DERNIER relevé du dressing de CETTE annonce dit « sold »,
        -- et il a été pris après sa mise en ligne. L'instant de la preuve : le
        -- premier relevé « sold » de cette annonce après sa mise en ligne.
        SELECT 'releve_vinted_sold'::text AS preuve,
               (SELECT min(s2.captured_at) FROM vinted_listing_snapshots s2
                 WHERE s2.user_id = c.user_id AND s2.vinted_item_id = btrim(c.platform_listing_id)
                   AND s2.status = 'sold' AND s2.captured_at >= coalesce(c.published_at, c.created_at)) AS preuve_le
         WHERE c.platform = 'vinted'
           AND (SELECT s.status = 'sold' AND s.captured_at >= coalesce(c.published_at, c.created_at)
                  FROM vinted_listing_snapshots s
                 WHERE s.user_id = c.user_id AND s.vinted_item_id = btrim(c.platform_listing_id)
                 ORDER BY s.captured_at DESC LIMIT 1)
        UNION ALL
        -- Toute plateforme : la page de CETTE annonce lue « vendue », identifiant exact.
        SELECT 'page_annonce_sold'::text,
               coalesce(_ts_ou_null(c.platform_fields #>> '{sale_evidence,observed_at}'),
                        _ts_ou_null(c.platform_fields #>> '{sale_evidence,lu_le}'),
                        _ts_ou_null(c.platform_fields ->> 'unavailable_since'), c.last_checked_at)
         WHERE c.platform_fields #>> '{sale_evidence,listing_id}' = btrim(c.platform_listing_id)
           AND c.platform_fields #>> '{sale_evidence,platform}' = c.platform
           AND c.platform_fields #>> '{sale_evidence,state}' = 'sold'
           AND c.platform_fields #>> '{sale_evidence,exact}' = 'true'
      ) x
      WHERE x.preuve_le IS NOT NULL
      ORDER BY x.preuve_le
      LIMIT 1
    ) p
   WHERE c.status = 'published' AND (c.platform_fields ->> 'sale_signal') = 'sold'   -- l'index partiel
     AND c.action IN ('publish', 'republish')
     AND (p_user IS NULL OR c.user_id = p_user)
     AND (p_job IS NULL OR c.id = p_job)
     AND nullif(btrim(c.platform_listing_id), '') IS NOT NULL
     AND i.statut = 'stock' AND coalesce(i.quantite, 1) > 0 AND i.fusionne_dans IS NULL
     AND p.preuve_le >= p_depuis
     AND NOT EXISTS (SELECT 1 FROM ventes_operations o
                      WHERE o.user_id = c.user_id AND o.cle = 'annonce:' || c.platform || ':' || btrim(c.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM ventes_operations o
                      WHERE o.user_id = c.user_id AND o.cle = c.platform_fields ->> 'vente_operation_cle')
     /*refus*/AND (p_ignorer_refus OR NOT EXISTS (SELECT 1 FROM ventes_prouvees_refus r
                                                 WHERE r.job_id = c.id AND r.reessayer_apres > now()))/*fin refus*/
   ORDER BY p.preuve_le, c.id
   LIMIT greatest(1, least(coalesce(p_limite, 25), 1000));
$candidates$;
REVOKE ALL ON FUNCTION public.ventes_prouvees_a_enregistrer(timestamptz, integer, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ventes_prouvees_a_enregistrer(timestamptz, integer, uuid, uuid, boolean) TO service_role;

-- ── 3. Une annonce : re-vérifier la preuve, puis la vente atomique ─────────
CREATE OR REPLACE FUNCTION public.enregistrer_vente_prouvee(p_job uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c record;
  r jsonb;
BEGIN
  -- La preuve est relue au moment d'écrire (un relevé a pu la démentir).
  SELECT x.* INTO c FROM ventes_prouvees_a_enregistrer('-infinity'::timestamptz, 1, NULL, p_job, true) x;
  IF c.job_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'issue', 'plus_a_enregistrer', 'job', p_job);
  END IF;
  -- Un relevé encore en cours peut écrire l'inventaire : la vente attend sa fin.
  IF EXISTS (SELECT 1 FROM vinted_sync_runs WHERE user_id = c.user_id AND status = 'running' LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'issue', 'releve_en_cours', 'job', p_job);
  END IF;
  BEGIN
    r := enregistrer_vente_atomique(c.user_id, NULL, p_job := c.job_id, p_prix := c.prix);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ventes_prouvees_refus AS f (job_id, user_id, inventaire_id, preuve_le, raison, reessayer_apres)
    VALUES (c.job_id, c.user_id, c.inventaire_id, c.preuve_le, left('erreur : ' || SQLERRM, 300), now() + interval '15 minutes')
    ON CONFLICT (job_id) DO UPDATE SET raison = excluded.raison, essais = f.essais + 1, le = now(),
      reessayer_apres = excluded.reessayer_apres, preuve_le = excluded.preuve_le;
    RETURN jsonb_build_object('ok', false, 'issue', 'erreur', 'job', p_job, 'reason', left(SQLERRM, 300));
  END;
  IF coalesce(r ->> 'ok', 'false') = 'true' THEN
    DELETE FROM ventes_prouvees_refus WHERE job_id = c.job_id;
    RETURN r || jsonb_build_object('issue', CASE WHEN coalesce(r ->> 'rejouee', 'false') = 'true' THEN 'rejouee' ELSE 'enregistree' END,
                                   'job', p_job, 'preuve', c.preuve, 'preuve_le', c.preuve_le);
  END IF;
  -- Une garde a refusé (annonce revue en ligne, plusieurs exemplaires, vente
  -- déjà liée…) : mémorisé, réexaminé dans 6 h — la fiche peut changer.
  INSERT INTO ventes_prouvees_refus AS f (job_id, user_id, inventaire_id, preuve_le, raison, reessayer_apres)
  VALUES (c.job_id, c.user_id, c.inventaire_id, c.preuve_le, left(coalesce(r ->> 'reason', 'refusée'), 300), now() + interval '6 hours')
  ON CONFLICT (job_id) DO UPDATE SET raison = excluded.raison, essais = f.essais + 1, le = now(),
    reessayer_apres = excluded.reessayer_apres, preuve_le = excluded.preuve_le;
  RETURN r || jsonb_build_object('issue', 'refusee', 'job', p_job);
END;
$function$;
REVOKE ALL ON FUNCTION public.enregistrer_vente_prouvee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_vente_prouvee(uuid) TO service_role;

-- ── 4. Le passage du cron : borné, verrouillé, tracé ───────────────────────
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
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, budget_atteint, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'fait',
          n_cand, n_ok, n_ref, n_rep, v_hors_budget, CASE WHEN n_cand > 0 THEN v_detail END);
  DELETE FROM ventes_prouvees_passages
   WHERE id IN (SELECT id FROM ventes_prouvees_passages WHERE debut < now() - interval '14 days' ORDER BY id LIMIT 500);
  RETURN jsonb_build_object('issue', 'fait', 'candidates', n_cand, 'enregistrees', n_ok, 'refusees', n_ref,
                            'reportees', n_rep, 'budget_atteint', v_hors_budget,
                            'duree_ms', (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer);
EXCEPTION WHEN OTHERS THEN
  -- Jamais un échec muet : le passage raté est tracé (la veille le voit).
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'erreur',
          n_cand, 0, 0, 0, jsonb_build_object('erreur', left(SQLERRM, 300)));
  RETURN jsonb_build_object('issue', 'erreur', 'erreur', left(SQLERRM, 300));
END;
$function$;
REVOKE ALL ON FUNCTION public.ventes_prouvees_tick(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ventes_prouvees_tick(integer, integer) TO service_role;

-- ── 5. La veille : ce qui attend, ce qui a tourné ──────────────────────────
-- Lue par l'ops-digest (quotidien) et par veille-cpu (toutes les 2 min, alerte).
CREATE OR REPLACE FUNCTION public.ventes_prouvees_veille(p_retard_min integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH cfg AS (
    SELECT coalesce((SELECT value FROM coin_config WHERE key = 'ventes_prouvees_auto_depuis'), 0) AS epoch
  ), toutes AS (
    SELECT a.*, (r.job_id IS NOT NULL) AS refus_actif
      FROM ventes_prouvees_a_enregistrer('-infinity'::timestamptz, 1000, NULL, NULL, true) a
      LEFT JOIN ventes_prouvees_refus r ON r.job_id = a.job_id AND r.reessayer_apres > now()
  ), classees AS (
    SELECT t.*,
           (cfg.epoch > 0 AND t.preuve_le >= to_timestamp(cfg.epoch)) AS depuis_armement,
           EXISTS (SELECT 1 FROM cross_post_jobs o
                    WHERE o.inventaire_id = t.inventaire_id AND o.user_id = t.user_id AND o.platform <> t.platform
                      AND o.action IN ('publish', 'republish') AND o.status = 'published'
                      AND o.vu_en_ligne_le > now() - interval '3 days') AS copie_vue_3j
      FROM toutes t CROSS JOIN cfg
  ), dernier AS (
    SELECT * FROM ventes_prouvees_passages ORDER BY debut DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'arme', (SELECT epoch > 0 FROM cfg),
    'depuis', (SELECT CASE WHEN epoch > 0 THEN to_timestamp(epoch) END FROM cfg),
    'dernier_passage', (SELECT jsonb_build_object('debut', debut, 'issue', issue, 'duree_ms', duree_ms,
                          'candidates', candidates, 'enregistrees', enregistrees, 'refusees', refusees) FROM dernier),
    'minutes_depuis_dernier_passage', (SELECT round(extract(epoch FROM now() - debut) / 60.0)::integer FROM dernier),
    'passages_24h', (SELECT count(*) FROM ventes_prouvees_passages WHERE debut > now() - interval '24 hours'),
    'passages_en_erreur_24h', (SELECT count(*) FROM ventes_prouvees_passages WHERE debut > now() - interval '24 hours' AND issue = 'erreur'),
    'enregistrees_24h', (SELECT coalesce(sum(enregistrees), 0) FROM ventes_prouvees_passages WHERE debut > now() - interval '24 hours'),
    'en_retard', (SELECT count(*) FROM classees WHERE depuis_armement AND NOT refus_actif
                    AND preuve_le < now() - make_interval(mins => greatest(5, coalesce(p_retard_min, 30)))),
    'en_retard_comptes', (SELECT count(DISTINCT user_id) FROM classees WHERE depuis_armement AND NOT refus_actif
                    AND preuve_le < now() - make_interval(mins => greatest(5, coalesce(p_retard_min, 30)))),
    'en_retard_plus_ancien', (SELECT min(preuve_le) FROM classees WHERE depuis_armement AND NOT refus_actif),
    'anterieures', (SELECT count(*) FROM classees WHERE NOT depuis_armement),
    'anterieures_comptes', (SELECT count(DISTINCT user_id) FROM classees WHERE NOT depuis_armement),
    'avec_copie_vue_3j', (SELECT count(*) FROM classees WHERE copie_vue_3j),
    'refus_actifs', (SELECT count(*) FROM ventes_prouvees_refus WHERE reessayer_apres > now()),
    'refus_par_raison', (SELECT coalesce(jsonb_object_agg(raison, n), '{}'::jsonb) FROM (
        SELECT left(raison, 90) AS raison, count(*) AS n FROM ventes_prouvees_refus
         WHERE reessayer_apres > now() GROUP BY 1 ORDER BY 2 DESC LIMIT 5) z)
  );
$function$;
REVOKE ALL ON FUNCTION public.ventes_prouvees_veille(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ventes_prouvees_veille(integer) TO service_role;

-- ── 6. Le cron : SQL pur, minutes impaires (loin des */2 et */3 des autres) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ventes-prouvees-2min') THEN
    PERFORM cron.schedule('ventes-prouvees-2min', '1-59/2 * * * *', $cmd$SELECT public.ventes_prouvees_tick();$cmd$);
  END IF;
END $$;

COMMIT;
