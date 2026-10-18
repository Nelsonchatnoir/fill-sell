-- ESSAI À BLANC (ROLLBACK) de scripts/reparations/20261018_louis_ventes_vinted_doublons.sql — rien n'est gardé.
-- 18/10 ~20:00 Paris — Louis : 2 commandes Vinted de @evat (boutique de louis-seller depuis le transfert de 18:25),
-- 23326812434 (9 articles, 18:37) et 23327856996 (3 articles, 19:02), enregistrées sur ses DEUX comptes : par la
-- veille de louis@ (sa VM, ouverte sur @evat) à 18:39:14 et 19:03:07, puis par louis-seller à 19:08:35.
-- Articles « pas suivis par FillSell » (aucune fiche, aucun retrait), prouvés de @evat par leur page publique
-- (/member/371531). Aucun mail, aucun push envoyé pour ces 12 ventes (push de louis-seller : « doublon »).
-- Règle (Nico, 18/10) : une vente n'appartient qu'au compte propriétaire → on garde celles de louis-seller, on
-- retire les 12 de louis@ (ventes, reçus ventes_operations, questions usage_logs) ; ses lignes de commande restent
-- (déjà éclatées : jamais réenregistrées), décision « compte_relie ». La règle qui l'empêche : migration 20261018230000.
-- Feu vert de Nico : 18/10 soir. Sauvegardes _backup_1810_louis_vdv_* ; inverse : 20261018_louis_ventes_vinted_doublons_INVERSE.sql.
-- Essai à blanc : scripts/essais/20261018_louis_ventes_vinted_doublons_essai.sql (même corps, ROLLBACK).
begin;
create temp table _c as select 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid u, '447d920c-976a-4d8f-aff4-a2998050358c'::uuid s;
create temp table _v as
  select v.id, v.annonce_id, v.commande_ref from ventes v, _c
   where v.user_id = _c.u and v.plateforme_code = 'vinted'
     and split_part(v.commande_ref, ':', 1) in ('23326812434', '23327856996')
     and v.inventaire_id is null and v.source = 'releve'
     and exists (select 1 from ventes w where w.user_id = _c.s and w.plateforme_code = 'vinted' and w.commande_ref = v.commande_ref);
do $g$ begin
  if (select count(*) from _v) <> 12 then raise exception 'attendu 12 ventes en double, trouvé % — réparation arrêtée', (select count(*) from _v); end if;
  if exists (select 1 from push_ventes p where p.vente_id in (select id from _v)) then raise exception 'un push existe pour ces ventes — réparation arrêtée'; end if;
end $g$;
create table public._backup_1810_louis_vdv_ventes as select v.* from ventes v where v.id in (select id from _v);
create table public._backup_1810_louis_vdv_ops as
  select o.* from ventes_operations o, _c where o.user_id = _c.u and o.cle in (select 'annonce:vinted:' || annonce_id from _v);
create table public._backup_1810_louis_vdv_usage as
  select l.* from usage_logs l, _c where l.user_id = _c.u and l.feature = 'vente_vinted_article_inconnu'
     and l.metadata ->> 'commande' in ('23326812434', '23327856996');
create table public._backup_1810_louis_vdv_vca as
  select x.* from vinted_commandes_articles x, _c where x.user_id = _c.u and x.commande_ref in ('23326812434', '23327856996');
update vinted_commandes_articles x set vente_id = null, decision = 'compte_relie',
       motif = 'commande de @evat (louis-seller) : enregistrée chez lui — doublon retiré le 18/10', decide_le = now(), maj_le = now()
  from _c where x.user_id = _c.u and x.commande_ref in ('23326812434', '23327856996');
delete from ventes_operations o using _c where o.user_id = _c.u and o.cle in (select 'annonce:vinted:' || annonce_id from _v);
delete from usage_logs l using _c where l.user_id = _c.u and l.feature = 'vente_vinted_article_inconnu'
   and l.metadata ->> 'commande' in ('23326812434', '23327856996');
delete from ventes where id in (select id from _v);
select (select count(*) from _backup_1810_louis_vdv_ventes) ventes_retirees, (select count(*) from _backup_1810_louis_vdv_ops) recus,
       (select count(*) from _backup_1810_louis_vdv_usage) questions, (select count(*) from _backup_1810_louis_vdv_vca) lignes_commande,
       (select count(*) from ventes v, _c where v.user_id = _c.s and split_part(v.commande_ref, ':', 1) in ('23326812434', '23327856996')) gardees_louis_seller,
       (select count(*) from ventes v, _c where v.user_id = _c.u and split_part(v.commande_ref, ':', 1) in ('23326812434', '23327856996')) restent_louis,
       (select count(*) from push_ventes p, _c where p.user_id in (_c.u, _c.s) and p.cree_le >= now()) push_crees;
rollback;
