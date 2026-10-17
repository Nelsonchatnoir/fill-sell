-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC — migration 20261017140000_vente_vinted_annulee_statut_annonce
-- Rien n'est écrit : ROLLBACK final (aucune vente, aucune fiche, aucun mail).
-- ═══════════════════════════════════════════════════════════════════════════
-- Déroulé, dans UNE transaction :
--   A. AVANT  — la définition de prod est celle lue le 17/10 à 14:05 (md5) ;
--               l'interrupteur ventes_annulees_retrait_pause est ouvert ; compteurs
--               email_logs et push_ventes du compte de Nico ; données d'essai sur le
--               compte de Nico SEULEMENT (fiches « [ESSAI 17/10] » à 999 €, annonces
--               Vinted fictives 90171014xx, jobs vendus, relevés, ventes prouvées et
--               leurs reçus) ; le défaut REJOUÉ avec l'ancienne règle : la fiche
--               revient au stock en gardant « sold », la trace n'a pas le reçu ;
--   B. LA MIGRATION — son contenu exact (garde md5 + définition + droits) ;
--   C. APRÈS  — C1 annonce fermée → 'closed', 2 lignes de journal, reçu dans la
--               trace, job clos ; C2 annonce revue en ligne après la vente → 'active',
--               job republié ; C3 la fiche porte une autre annonce → état d'annonce
--               intact ; C4 déjà 'closed' → rien de plus ; C5 plusieurs exemplaires →
--               +1, copie vendue effacée, état intact ; C6 vente saisie → signalée,
--               rien touché ; C7 rejeu → introuvable ; C8 la définition nouvelle est en
--               place, fermée à l'app ; C9 email_logs et push_ventes inchangés, journal
--               et traces bornés aux fiches d'essai.
-- Lancement (par le coordinateur) :
--   npx supabase db query --linked -f scripts/essais/20261017140000_essai.sql
-- Lecture : la dernière requête rend une ligne par contrôle (cas, attendu, obtenu,
-- ok) ; tout doit être ok = true.
-- La partie B est identique, octet pour octet, au corps de la migration (contrôlé par
-- scripts/vente-vinted-annulee-statut-selftest.mjs).

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _res (ordre serial, cas text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;
CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes bigint) ON COMMIT DROP;
CREATE TEMP TABLE _essai (n integer PRIMARY KEY, fiche bigint, annonce text, job uuid, vente bigint, copie bigint) ON COMMIT DROP;

-- ═══ A. AVANT LA MIGRATION ═══════════════════════════════════════════════════

-- A1. La prod est celle lue le 17/10 à 14:05 (sinon l'essai ne prouve rien).
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A1 avant : définition de prod vente_commande_annulee_vinted (md5)', '0dd6dc8aedf022b9cd3226459f16a83e',
       md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)),
       md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) = '0dd6dc8aedf022b9cd3226459f16a83e';

-- A2. L'interrupteur commun (règle eBay du 09/10) est ouvert : sinon la règle répond « en_pause ».
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A2 avant : interrupteur ventes_annulees_retrait_pause', '0',
       coalesce((SELECT value::text FROM public.coin_config WHERE key = 'ventes_annulees_retrait_pause'), 'absent (0)'),
       coalesce((SELECT value FROM public.coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 0;

-- A3. Compteurs du compte de Nico AVANT les données (relus en C9).
INSERT INTO _cpt (moment, mails, notes)
SELECT 'avant_donnees',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18');

-- A4. Données d'essai, compte de Nico : fiches 9017101400000 à …006 (« [ESSAI 17/10] »,
--     999 €), annonces Vinted fictives 90171014xx. Tout disparaît au ROLLBACK.
--     n = 0 : rejoué avec l'ANCIENNE règle (A5) ;
--     n = 1 : annonce fermée (dernier relevé « sold ») ;
--     n = 2 : annonce revue EN LIGNE par un relevé après la vente ;
--     n = 3 : la fiche porte une AUTRE annonce que celle de la vente ;
--     n = 4 : fiche déjà 'closed' ;
--     n = 5 : fiche à plusieurs exemplaires (en stock, 3) + sa copie « vendue » née de la vente ;
--     n = 6 : vente SAISIE (source manuel, aucun job vendu).
DO $donnees$
DECLARE
  u      uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  f      bigint := 9017101400000;
  v_cree timestamptz := now() - interval '2 days';
  v_ms   bigint := floor(extract(epoch FROM (now() - interval '2 days')) * 1000)::bigint;
  n      integer;
  v_lid  text;
  v_job  uuid;
  v_id   bigint;
  v_titre text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id BETWEEN f AND f + 99)
     OR EXISTS (SELECT 1 FROM public.inventaire WHERE user_id = u AND id BETWEEN v_ms - 2000 AND v_ms + 20000)
     OR EXISTS (SELECT 1 FROM public.inventaire WHERE user_id = u AND vinted_item_id LIKE '90171014%')
     OR EXISTS (SELECT 1 FROM public.vinted_listing_snapshots WHERE user_id = u AND vinted_item_id LIKE '90171014%')
     OR EXISTS (SELECT 1 FROM public.ventes WHERE user_id = u AND annonce_id LIKE '90171014%') THEN
    RAISE EXCEPTION 'essai : des données d''essai 90171014… existent déjà — essai arrêté, rien n''est écrit';
  END IF;

  FOR n IN 0..6 LOOP
    v_lid := '901710140' || n;
    v_titre := '[ESSAI 17/10] Commande Vinted annulée ' || n || ' — ne pas publier';
    INSERT INTO public.inventaire (id, user_id, titre, prix_vente, statut, quantite, plateforme, vinted_item_id, vinted_status, photos)
    VALUES (f + n, u, v_titre, 999,
            CASE WHEN n = 5 THEN 'stock' ELSE 'vendu' END,
            CASE WHEN n = 5 THEN 3 ELSE 0 END,
            'vinted',
            CASE n WHEN 3 THEN '9017101493' WHEN 5 THEN '9017101495' ELSE v_lid END,
            CASE n WHEN 4 THEN 'closed' WHEN 5 THEN 'active' ELSE 'sold' END,
            jsonb_build_array('https://example.invalid/essai-1710-14-' || n || '.jpg'));

    v_job := NULL;
    IF n <> 6 THEN
      INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price,
                                          platform_listing_id, listing_url, published_at, sold_at, platform_fields)
      VALUES (u, f + n, 'vinted', 'publish', 'sold', 'original', v_titre, 999, v_lid, 'https://www.vinted.fr/items/' || v_lid,
              now() - interval '20 days', v_cree,
              jsonb_build_object('essai_1710_140000', true, 'sale_signal', 'sold', 'vente_operation_cle', 'annonce:vinted:' || v_lid))
      RETURNING id INTO v_job;
      INSERT INTO public.vinted_listing_snapshots (user_id, vinted_item_id, inventaire_id, captured_at, captured_on, price, status)
      VALUES (u, v_lid, f + n,
              CASE WHEN n = 2 THEN now() - interval '1 hour' ELSE now() - interval '1 day' END,
              ((CASE WHEN n = 2 THEN now() - interval '1 hour' ELSE now() - interval '1 day' END) AT TIME ZONE 'Europe/Paris')::date,
              999, CASE WHEN n = 2 THEN 'active' ELSE 'sold' END);
    END IF;

    INSERT INTO public.ventes (user_id, titre, prix_vente, plateforme, plateforme_code, statut, quantite, date,
                               annonce_id, inventaire_id, source, created_at)
    VALUES (u, v_titre, 999, 'Vinted', 'vinted', 'vendu', 1, (v_cree AT TIME ZONE 'Europe/Paris')::date,
            v_lid, f + n, CASE WHEN n = 6 THEN 'manuel' END, v_cree)
    RETURNING id INTO v_id;

    IF n <> 6 THEN
      INSERT INTO public.ventes_operations (user_id, cle, inventaire_id, job_id, resultat, cree_le)
      VALUES (u, 'annonce:vinted:' || v_lid, f + n, v_job,
              jsonb_build_object('ok', true, 'ventes_ids', jsonb_build_array(v_id), 'essai_1710_140000', true), v_cree);
    END IF;

    INSERT INTO _essai (n, fiche, annonce, job, vente) VALUES (n, f + n, v_lid, v_job, v_id);
  END LOOP;

  -- La copie « vendue » de l'exemplaire (n = 5), née de la vente au même instant, sans lien.
  INSERT INTO public.inventaire (id, user_id, titre, prix_vente, statut, quantite, plateforme)
  VALUES (v_ms + 5, u, '[ESSAI 17/10] Commande Vinted annulée 5 — ne pas publier', 999, 'vendu', 0, 'vinted');
  UPDATE _essai x SET copie = v_ms + 5 WHERE x.n = 5;
END
$donnees$;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A4 avant : données d''essai posées (compte de Nico)', '8 fiches, 6 jobs vendus, 7 ventes, 6 reçus, 6 relevés',
       (SELECT count(*) FROM public.inventaire WHERE id BETWEEN 9017101400000 AND 9017101400006 OR id = (SELECT copie FROM _essai WHERE n = 5)) || ' fiches, '
       || (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 9017101400000 AND 9017101400006 AND status = 'sold') || ' jobs, '
       || (SELECT count(*) FROM public.ventes WHERE id IN (SELECT vente FROM _essai)) || ' ventes, '
       || (SELECT count(*) FROM public.ventes_operations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND cle LIKE 'annonce:vinted:90171014%') || ' reçus, '
       || (SELECT count(*) FROM public.vinted_listing_snapshots WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND vinted_item_id LIKE '90171014%') || ' relevés',
       (SELECT count(*) FROM public.inventaire WHERE id BETWEEN 9017101400000 AND 9017101400006 OR id = (SELECT copie FROM _essai WHERE n = 5)) = 8
       AND (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 9017101400000 AND 9017101400006 AND status = 'sold') = 6
       AND (SELECT count(*) FROM public.ventes WHERE id IN (SELECT vente FROM _essai)) = 7
       AND (SELECT count(*) FROM public.ventes_operations WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND cle LIKE 'annonce:vinted:90171014%') = 6
       AND (SELECT count(*) FROM public.vinted_listing_snapshots WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND vinted_item_id LIKE '90171014%') = 6;

-- Compteurs APRÈS les données, AVANT tout appel de la règle (relus en C9).
INSERT INTO _cpt (moment, mails, notes)
SELECT 'apres_donnees',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18');

-- A5. Le défaut, REJOUÉ avec l'ANCIENNE règle (n = 0) : la fiche revient au stock mais
--     garde « sold », et le reçu effacé n'est nulle part.
DO $a5$
DECLARE r jsonb; e record; i record; v_trace jsonb;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 0;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490000', now() - interval '2 days');
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT l.metadata INTO v_trace FROM public.usage_logs l
   WHERE l.user_id = i.user_id AND l.feature = 'vente_retiree' AND l.metadata -> 'vente' ->> 'id' = e.vente::text;
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'A5 avant : ancienne règle — fiche au stock mais annonce toujours « sold », reçu absent de la trace',
    'retiree ; stock/sold ; trace sans reçu ; reçu effacé',
    coalesce(r ->> 'action', '?') || ' ; ' || i.statut || '/' || coalesce(i.vinted_status, '∅')
      || ' ; trace ' || CASE WHEN v_trace ? 'recus' THEN 'avec reçu' ELSE 'sans reçu' END
      || ' ; reçu ' || CASE WHEN EXISTS (SELECT 1 FROM public.ventes_operations o WHERE o.user_id = i.user_id AND o.cle = 'annonce:vinted:' || e.annonce) THEN 'présent' ELSE 'effacé' END,
    coalesce(r ->> 'action' = 'retiree' AND i.statut = 'stock' AND i.vinted_status = 'sold' AND v_trace IS NOT NULL
             AND NOT (v_trace ? 'recus')
             AND NOT EXISTS (SELECT 1 FROM public.ventes_operations o WHERE o.user_id = i.user_id AND o.cle = 'annonce:vinted:' || e.annonce), false));
END
$a5$;

-- ═══ B. LA MIGRATION (son contenu exact, sans BEGIN/COMMIT) ═══════════════════

-- ═══ CORPS DE LA MIGRATION (repris à l'octet par l'essai à blanc) ═══════════
-- ── 0. La définition de prod n'a pas bougé depuis sa lecture (17/10 14:05) ──
DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure))
     IS DISTINCT FROM '0dd6dc8aedf022b9cd3226459f16a83e' THEN
    RAISE EXCEPTION 'vente_commande_annulee_vinted a changé en prod depuis le 17/10 14:05 : migration arrêtée, rien n''est écrit';
  END IF;
END
$garde$;

-- ── 1. vente_commande_annulee_vinted : l'annonce de la fiche, le reçu dans la trace ──
CREATE OR REPLACE FUNCTION public.vente_commande_annulee_vinted(p_vente bigint, p_statut text, p_commande text, p_commande_le timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; j cross_post_jobs%ROWTYPE;
  v_motif text := 'commande_' || lower(coalesce(nullif(btrim(p_statut), ''), 'annulee'));
  v_rendue text := NULL; v_hist bigint; v_ms bigint; v_snap record; v_job text := NULL; v_q integer;
  v_vs text := NULL; v_recus jsonb := NULL;   -- (17/10) l'annonce de la fiche ; les reçus gardés dans la trace
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'introuvable'); END IF;
  IF v.plateforme_code IS DISTINCT FROM 'vinted' THEN RETURN jsonb_build_object('action', 'hors_sujet'); END IF;
  -- Même interrupteur et même liste d'attente que la règle eBay (09/10).
  IF coalesce((SELECT value FROM coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 1 THEN
    RETURN jsonb_build_object('action', 'en_pause');
  END IF;
  IF EXISTS (SELECT 1 FROM ventes_annulees_attente_go g WHERE g.vente_id = v.id AND g.decision IS NULL) THEN
    RETURN jsonb_build_object('action', 'en_attente_go');
  END IF;
  -- La preuve de la plateforme : l'annonce FillSell close « vendue » sur ce numéro.
  IF v.annonce_id IS NOT NULL THEN
    SELECT * INTO j FROM cross_post_jobs c
     WHERE c.user_id = v.user_id AND c.platform = 'vinted' AND c.status = 'sold'
       AND c.action IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = v.annonce_id
     ORDER BY c.sold_at DESC NULLS LAST LIMIT 1;
  END IF;
  IF NOT (coalesce(v.source, '') = 'releve' OR j.id IS NOT NULL)
     OR coalesce(p_commande_le, v.created_at) < timestamptz '2026-10-13 00:00:00+02' THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_vinted_commande_annulee_signalee'
                    AND u.metadata ->> 'vente' = v.id::text) THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_vinted_commande_annulee_signalee',
        jsonb_build_object('vente', v.id::text, 'commande', p_commande, 'statut', p_statut, 'titre', v.titre, 'prix_vente', v.prix_vente,
          'motif', CASE WHEN coalesce(p_commande_le, v.created_at) < timestamptz '2026-10-13 00:00:00+02'
                        THEN 'annulation_anterieure_a_la_regle' ELSE 'vente_saisie_jamais_retiree' END));
    END IF;
    RETURN jsonb_build_object('action', 'signalee');
  END IF;
  IF v.inventaire_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
  END IF;
  INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
  VALUES (v.user_id, 'vinted', coalesce(v.commande_ref, p_commande), v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(),
          'releve_vinted', v_motif);
  -- (17/10) Le reçu qui va tomber part dans la trace : une réparation inverse le rend tel quel.
  IF v.annonce_id IS NOT NULL THEN
    SELECT jsonb_agg(to_jsonb(o)) INTO v_recus FROM ventes_operations o
     WHERE o.user_id = v.user_id AND o.cle = 'annonce:vinted:' || v.annonce_id;
  END IF;
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_retiree',
    jsonb_build_object('vente', to_jsonb(v), 'statut', p_statut, 'commande', p_commande, 'source', 'releve_vinted', 'motif', v_motif,
                       'recus', v_recus));
  DELETE FROM ventes WHERE id = v.id;
  -- Le reçu de la vente tombe avec elle : une vraie vente future de la même
  -- annonce (remise en ligne par Vinted) s'enregistrera normalement.
  IF v.annonce_id IS NOT NULL THEN
    DELETE FROM ventes_operations o WHERE o.user_id = v.user_id AND o.cle = 'annonce:vinted:' || v.annonce_id;
  END IF;

  -- (17/10) Le dernier relevé de l'annonce, lu UNE fois : il décide du job et de vinted_status.
  IF v.annonce_id IS NOT NULL THEN
    SELECT s.status, s.captured_at INTO v_snap FROM vinted_listing_snapshots s
     WHERE s.user_id = v.user_id AND s.vinted_item_id = v.annonce_id ORDER BY s.captured_at DESC LIMIT 1;
  END IF;

  -- La fiche revient au stock.
  v_q := greatest(coalesce(v.quantite, 1), 1);
  IF v.inventaire_id IS NOT NULL THEN
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
    IF i.id IS NOT NULL AND i.fusionne_dans IS NULL THEN
      IF i.statut = 'vendu' AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.user_id = v.user_id AND x.inventaire_id = i.id) THEN
        UPDATE remises_en_vente SET statut = 'abandonnee', motif = 'commande_annulee', traite_le = now()
         WHERE user_id = v.user_id AND inventaire_id = i.id AND statut = 'a_faire';
        UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i.id AND statut = 'vendu';
        v_rendue := 'fiche';
      ELSIF i.statut = 'stock' THEN
        -- Plusieurs exemplaires : l'exemplaire revient, sa copie « vendue » (créée
        -- par enregistrer_vente_atomique au même instant, sans lien) est effacée.
        UPDATE inventaire SET quantite = coalesce(quantite, 0) + v_q WHERE id = i.id;
        v_ms := floor(extract(epoch FROM v.created_at) * 1000)::bigint;
        SELECT h.id INTO v_hist FROM inventaire h
         WHERE h.user_id = v.user_id AND h.statut = 'vendu' AND h.id BETWEEN v_ms - 2000 AND v_ms + 20000
           AND h.titre IS NOT DISTINCT FROM i.titre AND h.prix_vente IS NOT DISTINCT FROM v.prix_vente
           AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.inventaire_id = h.id)
           AND NOT EXISTS (SELECT 1 FROM cross_post_jobs c WHERE c.inventaire_id = h.id)
         ORDER BY abs(h.id - v_ms) LIMIT 1;
        IF v_hist IS NOT NULL THEN DELETE FROM inventaire WHERE id = v_hist; END IF;
        v_rendue := 'exemplaire';
      END IF;
      IF v_rendue IS NOT NULL THEN
        INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
          (v.user_id, i.id, CASE WHEN v_rendue = 'fiche' THEN 'statut' ELSE 'quantite' END,
           CASE WHEN v_rendue = 'fiche' THEN i.statut ELSE i.quantite::text END,
           CASE WHEN v_rendue = 'fiche' THEN 'stock' ELSE (coalesce(i.quantite, 0) + v_q)::text END,
           'releve_vinted', 'commande_annulee',
           jsonb_build_object('vente', v.id, 'commande', p_commande, 'statut_vinted', p_statut, 'copie_effacee', v_hist));
        -- (17/10) L'ANNONCE DE LA FICHE : la valeur que le relevé du dressing écrit
        -- (content-scripts/vinted.js : 'closed' = fermée sans vente, 'active' = en ligne),
        -- seulement si la fiche porte CETTE annonce et si la valeur change — tracée
        -- dans inventaire_journal comme le statut.
        IF v.annonce_id IS NOT NULL AND btrim(coalesce(i.vinted_item_id, '')) = v.annonce_id THEN
          v_vs := CASE WHEN v_snap.status = 'active' AND v_snap.captured_at > coalesce(j.sold_at, v.created_at)
                       THEN 'active' ELSE 'closed' END;
          IF i.vinted_status IS DISTINCT FROM v_vs THEN
            UPDATE inventaire SET vinted_status = v_vs WHERE id = i.id AND vinted_status IS DISTINCT FROM v_vs;
            INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
              (v.user_id, i.id, 'vinted_status', i.vinted_status, v_vs, 'releve_vinted', 'commande_annulee',
               jsonb_build_object('vente', v.id, 'commande', p_commande, 'statut_vinted', p_statut,
                                  'releve_statut', v_snap.status, 'releve_le', v_snap.captured_at));
          ELSE
            v_vs := NULL;   -- déjà la bonne valeur : rien d'écrit
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- L'annonce : revue EN LIGNE après la vente → le job redevient « publié » ;
  -- sinon il est clos et le dit. Jamais une remise en ligne en silence.
  IF j.id IS NOT NULL THEN
    IF v_snap.status = 'active' AND v_snap.captured_at > coalesce(j.sold_at, v.created_at) THEN
      UPDATE cross_post_jobs SET status = 'published', sold_at = NULL,
             platform_fields = (coalesce(platform_fields, '{}'::jsonb)
               - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'vente_operation_cle'])
               || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'commande', p_commande, 'statut', p_statut,
                                     'vente', v.id, 'annonce', 'en_ligne', 'releve_le', v_snap.captured_at))
       WHERE id = j.id AND status = 'sold';
      v_job := 'en_ligne';
    ELSE
      UPDATE cross_post_jobs SET status = 'cancelled',
             error = 'Commande Vinted annulée : l''article est revenu dans ton stock. L''annonce Vinted reste fermée : remets-le en vente quand tu veux.',
             platform_fields = coalesce(platform_fields, '{}'::jsonb)
               || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'commande', p_commande, 'statut', p_statut,
                                     'vente', v.id, 'annonce', 'fermee'))
       WHERE id = j.id AND status = 'sold';
      v_job := 'close';
    END IF;
  END IF;
  RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'copie_effacee', v_hist, 'job', v_job, 'vinted_status', v_vs);
END;
$function$
;

REVOKE ALL ON FUNCTION public.vente_commande_annulee_vinted(bigint, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════

-- ═══ C. APRÈS LA MIGRATION ═══════════════════════════════════════════════════

-- C1. Annonce fermée (dernier relevé « sold ») : fiche au stock ET annonce « closed », tracées.
DO $c1$
DECLARE r jsonb; e record; i record; j record; n_j integer; v_trace jsonb;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 1;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490001', now() - interval '2 days');
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = e.job;
  SELECT count(*) INTO n_j FROM public.inventaire_journal
   WHERE inventaire_id = e.fiche AND source = 'releve_vinted' AND motif = 'commande_annulee';
  SELECT l.metadata INTO v_trace FROM public.usage_logs l
   WHERE l.user_id = i.user_id AND l.feature = 'vente_retiree' AND l.metadata -> 'vente' ->> 'id' = e.vente::text;
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C1 après : annonce fermée — fiche au stock ET « closed », 2 lignes de journal, reçu dans la trace',
    'retiree ; closed ; stock/closed ; 2 ligne(s) ; job cancelled ; reçus 1 ; vente effacée ; reçu effacé ; ventes_supprimees 1',
    coalesce(r ->> 'action', '?') || ' ; ' || coalesce(r ->> 'vinted_status', '∅') || ' ; ' || i.statut || '/' || coalesce(i.vinted_status, '∅')
      || ' ; ' || n_j || ' ligne(s) ; job ' || j.status || ' ; reçus '
      || coalesce(CASE WHEN jsonb_typeof(v_trace -> 'recus') = 'array' THEN jsonb_array_length(v_trace -> 'recus')::text END, '∅')
      || ' ; vente ' || CASE WHEN EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente) THEN 'présente' ELSE 'effacée' END
      || ' ; reçu ' || CASE WHEN EXISTS (SELECT 1 FROM public.ventes_operations o WHERE o.user_id = i.user_id AND o.cle = 'annonce:vinted:' || e.annonce) THEN 'présent' ELSE 'effacé' END
      || ' ; ventes_supprimees ' || (SELECT count(*) FROM public.ventes_supprimees s WHERE s.user_id = i.user_id AND s.vente_id = e.vente AND s.motif = 'commande_failed'),
    coalesce(r ->> 'action' = 'retiree' AND r ->> 'vinted_status' = 'closed' AND i.statut = 'stock' AND i.vinted_status = 'closed'
             AND n_j = 2 AND j.status = 'cancelled'
             AND CASE WHEN jsonb_typeof(v_trace -> 'recus') = 'array'
                      THEN jsonb_array_length(v_trace -> 'recus') = 1
                           AND (v_trace -> 'recus' -> 0 ->> 'cle') = 'annonce:vinted:' || e.annonce
                      ELSE false END
             AND NOT EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente)
             AND NOT EXISTS (SELECT 1 FROM public.ventes_operations o WHERE o.user_id = i.user_id AND o.cle = 'annonce:vinted:' || e.annonce)
             AND (SELECT count(*) FROM public.ventes_supprimees s WHERE s.user_id = i.user_id AND s.vente_id = e.vente AND s.motif = 'commande_failed') = 1, false));
END
$c1$;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C1 après : les deux lignes de journal (releve_vinted, commande_annulee)',
       'statut : vendu → stock | vinted_status : sold → closed',
       coalesce(string_agg(ij.champ || ' : ' || coalesce(ij.avant, '∅') || ' → ' || coalesce(ij.apres, '∅'), ' | ' ORDER BY ij.id), '∅'),
       coalesce(bool_or(ij.champ = 'statut' AND ij.avant = 'vendu' AND ij.apres = 'stock'), false)
       AND coalesce(bool_or(ij.champ = 'vinted_status' AND ij.avant = 'sold' AND ij.apres = 'closed'
                            AND ij.detail ->> 'releve_statut' = 'sold'), false)
FROM public.inventaire_journal ij
WHERE ij.inventaire_id = (SELECT fiche FROM _essai WHERE n = 1) AND ij.source = 'releve_vinted' AND ij.motif = 'commande_annulee';

-- C2. Annonce revue EN LIGNE par un relevé après la vente : 'active', job republié.
DO $c2$
DECLARE r jsonb; e record; i record; j record; n_j integer;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 2;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490002', now() - interval '2 days');
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT * INTO j FROM public.cross_post_jobs WHERE id = e.job;
  SELECT count(*) INTO n_j FROM public.inventaire_journal
   WHERE inventaire_id = e.fiche AND source = 'releve_vinted' AND motif = 'commande_annulee';
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C2 après : annonce revue en ligne après la vente — « active », job republié',
    'retiree ; active ; stock/active ; 2 ligne(s) ; job published ; en_ligne',
    coalesce(r ->> 'action', '?') || ' ; ' || coalesce(r ->> 'vinted_status', '∅') || ' ; ' || i.statut || '/' || coalesce(i.vinted_status, '∅')
      || ' ; ' || n_j || ' ligne(s) ; job ' || j.status || ' ; ' || coalesce(r ->> 'job', '∅'),
    coalesce(r ->> 'action' = 'retiree' AND r ->> 'vinted_status' = 'active' AND i.statut = 'stock' AND i.vinted_status = 'active'
             AND n_j = 2 AND j.status = 'published' AND r ->> 'job' = 'en_ligne', false));
END
$c2$;

-- C3. La fiche porte une AUTRE annonce que celle de la vente : son état d'annonce ne bouge pas.
DO $c3$
DECLARE r jsonb; e record; i record; n_j integer;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 3;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490003', now() - interval '2 days');
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT count(*) INTO n_j FROM public.inventaire_journal
   WHERE inventaire_id = e.fiche AND source = 'releve_vinted' AND motif = 'commande_annulee';
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C3 après : la fiche porte une autre annonce — état d''annonce intact, une seule ligne de journal',
    'retiree ; ∅ ; stock/sold ; 1 ligne(s)',
    coalesce(r ->> 'action', '?') || ' ; ' || coalesce(r ->> 'vinted_status', '∅') || ' ; ' || i.statut || '/' || coalesce(i.vinted_status, '∅')
      || ' ; ' || n_j || ' ligne(s)',
    coalesce(r ->> 'action' = 'retiree' AND r ->> 'vinted_status' IS NULL AND i.statut = 'stock' AND i.vinted_status = 'sold' AND n_j = 1, false));
END
$c3$;

-- C4. Fiche déjà 'closed' : rien d'écrit de plus sur l'annonce (aucune ligne inchangée réécrite).
DO $c4$
DECLARE r jsonb; e record; i record; n_j integer;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 4;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490004', now() - interval '2 days');
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT count(*) INTO n_j FROM public.inventaire_journal
   WHERE inventaire_id = e.fiche AND source = 'releve_vinted' AND motif = 'commande_annulee';
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C4 après : fiche déjà « closed » — aucune ligne de plus',
    'retiree ; ∅ ; stock/closed ; 1 ligne(s)',
    coalesce(r ->> 'action', '?') || ' ; ' || coalesce(r ->> 'vinted_status', '∅') || ' ; ' || i.statut || '/' || coalesce(i.vinted_status, '∅')
      || ' ; ' || n_j || ' ligne(s)',
    coalesce(r ->> 'action' = 'retiree' AND r ->> 'vinted_status' IS NULL AND i.statut = 'stock' AND i.vinted_status = 'closed' AND n_j = 1, false));
END
$c4$;

-- C5. Plusieurs exemplaires : l'exemplaire revient (+1), sa copie « vendue » est effacée,
--     l'état d'annonce de la fiche (autre annonce, en ligne) ne bouge pas.
DO $c5$
DECLARE r jsonb; e record; i record; n_j integer;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 5;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490005', now() - interval '2 days');
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT count(*) INTO n_j FROM public.inventaire_journal
   WHERE inventaire_id = e.fiche AND source = 'releve_vinted' AND motif = 'commande_annulee';
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C5 après : plusieurs exemplaires — +1, copie vendue effacée, état d''annonce intact',
    'retiree ; exemplaire ; copie effacée ; stock ×4 ; active ; 1 ligne(s)',
    coalesce(r ->> 'action', '?') || ' ; ' || coalesce(r ->> 'fiche', '∅') || ' ; copie '
      || CASE WHEN EXISTS (SELECT 1 FROM public.inventaire WHERE id = e.copie) THEN 'présente' ELSE 'effacée' END
      || ' ; ' || i.statut || ' ×' || coalesce(i.quantite::text, '∅') || ' ; ' || coalesce(i.vinted_status, '∅') || ' ; ' || n_j || ' ligne(s)',
    coalesce(r ->> 'action' = 'retiree' AND r ->> 'fiche' = 'exemplaire' AND (r ->> 'copie_effacee')::bigint = e.copie
             AND NOT EXISTS (SELECT 1 FROM public.inventaire WHERE id = e.copie)
             AND i.statut = 'stock' AND i.quantite = 4 AND i.vinted_status = 'active' AND n_j = 1, false));
END
$c5$;

-- C6. Vente SAISIE (aucune preuve de la plateforme) : seulement signalée, rien touché.
DO $c6$
DECLARE r jsonb; e record; i record; n_j integer;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 6;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490006', now() - interval '2 days');
  SELECT * INTO i FROM public.inventaire WHERE id = e.fiche;
  SELECT count(*) INTO n_j FROM public.inventaire_journal
   WHERE inventaire_id = e.fiche AND source = 'releve_vinted' AND motif = 'commande_annulee';
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C6 après : vente saisie — signalée, vente et fiche intactes',
    'signalee ; vente présente ; vendu/sold ; 0 ligne(s) ; signalement 1',
    coalesce(r ->> 'action', '?') || ' ; vente ' || CASE WHEN EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente) THEN 'présente' ELSE 'effacée' END
      || ' ; ' || i.statut || '/' || coalesce(i.vinted_status, '∅') || ' ; ' || n_j || ' ligne(s) ; signalement '
      || (SELECT count(*) FROM public.usage_logs l WHERE l.user_id = i.user_id AND l.feature = 'vente_vinted_commande_annulee_signalee'
            AND l.metadata ->> 'vente' = e.vente::text),
    coalesce(r ->> 'action' = 'signalee' AND EXISTS (SELECT 1 FROM public.ventes WHERE id = e.vente)
             AND i.statut = 'vendu' AND i.vinted_status = 'sold' AND n_j = 0
             AND (SELECT count(*) FROM public.usage_logs l WHERE l.user_id = i.user_id AND l.feature = 'vente_vinted_commande_annulee_signalee'
                    AND l.metadata ->> 'vente' = e.vente::text) = 1, false));
END
$c6$;

-- C7. Rejeu de la même vente : introuvable, rien de plus.
DO $c7$
DECLARE r jsonb; e record; n_j integer;
BEGIN
  SELECT * INTO e FROM _essai WHERE n = 1;
  r := public.vente_commande_annulee_vinted(e.vente, 'failed', '9017101490001', now() - interval '2 days');
  SELECT count(*) INTO n_j FROM public.inventaire_journal
   WHERE inventaire_id = e.fiche AND source = 'releve_vinted' AND motif = 'commande_annulee';
  INSERT INTO _res (cas, attendu, obtenu, ok) VALUES (
    'C7 après : rejeu de la même vente', 'introuvable ; toujours 2 ligne(s)',
    coalesce(r ->> 'action', '?') || ' ; toujours ' || n_j || ' ligne(s)',
    coalesce(r ->> 'action' = 'introuvable' AND n_j = 2, false));
END
$c7$;

-- C8. La définition nouvelle est en place, et toujours fermée à l'app.
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C8 après : définition nouvelle (annonce + reçu), fermée à authenticated',
       'md5 ≠ 0dd6dc8a… ; reçus ; vinted_status ; authenticated sans EXECUTE',
       left(md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)), 8) || '… ; '
         || CASE WHEN position('''recus'', v_recus' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) > 0 THEN 'reçus' ELSE 'sans reçus' END || ' ; '
         || CASE WHEN position('''vinted_status'', v_vs' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) > 0 THEN 'vinted_status' ELSE 'sans vinted_status' END || ' ; '
         || CASE WHEN has_function_privilege('authenticated', 'public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)', 'EXECUTE') THEN 'authenticated AVEC EXECUTE' ELSE 'authenticated sans EXECUTE' END,
       md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) <> '0dd6dc8aedf022b9cd3226459f16a83e'
       AND position('''recus'', v_recus' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) > 0
       AND position('''vinted_status'', v_vs' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) > 0
       AND NOT has_function_privilege('authenticated', 'public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)', 'EXECUTE');

-- C9. Aucun mail, aucune note de vente ; journal et traces bornés aux fiches d'essai.
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C9 après : email_logs et push_ventes du compte de Nico inchangés (avant les données, puis avant la règle)',
       a.mails || ' mails / ' || a.notes || ' notes (avant données) ; ' || b.mails || ' / ' || b.notes || ' (avant règle)',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') || ' mails / '
         || (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') || ' notes',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') = a.mails
       AND (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') = a.notes
       AND a.mails = b.mails AND a.notes = b.notes
FROM _cpt a, _cpt b WHERE a.moment = 'avant_donnees' AND b.moment = 'apres_donnees';

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C9 après : lignes de journal « commande_annulee » écrites dans la transaction hors fiches d''essai', '0',
       count(*)::text, count(*) = 0
FROM public.inventaire_journal ij
WHERE ij.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND ij.created_at >= now()
  AND ij.source = 'releve_vinted' AND ij.motif = 'commande_annulee'
  AND NOT (ij.inventaire_id BETWEEN 9017101400000 AND 9017101400006);

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C9 après : traces vente_retiree / signalée écrites dans la transaction hors ventes d''essai', '0',
       count(*)::text, count(*) = 0
FROM public.usage_logs l
WHERE l.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND l.created_at >= now()
  AND l.feature IN ('vente_retiree', 'vente_vinted_commande_annulee_signalee')
  AND coalesce(l.metadata -> 'vente' ->> 'id', l.metadata ->> 'vente') NOT IN (SELECT vente::text FROM _essai);

SELECT ordre, cas, attendu, obtenu, ok FROM _res ORDER BY ordre;

ROLLBACK;
