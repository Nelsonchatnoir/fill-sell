-- PREUVE (LECTURE SEULE) de 20261111_fiches_fantomes_reimport.sql — avant et après :
--   npx supabase db query --linked --read-only -f <ce fichier>
-- AVANT, attendu : fiches = 7 (6 + 1), toutes « stock », nées d'un relevé ; les 10 dépôts « cancelled », sur ces fiches ;
-- les 10 annonces relevées retirées (retiree_le / disparu_le posés) ; ni vente, ni lien, ni remise, ni tâche vivante.
-- APRÈS, attendu : fiches = 0 ; les 10 mêmes dépôts « cancelled » et les 10 mêmes annonces retirées, inventaire_id NULL
-- (clé étrangère), inchangés sinon ; aucun retrait né sur ces annonces.
-- (Dépôts et annonces relus en prod le 11/11 vers 14:15 : leurs identifiants, jamais un titre.)
WITH f(id, user_id) AS (VALUES
  (1794389289141::bigint, '447d920c-976a-4d8f-aff4-a2998050358c'::uuid), (1794389289234, '447d920c-976a-4d8f-aff4-a2998050358c'),
  (1794391571153, '447d920c-976a-4d8f-aff4-a2998050358c'), (1794391571230, '447d920c-976a-4d8f-aff4-a2998050358c'),
  (1794393469413, '447d920c-976a-4d8f-aff4-a2998050358c'), (1794263945937, '447d920c-976a-4d8f-aff4-a2998050358c'),
  (1794260149701, 'faf5021a-479a-4bb3-b3ec-c296770739b7')),
d(id) AS (VALUES
  ('c7c86c11-8a79-4bc2-9448-168ebcefcb7b'::uuid), ('241f7efc-05ee-434e-9275-d9570e7bf839'), ('cc930ca1-5593-48e6-a4e0-0481d809b5c1'),
  ('4b451540-5286-4b4b-aff7-d7a2c6a14452'), ('02aeb6b7-bcd0-47ac-a56a-ce01afd30a15'), ('b49783b3-be4d-4a59-91ad-1c801826ebb9'),
  ('b7664bf4-a14a-462e-9439-207ce7fa82d6'), ('8384a0d3-79a8-46d4-8375-4f002b3ce505'), ('8c64768c-0097-4ce3-818a-57c9dcc81eea'),
  ('90f535a9-67a6-4c74-8204-e9fec138448f')),
a(id) AS (VALUES
  ('49ccb771-4afe-4830-b8d6-fd725a649810'::uuid), ('2f72895a-631a-4450-84f7-dbb44116aaae'), ('6ae458c2-102b-4489-bc1a-42db754ebaae'),
  ('5e47094f-f2a4-41dd-9ec3-3285d3d47796'), ('988feaef-773c-481e-8684-cc5a044676aa'), ('aff57050-5bc1-43dd-9514-04498aba6d08'),
  ('7bd525bf-bfb6-404b-85b9-4f933d064647'), ('08bcfb0c-dde1-45ba-a2db-74d6edc974b8'), ('c0a7ccca-9290-4338-9f4a-b4de6adf4ff9'),
  ('a62b5a7f-a6d1-4099-966a-77168cf1275c'))
SELECT 'fiches' AS quoi, count(i.id) AS n, string_agg(DISTINCT i.statut || '/' || i.origine, ', ') AS detail
  FROM f LEFT JOIN public.inventaire i ON i.id = f.id AND i.user_id = f.user_id
UNION ALL
SELECT 'depots (statut ; sur une fiche fantome ; sans fiche)', count(j.id),
       string_agg(DISTINCT j.status, ', ') || ' ; ' || count(j.id) FILTER (WHERE j.inventaire_id IN (SELECT id FROM f))
       || ' ; ' || count(j.id) FILTER (WHERE j.inventaire_id IS NULL)
  FROM d JOIN public.cross_post_jobs j ON j.id = d.id
UNION ALL
SELECT 'annonces (vivantes ; sur une fiche fantome ; sans fiche)', count(x.id),
       count(x.id) FILTER (WHERE x.disparu_le IS NULL AND x.retiree_le IS NULL AND x.ignoree_le IS NULL) || ' ; '
       || count(x.id) FILTER (WHERE x.inventaire_id IN (SELECT id FROM f)) || ' ; ' || count(x.id) FILTER (WHERE x.inventaire_id IS NULL)
  FROM a JOIN public.annonces_plateforme x ON x.id = a.id
UNION ALL
SELECT 'autres taches vivantes des fiches', count(*), string_agg(j.platform || ' ' || COALESCE(j.action, 'publish') || ' ' || j.status, ', ')
  FROM public.cross_post_jobs j JOIN f ON f.id = j.inventaire_id
 WHERE j.status IN ('pending', 'processing', 'needs_user', 'published', 'sold')
UNION ALL
SELECT 'ventes', count(*), NULL FROM public.ventes v JOIN f ON f.id = v.inventaire_id
UNION ALL
SELECT 'liens_comptes', count(*), NULL FROM public.fiches_liees_comptes l JOIN f ON f.id IN (l.fiche_a, l.fiche_b)
UNION ALL
SELECT 'remises', count(*), NULL FROM public.remises_en_vente r JOIN f ON f.id = r.inventaire_id
UNION ALL
SELECT 'retraits sur ces annonces', count(*), string_agg(DISTINCT r.status, ', ')
  FROM public.cross_post_jobs r JOIN public.annonces_plateforme x ON x.id IN (SELECT id FROM a)
 WHERE r.user_id = x.user_id AND r.platform = x.platform AND r.action = 'delete'
   AND public.listing_designe(x.listing_id, r.listing_url, r.platform_listing_id)
   AND r.created_at > '2026-11-11 14:00:00 Europe/Paris';
