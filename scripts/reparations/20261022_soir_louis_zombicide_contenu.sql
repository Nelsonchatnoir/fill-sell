-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 au soir (point 8 — Louis, Business) — ses annonces Leboncoin « Zombicide Green Horde » repartent
-- avec SON contenu, par le circuit normal de l'app
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 20/10 à 13:57, louis@ a publié sur Leboncoin dix fiches nées à 13:49 du relevé Beebs, AVANT que leur annonce
-- Beebs soit lue (22:20) : 7 sont en ligne avec un texte rédigé, « Très bon état » au lieu de « Neuf », UNE photo ;
-- 2 sont « à relancer » (Vert, Violet) ; la Jaune (déjà lue) est juste. La règle est corrigée à la racine
-- (get-pending-jobs v268 : le contenu du vendeur part tel quel, une fiche pas encore lue attend sa lecture).
-- Ici, LE MÊME GESTE QUE LOUIS DANS L'APP, rien de plus :
--   A. « Relancer » des 2 publications à relancer (StockTab.relancerJobEchoue, champ pour champ) ;
--   B. « Republier » des 7 annonces fausses (RPC spend_coins_and_republish, source « manuel », Leboncoin) — 7 unités
--      de son quota de republication (Business) ; au départ, get-pending-jobs impose le texte, l'état et les 4 photos
--      de la fiche (photos encore chez Beebs : rapatriées d'abord par handler-watch, la republication attend).
-- Gardes vérifiées avant : aucune transaction Leboncoin en cours sur ces annonces (relevé du 21/10 14:31), extension
-- de louis@ vivante (22/10 21:10). La Jaune n'est pas touchée. Aucun mail.
-- Sauvegarde : _backup_2210_soir_louis (les 9 jobs avant). Inverse : une republication ne se défait pas (l'ancienne
-- annonce est retirée par le circuit) ; les jobs créés sont listés, annulables tant qu'ils sont « pending ».
-- Essai : remplacer COMMIT par ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS public._backup_2210_soir_louis (
  le timestamptz DEFAULT now(), job uuid PRIMARY KEY, inventaire_id bigint, status text, error text, platform_fields jsonb,
  description text, photos jsonb, geste text, resultat jsonb);
ALTER TABLE public._backup_2210_soir_louis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_soir_louis FROM anon, authenticated;

CREATE TEMP TABLE _gestes (job uuid, inventaire_id bigint, geste text);
INSERT INTO _gestes VALUES
  ('0f2920b0-9ffc-447e-86ba-6313031425cb', 1792497205925, 'relancer'),   -- Vert
  ('8d3687d2-6ded-4fb8-9872-ba3712e76cf8', 1792497203338, 'relancer'),   -- Violet
  ('3f0a928e-6f8d-453c-9d46-e7f1e7dccb00', 1792496954020, 'republier'),  -- Bleu   3291868470
  ('4a404f0a-0d30-4d66-a700-1f87b082f484', 1792496954035, 'republier'),  -- Noir   3291867710
  ('ee11327c-80d3-4d59-ab20-c409b7248eb5', 1792496954045, 'republier'),  -- Gris   3291866949
  ('8ba49021-6b52-4acb-b897-8703a3f6afee', 1792496954072, 'republier'),  -- Blanc  3291865334
  ('26591972-335b-491f-826c-4dcbfa84c752', 1792497207175, 'republier'),  -- Rouge  3291863196
  ('6b99678d-4c9f-4eee-9a79-078e2dcf44e0', 1792497208438, 'republier'),  -- Rose   3291862394
  ('73c4866f-c089-41f1-8be1-0bed86e38c3a', 1792497209642, 'republier');  -- Orange 3291861603

INSERT INTO public._backup_2210_soir_louis (job, inventaire_id, status, error, platform_fields, description, photos, geste)
SELECT j.id, j.inventaire_id, j.status, j.error, j.platform_fields, j.description, to_jsonb(j.photos), g.geste
  FROM cross_post_jobs j JOIN _gestes g ON g.job = j.id
 WHERE j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
ON CONFLICT (job) DO NOTHING;

-- A. « Relancer » (StockTab.relancerJobEchoue) : nouveau cycle d'essais, l'arrêt archivé, statut lu = needs_user.
UPDATE cross_post_jobs j SET status = 'pending', error = NULL,
  platform_fields = (j.platform_fields - array['next_action_after', 'needs_user_tick_le', 'needs_user_actif_ms',
                       'needs_user_vu_le', 'needs_user_vu_erreur', 'attente_session', 'refus_passager'])
    || jsonb_build_object('needsUserAttempts', 0,
         'relances_manuelles', coalesce((j.platform_fields ->> 'relances_manuelles')::int, 0) + 1,
         'derniere_relance_manuelle', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'erreurs_archivees', coalesce(j.platform_fields -> 'erreurs_archivees', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'le', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'statut', j.status,
           'erreur', left(coalesce(j.error, ''), 600), 'par', 'relance_manuelle (réparation 22/10 soir, point 8)')))
  FROM _gestes g WHERE g.job = j.id AND g.geste = 'relancer' AND j.status = 'needs_user'
   AND j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';
UPDATE public._backup_2210_soir_louis b SET resultat = jsonb_build_object('status', j.status)
  FROM cross_post_jobs j WHERE j.id = b.job AND b.geste = 'relancer';

-- B. « Republier » (src/utils/republication.js → spend_coins_and_republish), en tant que louis@.
DO $$
DECLARE g record; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'role', 'authenticated')::text, true);
  FOR g IN SELECT * FROM _gestes WHERE geste = 'republier' LOOP
    r := public.spend_coins_and_republish(g.inventaire_id, NULL, 'manuel', NULL, 'leboncoin');
    UPDATE public._backup_2210_soir_louis SET resultat = r WHERE job = g.job;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT b.geste, b.inventaire_id, b.resultat::text AS resultat FROM public._backup_2210_soir_louis b ORDER BY 1, 2;
COMMIT;
