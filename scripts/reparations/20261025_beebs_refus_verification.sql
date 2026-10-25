-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 25/10 (N11) — DÉPÔTS BEEBS REFUSÉS PAR LA VÉRIFICATION, RESTÉS « PUBLIÉS ». ÉCRIT, NON LANCÉ.
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle corrigée pour tous (handler-watch, _shared/beebs-sortie-verification.js) : un dépôt Beebs vu « en cours de
-- vérification » (lecture « Mes annonces » juste après le clic), puis absent de cet onglet (lu en entier, même
-- compte), jamais vu en ligne, et toujours absent 7 jours après d'une lecture qui voit TOUT « en ligne » = refusé
-- par la vérification Beebs. 7 jours et pas 30 minutes : mesuré le 25/10 sur 31 jours (1 452 dépôts lus), 18 dépôts
-- sortis de la vérification sans être en ligne le sont devenus 48 à 126 h plus tard ; à 7 jours, 0 faux refus sur
-- 1 293 dépôts vus en ligne. Le passage de handler-watch (toutes les 15 min) les trancherait seul une fois déployé ;
-- ce script tranche MAINTENANT les 4 que la règle prouve aujourd'hui (verdicts calculés par le module, lecture du
-- 25/10 matin) :
--   · 6a38d0b6 XEWER (republication, n° 34140079, 9,99 €) : déposée le 09/10 19:57, sortie de la vérification à
--     20:09, absente des lectures complètes jusqu'au 17/10 — l'ancienne annonce 34065986 avait été retirée ;
--   · 99571727 XEWER (n° 34099938, 4,90 €) : déposée le 03/10 16:11, sortie à 17:32, absente le 10/10 ;
--   · 1fc35133 Alizee (n° 34138428, 4 €) : déposée le 09/10 15:39, sortie le 10/10 13:30, absente le 24/10 ;
--   · f8054ba8 Alizee (n° 34138371, 5 €) : déposée le 09/10 15:33, sortie à 15:36, absente le 24/10.
-- Chaque job : « failed », message vrai (refusée, motif inconnu, rien en ligne ni vendu, ne compte pas dans les
-- limites, jamais à l'identique), marqueur refus_verification_beebs, signaux de vente et « pas encore visible »
-- retirés. Aucun quota à rendre : les trois publications n'ont pas de réservation (reservation_id nul :
-- refund_publish_unconfirmed rendrait « sans_reservation ») et la republication n'a rien débité (pepites_debitees 0)
-- — gardé ici (RAISE si ce n'est plus vrai). Rien n'est envoyé à Beebs ; aucun mail ; aucune annonce touchée.
-- Garde : chaque job encore « publié », jamais vu en ligne (veille), aucune ligne de relevé (run_id) « en_ligne » ou
-- « vendue » pour son numéro, pas déjà tranché. Sauvegarde : _backup_2510_beebs_refus_verification (RLS, aucun droit).
-- Inverse : 20261025_beebs_refus_verification_INVERSE.sql. Essai à blanc : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2510_beebs_refus_verification AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2510_beebs_refus_verification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2510_beebs_refus_verification FROM PUBLIC, anon, authenticated;

CREATE TEMP TABLE _refus_2510 (id uuid PRIMARY KEY, user_id uuid, action text, numero text, sortie timestamptz, derniere_vue timestamptz,
  confirmee timestamptz, message text) ON COMMIT DROP;
INSERT INTO _refus_2510 VALUES
 ('6a38d0b6-ac74-4650-af2c-5454f3d86b4f', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', 'republish', '34140079',
  '2026-10-09T18:09:37.603Z', '2026-10-09T17:57:23.438Z', '2026-10-17T16:47:28.487Z',
  'Beebs a refusé la nouvelle annonce à sa vérification (Beebs ne dit pas pourquoi) : déposée le 09/10 à 19h57, elle n''était plus « en cours de vérification » le 09/10 à 20h09 et, sept jours plus tard, n''était toujours pas en ligne. L''ancienne annonce avait été retirée : ton article n''est plus en ligne sur Beebs. Rien n''est vendu, ton article reste dans ton stock, et cette republication ne compte pas dans tes limites. La reproposer à l''identique serait refusé de même : change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).'),
 ('99571727-8f4a-4c33-82ec-0eb3a18008be', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', 'publish', '34099938',
  '2026-10-03T15:32:55.839Z', '2026-10-03T14:11:10.968Z', '2026-10-10T15:27:16.775Z',
  'Beebs a refusé cette annonce à sa vérification (Beebs ne dit pas pourquoi) : déposée le 03/10 à 16h11, elle n''était plus « en cours de vérification » le 03/10 à 17h32 et, sept jours plus tard, n''était toujours pas en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. La reproposer à l''identique serait refusé de même : change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).'),
 ('1fc35133-c82a-4f9b-9d33-d352b8fa7fc1', 'ed4d2d4e-4ce4-400a-bdeb-ea420bedfc09', 'publish', '34138428',
  '2026-10-10T11:30:53.762Z', '2026-10-09T13:39:33.995Z', '2026-10-24T17:10:01.744Z',
  'Beebs a refusé cette annonce à sa vérification (Beebs ne dit pas pourquoi) : déposée le 09/10 à 15h39, elle n''était plus « en cours de vérification » le 10/10 à 13h30 et, sept jours plus tard, n''était toujours pas en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. La reproposer à l''identique serait refusé de même : change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).'),
 ('f8054ba8-6435-45f4-b0d1-aade6153d46e', 'ed4d2d4e-4ce4-400a-bdeb-ea420bedfc09', 'publish', '34138371',
  '2026-10-09T13:36:11.187Z', '2026-10-09T13:33:45.332Z', '2026-10-24T17:10:01.744Z',
  'Beebs a refusé cette annonce à sa vérification (Beebs ne dit pas pourquoi) : déposée le 09/10 à 15h33, elle n''était plus « en cours de vérification » le 09/10 à 15h36 et, sept jours plus tard, n''était toujours pas en ligne. Rien n''est en ligne, rien n''est vendu : ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. La reproposer à l''identique serait refusé de même : change d''abord ce que Beebs a pu refuser (photos, titre, description, rayon).');

-- Les jobs, tels qu'attendus (garde), sauvegardés.
INSERT INTO public._backup_2510_beebs_refus_verification SELECT now(), c.* FROM public.cross_post_jobs c
  JOIN _refus_2510 r ON r.id = c.id AND r.user_id = c.user_id AND r.action = c.action AND r.numero = btrim(c.platform_listing_id)
 WHERE c.platform = 'beebs' AND c.status = 'published' AND c.vu_en_ligne_le IS NULL AND c.price < 500
   AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'refus_verification_beebs')
   AND c.reservation_id IS NULL AND COALESCE(NULLIF(c.platform_fields->>'pepites_debitees', '')::integer, 0) = 0
   AND NOT EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.user_id = c.user_id AND a.platform = 'beebs'
                    AND a.listing_id = r.numero AND a.run_id IS NOT NULL AND a.statut_plateforme IN ('en_ligne', 'vendue'));
DO $$
DECLARE n integer;
BEGIN
  IF (SELECT count(*) FROM public._backup_2510_beebs_refus_verification WHERE id IN (SELECT id FROM _refus_2510)) <> 4 THEN
    RAISE EXCEPTION 'sauvegarde : 4 jobs attendus dans l''état prévu (publiés, jamais vus en ligne, sans quota à rendre) — rien n''est fait';
  END IF;
  UPDATE public.cross_post_jobs c
     SET status = 'failed',
         error = r.message,
         platform_fields = (COALESCE(c.platform_fields, '{}'::jsonb)
             - ARRAY['sale_signal', 'unavailable_since', 'unavailable_pending_since', 'pas_encore_visible', 'next_action_after', 'processing_since'])
           || jsonb_build_object('refus_verification_beebs', jsonb_build_object(
                'le', now(), 'regle', 'sortie_de_verification_sans_mise_en_ligne',
                'par', 'scripts/reparations/20261025_beebs_refus_verification.sql', 'numero', r.numero,
                'derniere_vue', r.derniere_vue, 'sortie_constatee_le', r.sortie, 'confirmee_le', r.confirmee,
                'confirmee_par', 'mes_annonces', 'quota', 'rien à rendre (aucune réservation, rien débité)'))
    FROM _refus_2510 r
   WHERE c.id = r.id AND c.status = 'published' AND c.vu_en_ligne_le IS NULL
     AND c.id IN (SELECT id FROM public._backup_2510_beebs_refus_verification);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION 'attendu 4 jobs, obtenu % — rien n''est fait', n; END IF;
END $$;
-- Relecture : statut, message, marqueur ; aucun mail parti.
SELECT c.id, c.user_id, c.action, c.status, left(c.error, 90) AS message, c.platform_fields->'refus_verification_beebs'->>'sortie_constatee_le' AS sortie,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id IN (SELECT id FROM _refus_2510) ORDER BY c.published_at;
COMMIT;
