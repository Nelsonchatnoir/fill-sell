-- ═══════════════════════════════════════════════════════════════════════════
-- RECALAGE DE XEWER SUR LE 1er DU MOIS — tâche unique du 01/10/2026 (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- XEWER (Pro, sub_1UH2YCQZRA77vrWJiy855svF) demande une facturation et un
-- quota calés sur le 1er du mois. Décision Nico : au prorata, sans calendrier
-- d'abonnement Stripe, côté serveur, UNE fois, le 01/10/2026 à 00:00 UTC.
-- Tout le travail est dans la fonction edge stripe-recalage-1er-du-mois
-- (gardes, portefeuille, Stripe, journal). Ici : le journal et le déclencheur.
--
-- ⛔ LA TÂCHE SE DÉSINSCRIT ELLE-MÊME. Elle passe toutes les 5 min de 00:00 à
--    03:55 UTC le 01/10 ; chaque passage lit d'abord le journal, et se
--    désinscrit (cron.unschedule) dès que la fonction a écrit « fait »,
--    « deja_fait » ou « abandon », après 6 erreurs, ou à partir de 03:00 UTC
--    (fenêtre close avant le balayage des recharges de 04:15). Elle ne peut
--    donc pas survivre au 01/10/2026 ni revenir le 01/10/2027.
-- ⛔ IDEMPOTENTE : on désinscrit avant d'inscrire (un cron.schedule sur un nom
--    existant DUPLIQUE le job — cf. handler-watch-3min).
-- ⛔ Chantier « rotation du secret de cron » (CLAUDE.md) : ce fichier porte le
--    secret en clair dans recalage_xewer_tick(), COMME TOUTES les autres
--    tâches cron (même fonctionnement, choix de Nico le 26/09) — un endroit de
--    plus, qui disparaîtra avec la fonction après le 01/10.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Le journal : ce qui a été tenté, facturé, payé ─────────────────────
CREATE TABLE IF NOT EXISTS public.recalage_abonnement_journal (
  id               bigserial PRIMARY KEY,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  user_id          uuid        NOT NULL,
  subscription_id  text        NOT NULL,
  mode             text        NOT NULL CHECK (mode IN ('simulation', 'execution')),
  -- simule | ecart | hors_fenetre | fait | deja_fait | abandon | erreur
  statut           text        NOT NULL,
  montant_facture  integer,     -- centimes : amount_due de la facture Stripe (ou de l'aperçu)
  montant_paye     integer,     -- centimes : amount_paid
  facture_id       text,
  facture_statut   text,
  detail           jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.recalage_abonnement_journal IS
  'Journal de la tâche unique stripe-recalage-1er-du-mois (XEWER, 01/10/2026). '
  'Écrit par la fonction edge (service_role) ; lu par recalage_xewer_tick().';

-- Journal SERVEUR seulement (décision Nico) : aucun accès pour anon ni pour
-- les utilisateurs connectés. ⚠️ Pas de GRANT à authenticated, et un REVOKE
-- explicite : les droits par défaut du schéma public donnent TOUT à anon et
-- authenticated sur chaque table neuve (pg_default_acl, relevé le 26/09).
-- RLS active sans politique en second verrou. service_role garde son accès.
ALTER TABLE public.recalage_abonnement_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recalage_abonnement_journal FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.recalage_abonnement_journal_id_seq FROM anon, authenticated;

-- ── 2. Le passage de la tâche ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalage_xewer_tick()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_termine boolean;
  v_erreurs integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.recalage_abonnement_journal
     WHERE mode = 'execution' AND statut IN ('fait', 'deja_fait', 'abandon')
  ) INTO v_termine;

  SELECT count(*)::int INTO v_erreurs
    FROM public.recalage_abonnement_journal
   WHERE mode = 'execution' AND statut = 'erreur';

  IF v_termine OR v_erreurs >= 6 OR now() >= timestamptz '2026-10-01 03:00:00+00' THEN
    PERFORM cron.unschedule('recalage-xewer-1er-oct');
    RETURN 'desinscrite';
  END IF;

  IF now() < timestamptz '2026-10-01 00:00:00+00' THEN
    RETURN 'trop_tot';
  END IF;

  PERFORM net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/stripe-recalage-1er-du-mois',
    headers := '{"Content-Type":"application/json","x-cron-secret":"__CRON_SECRET_DU_VAULT__"}'::jsonb,
    body    := '{"mode":"execution"}'::jsonb,
    timeout_milliseconds := 60000
  );
  RETURN 'appelee';
END;
$$;

REVOKE ALL ON FUNCTION public.recalage_xewer_tick() FROM public, anon, authenticated;

-- ── 3. Le déclencheur : le 01/10 seulement, de 00:00 à 03:55 UTC ────────────
DO $cron$
BEGIN
  PERFORM cron.unschedule('recalage-xewer-1er-oct');
EXCEPTION WHEN OTHERS THEN
  NULL; -- pas encore planifié : rien à désinscrire
END;
$cron$;

SELECT cron.schedule(
  'recalage-xewer-1er-oct',
  '*/5 0-3 1 10 *',
  $cron$ SELECT public.recalage_xewer_tick() $cron$
);
