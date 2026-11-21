-- (21/11/2026, ordre de Nico, point 1) Rendre au compte 0c97dc8b ses 22 retouches IA du 20/11 (23:28 → 23:32) : le lot les
-- a faites SANS qu'elle les demande (il ne posait les photos d'origine que lorsqu'il changeait la sélection du moteur ;
-- corrigé le 21/11, fdd43c1). Les 22 lignes photo_retouche restent (télémétrie, coût) ; elles portent
-- metadata.hors_quota et ne comptent plus (retouches_consommees, migration 20261121120000 — À PASSER APRÈS elle).
-- Gardes : la migration est passée, 22 lignes exactement, sinon rien n'est écrit.
-- Sauvegarde : _backup_2111_retouches_0c97dc8b. Inverse : 20261121_retouches_rendues_0c97dc8b_INVERSE.sql.
BEGIN;
DO $garde$ BEGIN
  IF to_regclass('public._backup_2111_retouches_0c97dc8b') IS NOT NULL THEN RAISE EXCEPTION 'script déjà passé : rien n''est écrit'; END IF;
  IF to_regprocedure('public.retouches_consommees(uuid,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261121120000 pas encore passée : rien n''est écrit';
  END IF;
END $garde$;
CREATE TABLE public._backup_2111_retouches_0c97dc8b AS
SELECT now() AS le, u.id, u.metadata FROM public.usage_logs u
 WHERE u.user_id = '0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b' AND u.feature = 'photo_retouche'
   AND u.created_at >= '2026-11-20 23:28:00+01' AND u.created_at < '2026-11-20 23:33:00+01'
   AND (u.metadata->>'delivered') IS DISTINCT FROM 'false' AND NOT (u.metadata ? 'hors_quota');
ALTER TABLE public._backup_2111_retouches_0c97dc8b ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2111_retouches_0c97dc8b FROM PUBLIC, anon, authenticated;
DO $ecrit$ DECLARE n int; BEGIN
  IF (SELECT count(*) FROM public._backup_2111_retouches_0c97dc8b) <> 22 THEN
    RAISE EXCEPTION 'attendu 22 retouches, lu % : rien n''est écrit', (SELECT count(*) FROM public._backup_2111_retouches_0c97dc8b);
  END IF;
  UPDATE public.usage_logs u SET metadata = u.metadata || jsonb_build_object('hors_quota', jsonb_build_object(
           'motif', 'retouche_non_demandee_lot', 'le', now(), 'par', 'ordre de Nico 21/11 (point 1)'))
    FROM public._backup_2111_retouches_0c97dc8b b WHERE u.id = b.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 22 THEN RAISE EXCEPTION 'attendu 22 lignes, % touchées : rien n''est écrit', n; END IF;
END $ecrit$;
SELECT public.retouches_consommees('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b',
         GREATEST(public.debut_cycle_quotas('0c97dc8b-b839-4c1f-8b14-1d30d7cfdc9b'),
                  to_timestamp(COALESCE((SELECT value FROM public.coin_config WHERE key = 'quotas_retouche_depuis'), 0)))) AS retouches_consommees;
COMMIT;
