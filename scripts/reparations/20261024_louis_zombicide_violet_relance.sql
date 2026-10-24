-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 24/10 soir (décision 3 de Nico) — louis : « Insert / Rangement Violet Zombicide: Green Horde – Jeu non
-- inclus » (job Leboncoin 8d3687d2, dépôt 3293338726 refusé par la modération, jamais en ligne aux relevés complets du
-- 22/10 22:21, 23/10 03:07, 23/10 17:13 et 24/10 12:10). RELANCÉ UNE SEULE FOIS.
-- Comparaison avec ses annonces sœurs ACCEPTÉES (Vert 3293339765, Noir 3293342330, Rouge 3293347642) : catégorie,
-- critères, prix, description, livraison, photos — identiques ; seuls la couleur et les photos diffèrent. Le champ mal
-- posé, commun à la famille et « de notre fait » : la MARQUE. La fiche dit « Sans marque » (relevé de son annonce
-- Beebs) ; la rédaction a déclaré « Zombicide » (le jeu dont l'objet est un accessoire non officiel), Leboncoin a reçu
-- « Autre » et « Marque : Zombicide » dans la description. Règle corrigée pour tous les comptes : « Sans marque »
-- déclaré par le vendeur n'est jamais remplacé par une marque de l'IA (src/publication/moteur/reponsesPartagees.js,
-- sansMarqueDeLaFiche ; selftest lot-2410-soir). Ici, le job reçoit ce que la règle donne : « Sans marque » (Leboncoin
-- le pré-remplit lui-même ; aucune ligne de marque ajoutée à la description).
-- Le reste du job est inchangé (catégorie, critères, prix, description, photos). Le dépôt refusé n'est jamais en
-- ligne : aucun doublon possible.
-- Sauvegarde : _backup_2410_louis_zombicide. Inverse : 20261024_louis_zombicide_violet_relance_INVERSE.sql.
-- Aucun mail, aucune notification.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_louis_zombicide AS
  SELECT now() AS sauvegarde_le, c.* FROM public.cross_post_jobs c WHERE false;
ALTER TABLE public._backup_2410_louis_zombicide ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_louis_zombicide FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_2410_louis_zombicide SELECT now(), c.* FROM public.cross_post_jobs c
 WHERE c.id = '8d3687d2-6ded-4fb8-9872-ba3712e76cf8' AND c.status = 'failed';
DO $$
DECLARE n integer;
  v_trace jsonb := jsonb_build_object('le', now(), 'par', 'Claude — 24/10 soir (décision 3 de Nico : relance unique)',
    'pose_par', 'scripts/reparations/20261024_louis_zombicide_violet_relance.sql',
    'cause', 'marque « Zombicide » de la rédaction déclarée sur un accessoire non officiel ; la fiche dit « Sans marque »',
    'depot_refuse', '3293338726');
BEGIN
  UPDATE public.cross_post_jobs c
     SET status = 'pending', error = NULL, platform_listing_id = NULL, published_at = NULL,
         platform_fields = (c.platform_fields - 'lbc_depot' - 'moderation_probe' - 'depot_jamais_en_ligne' - 'error_technique'
                              - 'processing_since' - 'next_action_after' - 'work_window_state' - 'needs_user_source'
                              - 'needsUserAttempts')
           || jsonb_build_object(
                'marque', 'Sans marque',
                'needsUserAttempts', 0,
                'relance_support', v_trace || jsonb_build_object('marque_avant', c.platform_fields -> 'marque'),
                'erreurs_archivees', coalesce(CASE WHEN jsonb_typeof(c.platform_fields -> 'erreurs_archivees') = 'array' THEN c.platform_fields -> 'erreurs_archivees' END, '[]'::jsonb)
                    || jsonb_build_array(jsonb_build_object('le', now(), 'statut', c.status, 'erreur', left(btrim(coalesce(c.error, '')), 600),
                                                            'par', 'relance support unique (refus de modération Leboncoin)')))
   WHERE c.id = '8d3687d2-6ded-4fb8-9872-ba3712e76cf8' AND c.status = 'failed'
     AND c.platform = 'leboncoin' AND c.action = 'publish' AND c.listing_url IS NULL
     AND c.platform_fields ->> 'marque' = 'Zombicide';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'louis : % ligne(s) au lieu de 1 — rien n''est fait', n; END IF;
END $$;
SELECT c.id, c.status, c.platform_fields ->> 'marque' AS marque,
       (SELECT count(*) FROM public.email_logs e WHERE e.user_id = c.user_id AND e.sent_at > now() - interval '5 minutes') AS mails_5min
  FROM public.cross_post_jobs c WHERE c.id = '8d3687d2-6ded-4fb8-9872-ba3712e76cf8';
COMMIT;
