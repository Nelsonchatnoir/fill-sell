-- Essai à blanc de 20261024234000_vinted_annulee_remise_en_vente_hors_quota (réécrite, 24/10 soir) : ROLLBACK, rien n'est gardé.
--   npx supabase db query --linked -f scripts/essais/20261024234000_essai.sql
-- Le VRAI cas, joué DANS la transaction : la vente 274921 du short de Nico « annulée » → rien d'automatique, trois
-- remises PROPOSÉES (Vinted, Leboncoin, Beebs), la carte ; l'appui → à faire, hors quota ; le tick attend un relevé fait
-- après l'appui ; avec ce relevé (simulé), il crée les trois publications, aucune en double ; puis le vendeur qui l'a
-- remis en ligne lui-même (simulé) → « déjà en vente », rien de republié.
begin;
set local statement_timeout = '120s';
create temp table _r (essai text, ok boolean, detail text);

ALTER TABLE public.remises_en_vente ADD COLUMN IF NOT EXISTS accepte_le timestamptz;
ALTER TABLE public.remises_en_vente DROP CONSTRAINT IF EXISTS remises_en_vente_statut_check;
ALTER TABLE public.remises_en_vente ADD CONSTRAINT remises_en_vente_statut_check
  CHECK (statut = ANY (ARRAY['a_faire'::text, 'faite'::text, 'abandonnee'::text, 'proposee'::text]));

-- Le relevé qui prouve, après une annulation, que le vendeur n'a pas déjà remis l'article en ligne lui-même :
-- 'vu' (relevé complet fait depuis p_depuis), 'attendu', ou 'sans_releve' (ce compte n'a aucun relevé de cette
-- plateforme depuis 30 jours : les gardes d'avant s'appliquent seules).
CREATE OR REPLACE FUNCTION public.releve_apres_annulation(p_user uuid, p_platform text, p_depuis timestamptz)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text := CASE WHEN p_platform = 'vinted' THEN 'dressing' ELSE 'annonces' END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.platform = p_platform AND s.kind = v_kind
                    AND s.status = 'done' AND s.finished_at > now() - interval '30 days') THEN
    RETURN 'sans_releve';
  END IF;
  IF EXISTS (SELECT 1 FROM vinted_sync_runs s WHERE s.user_id = p_user AND s.platform = p_platform AND s.kind = v_kind
                AND s.status = 'done' AND s.finished_at > p_depuis
                AND (CASE WHEN v_kind = 'annonces' THEN public.releve_preuve_absence(s.id)
                          ELSE COALESCE(s.items_vus, 0) > 0 AND COALESCE(s.erreur, '') NOT LIKE '[incomplet]%'
                               AND (s.total_entries IS NULL OR s.items_vus >= s.total_entries) END)) THEN
    RETURN 'vu';
  END IF;
  RETURN 'attendu';
END;
$function$;
REVOKE ALL ON FUNCTION public.releve_apres_annulation(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- L'APPUI : « Remettre en vente » sur la carte « Vente annulée ». Remet en vente, d'un geste, l'article sur toutes les
-- plateformes proposées (Vinted et les copies retirées à cause de cette vente), hors quota ; demande les relevés qui
-- prouvent qu'il n'est pas déjà remis en ligne (sinon : rattaché, rien de republié).
CREATE OR REPLACE FUNCTION public.remettre_en_vente_apres_annulation(p_inventaire bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  i inventaire%ROWTYPE;
  v_pf text[];
  p text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'session requise'; END IF;
  SELECT * INTO i FROM inventaire WHERE id = p_inventaire AND user_id = v_user;
  IF i.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'fiche_inconnue'); END IF;
  IF i.fusionne_dans IS NOT NULL OR i.statut IS DISTINCT FROM 'stock' OR COALESCE(i.quantite, 1) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'motif', 'plus_en_stock');
  END IF;
  WITH m AS (
    UPDATE remises_en_vente r SET statut = 'a_faire', accepte_le = now(), prochain_essai = now(), motif = NULL, traite_le = NULL
     WHERE r.user_id = v_user AND r.inventaire_id = p_inventaire AND r.statut = 'proposee'
     RETURNING r.platform)
  SELECT array_agg(DISTINCT platform) INTO v_pf FROM m;
  IF v_pf IS NULL THEN RETURN jsonb_build_object('ok', false, 'motif', 'rien_a_remettre'); END IF;
  INSERT INTO usage_logs (user_id, feature, metadata)
  VALUES (v_user, 'remise_apres_annulation_acceptee', jsonb_build_object('inventaire_id', p_inventaire::text, 'plateformes', to_jsonb(v_pf)));
  FOREACH p IN ARRAY v_pf LOOP
    BEGIN
      IF p = 'vinted' THEN PERFORM public.demander_sync_dressing(); ELSE PERFORM public.demander_sync_plateforme(p); END IF;
    EXCEPTION WHEN OTHERS THEN NULL; -- un relevé refusé ne retient pas la remise : la garde du relevé attend, 3 jours au plus
    END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'plateformes', to_jsonb(v_pf));
END;
$function$;
REVOKE ALL ON FUNCTION public.remettre_en_vente_apres_annulation(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remettre_en_vente_apres_annulation(bigint) TO authenticated;

-- LA CARTE : les fiches du compte dont une vente annulée propose (ou fait) une remise en vente.
CREATE OR REPLACE FUNCTION public.ventes_annulees_a_remettre()
 RETURNS TABLE(inventaire_id bigint, titre text, photo text, plateformes text[], etat text, motif text, le timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.inventaire_id, max(i.titre), max(CASE WHEN jsonb_typeof(i.photos) = 'array' THEN i.photos ->> 0 END),
         array_agg(DISTINCT r.platform ORDER BY r.platform),
         CASE WHEN bool_or(r.statut = 'proposee') THEN 'proposee'
              WHEN bool_or(r.statut = 'a_faire') THEN 'en_cours'
              WHEN bool_or(r.statut = 'abandonnee' AND r.motif = 'deja_en_vente') THEN 'deja_en_vente'
              WHEN bool_and(r.statut = 'faite') THEN 'faite' ELSE 'abandonnee' END,
         max(r.motif), max(COALESCE(r.traite_le, r.accepte_le, r.cree_le))
    FROM remises_en_vente r
    JOIN cross_post_jobs j ON j.id = r.job_vendu AND COALESCE(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
    JOIN inventaire i ON i.id = r.inventaire_id AND i.user_id = r.user_id
   WHERE r.user_id = auth.uid()
     AND (r.statut IN ('proposee', 'a_faire') OR COALESCE(r.traite_le, r.cree_le) > now() - interval '24 hours')
   GROUP BY r.inventaire_id
$function$;
REVOKE ALL ON FUNCTION public.ventes_annulees_a_remettre() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventes_annulees_a_remettre() TO authenticated;

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
  v_copie record; v_copies integer := 0;      -- (18/10) les copies retirées à cause de cette vente
  v_propose_vinted boolean := false;          -- (24/10) l'annonce Vinted fermée : remise en vente PROPOSÉE
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
  -- (18/10, règle de Nico) UNE COMMANDE ÉCHOUÉE, ANNULÉE OU REMBOURSÉE N'EST JAMAIS
  -- UNE VENTE, quelle que soit sa date : seule une vente SAISIE à la main (ni relevé,
  -- ni annonce close « vendue » sur son numéro) reste, signalée une fois.
  IF NOT (coalesce(v.source, '') = 'releve' OR j.id IS NOT NULL) THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_vinted_commande_annulee_signalee'
                    AND u.metadata ->> 'vente' = v.id::text) THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_vinted_commande_annulee_signalee',
        jsonb_build_object('vente', v.id::text, 'commande', p_commande, 'statut', p_statut, 'titre', v.titre, 'prix_vente', v.prix_vente,
          'motif', 'vente_saisie_jamais_retiree'));
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
        -- (18/10) LES COPIES RETIRÉES À CAUSE DE CETTE VENTE REVIENNENT PAR LES JOBS
        -- NORMAUX : un retrait `deleted` d'une autre plateforme, armé par
        -- vente_article_serveur à l'instant de la vente (± 2 min), dont le dépôt est
        -- `cancelled` → une ligne remises_en_vente sur CE dépôt (marqué
        -- vente_annulee_remise) ; remises_en_vente_tick crée la publication avec ses
        -- gardes (déjà en vente, plafond, poste absent, pause, jamais un débit).
        FOR v_copie IN
          SELECT d.platform, p.id AS depot
            FROM cross_post_jobs d
            JOIN cross_post_jobs p ON p.id = nullif(d.platform_fields #>> '{arme_par,depot}', '')::uuid
           WHERE d.user_id = v.user_id AND d.inventaire_id = i.id AND d.action = 'delete' AND d.status = 'deleted'
             AND d.platform <> 'vinted'
             AND d.platform_fields #>> '{arme_par,chemin}' = 'vente_article_serveur'
             AND abs(extract(epoch FROM (nullif(d.platform_fields #>> '{arme_par,le}', '')::timestamptz - v.created_at))) <= 120
             AND p.user_id = v.user_id AND p.platform = d.platform AND p.status = 'cancelled'
             AND coalesce(p.action, 'publish') IN ('publish', 'republish')
          ORDER BY d.platform
        LOOP
          UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                 || jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', v.id, 'commande', p_commande, 'statut', p_statut, 'le', now()))
           WHERE id = v_copie.depot;
          -- (24/10 soir, décision de Nico) PROPOSÉE, jamais automatique : le vendeur a pu annuler parce que l'article
          -- n'est plus disponible, ou le remettre en ligne lui-même. La carte « Vente annulée — Remettre en vente ? »
          -- (remettre_en_vente_apres_annulation) la fait partir d'un appui.
          INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai, statut)
          VALUES (v.user_id, i.id, v_copie.platform, v_copie.depot, now(), 'proposee')
          ON CONFLICT (job_vendu) DO UPDATE
            SET statut = 'proposee', motif = NULL, prochain_essai = now(), traite_le = NULL, accepte_le = NULL
            WHERE remises_en_vente.statut <> 'faite';
          v_copies := v_copies + 1;
        END LOOP;
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
           jsonb_build_object('vente', v.id, 'commande', p_commande, 'statut_vinted', p_statut, 'copie_effacee', v_hist, 'copies_remises', v_copies));
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
      -- (24/10 soir, décision de Nico) Vinted NE remet PAS l'annonce d'origine en ligne (30 commandes annulées sur 30
      -- depuis le 16/10). Rien d'automatique : la remise en vente est PROPOSÉE (carte « Vente annulée — Remettre en
      -- vente ? »), pour une fiche d'un exemplaire revenue au stock ; plusieurs exemplaires : inchangé.
      UPDATE cross_post_jobs SET status = 'cancelled',
             error = CASE WHEN v_rendue = 'fiche'
                          THEN 'Commande Vinted annulée : l''article est revenu dans ton stock. Remets-le en vente d''un appui dans FillSell (carte « Vente annulée »).'
                          ELSE 'Commande Vinted annulée : l''article est revenu dans ton stock. L''annonce Vinted reste fermée : remets-le en vente quand tu veux.' END,
             platform_fields = coalesce(platform_fields, '{}'::jsonb)
               || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'commande', p_commande, 'statut', p_statut,
                                     'vente', v.id, 'annonce', 'fermee'))
               || CASE WHEN v_rendue = 'fiche'
                       THEN jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', v.id, 'commande', p_commande,
                                               'statut', p_statut, 'le', now(), 'plateforme', 'vinted'))
                       ELSE '{}'::jsonb END
       WHERE id = j.id AND status = 'sold';
      IF FOUND AND v_rendue = 'fiche' AND v.inventaire_id IS NOT NULL THEN
        INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai, statut)
        VALUES (v.user_id, v.inventaire_id, 'vinted', j.id, now(), 'proposee')
        ON CONFLICT (job_vendu) DO UPDATE
          SET statut = 'proposee', motif = NULL, prochain_essai = now(), traite_le = NULL, accepte_le = NULL
          WHERE remises_en_vente.statut <> 'faite';
        v_propose_vinted := true;
      END IF;
      v_job := 'close';
    END IF;
  END IF;
  RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'copie_effacee', v_hist, 'job', v_job, 'vinted_status', v_vs,
                            'copies_proposees', v_copies, 'remise_vinted_proposee', v_propose_vinted);
END;
$function$;

REVOKE ALL ON FUNCTION public.vente_commande_annulee_vinted(bigint, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vente_transaction_annulee_leboncoin(p_vente bigint, p_motif text DEFAULT 'transaction_annulee'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v ventes%ROWTYPE; i inventaire%ROWTYPE; j cross_post_jobs%ROWTYPE;
  v_rendue text := NULL; v_recus jsonb := NULL; v_q integer;
  v_copie record; v_copies integer := 0; v_arretes integer := 0; v_en_cours integer := 0;
BEGIN
  SELECT * INTO v FROM ventes WHERE id = p_vente;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'introuvable'); END IF;
  IF v.plateforme_code IS DISTINCT FROM 'leboncoin' OR v.annonce_id IS NULL THEN RETURN jsonb_build_object('action', 'hors_sujet'); END IF;
  -- Mêmes interrupteur et liste d'attente que les commandes annulées (09/10, 17/10).
  IF coalesce((SELECT value FROM coin_config WHERE key = 'ventes_annulees_retrait_pause'), 0) = 1 THEN
    RETURN jsonb_build_object('action', 'en_pause');
  END IF;
  IF EXISTS (SELECT 1 FROM ventes_annulees_attente_go g WHERE g.vente_id = v.id AND g.decision IS NULL) THEN
    RETURN jsonb_build_object('action', 'en_attente_go');
  END IF;
  -- La preuve : l'annonce FillSell close « vendue » sur CE numéro PAR la transaction Leboncoin.
  SELECT * INTO j FROM cross_post_jobs c
   WHERE c.user_id = v.user_id AND c.platform = 'leboncoin' AND c.status = 'sold'
     AND c.action IN ('publish', 'republish') AND btrim(coalesce(c.platform_listing_id, '')) = v.annonce_id
     AND c.platform_fields #>> '{sale_evidence,source}' = 'transaction_leboncoin'
   ORDER BY c.sold_at DESC NULLS LAST LIMIT 1;
  -- Une vente SAISIE (ou née d'un autre chemin) n'est jamais retirée : signalée une fois.
  IF j.id IS NULL OR NOT EXISTS (SELECT 1 FROM ventes_operations o WHERE o.user_id = v.user_id
                                   AND o.cle = 'annonce:leboncoin:' || v.annonce_id AND o.resultat -> 'ventes_ids' @> to_jsonb(ARRAY[v.id])) THEN
    IF NOT EXISTS (SELECT 1 FROM usage_logs u WHERE u.user_id = v.user_id AND u.feature = 'vente_leboncoin_transaction'
                    AND u.metadata ->> 'vente' = v.id::text AND u.metadata ->> 'issue' = 'annulation_vente_saisie_signalee') THEN
      INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_leboncoin_transaction',
        jsonb_build_object('vente', v.id::text, 'annonce', v.annonce_id, 'titre', v.titre, 'prix_vente', v.prix_vente,
          'issue', 'annulation_vente_saisie_signalee'));
    END IF;
    RETURN jsonb_build_object('action', 'signalee');
  END IF;
  IF v.inventaire_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v.user_id::text || ':' || v.inventaire_id::text, 0));
  END IF;
  INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif)
  VALUES (v.user_id, 'leboncoin', v.commande_ref, v.annonce_id, v.titre, v.prix_vente, v.vendu_le, v.id, now(),
          'releve_leboncoin', left(coalesce(p_motif, 'transaction_annulee'), 60));
  SELECT jsonb_agg(to_jsonb(o)) INTO v_recus FROM ventes_operations o
   WHERE o.user_id = v.user_id AND o.cle = 'annonce:leboncoin:' || v.annonce_id;
  INSERT INTO usage_logs (user_id, feature, metadata) VALUES (v.user_id, 'vente_retiree',
    jsonb_build_object('vente', to_jsonb(v), 'source', 'releve_leboncoin', 'motif', coalesce(p_motif, 'transaction_annulee'), 'recus', v_recus));
  DELETE FROM ventes WHERE id = v.id;
  DELETE FROM ventes_operations o WHERE o.user_id = v.user_id AND o.cle = 'annonce:leboncoin:' || v.annonce_id;

  v_q := greatest(coalesce(v.quantite, 1), 1);
  IF v.inventaire_id IS NOT NULL THEN
    SELECT * INTO i FROM inventaire WHERE id = v.inventaire_id AND user_id = v.user_id FOR UPDATE;
    IF i.id IS NOT NULL AND i.fusionne_dans IS NULL AND i.statut = 'vendu'
       AND NOT EXISTS (SELECT 1 FROM ventes x WHERE x.user_id = v.user_id AND x.inventaire_id = i.id) THEN
      UPDATE remises_en_vente SET statut = 'abandonnee', motif = 'transaction_annulee', traite_le = now()
       WHERE user_id = v.user_id AND inventaire_id = i.id AND statut = 'a_faire';
      UPDATE inventaire SET statut = 'stock', quantite = v_q WHERE id = i.id AND statut = 'vendu';
      v_rendue := 'fiche';
      -- Les retraits armés par CETTE vente (même instant, ± 2 min) :
      --   · encore en file (pending / needs_user) → arrêtés : l'annonce est restée en ligne, rien à remettre ;
      --   · déjà faits (deleted), dépôt clos → remise en vente par la file remises_en_vente (ses gardes) ;
      --   · en cours chez l'extension (processing) → comptés, la remise suivra au prochain achat annulé lu.
      FOR v_copie IN
        SELECT d.id AS retrait, d.status, d.platform, p.id AS depot, p.status AS depot_statut
          FROM cross_post_jobs d
          LEFT JOIN cross_post_jobs p ON p.id = nullif(d.platform_fields #>> '{arme_par,depot}', '')::uuid
         WHERE d.user_id = v.user_id AND d.inventaire_id = i.id AND d.action = 'delete'
           AND d.platform <> 'leboncoin'
           AND d.platform_fields #>> '{arme_par,chemin}' IN ('vente_article_serveur', 'vente_copie_prouvee')
           AND abs(extract(epoch FROM (nullif(d.platform_fields #>> '{arme_par,le}', '')::timestamptz - v.created_at))) <= 120
         ORDER BY d.platform
      LOOP
        IF v_copie.status IN ('pending', 'needs_user') THEN
          UPDATE cross_post_jobs SET status = 'cancelled',
                 error = 'Achat Leboncoin annulé : l''article est revenu dans ton stock, cette annonce reste en ligne.',
                 platform_fields = coalesce(platform_fields, '{}'::jsonb)
                   || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'source', 'transaction_leboncoin'))
           WHERE id = v_copie.retrait AND status IN ('pending', 'needs_user');
          IF FOUND THEN v_arretes := v_arretes + 1; END IF;
        ELSIF v_copie.status = 'deleted' AND v_copie.depot IS NOT NULL AND v_copie.depot_statut = 'cancelled' THEN
          UPDATE cross_post_jobs SET platform_fields = coalesce(platform_fields, '{}'::jsonb)
                 || jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', v.id, 'source', 'transaction_leboncoin', 'le', now()))
           WHERE id = v_copie.depot;
          -- (24/10 soir, décision de Nico) PROPOSÉE, jamais automatique : le vendeur a pu annuler parce que l'article
          -- n'est plus disponible, ou le remettre en ligne lui-même. La carte « Vente annulée — Remettre en vente ? »
          -- (remettre_en_vente_apres_annulation) la fait partir d'un appui.
          INSERT INTO remises_en_vente (user_id, inventaire_id, platform, job_vendu, prochain_essai, statut)
          VALUES (v.user_id, i.id, v_copie.platform, v_copie.depot, now(), 'proposee')
          ON CONFLICT (job_vendu) DO UPDATE
            SET statut = 'proposee', motif = NULL, prochain_essai = now(), traite_le = NULL, accepte_le = NULL
            WHERE remises_en_vente.statut <> 'faite';
          v_copies := v_copies + 1;
        ELSIF v_copie.status = 'processing' THEN
          v_en_cours := v_en_cours + 1;
        END IF;
      END LOOP;
      INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail) VALUES
        (v.user_id, i.id, 'statut', i.statut, 'stock', 'releve_leboncoin', 'transaction_annulee',
         jsonb_build_object('vente', v.id, 'annonce', v.annonce_id, 'retraits_arretes', v_arretes, 'copies_remises', v_copies,
                            'retraits_en_cours', v_en_cours));
    END IF;
  END IF;
  -- L'annonce Leboncoin a été relue EN LIGNE sans transaction : son job redevient « publié ».
  UPDATE cross_post_jobs SET status = 'published', sold_at = NULL,
         platform_fields = (coalesce(platform_fields, '{}'::jsonb)
           - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'detected_price', 'vente_operation_cle'])
           || jsonb_build_object('vente_annulee', jsonb_build_object('le', now(), 'vente', v.id, 'annonce', 'en_ligne',
                                 'source', 'transaction_leboncoin', 'preuve', platform_fields -> 'sale_evidence'))
   WHERE id = j.id AND status = 'sold';
  RETURN jsonb_build_object('action', 'retiree', 'fiche', v_rendue, 'job', j.id, 'retraits_arretes', v_arretes,
                            'copies_remises', v_copies, 'retraits_en_cours', v_en_cours);
END;
$function$;

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
  v_annul boolean; v_restant integer;   -- (18/10) copie retirée à cause d'une vente annulée
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
    -- (18/10) Le dépôt `cancelled` d'une copie retirée à cause d'une vente Vinted
    -- annulée (vente_commande_annulee_vinted) : pas de reçu, le restant est la
    -- quantité de la fiche ; toutes les autres gardes s'appliquent.
    v_annul := (j.id IS NOT NULL AND j.status = 'cancelled' AND (COALESCE(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'));
    v_restant := CASE WHEN v_annul THEN COALESCE(i.quantite, 1) ELSE NULLIF(v_op->>'restant', '')::integer END;

    IF j.id IS NULL OR (j.status <> 'sold' AND NOT v_annul) THEN
      v_motif := 'annonce_plus_vendue';            -- vente annulée, job revenu
    ELSIF NOT v_annul AND (v_op IS NULL OR (v_op->>'ok') IS DISTINCT FROM 'true') THEN
      v_motif := 'vente_non_enregistree';          -- signal sans reçu : on ne sait pas
    ELSIF NOT v_annul AND COALESCE(NULLIF(v_op->>'restant', '')::integer, 0) <= 0 THEN
      v_motif := 'plus_de_stock';                  -- dernière unité : rien à remettre
    ELSIF i.id IS NULL OR i.fusionne_dans IS NOT NULL THEN
      v_motif := 'fiche_absente';
    ELSIF i.statut = 'vendu' OR COALESCE(i.quantite, 1) <= 0 THEN
      v_motif := 'plus_de_stock';
    -- (24/10 soir, décision de Nico) Après une vente ANNULÉE, jamais de doublon : le vendeur a pu remettre l'article en
    -- ligne lui-même. La remise attend un relevé COMPLET de la plateforme fait après l'annulation et au plus tôt
    -- 15 min avant l'appui (demandé par l'appui) ; ce relevé rattache l'annonce remise en ligne, et « déjà en vente »
    -- l'écarte plus bas. Un compte sans aucun relevé de cette plateforme garde les gardes d'avant. 3 jours au plus.
    ELSIF v_annul AND public.releve_apres_annulation(r.user_id, r.platform,
            GREATEST(COALESCE(NULLIF(j.platform_fields #>> '{vente_annulee_remise,le}', '')::timestamptz, r.cree_le),
                     COALESCE(r.accepte_le, r.cree_le) - interval '15 minutes')) = 'attendu' THEN
      v_motif := 'releve_attendu';
      v_report := CASE WHEN COALESCE(r.accepte_le, r.cree_le) < now() - interval '3 days' THEN NULL
                       ELSE now() + interval '20 minutes' END;
    ELSIF r.platform NOT IN ('vinted', 'beebs', 'opla', 'leboncoin', 'ebay', 'depop') THEN
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
    -- (09/10 soir, Louis) Plus de branche « jumeau_en_ligne » : l'annonce
    -- d'une AUTRE fiche ne retient jamais la remise en vente de celle-ci
    -- (migration 20261009233000). « deja_en_vente » (CETTE fiche) reste.
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
    -- (24/10 soir) Une remise après une vente ANNULÉE est hors quota : c'est l'état d'avant la vente, pas une publication voulue.
    IF v_motif IS NULL AND NOT v_annul THEN
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
                                     'restant', v_restant, 'apres_annulation', v_annul, 'le', now()))
                || CASE WHEN v_annul THEN jsonb_build_object('hors_quota', true) ELSE '{}'::jsonb END)
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
        'restant', v_restant, 'apres_annulation', v_annul));
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

CREATE OR REPLACE FUNCTION public.remise_en_vente_place(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_palier text := COALESCE(republish_palier(p_user), 'free');
  v_quota integer; v_depuis timestamptz; v_faits integer;
  v_qfree jsonb;
BEGIN
  -- (24/10, décision de Nico) PLUS DE PLAFOND PAR JOUR, pour aucun palier : seule la limite du mois ferme la place.
  IF v_palier = 'free' THEN
    -- (05/10) 50 PAR MOIS : le compteur partagé ; épuisé, on reprend à la
    -- remise à zéro (jamais un abandon : le mois suivant rouvre la place).
    v_qfree := quota_republication_free_etat(p_user);
    IF (v_qfree ->> 'plafond') IS NOT NULL AND (v_qfree ->> 'restantes')::integer <= 0 THEN
      RETURN jsonb_build_object('place', false, 'motif', 'quota_du_mois',
        'palier', v_palier, 'plafond', (v_qfree ->> 'plafond')::integer,
        'faits', (v_qfree ->> 'faites')::integer,
        'reprise', GREATEST(COALESCE((v_qfree ->> 'remise_le')::timestamptz, now() + interval '1 day'),
                            now() + interval '1 hour'));
    END IF;
  ELSIF v_palier IN ('premium', 'pro') THEN
    SELECT NULLIF(value, 0) INTO v_quota FROM coin_config WHERE key = 'quota_republication_' || v_palier;
    v_depuis := debut_cycle_quotas(p_user);
  END IF;
  IF v_quota IS NOT NULL AND v_depuis IS NOT NULL THEN
    SELECT (SELECT count(*) FROM cross_post_jobs c
             WHERE c.user_id = p_user AND c.action = 'republish' AND c.created_at >= v_depuis
               AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ?| ARRAY['opla_sortie', 'hors_quota']))
         + (SELECT count(*) FROM remises_en_vente r
             WHERE r.user_id = p_user AND r.statut = 'faite' AND r.traite_le >= v_depuis
               -- (24/10 soir) une remise après une vente ANNULÉE est hors quota
               AND NOT EXISTS (SELECT 1 FROM cross_post_jobs jv WHERE jv.id = r.job_vendu
                                AND COALESCE(jv.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'))
      INTO v_faits;
    IF v_faits >= v_quota THEN
      RETURN jsonb_build_object('place', false,
        'motif', 'quota_du_mois',
        'palier', v_palier, 'plafond', v_quota, 'faits', v_faits,
        'reprise', now() + interval '1 day');
    END IF;
  END IF;
  RETURN jsonb_build_object('place', true, 'palier', v_palier);
END;
$function$;

create temp table _b as select public.vente_commande_annulee_vinted(274921, 'failed', '23532974658') r;
insert into _r select 'B1 vente retirée, fiche au stock, Vinted + 2 copies PROPOSÉES (rien d''automatique)',
  r ->> 'action' = 'retiree' and r ->> 'fiche' = 'fiche' and (r ->> 'remise_vinted_proposee')::boolean and (r ->> 'copies_proposees')::int = 2, r::text from _b;
insert into _r select 'B2 aucune remise « à faire » : toutes « proposee »', count(*) filter (where statut = 'proposee') = 3 and count(*) filter (where statut = 'a_faire') = 0,
  string_agg(platform || ':' || statut, ',' order by platform) from remises_en_vente where inventaire_id = 1785871917724004;
create temp table _t0 as select public.remises_en_vente_tick(20, 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) r;
insert into _r select 'B3 le tick ne fait RIEN tant que Nico n''a pas appuyé', coalesce((r ->> 'faites')::int, 0) = 0, r::text from _t0;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
create temp table _carte as select * from public.ventes_annulees_a_remettre();
insert into _r select 'B4 la carte « Vente annulée » montre le short, trois plateformes', count(*) = 1 and bool_and(etat = 'proposee' and plateformes @> array['beebs','leboncoin','vinted']),
  string_agg(titre || ' · ' || array_to_string(plateformes, ',') || ' · ' || etat, ' ; ') from _carte where inventaire_id = 1785871917724004;
create temp table _appui as select public.remettre_en_vente_apres_annulation(1785871917724004) r;
insert into _r select 'B5 un appui : les trois passent « à faire »', (r ->> 'ok')::boolean and jsonb_array_length(r -> 'plateformes') = 3, r::text from _appui;
select set_config('request.jwt.claims', '', true);
-- Le relevé d'après l'appui n'est pas encore fait : rien ne part (Vinted et Leboncoin ont des relevés récents chez Nico).
create temp table _t1 as select public.remises_en_vente_tick(20, 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) r;
insert into _r select 'B6 sans relevé fait après l''appui : rien publié, « relevé attendu »',
  (select count(*) from cross_post_jobs where inventaire_id = 1785871917724004 and status = 'pending' and action = 'publish') = 0,
  (select string_agg(platform || ':' || coalesce(motif, '-'), ',' order by platform) from remises_en_vente where inventaire_id = 1785871917724004) from _t1;
-- Le vendeur l'a remis en ligne LUI-MÊME sur Vinted (simulé : le relevé du dressing a rattaché sa nouvelle annonce).
update inventaire set vinted_item_id = 'ESSAI-REMISE-PAR-LE-VENDEUR', vinted_status = 'active' where id = 1785871917724004;
-- Les relevés faits après l'appui (simulés : un run complet par plateforme ; gardes des runs coupées le temps de l'insert).
set local session_replication_role = replica;
insert into vinted_sync_runs (user_id, kind, platform, status, started_at, finished_at, items_vus, total_entries, declencheur)
select 'f44b5917-bccc-4431-ba41-f40571a2ed18', k, p, 'done', now() - interval '1 minute', now() + interval '1 second', 10, 10, 'essai'
  from (values ('dressing', 'vinted'), ('annonces', 'leboncoin'), ('annonces', 'beebs')) v(k, p);
set local session_replication_role = origin;
update remises_en_vente set prochain_essai = now() - interval '1 second' where inventaire_id = 1785871917724004 and statut = 'a_faire';
create temp table _t2 as select public.remises_en_vente_tick(20, 'f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) r;
insert into _r select 'B7 relevés faits : Leboncoin et Beebs repartent (hors quota), une seule fois chacune',
  (select count(*) from cross_post_jobs where inventaire_id = 1785871917724004 and status = 'pending' and action = 'publish'
     and platform in ('leboncoin', 'beebs') and platform_fields ->> 'hors_quota' = 'true') = 2
  and (select max(c) from (select count(*) c from cross_post_jobs where inventaire_id = 1785871917724004 and status = 'pending' and action = 'publish' group by platform) x) = 1,
  (select r::text from _t2);
insert into _r select 'B7b Vinted : remis en ligne par le vendeur → rattaché, RIEN republié (jamais de doublon)',
  (select count(*) from cross_post_jobs where inventaire_id = 1785871917724004 and status = 'pending' and action = 'publish' and platform = 'vinted') = 0
  and (select statut || ':' || coalesce(motif, '-') from remises_en_vente where inventaire_id = 1785871917724004 and platform = 'vinted') = 'abandonnee:deja_en_vente',
  (select statut || ':' || coalesce(motif, '-') from remises_en_vente where inventaire_id = 1785871917724004 and platform = 'vinted');
insert into _r select 'B8 retrait eBay arrêté (règle du 25/09), annonce eBay intacte',
  (select status from cross_post_jobs where id::text like '3eb39e5b%') = 'cancelled'
  and (select status from cross_post_jobs where id = '44582011-ceca-4d55-a5a0-553f0ddd7d25') = 'published', '';
insert into _r select 'B9 quota du mois : non entamé par ces remises', (remise_en_vente_place('f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid) ->> 'place')::boolean, '';
select essai, ok, left(detail, 300) detail from _r order by essai;
rollback;
