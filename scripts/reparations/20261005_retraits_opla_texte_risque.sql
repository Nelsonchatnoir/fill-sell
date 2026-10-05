-- 05/10 — Retraits Opla bloqués par une connexion : le texte dit le risque
-- 9 retraits (Joséphine 8, Ornella 1), articles VENDUS, en needs_user « Connexion
-- Opla requise … Ton annonce est intacte » — faux pour un retrait : l'annonce est
-- encore en ligne. Même texte que mur-geste.js (messageConnexionRequise, retrait)
-- déployé le 05/10 (gpj v217). Statut, champs et tentatives inchangés ; handler-watch
-- v82 ne les solde plus (retraitBloqueParConnexion).
-- Sauvegarde : 20261005_retraits_opla_texte_risque_SAUVEGARDE.json ; inverse : _INVERSE.sql
BEGIN;
UPDATE cross_post_jobs SET error = 'Connexion Opla requise : reconnecte-toi à Opla dans Chrome, sur ton ordinateur. Ton article est vendu mais son annonce est encore en ligne sur Opla (risque de double vente) : FillSell la retire tout seul dès que c''est fait.'
 WHERE action = 'delete' AND platform = 'opla' AND status = 'needs_user'
   AND error LIKE 'Connexion Opla requise : reconnecte-toi à Opla dans Chrome, sur ton ordinateur. Ton annonce est intacte%'
   AND id IN (
  'f792051a-eef3-4c54-8738-f222e752f8b4',
  'e9910c62-48fc-427d-a7b3-9815fc3dc9f4',
  'fcc9a630-2a1f-423f-b4d0-5d3961804fc4',
  'fb0b9ee8-d35f-4063-b18f-a8b21f34e29b',
  '1459602f-2dce-4943-ac68-296aabb81d33',
  '7dd90016-7a59-468d-9160-4122aa641a21',
  'd716e3db-ceb0-4130-9ee0-1bf36e28c77f',
  '4ae7c096-6976-4430-803f-2f1f963604f0',
  'ba4c46d2-0a2c-431d-92e3-a618b02e3437');
SELECT count(*) AS textes_corriges FROM cross_post_jobs WHERE id IN (
  'f792051a-eef3-4c54-8738-f222e752f8b4',
  'e9910c62-48fc-427d-a7b3-9815fc3dc9f4',
  'fcc9a630-2a1f-423f-b4d0-5d3961804fc4',
  'fb0b9ee8-d35f-4063-b18f-a8b21f34e29b',
  '1459602f-2dce-4943-ac68-296aabb81d33',
  '7dd90016-7a59-468d-9160-4122aa641a21',
  'd716e3db-ceb0-4130-9ee0-1bf36e28c77f',
  '4ae7c096-6976-4430-803f-2f1f963604f0',
  'ba4c46d2-0a2c-431d-92e3-a618b02e3437') AND error LIKE '%risque de double vente%';
COMMIT;
