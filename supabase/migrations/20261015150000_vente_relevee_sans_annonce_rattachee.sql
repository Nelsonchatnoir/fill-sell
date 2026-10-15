-- ═══════════════════════════════════════════════════════════════════════════
-- (15/10 fin d'après-midi, point 6 — Bilal) UNE VENTE RELEVÉE PAR LES
-- COMMANDES VINTED SANS NUMÉRO D'ANNONCE SE RATTACHE À SA FICHE QUAND LA
-- PREUVE EST UNIQUE DES DEUX CÔTÉS
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas (FAIT PROUVÉ) : nappe rose de Bilal (fiche 1790523715035002), vendue sur
-- Vinted le 27/09 17:46. La lecture des commandes a écrit la vente 95888
-- (commande 22659388975, 8 €) SANS numéro d'annonce → aucune fiche (le titre
-- n'est jamais une preuve). Le job Vinted de l'annonce 10152700586 portait la
-- carte « Vendue » (relevé du dressing « sold » depuis le 04/10), mais la preuve
-- est antérieure à l'armement des ventes prouvées automatiques (08/10 23:40) :
-- ventes_prouvees_tick ne la prendra jamais, la carte attendait un clic qui n'est
-- jamais venu, la fiche est restée « en stock » et ses copies Beebs, eBay et
-- Leboncoin en ligne trois semaines (réparé à la main le 15/10 ~16:44).
-- Règle (jamais le titre ; les deux côtés uniques, sinon rien) :
--   · côté ANNONCE : job Vinted 'published', carte « Vendue » ouverte
--     (sale_signal sold, jamais contestée par la personne, aucun reçu), fiche
--     en stock à UN exemplaire, sans aucune vente ; sa FENÊTRE = de la dernière
--     vue « active » (relevé du dressing, vu_en_ligne_le, mise en ligne) à la
--     première vue « indisponible » (unavailable_since, relevé sold/reserved/
--     hidden/draft) ; jamais revue en ligne après ;
--   · côté VENTE : vente Vinted du relevé des commandes, commande connue, SANS
--     annonce NI fiche, non annulée, pas un lot (« Lot N articles », libellé de
--     Vinted : veto, jamais une preuve), MÊME PRIX que l'annonce (celui de sa
--     dernière vue « active », sinon detected_price comme
--     ventes_prouvees_a_enregistrer), vendue DANS la fenêtre ;
--   · UNIQUE : une seule vente Vinted du compte à ce prix dans la fenêtre (toutes
--     sources), et aucune autre annonce Vinted du compte, à ce prix OU PLUS (une
--     offre acceptée baisse le prix), qui aurait pu être vendue à cet instant
--     (relevés du dressing : pas vendue avant, pas revue en ligne après, vendue
--     ensuite, et déjà créée : numéro sous celui des annonces que FillSell a
--     créées après la vente — Vinted numérote dans l'ordre de création ; jobs
--     sans relevé : en ligne avant, indisponible après). ⛔ Jamais la date de la
--     photo (listed_at_guess) : elle change quand la personne retouche ses photos
--     (Bilal : annonce vue le 25/09, photo du 03/10).
-- Rejeu sur l'historique (ventes dont le numéro d'annonce est CONNU, traitées
-- comme si elles ne l'avaient pas) : avec « même prix » seul pour les
-- concurrentes, 2 rattachements FAUX sur 12 (deux offres acceptées : 2,50 → 2 €,
-- 44,90 → 35,90 €) ; avec « ce prix ou plus » et la création par le numéro :
-- 8 justes, 0 faux, 324 paires fausses écartées (15/10, 6 909 annonces, 75 jours).
-- Alors : la vente reçoit la fiche et le numéro d'annonce, puis
-- signal_vente_clore_vente_relevee (règle du 15/10 lot H : vente déclarée,
-- 0 mail, 0 push, 0 vente créée) → fiche « vendue », et le déclencheur existant
-- inventaire_vendu_retire_ses_copies arme les retraits PROUVÉS des autres
-- plateformes (les autres deviennent la question « Déjà vendu ? »).
-- Appelée par ventes_prouvees_tick (même verrou, cron 52), bornée : 25 par
-- passage, 4 s ; tracée (usage_logs 'vente_relevee_rattachee', détail du
-- passage). Une preuve « sold » d'AVANT l'armement n'est donc plus perdue :
-- rattrapée par sa vente relevée quand elle est unique, sinon la carte
-- « Vendue ? » reste visible dans « À régler » (inchangé).
-- Inchangés : enregistrer_vente_atomique, enregistrer_ventes_relevees,
-- vente_relevee_meme_cession, signal_vente_clore_vente_relevee, l'armement.
-- Définition de départ de ventes_prouvees_tick : pg_get_functiondef EN PROD le
-- 15/10 ~17:00.
-- Inverse : supabase/rollbacks/20261015150000_vente_relevee_sans_annonce_rattachee_INVERSE.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ventes_relevees_sans_annonce_candidats(p_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(job_id uuid, user_id uuid, inventaire_id bigint, annonce text, prix numeric,
               fenetre_debut timestamp with time zone, fenetre_fin timestamp with time zone,
               vente_id bigint, commande_ref text, vendu_le timestamp with time zone,
               ventes_dans_fenetre integer, autres_annonces_eligibles integer,
               annonces_concurrentes integer, rattachable boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '8s'
AS $function$
  WITH a AS (
    -- Les annonces Vinted à la carte « Vendue » ouverte, fiche en stock à un
    -- exemplaire, sans aucune vente ni reçu (l'index partiel du signal).
    -- ⛔ Toute modification de cette fonction se rejoue d'abord sur l'historique
    -- (scripts/vente-relevee-sans-annonce-selftest.mjs, --prod) : 0 rattachement faux.
    SELECT c.id AS job_id, c.user_id, c.inventaire_id, btrim(c.platform_listing_id) AS annonce,
           coalesce(CASE WHEN c.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                         THEN (c.platform_fields ->> 'detected_price')::numeric END,
                    c.price,
                    CASE WHEN c.platform_fields ->> 'prix_recreation' ~ '^[0-9]+([.][0-9]+)?$'
                         THEN (c.platform_fields ->> 'prix_recreation')::numeric END,
                    CASE WHEN c.platform_fields #>> '{republish_snapshot,prix}' ~ '^[0-9]+([.][0-9]+)?$'
                         THEN (c.platform_fields #>> '{republish_snapshot,prix}')::numeric END) AS prix,
           coalesce(c.published_at, c.created_at) AS publiee,
           public._ts_ou_null(c.platform_fields ->> 'unavailable_since') AS indispo,
           c.vu_en_ligne_le
      FROM public.cross_post_jobs c
      JOIN public.inventaire i ON i.id = c.inventaire_id AND i.user_id = c.user_id
     WHERE c.status = 'published' AND (c.platform_fields ->> 'sale_signal') = 'sold'
       AND c.platform = 'vinted' AND coalesce(c.action, 'publish') IN ('publish', 'republish')
       AND (p_user IS NULL OR c.user_id = p_user)
       AND nullif(btrim(c.platform_listing_id), '') IS NOT NULL
       AND NOT (coalesce(c.platform_fields, '{}'::jsonb) ? 'signal_conteste')
       AND nullif(c.platform_fields ->> 'vente_operation_cle', '') IS NULL
       AND i.statut = 'stock' AND i.fusionne_dans IS NULL AND coalesce(i.quantite, 1) <= 1
       AND NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.user_id = c.user_id AND v.inventaire_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.user_id = c.user_id AND v.plateforme_code = 'vinted'
                         AND v.annonce_id = btrim(c.platform_listing_id))
       AND NOT EXISTS (SELECT 1 FROM public.ventes_operations o WHERE o.user_id = c.user_id
                         AND o.cle = 'annonce:vinted:' || btrim(c.platform_listing_id))
  ),
  f AS (
    -- La fenêtre de CETTE annonce : dernière vue « active » → première vue
    -- « indisponible ». Jamais revue en ligne après. Son prix : celui de sa
    -- dernière vue « active » (un prix baissé entre-temps compte), sinon le job.
    SELECT a.job_id, a.user_id, a.inventaire_id, a.annonce, fin.t AS fenetre_fin,
           coalesce((SELECT s.price FROM public.vinted_listing_snapshots s
                      WHERE s.user_id = a.user_id AND s.vinted_item_id = a.annonce
                        AND s.status = 'active' AND s.captured_at <= fin.t AND s.price IS NOT NULL
                      ORDER BY s.captured_at DESC LIMIT 1), a.prix) AS prix,
           greatest(a.publiee,
                    (SELECT max(s.captured_at) FROM public.vinted_listing_snapshots s
                      WHERE s.user_id = a.user_id AND s.vinted_item_id = a.annonce
                        AND s.status = 'active' AND s.captured_at <= fin.t),
                    CASE WHEN a.vu_en_ligne_le <= fin.t THEN a.vu_en_ligne_le END) AS fenetre_debut
      FROM a
      CROSS JOIN LATERAL (
        SELECT least(a.indispo,
                     (SELECT min(s.captured_at) FROM public.vinted_listing_snapshots s
                       WHERE s.user_id = a.user_id AND s.vinted_item_id = a.annonce
                         AND s.status IN ('sold', 'reserved', 'hidden', 'draft')
                         AND s.captured_at >= a.publiee)) AS t) fin
     WHERE fin.t IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.vinted_listing_snapshots s
                        WHERE s.user_id = a.user_id AND s.vinted_item_id = a.annonce
                          AND s.status = 'active' AND s.captured_at > fin.t)
       AND (a.vu_en_ligne_le IS NULL OR a.vu_en_ligne_le <= fin.t)
  ),
  p AS (
    -- Les ventes du relevé des commandes, sans annonce ni fiche, au prix de
    -- l'annonce, dans sa fenêtre. « Lot N articles » (libellé de Vinted) : veto,
    -- jamais une preuve.
    SELECT f.job_id, f.user_id, f.inventaire_id, f.annonce, f.prix, f.fenetre_debut, f.fenetre_fin,
           v.id AS vente_id, v.commande_ref, v.vendu_le
      FROM f
      JOIN public.ventes v ON v.user_id = f.user_id AND v.plateforme_code = 'vinted'
       AND v.source = 'releve' AND v.annonce_id IS NULL AND v.inventaire_id IS NULL
       AND v.commande_ref IS NOT NULL AND v.prix_vente = f.prix
       AND v.vendu_le >= f.fenetre_debut AND v.vendu_le <= f.fenetre_fin
       AND lower(coalesce(v.statut, 'vendu')) NOT IN ('annule', 'annulee', 'annulée', 'cancelled', 'canceled')
       AND coalesce(v.titre, '') !~* '^[[:space:]]*lot[[:space:]]+[0-9]+[[:space:]]+articles?[[:space:]]*$'
     WHERE f.prix IS NOT NULL
  ),
  q AS (
    SELECT p.*,
           (count(*) OVER (PARTITION BY p.vente_id))::integer - 1 AS autres_annonces_eligibles
      FROM p
  )
  SELECT q.job_id, q.user_id, q.inventaire_id, q.annonce, q.prix, q.fenetre_debut, q.fenetre_fin,
         q.vente_id, q.commande_ref, q.vendu_le, nv.n AS ventes_dans_fenetre, q.autres_annonces_eligibles,
         k.n AS annonces_concurrentes,
         (nv.n = 1 AND q.autres_annonces_eligibles = 0 AND k.n = 0) AS rattachable
    FROM q
    CROSS JOIN LATERAL (
      -- TOUTES les ventes Vinted du compte à ce prix dans la fenêtre (avec ou sans
      -- annonce, quelle que soit leur source) : une seule, celle-ci.
      SELECT count(*)::integer AS n FROM public.ventes v
       WHERE v.user_id = q.user_id AND coalesce(v.plateforme_code, v.plateforme) = 'vinted'
         AND v.prix_vente = q.prix AND v.vendu_le >= q.fenetre_debut AND v.vendu_le <= q.fenetre_fin
         AND lower(coalesce(v.statut, 'vendu')) NOT IN ('annule', 'annulee', 'annulée', 'cancelled', 'canceled')
    ) nv
    CROSS JOIN LATERAL (
      -- Le SEUIL des annonces pas encore créées à l'instant de la vente. Vinted
      -- numérote ses annonces dans l'ordre de création (15/10 : 0 contre-exemple
      -- sur 11 475 annonces créées par FillSell du 21/07 au 15/10). Un job de
      -- dépôt ou de republication FillSell CRÉÉ après la vente porte une annonce
      -- créée après la vente : toute annonce de numéro supérieur ou égal n'existait
      -- pas encore. Cinquième plus petit numéro des 200 premiers jobs : une
      -- annonce mal reliée ne fausse jamais le seuil à elle seule.
      SELECT CASE WHEN count(*) = 5 THEN max(y.n) END AS n FROM (
        SELECT btrim(j.platform_listing_id)::numeric AS n
          FROM (SELECT j0.platform_listing_id FROM public.cross_post_jobs j0
                 WHERE j0.created_at > q.vendu_le AND j0.platform = 'vinted'
                   AND coalesce(j0.action, 'publish') IN ('publish', 'republish')
                   AND j0.platform_listing_id ~ '^[0-9]{6,15}$'
                   AND coalesce(j0.handler_build, '') NOT ILIKE '%sync-dressing%'
                   AND j0.platform_fields ? 'processing_since'
                 ORDER BY j0.created_at LIMIT 200) j
         ORDER BY 1 LIMIT 5) y
    ) seuil
    CROSS JOIN LATERAL (
      -- Toute AUTRE annonce Vinted du compte qui aurait pu être vendue à cet
      -- instant, à ce prix OU PLUS (une offre acceptée baisse le prix : 2 faux
      -- rattachements sur l'historique sans cette garde) :
      --   · par ses relevés : pas vendue avant, pas revue en ligne après, vendue
      --     ensuite, déjà créée (numéro sous le seuil ci-dessus) ;
      --   · sans relevé, par son job : en ligne avant, indisponible ou vendue après,
      --     jamais revue en ligne après.
      SELECT count(DISTINCT x.item)::integer AS n FROM (
        SELECT s.vinted_item_id AS item
          FROM public.vinted_listing_snapshots s
         WHERE s.user_id = q.user_id AND s.vinted_item_id <> q.annonce
         GROUP BY s.vinted_item_id
        HAVING max(s.price) >= q.prix
           AND bool_or(s.status = 'sold' AND s.captured_at >= q.vendu_le)
           AND NOT bool_or(s.status = 'sold' AND s.captured_at < q.vendu_le)
           AND NOT bool_or(s.status = 'active' AND s.captured_at > q.vendu_le)
           AND (seuil.n IS NULL OR s.vinted_item_id !~ '^[0-9]{6,15}$' OR s.vinted_item_id::numeric < seuil.n)
        UNION
        SELECT btrim(j.platform_listing_id)
          FROM public.cross_post_jobs j
         WHERE j.user_id = q.user_id AND j.platform = 'vinted'
           AND coalesce(j.action, 'publish') IN ('publish', 'republish') AND j.status IN ('published', 'sold')
           AND nullif(btrim(j.platform_listing_id), '') IS NOT NULL AND btrim(j.platform_listing_id) <> q.annonce
           AND NOT EXISTS (SELECT 1 FROM public.vinted_listing_snapshots s5
                            WHERE s5.user_id = j.user_id AND s5.vinted_item_id = btrim(j.platform_listing_id))
           AND coalesce(CASE WHEN j.platform_fields ->> 'detected_price' ~ '^[0-9]+([.][0-9]+)?$'
                             THEN (j.platform_fields ->> 'detected_price')::numeric END, j.price, q.prix) >= q.prix
           AND coalesce(j.published_at, j.created_at) <= q.vendu_le
           AND (j.vu_en_ligne_le IS NULL OR j.vu_en_ligne_le <= q.vendu_le)
           AND (public._ts_ou_null(j.platform_fields ->> 'unavailable_since') >= q.vendu_le
                OR (j.status = 'sold' AND coalesce(j.sold_at, now()) >= q.vendu_le))
      ) x
    ) k;
$function$;


CREATE OR REPLACE FUNCTION public.ventes_relevees_sans_annonce_rattacher(p_max integer DEFAULT 25, p_budget_ms integer DEFAULT 4000, p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_debut   timestamptz := clock_timestamp();
  v_max     integer := greatest(1, least(coalesce(p_max, 25), 1000));
  v_budget  interval := make_interval(secs => greatest(500, least(coalesce(p_budget_ms, 4000), 15000)) / 1000.0);
  c         record;
  r         jsonb;
  n_vus     integer := 0;
  n_ok      integer := 0;
  n_ref     integer := 0;
  n_amb     integer := 0;
  v_budget_atteint boolean := false;
  v_detail  jsonb := '[]'::jsonb;
BEGIN
  FOR c IN SELECT * FROM public.ventes_relevees_sans_annonce_candidats(p_user) x ORDER BY x.vendu_le, x.vente_id LOOP
    -- Deux candidats d'un côté ou de l'autre : rien, jamais.
    IF NOT c.rattachable THEN n_amb := n_amb + 1; CONTINUE; END IF;
    IF n_vus >= v_max OR clock_timestamp() - v_debut > v_budget THEN v_budget_atteint := true; EXIT; END IF;
    n_vus := n_vus + 1;
    BEGIN
      UPDATE public.ventes SET inventaire_id = c.inventaire_id, annonce_id = c.annonce
       WHERE id = c.vente_id AND user_id = c.user_id AND inventaire_id IS NULL AND annonce_id IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'la vente a changé'; END IF;
      -- Vente déclarée (0 mail, 0 push), fiche vendue, retraits prouvés par le déclencheur.
      r := public.signal_vente_clore_vente_relevee(c.job_id, c.vente_id, 'ventes_relevees_sans_annonce_rattacher');
      IF coalesce(r ->> 'ok', 'false') <> 'true' THEN
        RAISE EXCEPTION 'carte non close : %', coalesce(r ->> 'reason', '?');
      END IF;
      INSERT INTO public.usage_logs (user_id, feature, metadata)
      VALUES (c.user_id, 'vente_relevee_rattachee', jsonb_build_object(
        'vente', c.vente_id, 'commande', c.commande_ref, 'inventaire_id', c.inventaire_id,
        'job', c.job_id, 'annonce', c.annonce, 'prix', c.prix, 'vendu_le', c.vendu_le,
        'fenetre', jsonb_build_object('debut', c.fenetre_debut, 'fin', c.fenetre_fin),
        'regle', 'vente_relevee_sans_annonce_unique', 'par', 'ventes_relevees_sans_annonce_rattacher',
        'fiche_vendue', r -> 'inventaireUpdated'));
      n_ok := n_ok + 1;
      v_detail := v_detail || jsonb_build_array(jsonb_build_object(
        'vente', c.vente_id, 'inv', c.inventaire_id, 'annonce', c.annonce, 'user', left(c.user_id::text, 8)));
    EXCEPTION WHEN OTHERS THEN
      n_ref := n_ref + 1;
      v_detail := v_detail || jsonb_build_array(jsonb_build_object(
        'vente', c.vente_id, 'inv', c.inventaire_id, 'annonce', c.annonce, 'user', left(c.user_id::text, 8),
        'refus', left(SQLERRM, 200)));
    END;
  END LOOP;
  RETURN jsonb_build_object('rattachees', n_ok, 'refusees', n_ref, 'ambigues', n_amb,
                            'budget_atteint', v_budget_atteint,
                            'duree_ms', (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer)
      || CASE WHEN jsonb_array_length(v_detail) > 0 THEN jsonb_build_object('detail', v_detail) ELSE '{}'::jsonb END;
END;
$function$;

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
  v_ratt    jsonb := NULL;
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
  -- (15/10, point 6 — Bilal) La vente relevée par les commandes SANS numéro
  -- d'annonce rejoint sa fiche quand la preuve est unique des deux côtés (même
  -- prix, dans la fenêtre de l'annonce, une seule vente, une seule annonce) :
  -- vente déclarée, fiche vendue, retraits prouvés. Même verrou, borné (25, 4 s),
  -- isolé : un échec ici ne coûte jamais le passage.
  BEGIN
    v_ratt := public.ventes_relevees_sans_annonce_rattacher(25, 4000);
  EXCEPTION WHEN OTHERS THEN
    v_ratt := jsonb_build_object('erreur', left(SQLERRM, 200));
  END;
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, budget_atteint, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'fait',
          n_cand, n_ok, n_ref, n_rep, v_hors_budget,
          CASE WHEN n_cand > 0 OR coalesce((v_reco ->> 'dementis')::int, 0) + coalesce((v_reco ->> 'fusionnes')::int, 0) > 0 OR v_reco ? 'erreur'
                    OR coalesce((v_ratt ->> 'rattachees')::int, 0) + coalesce((v_ratt ->> 'refusees')::int, 0) > 0 OR v_ratt ? 'erreur'
               THEN v_detail || CASE WHEN v_reco IS NOT NULL THEN jsonb_build_array(jsonb_build_object('reconciliation', v_reco)) ELSE '[]'::jsonb END
                             || CASE WHEN v_ratt IS NOT NULL THEN jsonb_build_array(jsonb_build_object('rattachement', v_ratt)) ELSE '[]'::jsonb END END);
  DELETE FROM ventes_prouvees_passages
   WHERE id IN (SELECT id FROM ventes_prouvees_passages WHERE debut < now() - interval '14 days' ORDER BY id LIMIT 500);
  RETURN jsonb_build_object('issue', 'fait', 'candidates', n_cand, 'enregistrees', n_ok, 'refusees', n_ref,
                            'reportees', n_rep, 'budget_atteint', v_hors_budget, 'reconciliation', v_reco, 'rattachement', v_ratt,
                            'duree_ms', (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer);
EXCEPTION WHEN OTHERS THEN
  -- Jamais un échec muet : le passage raté est tracé (la veille le voit).
  INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue, candidates, enregistrees, refusees, reportees, detail)
  VALUES (v_debut, clock_timestamp(), (extract(epoch FROM clock_timestamp() - v_debut) * 1000)::integer, 'erreur',
          n_cand, 0, 0, 0, jsonb_build_object('erreur', left(SQLERRM, 300)));
  RETURN jsonb_build_object('issue', 'erreur', 'erreur', left(SQLERRM, 300));
END;
$function$;

REVOKE ALL ON FUNCTION public.ventes_relevees_sans_annonce_candidats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ventes_relevees_sans_annonce_rattacher(integer, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ventes_prouvees_tick(integer, integer) FROM PUBLIC, anon, authenticated;
