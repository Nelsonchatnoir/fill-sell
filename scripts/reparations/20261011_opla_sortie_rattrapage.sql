-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE — SORTIE D'OPLA : PLUS AUCUNE ACTION OPLA VIVANTE (11/10, A2)
-- ═══════════════════════════════════════════════════════════════════════════
-- APRÈS la migration 20261011130000 (sinon : refus, rien n'est écrit).
-- PAR LA RÈGLE : chaque job Opla encore vivant (pending / processing /
-- needs_user — les retraits d'articles vendus surtout : nadegemarcelin78,
-- inandup33, meminiandmove, ornellaracano, nicolas.svobodny, docherleny,
-- labouquinerie85, noahbessaguetlefort…) voit son statut réécrit TEL QUEL :
-- le déclencheur garde_opla_sortie_jobs le clôt ('cancelled' + le message de
-- Nico, erreur d'avant archivée). Les relevés Opla en file sont clos ; les
-- questions « Déjà vendu ? » ouvertes sur une copie Opla deviennent caduques.
-- Sauvegarde AVANT (_backup_1110_opla_*). AUCUN mail, AUCUNE notification :
-- aucun déclencheur de note ne regarde un retrait ni une question.
--   npx supabase db query --linked -f scripts/reparations/20261011_opla_sortie_rattrapage.sql
-- Inverse : scripts/reparations/20261011_opla_sortie_rattrapage_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
DO $g$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'garde_opla_sortie_jobs') THEN
    RAISE EXCEPTION 'migration 20261011130000 absente : rien n''est écrit';
  END IF;
  IF NOT public.opla_sortie_passee() THEN
    RAISE EXCEPTION 'sortie d''Opla non active (opla_sortie_le) : rien n''est écrit';
  END IF;
END $g$;

CREATE TABLE IF NOT EXISTS public._backup_1110_opla_jobs AS SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE false;
CREATE TABLE IF NOT EXISTS public._backup_1110_opla_releves AS SELECT now() AS sauve_le, r.* FROM public.vinted_sync_runs r WHERE false;
CREATE TABLE IF NOT EXISTS public._backup_1110_opla_questions AS SELECT now() AS sauve_le, d.* FROM public.inventaire_doublons d WHERE false;
ALTER TABLE public._backup_1110_opla_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1110_opla_releves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1110_opla_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1110_opla_jobs, public._backup_1110_opla_releves, public._backup_1110_opla_questions FROM anon, authenticated;

INSERT INTO public._backup_1110_opla_jobs
  SELECT now(), j.* FROM public.cross_post_jobs j
   WHERE j.platform = 'opla' AND j.status IN ('pending', 'processing', 'needs_user');
INSERT INTO public._backup_1110_opla_releves
  SELECT now(), r.* FROM public.vinted_sync_runs r
   WHERE r.platform = 'opla' AND r.status IN ('queued', 'running');
INSERT INTO public._backup_1110_opla_questions
  SELECT now(), d.* FROM public.inventaire_doublons d
   WHERE d.statut = 'proposee' AND d.motif = 'copie_non_prouvee' AND d.preuves ->> 'platform' = 'opla';

-- 1. Par la règle : le statut réécrit tel quel, garde_opla_sortie_jobs clôt.
UPDATE public.cross_post_jobs SET status = status
 WHERE platform = 'opla' AND status IN ('pending', 'processing', 'needs_user');

-- 2. Les relevés Opla en file ou en cours : clos (même texte que get-pending-jobs).
UPDATE public.vinted_sync_runs
   SET status = 'cancelled', finished_at = now(),
       erreur = 'Opla n''est plus disponible dans FillSell. Relevé non fait : Opla n''est plus pris en charge par FillSell (sortie d''Opla).'
 WHERE platform = 'opla' AND status IN ('queued', 'running');

-- 3. « Déjà vendu ? » sur une copie Opla : caduque (elle ne se retire plus d'ici).
UPDATE public.inventaire_doublons
   SET statut = 'caduque', decide_le = now(), decide_par = 'sortie_opla_1110',
       preuves = coalesce(preuves, '{}'::jsonb) || jsonb_build_object('caduque', jsonb_build_object(
         'le', now(), 'motif', 'sortie_opla', 'texte', 'Opla n''est plus pris en charge par FillSell.'))
 WHERE statut = 'proposee' AND motif = 'copie_non_prouvee' AND preuves ->> 'platform' = 'opla';

COMMIT;

-- Relecture : plus rien de vivant sur Opla.
SELECT (SELECT count(*) FROM public._backup_1110_opla_jobs) AS jobs_sauves,
       (SELECT count(*) FROM public.cross_post_jobs WHERE platform = 'opla' AND status IN ('pending', 'processing', 'needs_user')) AS jobs_opla_vivants,
       (SELECT count(*) FROM public.cross_post_jobs j WHERE j.id IN (SELECT id FROM public._backup_1110_opla_jobs) AND j.status = 'cancelled'
           AND j.platform_fields ? 'opla_sortie') AS jobs_clos,
       (SELECT count(*) FROM public._backup_1110_opla_releves) AS releves_sauves,
       (SELECT count(*) FROM public.vinted_sync_runs WHERE platform = 'opla' AND status IN ('queued', 'running')) AS releves_opla_vivants,
       (SELECT count(*) FROM public._backup_1110_opla_questions) AS questions_sauvees,
       (SELECT count(*) FROM public.inventaire_doublons WHERE statut = 'proposee' AND motif = 'copie_non_prouvee' AND preuves ->> 'platform' = 'opla') AS questions_opla_ouvertes;
