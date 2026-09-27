-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE (audit synchro, 27/09/2026) — LES ANNONCES EN LIGNE RESTÉES HORS
-- DU STOCK Y ENTRENT, AVEC LEUR QUESTION
-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉREQUIS : 20260927210000_releve_tout_importer_la_ressemblance_se_demande
-- (rapprocher_importer qui importe ET pose la question).
--
-- MESURÉ le 27/09 au soir : 888 annonces EN LIGNE, vues par le DERNIER relevé
-- complet de leur compte, sans fiche — Opla 572 (13 comptes), Leboncoin 139
-- (20), eBay 96 (13), Beebs 81 (6) ; 824 portent une proposition (retenues en
-- attente d'une réponse), 64 aucune (orphelines : fiche disparue, relevé
-- arrêté au budget).
--
-- CE QUE ÇA FAIT, annonce par annonce (rapprocher_importer, par 'auto') :
--   · crée la fiche (origine releve_<plateforme>, photos et champs du relevé),
--     et le suivi publié qui porte l'annonce ;
--   · si une fiche lui ressemble (homonyme en stock ou VENDU, proposition du
--     moteur, titre inclus) : pose la question « Est-ce le même article ? »
--     (écran Doublons). Rien n'est rattaché, rien n'est fusionné, rien n'est
--     retiré, aucun mail.
-- CE QUI EST EXCLU : annonce disparue, ignorée, pas « en_ligne », fiche
-- supprimée exprès par la personne (fiche_supprimee_le — 157 chez
-- van-breugel.sandra, décision à part), relevé hors de « Mes annonces »,
-- lien de notification, annonce qui a un RETRAIT en cours (labouquinerie85 :
-- 6 retraits lancés par elle le 27/09 à 18:19-18:22), annonce non revue par le
-- dernier relevé complet de son compte.
-- Interrupteur import_auto_ouvert fermé (≠ 1) → rien.
--
-- À RELANCER jusqu'à « reste 0 » : chaque passage traite ce qu'il peut en 40 s
-- (les gros comptes coûtent ~1 s par annonce) ; une annonce importée n'est
-- plus éligible, donc aucun doublon possible entre deux passages.
-- Idempotent. Aucune écriture hors du chemin d'import existant.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE IF NOT EXISTS rattrapage_2709_bilan (importees int, questions int, refusees int, duree_ms int);

DO $rattrapage$
DECLARE
  r record; v jsonb;
  n_ok integer := 0; n_q integer := 0; n_ko integer := 0;
  v_debut timestamptz := clock_timestamp();
BEGIN
  IF COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) <> 1 THEN
    INSERT INTO rattrapage_2709_bilan VALUES (0, 0, 0, 0);
    RETURN;
  END IF;
  FOR r IN
    WITH dern AS (
      SELECT DISTINCT ON (s.user_id, s.platform) s.user_id, s.platform, s.started_at
        FROM vinted_sync_runs s
       WHERE s.platform IN ('leboncoin', 'ebay', 'beebs', 'opla') AND s.kind = 'annonces' AND s.status = 'done'
         AND COALESCE(s.erreur, '') NOT LIKE '[incomplet]%' AND NOT releve_hors_liste(s.erreur)
         AND COALESCE(s.items_vus, 0) > 0
       ORDER BY s.user_id, s.platform, s.started_at DESC)
    SELECT a.id, a.user_id
      FROM annonces_plateforme a JOIN dern d ON d.user_id = a.user_id AND d.platform = a.platform
     WHERE a.inventaire_id IS NULL AND a.ignoree_le IS NULL AND a.disparu_le IS NULL
       AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL
       AND a.vu_le >= d.started_at - interval '1 minute'
       AND NOT releve_run_hors_liste(a.run_id) AND NOT annonce_lien_notification(a.url)
       AND NOT EXISTS (SELECT 1 FROM cross_post_jobs x
                        WHERE x.user_id = a.user_id AND x.platform = a.platform AND x.action = 'delete'
                          AND x.status IN ('pending', 'processing', 'needs_user')
                          AND (x.platform_listing_id = a.listing_id OR position(a.listing_id IN COALESCE(x.listing_url, '')) > 0))
     ORDER BY a.user_id, a.vu_le
  LOOP
    EXIT WHEN clock_timestamp() - v_debut > interval '40 seconds';
    v := rapprocher_importer(r.user_id, r.id, 'auto');
    IF COALESCE((v ->> 'ok')::boolean, false) THEN
      n_ok := n_ok + 1;
      IF COALESCE((v -> 'question' ->> 'posee')::boolean, false) THEN n_q := n_q + 1; END IF;
    ELSE
      n_ko := n_ko + 1;
    END IF;
  END LOOP;
  INSERT INTO rattrapage_2709_bilan
  VALUES (n_ok, n_q, n_ko, round(extract(epoch FROM clock_timestamp() - v_debut) * 1000)::int);
END
$rattrapage$;

-- Les 4 alertes « plus en ligne » eBay PROUVÉES FAUSSES le 27/09 vers 20:00
-- (page publique de l'annonce : en vente, bouton d'achat présent) :
-- ericsaint-georges ×3 (alertes posées à 15:34 et 16:12, pendant la panne de
-- la base), misscat801 ×1 (23/09, une seule lecture). Les 84 autres alertes
-- ouvertes ont été vérifiées VRAIES (terminées, vendues, désactivées, 404) et
-- restent telles quelles. Idempotent : seulement si l'alerte est encore là.
UPDATE cross_post_jobs
   SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price',
                                                 'alerte_masquee_pour', 'alerte_masquee_le'])
       || jsonb_build_object('revue_en_ligne_par_verification', jsonb_build_object(
            'at', now(), 'par', 'audit_2709', 'preuve', 'page publique eBay en vente le 27/09 vers 20:00'))
 WHERE id IN ('3bfff09a-7116-4e49-8e46-8bf2137f70e4', '31915e4d-18dc-4fc4-82e0-ed8adcc07393',
              'fec75b86-7189-41ab-af8f-65988ed75a2f', 'd5f49f27-67f8-421c-bf68-667445feb643')
   AND status = 'published' AND platform_fields ? 'unavailable_since';

SELECT (SELECT row_to_json(b) FROM rattrapage_2709_bilan b ORDER BY duree_ms DESC LIMIT 1) AS ce_passage;
