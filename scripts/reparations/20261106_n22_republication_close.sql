-- (06/11, décision de Nico, couple n° 22 — josephinecerni, Beebs, « Lot 2 bonnets + tour de cou en laine ») On garde le
-- dépôt FillSell 33939379 et on retire 33923195 ; la republication b3cb7da0 (pending depuis le 04/11 22:09, étape
-- « a_capturer ») vise 33923195 : laissée, elle recréerait un doublon. Elle est CLOSE (cancelled, compare-and-set sur
-- pending), AVANT le retrait. Aucune réservation d'unités (rien à rendre). Aucun message à la personne.
-- Inverse : 20261106_n22_republication_close_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public._backup_0611_n22_repub AS
SELECT now() AS le, j.id, j.status, j.error, j.platform_fields FROM public.cross_post_jobs j WHERE j.id = 'b3cb7da0-f857-4709-95ee-5ac7e6403b9e';
ALTER TABLE public._backup_0611_n22_repub ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_0611_n22_repub FROM PUBLIC, anon, authenticated;
UPDATE public.cross_post_jobs
   SET status = 'cancelled',
       error = 'Republication arrêtée : cette annonce Beebs était en double de ta publication FillSell 33939379, qui reste en vente ; le doublon est retiré.',
       platform_fields = (platform_fields - 'next_action_after' - 'processing_since')
         || jsonb_build_object('arret_doublon_0611', jsonb_build_object('le', now(), 'annonce_gardee', '33939379',
              'annonce_retiree', '33923195', 'par', 'réparation 06/11 (décision de Nico, couple n° 22)'))
 WHERE id = 'b3cb7da0-f857-4709-95ee-5ac7e6403b9e' AND status = 'pending' AND action = 'republish'
   AND btrim(platform_listing_id) = '33923195';
SELECT left(id::text, 8) AS id, status, platform_listing_id FROM public.cross_post_jobs WHERE id = 'b3cb7da0-f857-4709-95ee-5ac7e6403b9e';
COMMIT;
