-- INVERSE de scripts/essais/20261029_test_clic_publier_nico.sql : remet la description et les attributs SAUVEGARDÉS de
-- « Robot aspirateur LIEE blanc et noir » (1793009407689003, compte de Nico), tels qu'avant l'essai du 29/10.
-- Sans déclencheurs pour CETTE ligne (la fusion des attributs n'enlèverait pas une clé posée par l'essai).
begin;
set local session_replication_role = replica;
update public.inventaire i
   set description = b.description, attributs = b.attributs
  from public._backup_2910_essai_clic_publier b
 where i.id = b.id and i.id = 1793009407689003 and i.user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
select i.id, md5(coalesce(i.description, '')) = md5(coalesce(b.description, '')) as description_remise,
       i.attributs = b.attributs as attributs_remis
  from public.inventaire i join public._backup_2910_essai_clic_publier b on b.id = i.id;
