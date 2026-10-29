-- Essai de 20261029200000 (29/10, lot B 4.5/4.9) — partie AVANT la migration, assemblée par 20261029200000_generer.sh
-- (transaction annulée). Les trois dépôts « fantômes » du 4.5 et Polly sont remis tels que la seconde boucle de
-- trancher_publications_sans_lien les lit (publiés, jamais vus en ligne, sans verdict), puis jugés par la fonction DE LA
-- PROD sur le dernier relevé probant de leur compte : le verdict est gardé (sous-bloc annulé par une exception), pour le
-- comparer à celui de la nouvelle règle.
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
create temp table _cas (id uuid, user_id uuid, numero text, nom text);
insert into _cas values
  ('abd12bb5-2899-4bd2-a394-02dc6763f3cc', 'de63ca45-63d9-4a3c-b65a-d1345acd8b2e', '34198358', 'XEWER abd12bb5 34198358'),
  ('22362f3a-86fe-4eb3-a986-ef4569f6d89f', '447d920c-976a-4d8f-aff4-a2998050358c', '34200634', 'louis-seller 22362f3a 34200634'),
  ('ef037533-8fc0-4997-b436-3c562f3256a5', '447d920c-976a-4d8f-aff4-a2998050358c', '34200711', 'louis-seller ef037533 34200711'),
  ('4cdadbc1-886e-4af1-a40c-37bfa2f805ff', '447d920c-976a-4d8f-aff4-a2998050358c', '34206489', 'louis-seller Polly 4cdadbc1 34206489');
create temp table _runs (user_id uuid, run uuid, debut timestamptz);
insert into _runs
  select distinct on (r.user_id) r.user_id, r.id, r.started_at
    from public.vinted_sync_runs r
   where r.user_id in (select user_id from _cas) and r.platform = 'beebs' and r.kind = 'annonces'
     and r.started_at > now() - interval '3 days' and public.releve_preuve_absence(r.id)
   order by r.user_id, r.started_at desc;
create temp table _avant (v jsonb);
create temp table _bilans (quand text, user_id uuid, bilan jsonb);

-- Les quatre dépôts, remis « publiés » sans verdict (le marqueur « pas encore visible » de Polly, posé par
-- handler-watch le 20/10, reste : c'est lui qui date sa sortie de vérification).
update public.cross_post_jobs c set status = 'published', error = null,
       platform_fields = coalesce(c.platform_fields, '{}'::jsonb)
         - array['depot_jamais_en_ligne', 'unavailable_since', 'sale_signal', 'unavailable_pending_since',
                 'removed_by_user', 'pending_removal', 'retrait_arme', 'constat_en_ligne_2810']
 where c.id in (select id from _cas);

-- La règle d'AVANT (prod) : verdicts gardés, écritures annulées (sous-bloc défait par l'exception).
do $avant$
declare c record; v text; b jsonb := '[]'::jsonb;
begin
  begin
    for c in select * from _runs loop
      b := b || jsonb_build_array(jsonb_build_object('user', c.user_id,
             'bilan', public.trancher_publications_sans_lien(c.user_id, 'beebs', c.run)));
    end loop;
    select jsonb_build_object('bilans', b, 'cas', jsonb_agg(jsonb_build_object('id', j.id, 'status', j.status,
             'error', left(j.error, 200), 'issue', j.platform_fields #>> '{depot_jamais_en_ligne,issue}'))) ::text
      into v from public.cross_post_jobs j where j.id in (select id from _cas);
    raise exception using message = v, errcode = 'P0001';
  exception when sqlstate 'P0001' then
    insert into _avant values (sqlerrm::jsonb);
  end;
end
$avant$;
