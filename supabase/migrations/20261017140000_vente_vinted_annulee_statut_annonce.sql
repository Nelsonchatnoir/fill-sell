-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — UNE COMMANDE VINTED ANNULÉE FERME AUSSI L'ANNONCE DE LA FICHE, ET LE
-- REÇU EFFACÉ RESTE DANS LA TRACE (point 12, ventes Vinted annulées)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (lecture seule, 17/10) : vente_commande_annulee_vinted rend la fiche au
-- stock sans toucher inventaire.vinted_status — la fiche garde « sold » (annonce
-- vendue). Le 17/10 à 11:38, « closed » a été posé à la main sur les 4 fiches du lot
-- 144011-144014 de Louis (inventaire_journal, source claude_sql). Et la fonction
-- efface le reçu de la vente (ventes_operations) sans le garder : une réparation
-- inverse doit le reconstituer (même lot).
--
-- LA RÈGLE — le reste de la fonction ne bouge pas : ventes retirées et tracées
-- (ventes_supprimees, usage_logs), fiche au stock ou exemplaire rendu, job clos ou
-- republié, même interrupteur, même liste d'attente, aucun mail :
--   1. la fiche qui revient porte l'état d'annonce que le relevé du dressing écrit
--      (content-scripts/vinted.js : 'closed' = fermée sans vente, 'active' = en
--      ligne) : 'active' si un relevé a revu l'annonce en ligne APRÈS la vente,
--      'closed' sinon — seulement si la fiche porte CETTE annonce
--      (inventaire.vinted_item_id = ventes.annonce_id) et si la valeur change ;
--      tracé dans inventaire_journal (champ vinted_status, source releve_vinted,
--      motif commande_annulee), comme le statut ;
--   2. le dernier relevé de l'annonce est lu UNE fois : il décide du job et de
--      l'état d'annonce ;
--   3. le reçu effacé part dans la trace vente_retiree (clé 'recus').
-- ⚠️ Le dressing réécrit vinted_status à chaque relevé, et Vinted garde l'annonce
--    d'origine « sold » après une commande « failed » (4 cas sur 4 au 17/10) : sans
--    la migration 20261017141000 (garde du dressing), l'état posé ici ne tient que
--    jusqu'au relevé suivant (lot A de Louis repassé « vendu » le 17/10 à 01:18).
-- Corps de départ : pg_get_functiondef EN PROD le 17/10 à 14:05 — identique au corps
-- de la migration 20261015010000 ; md5 vérifié ci-dessous : la migration S'ARRÊTE
-- si la définition a bougé depuis. Seules les lignes de la règle changent.
--
-- Essai à blanc (ROLLBACK) : scripts/essais/20261017140000_essai.sql.
-- Inverse : supabase/rollbacks/20261017140000_vente_vinted_annulee_statut_annonce.sql.
-- ⛔ FEU VERT NOMMÉ DE NICO REQUIS. Application :
--   npx supabase db query --linked -f supabase/migrations/20261017140000_vente_vinted_annulee_statut_annonce.sql
--   npx supabase migration repair --linked --status applied 20261017140000
-- Selftests : scripts/vente-vinted-annulee-statut-selftest.mjs,
--             scripts/vente-vinted-annulee-selftest.mjs.

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

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

COMMIT;
