-- ════════════════════════════════════════════════════════════════════════════
-- NADÈGE : LES 8 953 RÉPÉTITIONS DE LA BOUCLE DU 07/10 (feu vert de Nico, 08/10)
-- ════════════════════════════════════════════════════════════════════════════
-- nadegemarcelin78 (8a2eba68), annonce Opla 7f1bb50d (« Lot de 5 magasines
-- Picsou ») : 8 954 lignes `rapprochements` identiques (attache / job /
-- inventaire NULL, job 839e4bf2, run 1f00dd8d) écrites du 07/10 21:26:18 au
-- 22:32:17 UTC par l'ancien moteur (v2 + job sans article ; cause et verrous :
-- docs/reprise/terminal-boucles-0810.md). On garde la PREMIÈRE (trace du
-- chemin), l'attache du 23/09 et la décision utile : l'import du 08/10 00:18
-- (article 1791418713148). Sans effet sur les lectures : le moteur ne lit que
-- la DERNIÈRE ligne d'une annonce (l'import) et l'existence d'un « ignore » de
-- la personne.
-- Sauvegarde : _backup_0810_boucle_rapprochements (RLS active, aucun accès
-- anon/authenticated). Inverse : 20261008_nadege_boucle_rapprochements_INVERSE.sql
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0810_boucle_rapprochements (LIKE public.rapprochements, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_0810_boucle_rapprochements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0810_boucle_rapprochements FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_0810_boucle_rapprochements
SELECT r.*, now() FROM public.rapprochements r
 WHERE r.annonce_id = '7f1bb50d-3854-4ebd-af11-c96d03e6b30e'
   AND r.user_id = '8a2eba68-7a2d-4fc1-aab0-aba23189c33b'
   AND r.decision = 'attache' AND r.par = 'job' AND r.inventaire_id IS NULL
   AND r.detail ->> 'job_id' = '839e4bf2-a35c-414e-bc02-48215fbc5bc1'
   AND r.created_at >= '2026-10-07 21:26:00+00' AND r.created_at < '2026-10-07 22:33:00+00'
   AND NOT EXISTS (SELECT 1 FROM public._backup_0810_boucle_rapprochements b WHERE b.id = r.id);

DELETE FROM public.rapprochements r
 USING public._backup_0810_boucle_rapprochements b
 WHERE r.id = b.id
   AND r.id <> (SELECT b2.id FROM public._backup_0810_boucle_rapprochements b2 ORDER BY b2.created_at, b2.id LIMIT 1);

SELECT (SELECT count(*) FROM public._backup_0810_boucle_rapprochements) sauvegardees,
       (SELECT count(*) FROM public.rapprochements WHERE annonce_id = '7f1bb50d-3854-4ebd-af11-c96d03e6b30e') restantes,
       (SELECT jsonb_agg(jsonb_build_object('decision', decision, 'par', par, 'inventaire_id', inventaire_id, 'le', created_at) ORDER BY created_at)
          FROM public.rapprochements WHERE annonce_id = '7f1bb50d-3854-4ebd-af11-c96d03e6b30e') lignes;
COMMIT;
