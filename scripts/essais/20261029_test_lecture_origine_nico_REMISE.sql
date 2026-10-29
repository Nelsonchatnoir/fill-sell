-- Remise à l'état d'AVANT l'essai (29/10, lot C partie 1) de la fiche de test du compte de Nico 1793009407689014
-- (annonce Vinted 9872357762, « Casquette Volcom beige logo diamant ») : elle n'avait PAS de description le 29/10 à 22:57
-- (relu). L'essai l'a lue et posée ; pour mesurer chaque situation sur la même annonce, on retire ce que l'essai a écrit
-- (description, marqueurs de lecture) et on ferme la demande. Sauvegarde d'abord. Inverse : remettre la ligne sauvegardée.
create table if not exists public._backup_3010_essai_lecture_origine as
  select now() as sauve_le, id, description, attributs from public.inventaire where id = 1793009407689014;
alter table public._backup_3010_essai_lecture_origine enable row level security;
revoke all on public._backup_3010_essai_lecture_origine from anon, authenticated;
-- La fusion des attributs (déclencheur inventaire_attributs_fusion_trg) n'enlève jamais une clé : le retrait des
-- marqueurs de l'essai se fait sans déclencheurs, pour CETTE ligne et cette transaction seulement.
begin;
set local session_replication_role = replica;
update public.inventaire
   set description = null,
       attributs = coalesce(attributs, '{}'::jsonb) - 'description_source' - 'page_publique_lue'
 where id = 1793009407689014 and user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
commit;
update public.lectures_origine_demandees set faite_le = now(), motif = null
 where inventaire_id = 1793009407689014 and faite_le is null;
select id, description is null as sans_description, attributs ? 'description_source' as marqueur from public.inventaire where id = 1793009407689014;
