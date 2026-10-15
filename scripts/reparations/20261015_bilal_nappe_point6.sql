-- Point 6 — Bilal (66ffd657-ae13-408a-9f46-40803de20819), fiche 1790523715035002.
-- Relu et rejoué dans une transaction annulée (15/10 ~16:50) : 3 retraits exactement, note « déclarée » (0 mail, 0 push). EXÉCUTÉ sur décision de Nico (point 6).
-- Circuit normal : la vente relevée 95888 (commande Vinted 22659388975) reçoit son
-- annonce et sa fiche, puis la carte « Vendue » se clôt par la règle du 15/10
-- (signal_vente_clore_vente_relevee : vente déclarée, 0 mail, 0 push) ; la fiche
-- passe vendue et inventaire_vendu_retire_ses_copies arme les retraits PROUVÉS
-- (fusion utilisateur:photo_go_nico_3009, une annonce vivante par plateforme).
-- Preuve du lien 95888 ↔ annonce 10152700586 (PAS le titre) : vendue le 27/09
-- 15:46:31 UTC, entre la dernière vue « active » de 10152700586 (15:41:54 UTC) et
-- son « indisponible » (17:42:49 UTC) ; même prix (8 € = detected_price) ; seule
-- vente relevée sans annonce du compte dans cette fenêtre ; les autres annonces
-- roses étaient vendues avant le 16/08 ou publiées le 05/10.
begin;
create table if not exists public._backup_1510_bilal_nappe_vente as
  select * from public.ventes where id = 95888;
update public.ventes
   set inventaire_id = 1790523715035002, annonce_id = '10152700586'
 where id = 95888 and user_id = '66ffd657-ae13-408a-9f46-40803de20819'
   and inventaire_id is null and annonce_id is null and commande_ref = '22659388975';
select public.signal_vente_clore_vente_relevee('cf6cd26c-594c-4339-96d7-2cfac07cb3f6', 95888, 'reparation_1510_bilal_point6');
-- Attendu : fiche 1790523715035002 vendu / quantité 0 ; job Vinted cf6cd26c 'sold' ;
-- 3 jobs delete 'pending' (next_action_after +10 min) :
--   beebs d122db19-9152-4510-bd06-11e5a4fc726f (33817108)
--   ebay  228e794b-dfdc-422e-a99e-d8db39f32368 (820034102196)
--   leboncoin edf13e48-105f-4c93-911d-0218968c1b1c (3254540549)
select id, platform, status, platform_listing_id from public.cross_post_jobs
 where inventaire_id = 1790523715035002 and action = 'delete';
-- Si autre chose que ces 3 lignes : rollback.
commit;
-- Ne JAMAIS toucher : 1791185668012007 (rose, Vinted 10251192120), 1786896340860
-- (Grey Lotus, 4 plateformes), 1788032381189001 (lotus gris, Vinted).
-- Inverse (si les retraits n'ont pas encore tourné) : annuler les 3 delete pending,
-- fiche statut 'stock' quantite 1, job cf6cd26c 'published' sans vente_operation_cle /
-- vente_meme_cession, delete ventes_operations cle 'annonce:vinted:10152700586',
-- ventes 95888 restaurée depuis _backup_1510_bilal_nappe_vente.
