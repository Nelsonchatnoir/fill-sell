-- INVERSE de 20261025_louis_seller_textes_vinted.sql : remet la description et les attributs sauvegardés des 5 fiches,
-- seulement si la description est encore celle posée par la réparation (un texte modifié depuis par Louis n'est jamais
-- effacé), et rouvre la lecture d'origine demandée.
begin;
set local lock_timeout = '5s';
update public.inventaire i
   set description = b.description, attributs = b.attributs
  from public._backup_2510_louis_seller_textes b
 where i.id = b.id and i.user_id = '447d920c-976a-4d8f-aff4-a2998050358c'
   and i.attributs -> 'description_source' ->> 'source' = 'vinted_page_publique';
update public.lectures_origine_demandees d set faite_le = null
  from public._backup_2510_louis_seller_textes b
 where d.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and d.inventaire_id = b.id;
select i.id, coalesce(length(i.description), 0) as longueur from public.inventaire i
  join public._backup_2510_louis_seller_textes b on b.id = i.id order by i.id;
commit;
