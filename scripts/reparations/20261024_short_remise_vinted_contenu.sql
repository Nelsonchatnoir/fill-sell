-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 nuit — le short de Nico (fiche 1785871917724004) : la remise en vente Vinted après l'annulation
-- (job 6c02755d, créé à 22:20 après l'appui de 22:18:36) est partie SANS photo ni prix (contenu copié d'une ancienne
-- republication du 26/09) et la publication a échoué. Règle corrigée pour tous : 20261024235800 (le contenu de la fiche
-- quand le job source n'en a pas — feu vert nommé de Nico). Ici : le contenu de la fiche (titre, description, 3 photos),
-- PRIX 999 € — règle des annonces de test sur les comptes de Nico (la fiche dit 1 €, prix de la vente de test à Ornella) ;
-- Nico le change quand il veut. L'échéance de reprise est levée : le job repart tout de suite.
-- Sauvegarde : _backup_2410_short_remise. Inverse : 20261024_short_remise_vinted_contenu_INVERSE.sql. Aucun mail.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_short_remise AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_short_remise ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_short_remise FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_short_remise SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565' AND c.status = 'pending';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET title = coalesce(nullif(btrim(c.title), ''), i.titre),
         description = coalesce(nullif(btrim(c.description), ''), i.description),
         price = 999,
         photos = CASE WHEN jsonb_typeof(c.photos) = 'array' AND jsonb_array_length(c.photos) > 0 THEN c.photos ELSE i.photos END,
         error = NULL,
         platform_fields = (c.platform_fields - 'next_action_after' - 'processing_since' - 'needsUserAttempts')
           || jsonb_build_object('relance_support', jsonb_build_object('le', now(), 'par', 'Claude — 24/10 nuit (preuve du parcours vente annulée)',
                'pose_par', 'scripts/reparations/20261024_short_remise_vinted_contenu.sql',
                'cause', 'remise copiée d''une ancienne republication sans photo ni prix ; prix de test 999 € (règle des comptes de Nico)'))
    FROM public.inventaire i
   WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565' AND c.status = 'pending' AND i.id = c.inventaire_id
     AND c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job, obtenu % — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, c.price, jsonb_array_length(c.photos) AS photos, left(c.title, 60) AS titre,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565';
COMMIT;
