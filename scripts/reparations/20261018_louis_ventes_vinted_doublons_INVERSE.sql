-- Inverse de 20261018_louis_ventes_vinted_doublons.sql (depuis les sauvegardes _backup_1810_louis_vdv_*).
-- Remettre une vente fait naître des push (déclencheurs ventes_push_*) : ceux nés ici sont retirés (aucun mail).
begin;
insert into ventes overriding system value select * from _backup_1810_louis_vdv_ventes;
insert into ventes_operations select * from _backup_1810_louis_vdv_ops on conflict do nothing;
insert into usage_logs select * from _backup_1810_louis_vdv_usage on conflict do nothing;
update vinted_commandes_articles x set vente_id = b.vente_id, decision = b.decision, motif = b.motif, decide_le = b.decide_le, maj_le = b.maj_le
  from _backup_1810_louis_vdv_vca b where x.user_id = b.user_id and x.commande_ref = b.commande_ref and x.item_id = b.item_id;
delete from push_ventes p where p.vente_id in (select id from _backup_1810_louis_vdv_ventes) and p.cree_le >= now();
commit;
