-- LECTURE SEULE (11/11/2026) — témoin des deux relances à la main du compte 64eab2f9 (20261111_relances_manuelles_64eab2f9.sql).
-- Montre, pour les 6 tâches, l'état actuel et les traces des deux relances (heures de Paris). N'écrit rien.
SELECT left(j.id::text, 8) AS tache, j.status, j.action,
       (j.platform_fields->'relance_manuelle'->>'le')::timestamptz AT TIME ZONE 'Europe/Paris' AS relance_1_paris,
       (j.platform_fields->'relance_manuelle_2'->>'le')::timestamptz AT TIME ZONE 'Europe/Paris' AS relance_2_paris,
       j.platform_fields->'relance_manuelle_2'->'tentee_avant' AS tentee_avant_relance_2,
       jsonb_array_length(coalesce(j.platform_fields->'relance_manuelle_2'->'envois_avant', '[]'::jsonb)) AS envois_avant_relance_2,
       j.platform_fields ? 'recreation_bloquee' AS bloquee_maintenant,
       j.platform_fields->'recreation_tentee' AS tentee_maintenant
  FROM public.cross_post_jobs j
 WHERE j.id IN ('c69af940-4ba6-42d2-8283-1514244f2c36', '14a0b009-3ed5-47f8-9d52-6e804e8ccbc1',
                '07f8109c-553c-4376-a02b-50a00b8f3b0d', '86e8d9d6-f477-4169-a3f3-bf6c971c3435',
                'b78077f7-ae79-4122-97a2-06a25840762f', '162125f6-fb02-447d-834e-56d33a8c9a20')
 ORDER BY 1;
