-- Essai réel (29/10, lot C partie 1) du CLIC sur Publier, compte de Nico : une fiche importée de Vinted, EN VENTE, dont
-- la description n'est pas encore là. Aucune fiche de Nico n'était dans ce cas le 29/10 à 23:40 (relu) : on y met
-- « Robot aspirateur LIEE blanc et noir » (1793009407689003, annonce Vinted 10219042382, active), sans sa description
-- ni ses marqueurs de lecture. L'app doit la relire SEULE au clic (même chemin que pour tous les comptes).
-- Sauvegarde d'abord ; inverse : scripts/essais/20261029_test_clic_publier_nico_REMISE.sql (remet la ligne sauvegardée).
create table if not exists public._backup_2910_essai_clic_publier as
  select now() as sauve_le, id, description, attributs from public.inventaire where id = 1793009407689003;
alter table public._backup_2910_essai_clic_publier enable row level security;
revoke all on public._backup_2910_essai_clic_publier from anon, authenticated;
-- La fusion des attributs (déclencheur inventaire_attributs_fusion_trg) n'enlève jamais une clé : le retrait des
-- marqueurs se fait sans déclencheurs, pour CETTE ligne et cette transaction seulement.
begin;
set local session_replication_role = replica;
update public.inventaire
   set description = null,
       attributs = coalesce(attributs, '{}'::jsonb) - 'description_source' - 'page_publique_lue'
 where id = 1793009407689003 and user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
update public.lectures_origine_demandees set faite_le = now(), motif = null
 where inventaire_id = 1793009407689003 and faite_le is null;
select id, description is null as sans_description, attributs ? 'description_source' as marqueur,
       (select count(*) from public._backup_2910_essai_clic_publier) as sauvegarde
  from public.inventaire where id = 1793009407689003;
