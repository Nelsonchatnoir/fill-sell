-- (06/11 14:22) Correction de l'heure de lecture écrite par le lot « ebay » (14:36 par erreur, lecture faite entre 14:10 et 14:20).
BEGIN;
UPDATE public.cross_post_jobs j
   SET platform_fields = jsonb_set(j.platform_fields, '{lecture_avant_retrait,le}', '"2026-11-06T14:20:00+01:00"'::jsonb)
                      || jsonb_build_object('lecture_avant_retrait', (jsonb_set(j.platform_fields->'lecture_avant_retrait', '{le}', '"2026-11-06T14:20:00+01:00"'::jsonb)) || '{"fenetre":"relue entre 14:10 et 14:20 (heure de Paris)"}'::jsonb)
  FROM public._backup_0611_couples_retraits b
 WHERE b.lot = 'ebay' AND j.id = b.retrait_cree AND j.status = 'pending' AND j.platform_fields->'lecture_avant_retrait'->>'le' = '2026-11-06T14:36:00+01:00';
UPDATE public._backup_0611_couples_retraits SET lecture = jsonb_set(lecture, '{le}', '"2026-11-06T14:20:00+01:00"'::jsonb) || '{"fenetre":"relue entre 14:10 et 14:20 (heure de Paris)"}'::jsonb WHERE lot = 'ebay';
SELECT count(*) FILTER (WHERE j.platform_fields->'lecture_avant_retrait'->>'le' = '2026-11-06T14:20:00+01:00') corrigees, count(*) total
  FROM public._backup_0611_couples_retraits b JOIN public.cross_post_jobs j ON j.id = b.retrait_cree WHERE b.lot = 'ebay';
COMMIT;
