-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 nuit — le short de Nico (fiche 1785871917724004) : la remise Vinted d'une vente ANNULÉE se fera par le
-- bouton « Republier » de Vinted (même annonce, même contenu ; geste d'extension du prochain lot, le short en est le cas
-- de test — choix 2 de Nico, 24/10 23:3x : il ne touche pas au bouton d'ici là). Le job de remise Vinted de FillSell
-- (6c02755d, jamais publié, « needs_user » depuis 22:59 : catégorie absente) est donc ANNULÉ — sinon doublon. Même geste que
-- « Oublier » de l'app (StockTab, oublierPublication) : statut « cancelled », motif écrit, erreur archivée, aucune
-- reprise. Rien n'est retiré chez Vinted (le job n'a jamais rien publié).
-- Sauvegarde : _backup_2410_short_remise_republier. Inverse : 20261024_short_remise_vinted_par_republier_INVERSE.sql.
-- Aucun mail.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_short_remise_republier AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_short_remise_republier ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_short_remise_republier FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_short_remise_republier SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565' AND c.status IN ('needs_user', 'pending', 'failed') AND c.listing_url IS NULL;
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = 'cancelled',
         error = 'Annulée — sur Vinted, la remise en vente se fera par le bouton « Republier » de Vinted (même annonce). Rien n''a été publié par FillSell.',
         platform_fields = (c.platform_fields - 'next_action_after' - 'processing_since')
           || jsonb_build_object('remise_par_republier_vinted', jsonb_build_object('le', now(),
                'par', 'Claude — 24/10 nuit, choix 2 de Nico (remise par le bouton « Republier » de Vinted, geste à venir)',
                'pose_par', 'scripts/reparations/20261024_short_remise_vinted_par_republier.sql',
                'depuis_statut', c.status, 'erreur_archivee', c.error, 'error_technique_archivee', c.platform_fields->'error_technique'))
   WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565' AND c.status IN ('needs_user', 'pending', 'failed') AND c.listing_url IS NULL
     AND c.platform_listing_id IS NULL AND c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job, obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, left(c.error, 80) AS erreur,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565';
COMMIT;
