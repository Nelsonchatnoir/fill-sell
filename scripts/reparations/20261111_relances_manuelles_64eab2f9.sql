-- (11/11/2026, soir — point 5 de Nico : « script témoin pour les deux relances faites en SQL direct (compte 64eab2f9),
-- sauvegarde + inverse, sans réécrire les données ») TÉMOIN DES DEUX RELANCES À LA MAIN DU 11/11
-- Rapport : scratchpad du 11/11 SOIR-a-b.md, point a ; la règle qui les rend inutiles : _shared/remise-en-file.js
-- (remettre en file = remettre à zéro TOUS les compteurs d'essais), migration 20261111210000, verrou selftest:remise-en-file.
--
-- Ce qui a été fait, en SQL direct, par une session Claude sur ordre de Nico (AUCUN script à l'époque) — reconstitué
-- depuis les traces que les deux UPDATE ont écrites dans chaque tâche (platform_fields.relance_manuelle et
-- relance_manuelle_2, lues le 11/11 vers 23:05) :
--   1. 11/11 à 18:57:10 (Paris ; 17:57:10.832706 UTC, UN seul UPDATE, même horodatage pour les 6) — les 6 republications
--      Vinted c69af940, 14a0b009, 07f8109c, 86e8d9d6, b78077f7, 162125f6 : recreation_bloquee retirée (gardée dans
--      relance_manuelle.avant), remises en file (statut d'avant : pending) ; recreation_tentee {n: 3} GARDÉ → handler-watch
--      les a ressorties à 19:00:19 (essais 2), sauf 162125f6 prise par le poste à 18:57:48.
--   2. 11/11 à 20:16:26 (Paris ; 19:16:26.65476 UTC) — les 5 autres : recreation_tentee ET recreation_envois retirés
--      (gardés dans relance_manuelle_2.tentee_avant / envois_avant), recreation_bloquee retirée (bloquee_avant).
-- État lu le 11/11 vers 23:05 : les 6 sont PUBLIÉES (status published) ; chacune porte de nouveau recreation_tentee et
-- recreation_envois, écrits par les essais réussis après la relance.
--
-- ⛔ CE FICHIER N'ÉCRIT RIEN DANS LES TÂCHES : il ne rejoue pas les relances (elles sont passées et ont abouti). Il
-- pose seulement la SAUVEGARDE de l'état actuel des 6 lignes (public._backup_1111_relances_64eab2f9, RLS, aucun accès
-- client), pour que l'inverse ait une base. Lecture : 20261111_relances_manuelles_64eab2f9_PREUVE.sql.
-- Inverse (gardé : il ne touche qu'une tâche encore dans l'état laissé par la relance, jamais une tâche publiée depuis) :
-- 20261111_relances_manuelles_64eab2f9_INVERSE.sql.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _relances_1111 (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _relances_1111 (id) VALUES
  ('c69af940-4ba6-42d2-8283-1514244f2c36'), ('14a0b009-3ed5-47f8-9d52-6e804e8ccbc1'),
  ('07f8109c-553c-4376-a02b-50a00b8f3b0d'), ('86e8d9d6-f477-4169-a3f3-bf6c971c3435'),
  ('b78077f7-ae79-4122-97a2-06a25840762f'), ('162125f6-fb02-447d-834e-56d33a8c9a20');

DO $garde$
DECLARE v_n integer;
BEGIN
  IF to_regclass('public._backup_1111_relances_64eab2f9') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
  SELECT count(*) INTO v_n FROM public.cross_post_jobs j JOIN _relances_1111 r ON r.id = j.id
   WHERE j.user_id::text LIKE '64eab2f9%' AND j.platform = 'vinted'
     AND j.platform_fields ? 'relance_manuelle';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'attendu 6 tâches du compte 64eab2f9 portant relance_manuelle, trouvé % : rien n''est écrit', v_n;
  END IF;
END
$garde$;

CREATE TABLE public._backup_1111_relances_64eab2f9 AS
  SELECT j.id, j.user_id, j.status, j.action, j.platform, j.platform_fields, now() AS sauvegarde_le
    FROM public.cross_post_jobs j JOIN _relances_1111 r ON r.id = j.id;
ALTER TABLE public._backup_1111_relances_64eab2f9 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1111_relances_64eab2f9 FROM PUBLIC, anon, authenticated;

DO $verif$
BEGIN
  IF (SELECT count(*) FROM public._backup_1111_relances_64eab2f9) <> 6 THEN
    RAISE EXCEPTION 'sauvegarde incomplète : rien n''est écrit';
  END IF;
END
$verif$;

COMMIT;

SELECT id, status, platform_fields ? 'relance_manuelle' AS relance_1, platform_fields ? 'relance_manuelle_2' AS relance_2,
       sauvegarde_le AT TIME ZONE 'Europe/Paris' AS sauvegarde_paris
  FROM public._backup_1111_relances_64eab2f9 ORDER BY id;
