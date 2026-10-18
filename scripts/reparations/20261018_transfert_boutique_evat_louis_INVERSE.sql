-- Inverse de 20261018_transfert_boutique_evat_louis.sql (18/10). Remet les deux comptes de Louis tels que sauvegardés
-- (_backup_1810_louis_*). Essai : scripts/essais/20261018_transfert_louis_inverse_essai.sql. Corps : …_INVERSE_CORPS.sql.
begin;
-- ═══════════════════════════════════════════════════════════════════════════
-- CORPS de l'INVERSE du transfert @evat de Louis (18/10). Inclus par
-- 20261018_transfert_boutique_evat_louis_INVERSE.sql (BEGIN … COMMIT) et par l'essai
-- scripts/essais/20261018_transfert_louis_inverse_essai.sql (… ROLLBACK).
-- Remet chaque ligne des deux comptes telle que sauvegardée (_backup_1810_louis_*) :
-- les lignes supprimées reviennent, les colonnes déplacées (user_id, inventaire_id,
-- fusionne_dans, pin, bêta) reprennent leur valeur ; les jumelles, les liens et le
-- registre posés par le transfert sont retirés. Rien n'est touché sur les plateformes.
-- ⚠️ Une ligne créée APRÈS le transfert par l'activité normale reste en place.
-- ═══════════════════════════════════════════════════════════════════════════
set local fillsell.sans_retrait = '1';
-- Restauration de fiches nées d'un relevé : autorisée par nous seuls (inventaire_releve_par_decision).
select set_config('fillsell.import_releve', 'on', true);
create temp table _ci as select 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid as c1, '447d920c-976a-4d8f-aff4-a2998050358c'::uuid as c2, clock_timestamp() as debut;

-- 1. Fiches : celles qui ont disparu reviennent ; propriétaire et fusion d'avant.
-- (ordre imposé par l'index unique (user_id, vinted_item_id) : les fiches @evat reviennent à C1 AVANT que les
-- fiches nues de C2, au même numéro, soient réinsérées)
update inventaire i set user_id = b.user_id, fusionne_dans = b.fusionne_dans from _backup_1810_louis_inventaire b
 where i.id = b.id and (i.user_id is distinct from b.user_id or i.fusionne_dans is distinct from b.fusionne_dans);
insert into inventaire overriding system value select b.* from _backup_1810_louis_inventaire b where not exists (select 1 from inventaire i where i.id = b.id);

-- 2. Tables à identifiant : réinsérer ce qui manque, remettre user_id / inventaire_id.
-- (toutes les remises à jour d'abord, puis les réinsertions : index uniques par compte)
update cross_post_jobs x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_jobs b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update annonces_plateforme x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_annonces b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update rapprochements x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_rapprochements b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update ventes x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_ventes b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update push_ventes x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_push_ventes b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update vinted_listing_snapshots x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_snapshots b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update vinted_republish_captures x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_captures b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update inventaire_journal x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_journal b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update remises_en_vente x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_remises b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update messagerie_conversations x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_conversations b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update plateforme_commandes x set user_id = b.user_id, inventaire_id = b.inventaire_id from _backup_1810_louis_commandes b
 where x.id = b.id and (x.user_id is distinct from b.user_id or x.inventaire_id is distinct from b.inventaire_id);
update bordereaux_demandes x set user_id = b.user_id from _backup_1810_louis_bordereaux b where x.id = b.id and x.user_id is distinct from b.user_id;
update inventaire_doublons x set user_id = b.user_id from _backup_1810_louis_doublons b where x.id = b.id and x.user_id is distinct from b.user_id;
update vinted_sync_runs x set user_id = b.user_id from _backup_1810_louis_sync_runs b where x.id = b.id and x.user_id is distinct from b.user_id;
insert into cross_post_jobs overriding system value select b.* from _backup_1810_louis_jobs b where not exists (select 1 from cross_post_jobs x where x.id = b.id);
insert into annonces_plateforme overriding system value select b.* from _backup_1810_louis_annonces b where not exists (select 1 from annonces_plateforme x where x.id = b.id);
insert into rapprochements overriding system value select b.* from _backup_1810_louis_rapprochements b where not exists (select 1 from rapprochements x where x.id = b.id);
insert into ventes overriding system value select b.* from _backup_1810_louis_ventes b where not exists (select 1 from ventes x where x.id = b.id);
insert into push_ventes overriding system value select b.* from _backup_1810_louis_push_ventes b where not exists (select 1 from push_ventes x where x.id = b.id);
insert into vinted_listing_snapshots overriding system value select b.* from _backup_1810_louis_snapshots b where not exists (select 1 from vinted_listing_snapshots x where x.id = b.id);
insert into inventaire_journal overriding system value select b.* from _backup_1810_louis_journal b where not exists (select 1 from inventaire_journal x where x.id = b.id);
insert into remises_en_vente overriding system value select b.* from _backup_1810_louis_remises b where not exists (select 1 from remises_en_vente x where x.id = b.id);
insert into messagerie_conversations overriding system value select b.* from _backup_1810_louis_conversations b where not exists (select 1 from messagerie_conversations x where x.id = b.id);
insert into plateforme_commandes overriding system value select b.* from _backup_1810_louis_commandes b where not exists (select 1 from plateforme_commandes x where x.id = b.id);
insert into inventaire_doublons overriding system value select b.* from _backup_1810_louis_doublons b where not exists (select 1 from inventaire_doublons x where x.id = b.id);

-- 3. Tables à clé composée : on remet exactement les lignes sauvegardées des deux comptes.
delete from vinted_commandes_articles x using _ci where x.user_id in (_ci.c1, _ci.c2)
  and exists (select 1 from _backup_1810_louis_vca b where b.commande_ref = x.commande_ref and b.item_id = x.item_id);
insert into vinted_commandes_articles overriding system value select b.* from _backup_1810_louis_vca b
 where not exists (select 1 from vinted_commandes_articles x where x.user_id = b.user_id and x.commande_ref = b.commande_ref and x.item_id = b.item_id);
delete from ventes_operations x using _ci where x.user_id in (_ci.c1, _ci.c2)
  and exists (select 1 from _backup_1810_louis_ventes_operations b where b.cle = x.cle);
insert into ventes_operations overriding system value select b.* from _backup_1810_louis_ventes_operations b
 where not exists (select 1 from ventes_operations x where x.user_id = b.user_id and x.cle = b.cle);
delete from fiches_annonce x where x.inventaire_id in (select id from _backup_1810_louis_inventaire)
  or x.inventaire_id in (select id from inventaire where origine = 'transfert_boutique_1810');
insert into fiches_annonce overriding system value select b.* from _backup_1810_louis_fiches_annonce b where not exists (select 1 from fiches_annonce x where x.inventaire_id = b.inventaire_id);
delete from inventaire_doublons_verifies x where x.inventaire_id in (select inventaire_id from _backup_1810_louis_doublons_verifies);
insert into inventaire_doublons_verifies overriding system value select b.* from _backup_1810_louis_doublons_verifies b;

-- 4. Pins, bêta, registre, liens, jumelles.
-- (le registre rend @evat AVANT que le pin du compte principal la reprenne)
delete from boutiques_plateforme where platform = 'vinted' and compte_ref = '371531' and source = 'transfert_louis_1810';
update profiles p set vinted_sync_pin = b.vinted_sync_pin, beta_flags = b.beta_flags from _backup_1810_louis_profiles b where p.id = b.id;
update boutiques_plateforme set source = 'pin_unique_1810' where platform = 'vinted' and compte_ref = '247512093' and source = 'transfert_louis_1810';
delete from fiches_liees_comptes where source = 'transfert_boutique_evat_1810';
delete from comptes_lies c using _ci where c.user_a = least(_ci.c1, _ci.c2) and c.user_b = greatest(_ci.c1, _ci.c2);
delete from inventaire where origine = 'transfert_boutique_1810'
  and not exists (select 1 from cross_post_jobs j where j.inventaire_id = inventaire.id)
  and not exists (select 1 from ventes v where v.inventaire_id = inventaire.id);

-- 5. Ce que les déclencheurs ont fait naître pendant l'inverse : AUCUNE notification de vente ne part (les ventes
--    réinsérées en créent — essai du 18/10 : 8), et @evat revient « en doute » au registre (deux pins, aucun propriétaire).
delete from push_ventes p using _ci where p.user_id in (_ci.c1, _ci.c2) and p.cree_le >= now()  -- now() = début de la transaction de l'inverse
  and not exists (select 1 from _backup_1810_louis_push_ventes b where b.id = p.id);
delete from boutiques_plateforme where platform = 'vinted' and compte_ref = '371531';


commit;
