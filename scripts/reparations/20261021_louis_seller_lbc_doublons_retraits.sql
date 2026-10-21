-- 21/10 ≈ 22:45 — Louis : les doublons Leboncoin EN LIGNE (liste du 20/10 : 40, docs/enquetes/urgences-2010/
-- doublons-leboncoin-louis-2010.csv). Même article, deux annonces sur le MÊME compte Leboncoin : celle de louis-seller
-- (dépôt du 19-20/10 sur une fiche jumelle) et celle de louis@ (l'originale, sur la jumelle).
-- Ordre de Nico (21/10) : « retire les copies de louis-seller et garde celles de louis@, qui sont les originales.
-- AVANT chaque retrait, vérifie qu'aucune copie n'a de vente, d'achat en cours, d'offre ou de conversation active ;
-- si c'est le cas, NE RETIRE PAS cette copie et liste-la-moi. Sauvegarde et liste complète de ce qui a été retiré. »
-- Chemin normal : un job de retrait par copie (numéro et lien EXACTS de l'annonce de louis-seller), exécuté par son
-- extension (contrôle de l'URL et du titre sur la page avant suppression). Les fiches ne bougent pas : l'article reste
-- en vente par l'annonce de louis@ (copie jumelle, migration 20261020210000).
-- Contrôles, copie par copie (les deux comptes, une conversation n'étant copiée que chez l'un des deux) :
--   les deux annonces encore en ligne au relevé ; les deux fiches en stock ; aucune vente (annonce ou fiche) ; aucun
--   signal de vente ; aucune commande ; aucune offre ; aucune conversation sur l'annonce de louis-seller ; aucun
--   retrait déjà ouvert ou fait sur elle. Un seul motif suffit à ne PAS la retirer.
-- Sauvegarde : _backup_2110_louis_seller_doublons (les candidates, leurs motifs, le job de retrait créé) ;
-- inverse : 20261021_louis_seller_lbc_doublons_retraits_INVERSE.sql (annule les retraits pas encore partis).
begin;
create temp table _d as
with j as (
  select j.id as depot, j.inventaire_id as fiche_s, j.title,
         coalesce(nullif(btrim(j.platform_listing_id), ''), public.annonce_id_job('leboncoin', j.listing_url)) as x,
         j.platform_fields
    from cross_post_jobs j
   where j.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and j.platform = 'leboncoin'
     and j.action = 'publish' and j.status = 'published'
     and j.created_at >= '2026-10-18 22:00+00' and j.created_at < '2026-10-20 22:00+00')
select j.*, a.url as url_x, a.titre as titre_x, f.fiche as fiche_l, b.listing_id as y, b.url as url_y
  from j
  join annonces_plateforme a on a.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and a.platform = 'leboncoin'
   and a.listing_id = j.x and a.disparu_le is null and a.statut_plateforme = 'en_ligne'
  join lateral (select fl.fiche_b as fiche from fiches_liees_comptes fl where fl.fiche_a = j.fiche_s
                union select fl.fiche_a from fiches_liees_comptes fl where fl.fiche_b = j.fiche_s limit 1) f on true
  join lateral (select b.listing_id, b.url from annonces_plateforme b
                 where b.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and b.platform = 'leboncoin'
                   and b.inventaire_id = f.fiche and b.disparu_le is null and b.statut_plateforme = 'en_ligne'
                   and b.listing_id <> j.x
                 order by b.vu_le desc limit 1) b on true;
alter table _d add column motifs text[] not null default '{}', add column retrait uuid;
update _d set motifs = array_remove(array[
  case when exists (select 1 from inventaire i where i.id in (_d.fiche_s, _d.fiche_l) and (i.statut <> 'stock' or i.fusionne_dans is not null)) then 'fiche_pas_en_stock' end,
  case when exists (select 1 from ventes v where v.user_id in ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
                     and (v.annonce_id = _d.x or v.inventaire_id in (_d.fiche_s, _d.fiche_l))) then 'vente' end,
  case when _d.platform_fields ->> 'sale_signal' is not null or _d.platform_fields ? 'unavailable_since' then 'signal_vente_ou_absence' end,
  case when exists (select 1 from plateforme_commandes c where c.user_id in ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
                     and (c.annonce_ref = _d.x or c.inventaire_id = _d.fiche_s)) then 'commande' end,
  case when exists (select 1 from messagerie_conversations c where c.user_id in ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
                     and c.platform = 'leboncoin' and c.annonce_ref = _d.x
                     and (c.offre_statut is not null or c.offre_montant is not null or c.commande_ref is not null
                          or exists (select 1 from messagerie_messages m where m.conversation_id = c.id and (m.type = 'offre' or m.offre_statut is not null)))) then 'offre_ou_achat' end,
  case when exists (select 1 from messagerie_conversations c where c.user_id in ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7')
                     and c.platform = 'leboncoin' and c.annonce_ref = _d.x) then 'conversation' end,
  case when exists (select 1 from cross_post_jobs r where r.user_id = '447d920c-976a-4d8f-aff4-a2998050358c' and r.platform = 'leboncoin'
                     and r.action = 'delete' and r.status in ('pending', 'processing', 'needs_user', 'deleted')
                     and (btrim(r.platform_listing_id) = _d.x or r.listing_url = _d.url_x)) then 'retrait_deja_ouvert' end,
  -- louis@ republie ses annonces Leboncoin toutes les 21 min (supprimer puis recréer) : pendant une recréation en vol,
  -- la copie de louis-seller peut être la SEULE annonce de l'article — on n'y touche pas.
  case when exists (select 1 from cross_post_jobs r where r.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and r.platform = 'leboncoin'
                     and r.inventaire_id = _d.fiche_l and r.action in ('republish', 'delete')
                     and r.status in ('pending', 'processing', 'needs_user')) then 'republication_ou_retrait_en_cours_chez_louis' end,
  -- L'annonce gardée de louis@ doit être la DERNIÈRE publiée pour sa fiche (jamais une ancienne déjà remplacée).
  case when exists (select 1 from cross_post_jobs r where r.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' and r.platform = 'leboncoin'
                     and r.inventaire_id = _d.fiche_l and r.action in ('publish', 'republish') and r.status = 'published'
                     and coalesce(nullif(btrim(r.platform_listing_id), ''), public.annonce_id_job('leboncoin', r.listing_url)) is distinct from _d.y
                     and coalesce(r.published_at, r.created_at) > (select coalesce(p.published_at, p.created_at) from cross_post_jobs p
                                                                    where p.user_id = r.user_id and p.platform = 'leboncoin' and p.inventaire_id = _d.fiche_l
                                                                      and coalesce(nullif(btrim(p.platform_listing_id), ''), public.annonce_id_job('leboncoin', p.listing_url)) = _d.y
                                                                    order by coalesce(p.published_at, p.created_at) desc limit 1)) then 'annonce_gardee_deja_remplacee' end
], null);
do $g$ begin
  if (select count(*) from _d) not between 30 and 45 then raise exception 'attendu ≈ 40 doublons en ligne, trouvé % — réparation arrêtée', (select count(*) from _d); end if;
  if exists (select 1 from _d group by x having count(*) > 1) or exists (select 1 from _d where x = y) then raise exception 'une copie apparaît deux fois — réparation arrêtée'; end if;
end $g$;
with ins as (
  insert into cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, voie, title, listing_url, platform_listing_id, platform_fields)
  select '447d920c-976a-4d8f-aff4-a2998050358c', d.fiche_s, 'leboncoin', 'delete', 'pending', 'original', 'extension',
         coalesce(nullif(btrim(d.title), ''), d.titre_x), d.url_x, d.x,
         jsonb_build_object('arme_par', jsonb_build_object(
           'chemin', 'doublon_compte_relie', 'depot', d.depot, 'garde', d.y, 'garde_url', d.url_y,
           'garde_compte', 'faf5021a-479a-4bb3-b3ec-c296770739b7', 'le', now(),
           'pose_par', 'Claude 21/10 — ordre de Nico : retirer les copies de louis-seller, garder les originales de louis@'))
    from _d d where cardinality(d.motifs) = 0
  returning id, platform_listing_id)
update _d set retrait = ins.id from ins where ins.platform_listing_id = _d.x;
create table public._backup_2110_louis_seller_doublons as
  select d.depot, d.fiche_s, d.fiche_l, d.x as annonce_retiree, d.url_x, d.y as annonce_gardee, d.url_y, d.titre_x as titre,
         d.motifs, d.retrait, now() as le
    from _d d;
select (select count(*) from _d) candidates,
       (select count(*) from _d where retrait is not null) retraits_crees,
       (select count(*) from cross_post_jobs j join _d on _d.retrait = j.id where j.status = 'pending') retraits_en_file,
       (select json_agg(json_build_object('annonce', x, 'titre', left(titre_x, 50), 'motifs', motifs)) from _d where cardinality(motifs) > 0) pas_retirees,
       (select count(*) from ventes where user_id in ('447d920c-976a-4d8f-aff4-a2998050358c', 'faf5021a-479a-4bb3-b3ec-c296770739b7') and created_at >= now()) ventes_creees,
       (select count(*) from inventaire where id in (select fiche_s from _d union select fiche_l from _d) and statut <> 'stock') fiches_hors_stock;
commit;
