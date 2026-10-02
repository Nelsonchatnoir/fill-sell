-- INVERSE de 20261002_sortie_opla_republication_planifiee.sql — à ne jouer que
-- sur décision de Nico (retour d'Opla). Rouvre la republication planifiée Opla.
UPDATE coin_config SET value = 1
 WHERE key = 'republish_planifiee_pf_opla' AND value = 0;

SELECT key, value FROM coin_config WHERE key LIKE 'republish_planifiee_pf_%' ORDER BY key;
