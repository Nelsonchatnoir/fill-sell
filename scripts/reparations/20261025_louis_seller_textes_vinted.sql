-- 25/10 ~10:55 Paris — louis-seller (447d920c, boutique Vinted evat 371531) : son lot « Publier 5 articles » est
-- bloqué sur « Lecture de ton annonce d'origine » depuis 10:29 (mail de Louis à Nico, 10:35 : « complètement bloqué »).
-- Les 5 fiches sont nées du relevé du dressing le 24/10 12:21 SANS description (le relevé ne la porte pas) ; la
-- lecture demandée à 10:29-10:32 (lectures_origine_demandees) n'a jamais été faite par son poste (0.6.141, en ligne,
-- 0 job en file, polls toutes les 2 min : la lecture de détail échoue sur ce poste — cause côté extension à établir,
-- règle corrigée dans le même lot). Les textes ont été LUS ce matin sur les pages PUBLIQUES de ses 5 annonces Vinted
-- (navigateur de Nico, aucune connexion à son compte) : ce sont SES textes, mot pour mot. Ici : la fiche reçoit SA
-- description seulement si elle est vide (jamais un texte écrasé), la source est tracée, la lecture demandée est close.
-- Aucune annonce touchée, aucun job créé, 0 mail. Sauvegarde : _backup_2510_louis_seller_textes.
-- Inverse : 20261025_louis_seller_textes_vinted_INVERSE.sql.
begin;
set local lock_timeout = '5s';

create table if not exists public._backup_2510_louis_seller_textes as
  select now() as sauve_le, i.id, i.description, i.attributs
    from public.inventaire i where false;
alter table public._backup_2510_louis_seller_textes enable row level security;
revoke all on table public._backup_2510_louis_seller_textes from public, anon, authenticated;

create temporary table _textes (fiche bigint primary key, item text not null, texte text not null) on commit drop;
insert into _textes (fiche, item, texte) values
  (1792837269776012, '10499143345', $t$Vendu avec tous les accessoires présents en photo
Petit coffret qui se ferme à l'aide d'une clef présente sous le coffret$t$),
  (1792837269776011, '10499249488', $t$Vendu avec tous les accessoires présents en photo
Petit coffret qui se ferme à l'aide d'une clef présente sous le coffret$t$),
  (1792837269776002, '10506509036', $t$Vendu avec les accessoires présents sur les photos
Miroir abimé$t$),
  (1792837269776001, '10506593836', $t$Le set est complet et comprend :
• La maman et le bébé
• Le berceau blanc à motifs et la table à langer
• Tous les accessoires d'origine (biberon, doudou ours, petit pot, hochet, crème, ballon...)
En très bon état, idéal pour être emporté partout grâce à sa poignée de transport !$t$),
  (1792837269775000, '10506719817', $t$Grand set Spirit vendu avec personnages et accessoires présents sur les photos
Vendu d'occasion en parfait état, exactement comme sur les photos (sans la boîte d'origine).$t$);

-- Garde : les 5 fiches de CE compte, même annonce, toujours sans description.
do $$
declare n integer;
begin
  select count(*) into n
    from public.inventaire i join _textes t on t.fiche = i.id
   where i.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and i.vinted_item_id = t.item
     and coalesce(btrim(i.description), '') = '';
  if n <> 5 then raise exception 'état inattendu : % fiche(s) au lieu de 5 — rien écrit', n; end if;
end $$;

insert into public._backup_2510_louis_seller_textes
select now(), i.id, i.description, i.attributs from public.inventaire i join _textes t on t.fiche = i.id
 where not exists (select 1 from public._backup_2510_louis_seller_textes b where b.id = i.id);

update public.inventaire i
   set description = t.texte,
       attributs = coalesce(i.attributs, '{}'::jsonb) || jsonb_build_object('description_source', jsonb_build_object(
         'v', 'vinted', 'source', 'vinted_page_publique', 'at', now(),
         'par', 'scripts/reparations/20261025_louis_seller_textes_vinted.sql'))
  from _textes t
 where i.id = t.fiche and i.user_id = '447d920c-976a-4d8f-aff4-a2998050358c'
   and coalesce(btrim(i.description), '') = '';

update public.lectures_origine_demandees d set faite_le = now()
  from _textes t
 where d.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and d.inventaire_id = t.fiche and d.faite_le is null;

select i.id, length(i.description) as longueur, i.attributs -> 'description_source' ->> 'source' as source,
       (select d.faite_le is not null from public.lectures_origine_demandees d
         where d.user_id = i.user_id and d.inventaire_id = i.id) as lecture_close,
       (select count(*) from public.email_logs e where e.user_id = i.user_id and e.sent_at > now() - interval '5 minutes') as mails
  from public.inventaire i join _textes t on t.fiche = i.id order by i.id;
commit;
