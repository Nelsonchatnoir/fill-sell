-- Sortie d'Opla (02/10/2026, décision de Nico, lot A1) : plus aucune
-- republication Opla, y compris la republication PLANIFIÉE automatique.
--
-- L'interrupteur prévu pour ça : coin_config `republish_planifiee_pf_opla`
-- (lu par republish_planifiee_pf_ouverte, appelé par republish_planifiee_sweep
-- avant TOUT appel à spend_coins_and_republish pour la plateforme). À 0, le
-- balayage passe Opla (« plateforme_fermee ») ; Vinted, Leboncoin et Beebs ne
-- bougent pas (leurs clés restent à 1). Aucune donnée de compte touchée : les
-- réglages `platform_settings.opla.republish_planifiee` des 2 comptes qui
-- l'avaient activée restent tels quels.
--
-- Avant (relu le 02/10) : republish_planifiee_pf_opla = 1.
-- Inverse : 20261002_sortie_opla_republication_planifiee_INVERSE.sql

UPDATE coin_config SET value = 0
 WHERE key = 'republish_planifiee_pf_opla' AND value = 1;

SELECT key, value FROM coin_config WHERE key LIKE 'republish_planifiee_pf_%' ORDER BY key;
