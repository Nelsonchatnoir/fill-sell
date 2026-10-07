-- ═══════════════════════════════════════════════════════════════════════════
-- UNE synchro de vérification pour Corinne (771ac4d9) — 08/10 nuit, mandat de
-- Nico (« une seule synchro de vérification, pas des relances en boucle »).
-- ═══════════════════════════════════════════════════════════════════════════
-- L'équivalent SERVEUR du bouton « Synchroniser » distant de l'app : un relevé
-- par plateforme connectée chez elle (dressing Vinted, Leboncoin, Beebs — pas
-- d'eBay ni d'Opla sur son compte), déclencheur 'bouton_distant' (un GESTE :
-- les imports sont permis, règle du 05/10), jamais doublé (un relevé déjà en
-- file ou en cours est gardé), jamais relancé. Exactement ce que font
-- demander_sync_dressing() et demander_sync_plateforme(), sans auth.uid().
-- Son extension (0.6.102) est hors ligne depuis le 07/10 12:10 UTC : les relevés
-- partiront à son retour ; passé 6 h sans extension, purger_sync_queue_perimee
-- les expire (comportement normal, déjà vu le 07/10 13:32 → 19:33).
-- Lecture seule sur ses plateformes : un relevé lit, il n'écrit rien chez Vinted,
-- Leboncoin ni Beebs. Inverse : UPDATE vinted_sync_runs SET status='expired'
-- WHERE user_id=… AND declencheur='bouton_distant' AND status='queued'.

DO $$
DECLARE
  v_user uuid := '771ac4d9-727c-4f68-bd8c-f4c7e8056a03';
  v_pf   text;
BEGIN
  PERFORM purger_sync_queue_perimee(v_user);
  IF NOT EXISTS (SELECT 1 FROM vinted_sync_runs
                  WHERE user_id = v_user AND kind = 'dressing' AND status IN ('queued', 'running')) THEN
    INSERT INTO vinted_sync_runs (user_id, kind, status, declencheur, queued_at)
    VALUES (v_user, 'dressing', 'queued', 'bouton_distant', now());
  END IF;
  FOREACH v_pf IN ARRAY ARRAY['leboncoin', 'beebs'] LOOP
    IF plateforme_ecartee_pour(v_user, v_pf) THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM vinted_sync_runs
                    WHERE user_id = v_user AND kind = 'annonces' AND platform = v_pf AND status IN ('queued', 'running')) THEN
      INSERT INTO vinted_sync_runs (user_id, kind, platform, status, declencheur, queued_at)
      VALUES (v_user, 'annonces', v_pf, 'queued', 'bouton_distant', now());
    END IF;
  END LOOP;
  PERFORM rapprochement_demander(v_user, 'bouton_distant');
END $$;

SELECT platform, kind, status, declencheur, queued_at
  FROM vinted_sync_runs
 WHERE user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03' AND status IN ('queued', 'running')
 ORDER BY queued_at;
SELECT etat, demande_le, bilan ->> 'motif' AS motif
  FROM rapprochement_comptes
 WHERE user_id = '771ac4d9-727c-4f68-bd8c-f4c7e8056a03';
