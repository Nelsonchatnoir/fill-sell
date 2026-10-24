-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 nuit — le short de Nico (fiche 1785871917724004), 2e passe : le job de remise Vinted 6c02755d est
-- refusé par l'extension (« platform_fields.categoryPath absent ») — l'article n'a jamais été publié depuis l'app
-- (importé du dressing le 04/08, puis republié par capture), aucun job ne porte sa catégorie ; passé « needs_user »
-- à 22:59 après les reprises automatiques. Règle corrigée pour tous : 20261024235900 (feu vert NOMMÉ de Nico) — la
-- remise reprend catégorie, état, taille, marque et couleurs de la dernière capture. Ici, la MÊME aide
-- (remise_en_vente_champs_capture) sur ce job, puis les gestes de la relance « d'un clic » de l'app (StockTab,
-- relancerJobEchoue) : reprises remises à zéro, marques « needs_user » levées, motif archivé, retour en file.
-- Prix inchangé : 999 € (règle des annonces de test sur les comptes de Nico).
-- À lancer APRÈS 20261024235900. Sauvegarde : _backup_2410_short_remise_categorie.
-- Inverse : 20261024_short_remise_vinted_categorie_INVERSE.sql. Aucun mail.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_short_remise_categorie AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_short_remise_categorie ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_short_remise_categorie FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_short_remise_categorie SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565' AND c.status = 'needs_user';
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = 'pending',
         error = NULL,
         platform_fields = public.remise_en_vente_champs_capture(c.user_id, c.inventaire_id, c.platform, c.platform_fields)
           || (c.platform_fields - 'next_action_after' - 'processing_since' - 'needs_user_tick_le' - 'needs_user_actif_ms'
                 - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'needs_user_source' - 'error_technique' - 'refus_passager')
           || jsonb_build_object('needsUserAttempts', 0,
                'relance_support', jsonb_build_object('le', now(), 'par', 'Claude — 24/10 nuit (preuve du parcours vente annulée)',
                  'pose_par', 'scripts/reparations/20261024_short_remise_vinted_categorie.sql',
                  'cause', 'remise Vinted sans catégorie (article importé puis republié par capture) : champs de la capture '
                           || coalesce(public.remise_en_vente_champs_capture(c.user_id, c.inventaire_id, c.platform, c.platform_fields) #>> '{remise_capture,capture_id}', '∅'),
                  'erreur_archivee', c.error, 'error_technique_archivee', c.platform_fields->'error_technique'))
   WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565' AND c.status = 'needs_user' AND c.listing_url IS NULL
     AND c.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'
     AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'categoryPath');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 job, obtenu % — rien n''est fait', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs c WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565'
                    AND jsonb_typeof(c.platform_fields->'categoryPath') = 'array') THEN
    RAISE EXCEPTION 'aucune catégorie reprise de la capture — rien n''est fait';
  END IF;
END $$;
SELECT c.id, c.status, c.price, c.platform_fields->'categoryPath' AS categorie, c.platform_fields->>'etat' AS etat,
       c.platform_fields->>'taille' AS taille, c.platform_fields->>'marque' AS marque, c.platform_fields->'colors' AS couleurs,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id = '6c02755d-bf19-48be-9cc2-285a02d6e565';
COMMIT;
