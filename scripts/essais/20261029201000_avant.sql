-- Essai de 20261029201000 (29/10, lot B 4.9 B) — partie AVANT la migration, assemblée par 20261029201000_generer.sh
-- (transaction annulée). Le retrait cfed66ca de Sébastien (copie Beebs 34219819, fiche supprimée) est mis dans l'état
-- que le filet regarde : clos « deleted », puis l'annonce revue EN LIGNE par un relevé (ligne posée dans la transaction).
-- La fonction DE LA PROD le juge d'abord (sous-bloc défait par une exception).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
create temp table _avant (n_rearmes integer, statut text);
update public.cross_post_jobs set status = 'deleted', error = null where id = 'cfed66ca-ae69-48c2-a312-ab796a79bdd7';
insert into public.annonces_plateforme (user_id, platform, listing_id, url, statut_plateforme, vu_le)
values ('48dd94f7-3105-49a7-af54-24d9c479a980', 'beebs', '34219819', 'https://www.beebs.app/fr/p/34219819', 'en_ligne', now());
do $avant$
declare v text;
begin
  begin
    v := public.retraits_beebs_rearmer_revus('48dd94f7-3105-49a7-af54-24d9c479a980')::text
      || ':' || (select status from public.cross_post_jobs where id = 'cfed66ca-ae69-48c2-a312-ab796a79bdd7');
    raise exception using message = v, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _avant values (split_part(sqlerrm, ':', 1)::integer, split_part(sqlerrm, ':', 2));
  end;
end
$avant$;
