-- Tests de 20261024130000_beebs_commande_ref_courte (assemblés par 20261024130000_generer.sh, ROLLBACK).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  v_nico uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  b jsonb; n_avant integer; n_apres integer; n_logs integer;
begin
  -- C1 le corps est celui attendu (une seule ligne change : {6,80} → {1,80}).
  insert into _r values ('C1 corps attendu (md5 fa0fa954…)',
    (select md5(pg_get_functiondef('public.commandes_beebs_noter(jsonb,uuid,jsonb)'::regprocedure))) = 'fa0fa9541ebc6a3bbd31b4b0dcae761b',
    (select md5(pg_get_functiondef('public.commandes_beebs_noter(jsonb,uuid,jsonb)'::regprocedure))));
  insert into _r values ('C2 droits inchangés (postgres, authenticated, service_role ; ni PUBLIC ni anon)',
    (select proacl::text from pg_proc where oid = 'public.commandes_beebs_noter(jsonb,uuid,jsonb)'::regprocedure)
      = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
    (select proacl::text from pg_proc where oid = 'public.commandes_beebs_noter(jsonb,uuid,jsonb)'::regprocedure));
  insert into _r values ('C3 interrupteur toujours éteint (fantôme)',
    (select value from public.coin_config where key = 'ventes_beebs_commandes') = 0, null);

  -- F1 un numéro court est lu ; un numéro d'une autre forme reste « forme_inconnue » ; aucune écriture (fantôme).
  select count(*) into n_avant from public.cross_post_jobs where platform_fields #>> '{sale_evidence,source}' = 'commande_beebs';
  select count(*) into n_logs from public.usage_logs where feature = 'ventes_beebs_commandes';
  b := public.commandes_beebs_noter(
    '[{"ref":"890","statut":"CANCELLED","produits":[]},
      {"ref":"12 3","statut":"SELLER_PAID","produits":["34101549"]},
      {"ref":"5","statut":"SELLER_PAID","produits":["999999999001"]},
      {"ref":"","statut":"SELLER_PAID","produits":["999999999002"]}]'::jsonb,
    v_nico, '{"requetes":2,"illisibles":0}'::jsonb);
  insert into _r values ('F1 4 reçues : « 890 » annulée lue, « 5 » lue (produit sans job), « 12 3 » et « » : forme inconnue',
    (b ->> 'recues')::int = 4 and (b ->> 'annulees')::int = 1 and (b ->> 'forme_inconnue')::int = 2
      and (b ->> 'sans_job')::int = 1 and (b ->> 'prouvees_ou_auraient')::int = 0 and b ->> 'mode' = 'fantome'
      and (b ->> 'requetes')::int = 2, b::text);
  select count(*) into n_apres from public.cross_post_jobs where platform_fields #>> '{sale_evidence,source}' = 'commande_beebs';
  insert into _r values ('F2 aucune preuve posée sur un job (fantôme)', n_avant = n_apres, n_avant || ' → ' || n_apres);
  insert into _r values ('F3 le bilan est noté (usage_logs, aucune donnée personnelle)',
    (select count(*) from public.usage_logs where feature = 'ventes_beebs_commandes') = n_logs + 1, null);

  -- F4 avant le changement, « 890 » et « 5 » auraient été « forme_inconnue » (l'ancienne garde, rejouée en SQL).
  insert into _r values ('F4 ancienne garde {6,80} : « 890 » et « 5 » refusés, « 1234567 » accepté',
    '890' !~ '^[A-Za-z0-9_-]{6,80}$' and '5' !~ '^[A-Za-z0-9_-]{6,80}$' and '1234567' ~ '^[A-Za-z0-9_-]{6,80}$'
      and '890' ~ '^[A-Za-z0-9_-]{1,80}$' and '12 3' !~ '^[A-Za-z0-9_-]{1,80}$', null);
end $$;
select essai, ok, detail from _r order by essai;
select count(*) filter (where ok) || '/' || count(*) as verts from _r;
