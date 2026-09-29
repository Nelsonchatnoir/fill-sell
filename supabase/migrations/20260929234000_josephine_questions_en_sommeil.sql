-- APPLIQUÉE le 29/09/2026 vers 23:45 (GO de nuit de Nico, geste 1).
-- Rejeu annulé avant application : 21 lignes, josephinecerni 0 question
-- restante, 2222 → 2201 questions ouvertes sur tout le parc (−21, rien ailleurs).
--
-- josephinecerni : 21 questions « Est-ce le même article ? » ouvertes depuis
-- 21:58, nées des 21 fiches créées en double par son relevé Beebs de 21:52.
-- Mises en sommeil (statut 'caduque', aucun trigger sur la table), l'état
-- d'avant noté dans preuves. Aucune fiche touchée, aucune fusion, aucun retrait.
-- La paire caduque n'est jamais reposée (releve_poser_question : ON CONFLICT
-- DO NOTHING sur la paire).

SET statement_timeout = '10s';
SET lock_timeout = '1s';
DO $geste$
DECLARE n_maj integer;
BEGIN
  UPDATE inventaire_doublons d
     SET statut = 'caduque',
         preuves = COALESCE(d.preuves, '{}'::jsonb) || jsonb_build_object(
           'en_sommeil_incident_beebs_2909', jsonb_build_object(
             'le', now(), 'statut_avant', d.statut,
             'motif', 'fiche importée en double par le relevé Beebs du 29/09 21:52 — nettoyage à venir'))
    FROM auth.users u
   WHERE u.id = d.user_id AND u.email = 'josephinecerni@gmail.com'
     AND d.statut = 'proposee'
     AND d.id IN ('7fe946ac-6229-4561-a5f6-14dbc989d2f6','339ac655-d2b5-444f-834b-6802c3893a47',
       '6ac26c4e-2d0e-48ed-842c-b9d731d07cdd','fc6fad26-c3b1-4ac5-a7a2-bc52051fc7ad',
       'ec4cffb7-06e5-4508-b8f9-1c2fc62b7a48','c05ba877-0239-4c90-ad5c-f2957c98202c',
       '992eee09-8360-4393-9228-fd3ace220239','42d3a77c-bb9d-4f0e-9d56-1b85404be674',
       '7dc0f9b1-02f9-4e0d-aa79-9dbe1af736e1','34811ae1-a15b-464a-afcd-17e79c6069bd',
       'd4fe289b-303f-427d-85b1-5ac8c627afb7','05a0f4c9-b792-493b-8571-6fa0b716ada7',
       '5fa074ad-b8ac-477c-af92-de53df17e475','f78e5cd9-4913-41b9-a664-368f020212cd',
       '6c8c82fb-a8e9-42c6-84c2-7c72747a3f2a','3ed4a574-26b1-405d-9ab9-a1029841be51',
       'a83b644d-66d0-4037-86e9-9c0f5b610a6e','32ffd196-a89a-4a60-be9a-cab75e1a1bd1',
       '530ae571-aa46-467f-b620-8480751b3b71','ba200f80-81b6-4be9-9500-13d55901c617',
       'cd3d6a34-1ae5-4d3c-bb5e-dd1d08da2288');
  GET DIAGNOSTICS n_maj = ROW_COUNT;
  IF n_maj NOT IN (0, 21) THEN RAISE EXCEPTION 'attendu 21 lignes (ou 0 si déjà passée), obtenu %', n_maj; END IF;
END
$geste$;
