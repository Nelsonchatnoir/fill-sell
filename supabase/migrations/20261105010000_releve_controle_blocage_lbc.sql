-- ═══════════════════════════════════════════════════════════════════════════
-- LA VISITE DE CONTRÔLE D'UNE PAUSE LEBONCOIN N'EST PLUS AVALÉE PAR LA GARDE DES RELEVÉS (05/11, point 4)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le cas : louis-seller (Business) fait Leboncoin par délégation au compte Amiral. Amiral est en pause Leboncoin
-- depuis le 02/11 18:09 (Paris, signe http_403). La pause ne se lève que par une « visite de contrôle » (règle du 03/11,
-- point 7) : get-pending-jobs pose un relevé « Mes annonces », déclencheur 'controle_blocage_lbc'. Or ce déclencheur
-- manque à releve_est_veille() : le déclencheur BEFORE INSERT garde_releve_sans_geste fait RETURN NULL — ni ligne, ni
-- erreur. 690 refus pour Amiral le 04/11 (journaux postgres), 7 comptes en pause concernés ; aucune pause posée depuis
-- le 03/11 ne pouvait se lever. Amiral en pause → son extension ne fait plus le travail délégué → plus aucune action
-- Leboncoin pour Louis depuis le 02/11 16:52 (le retrait 69f89a6d attend depuis le 03/11 15:36).
-- La règle : un relevé que le SERVEUR pose pour lire (jamais importer) est un relevé de veille. La visite de contrôle
-- est une lecture seule (aucune action, aucun import) : elle rejoint la liste. Rien d'autre ne change.
-- Définition de départ : celle lue EN PROD le 05/11 (pg_get_functiondef, md5 7e2c89d3cdc246613703c6b066c5350b).
-- Inverse : supabase/rollbacks/20261105010000_releve_controle_blocage_lbc_INVERSE.sql.
-- Preuve sur un Postgres jetable : scripts/preuve-releve-controle-blocage-lbc.mjs. Miroir de l'app :
-- src/utils/declencheursReleve.js (selftest:releve-veille-miroir).
BEGIN;

CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api', 'serveur:lecture_origine',
    'serveur:introuvable_a_confirmer', 'controle_blocage_lbc')
$function$;

COMMIT;
