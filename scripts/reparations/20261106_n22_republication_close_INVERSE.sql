-- Inverse de 20261106_n22_republication_close.sql : la republication b3cb7da0 reprend son état d'avant (si elle est
-- encore « cancelled » par cette réparation).
BEGIN;
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_0611_n22_repub b
 WHERE j.id = b.id AND j.status = 'cancelled' AND j.platform_fields ? 'arret_doublon_0611';
SELECT left(id::text, 8), status FROM public.cross_post_jobs WHERE id = 'b3cb7da0-f857-4709-95ee-5ac7e6403b9e';
COMMIT;
