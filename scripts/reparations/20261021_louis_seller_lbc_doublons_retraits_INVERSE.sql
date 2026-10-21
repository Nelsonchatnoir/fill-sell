-- INVERSE de 20261021_louis_seller_lbc_doublons_retraits.sql : annule les retraits créés par le script qui ne sont PAS
-- encore partis (pending / needs_user). Un retrait déjà exécuté (deleted) a supprimé l'annonce chez Leboncoin : il ne
-- s'annule pas — la liste ci-dessous le dit ; pour la remettre en ligne, il faudrait un nouveau dépôt.
begin;
update cross_post_jobs j set status = 'cancelled',
       error = 'Retrait annulé avant son départ (inverse du retrait des doublons du 21/10).'
  from public._backup_2110_louis_seller_doublons b
 where j.id = b.retrait and j.status in ('pending', 'needs_user');
select (select count(*) from cross_post_jobs j join public._backup_2110_louis_seller_doublons b on b.retrait = j.id where j.status = 'cancelled') annules,
       (select json_agg(b.annonce_retiree) from cross_post_jobs j join public._backup_2110_louis_seller_doublons b on b.retrait = j.id where j.status in ('processing', 'deleted')) deja_partis;
commit;
