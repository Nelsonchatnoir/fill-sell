-- RETOUR ARRIÈRE — fusion par la photo après synchro (20260930160000 + 20260930160500)
-- a) plus rien ne part :
SELECT cron.unschedule('fusion-photo-1min');
DROP TRIGGER IF EXISTS fusion_photo_apres_synchro ON public.vinted_sync_runs;
-- b) défaire les fusions du passage (chacune rend annonces, jobs, ventes,
--    identité Vinted ; la question fermée repasse « defaite ») — une par une :
--   SELECT public.inventaire_defusionner_pour(user_id, id, 'retour_fusion_photo_auto')
--     FROM public.inventaire_fusions
--    WHERE par = 'utilisateur:photo_auto' AND defait_le IS NULL ORDER BY created_at DESC;
-- c) (facultatif) retirer les objets :
--   DROP FUNCTION IF EXISTS public.fusion_photo_tick(), public.fusion_photo_compte(uuid, timestamptz, integer, text, integer),
--     public.fusion_photo_candidates(uuid, timestamptz), public.fusion_photo_ecart(jsonb),
--     public.fusion_photo_synchro_en_cours(uuid), public.fusion_photo_file_apres_synchro();
--   DROP TABLE IF EXISTS public.fusion_photo_demandes, public.fusion_photo_file;
