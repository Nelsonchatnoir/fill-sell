-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION C1 (16/10/2026) — LE PRIX DES NOTES DE VENTE NÉES SANS PRIX
-- ═══════════════════════════════════════════════════════════════════════════
-- Prérequis : migration 20261016221000 APPLIQUÉE (prix_vente_du_job : la règle).
-- Cible : les notes push_ventes nées d'un JOB (job_id non NULL) dont le prix est
-- NULL (= inconnu). Jamais une note à 0 € (0 ≠ inconnu), jamais une note qui a
-- déjà un prix. Prix remis = prix_vente_du_job : la vente enregistrée (reçu),
-- sinon le prix lu à la vente, le prix du job, le dernier prix publié, la fiche.
-- Le 16/10 au soir : 128 notes (toutes Vinted, toutes des republications), 128
-- avec un prix connu (119 par leur vente enregistrée, 8 par le prix lu à la
-- vente, 1 par le prix de recréation). Les VENTES (table ventes) de ces notes
-- ont toutes leur prix : rien à y réparer.
-- ⛔ AUCUN MAIL, AUCUNE NOTIFICATION : seule la colonne `prix` change.
--    push_ventes n'a aucun déclencheur ; l'envoi (push_ventes_a_envoyer) ne
--    prend que statut / mail_statut = 'a_envoyer', jamais touchés ici ; un mail
--    déjà parti est réservé dans email_logs (type vente:<note>), non lu ici.
-- Sauvegarde : public._backup_1610_ventes_prix_zero (prix avant / après).
-- Lots de 100 (clé croissante), 20 lots au plus. Aucune ligne inchangée réécrite.
-- Appliquer (feu vert nommé de Nico, APRÈS la migration) :
--   npx supabase db query --linked -f scripts/reparations/20261016_ventes_prix_zero.sql
-- INVERSE : en bas du fichier (bloc commenté).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regprocedure('public.prix_vente_du_job(uuid,text,text,numeric,jsonb,bigint)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261016221000 absente : rien n''est fait';
  END IF;
END
$pre$;

CREATE TABLE IF NOT EXISTS public._backup_1610_ventes_prix_zero (
  id          bigint PRIMARY KEY,
  user_id     uuid NOT NULL,
  job_id      uuid NOT NULL,
  prix_avant  numeric,
  prix_apres  numeric NOT NULL,
  statut      text,
  mail_statut text,
  sauve_le    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._backup_1610_ventes_prix_zero ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1610_ventes_prix_zero FROM anon, authenticated;

DO $rep$
DECLARE
  v_dernier bigint := 0;
  v_max     bigint;
  v_lot     int;
  v_total   int := 0;
  v_tour    int := 0;
BEGIN
  LOOP
    v_tour := v_tour + 1;
    -- Le lot : 100 notes sans prix, après la dernière vue (clé croissante :
    -- une note sans prix connu ne bloque jamais les suivantes).
    SELECT max(x.id) INTO v_max FROM (
      SELECT pv.id FROM public.push_ventes pv
       WHERE pv.job_id IS NOT NULL AND pv.prix IS NULL AND pv.id > v_dernier
       ORDER BY pv.id LIMIT 100) x;
    EXIT WHEN v_max IS NULL;

    WITH cible AS (
      SELECT pv.id, pv.user_id, pv.job_id, pv.prix, pv.statut, pv.mail_statut,
             public.prix_vente_du_job(j.user_id, j.platform, j.platform_listing_id,
                                      j.price, j.platform_fields, j.inventaire_id) AS nouveau
        FROM public.push_ventes pv
        JOIN public.cross_post_jobs j ON j.id = pv.job_id AND j.user_id = pv.user_id
       WHERE pv.job_id IS NOT NULL AND pv.prix IS NULL
         AND pv.id > v_dernier AND pv.id <= v_max
    ), sauve AS (
      INSERT INTO public._backup_1610_ventes_prix_zero (id, user_id, job_id, prix_avant, prix_apres, statut, mail_statut)
      SELECT c.id, c.user_id, c.job_id, c.prix, c.nouveau, c.statut, c.mail_statut
        FROM cible c WHERE c.nouveau IS NOT NULL
      ON CONFLICT (id) DO NOTHING
      RETURNING id, prix_apres
    )
    UPDATE public.push_ventes pv SET prix = s.prix_apres
      FROM sauve s
     WHERE pv.id = s.id AND pv.prix IS NULL;
    GET DIAGNOSTICS v_lot = ROW_COUNT;
    v_total := v_total + v_lot;
    v_dernier := v_max;
    EXIT WHEN v_tour >= 20;
  END LOOP;
  RAISE NOTICE 'notes de vente réparées : %', v_total;
END
$rep$;

-- Contrôle : ce qui reste sans prix (né d'un job), et ce que la sauvegarde porte.
SELECT (SELECT count(*) FROM public.push_ventes WHERE job_id IS NOT NULL AND prix IS NULL) AS restent_sans_prix,
       (SELECT count(*) FROM public._backup_1610_ventes_prix_zero) AS sauvegardees;

COMMIT;

-- ── INVERSE (à lancer seul, sur décision) ─────────────────────────────────
-- BEGIN;
-- UPDATE public.push_ventes pv SET prix = b.prix_avant
--   FROM public._backup_1610_ventes_prix_zero b
--  WHERE pv.id = b.id AND pv.prix IS NOT DISTINCT FROM b.prix_apres;
-- COMMIT;
