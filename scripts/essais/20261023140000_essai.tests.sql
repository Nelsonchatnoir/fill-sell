-- Tests de 20261023140000_republication_annonce_introuvable (assemblés par 20261023140000_generer.sh, ROLLBACK).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  louis uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  v_regl jsonb; rec record; n_avant integer; n_apres integer; v_fiche bigint; v_lid text;
begin
  v_regl := coalesce((select platform_settings #> '{beebs,republish_planifiee}' from profiles where id = louis), '{}'::jsonb) || jsonb_build_object('age_jours', 7);
  -- A. Les 8 annonces mortes de louis@ (34154795…) ne sont plus candidates
  --    (leurs republications en pause sont closes ici, dans la transaction annulée : la situation de la nuit suivante)
  update cross_post_jobs set status = 'cancelled', platform_fields = platform_fields || jsonb_build_object('annonce_disparue', jsonb_build_object('at', now() - interval '1 hour'))
   where user_id = louis and platform = 'beebs' and action = 'republish' and status = 'needs_user';
  select count(*) into n_avant from public.republish_planifiee_candidats(louis, v_regl, 'beebs') c
   where c.item_id in ('34154795','34154826','34156147','34156303','34156639','34156862','34157037','34157225') and c.motif is null;
  select count(*) into n_apres from public.republish_planifiee_candidats(louis, v_regl, 'beebs') c
   where c.item_id in ('34154795','34154826','34156147','34156303','34156639','34156862','34157037','34157225') and c.motif = 'annonce_introuvable';
  insert into _r values ('A1 les 8 annonces Beebs mortes de louis@ : jamais candidates (annonce_introuvable)', n_avant = 0 and n_apres >= 1, n_avant || ' éligibles, ' || n_apres || ' écartées');
  -- B. Ses autres annonces Beebs vivantes restent candidates comme avant
  select count(*) into n_avant from public.republish_planifiee_candidats(louis, v_regl, 'beebs') c where c.motif is null;
  insert into _r values ('B1 ses annonces Beebs vivantes restent éligibles', n_avant > 0, n_avant::text);
  -- C. Un relevé qui REVOIT l'annonce lève la garde de lui-même
  select c.inv_id, c.item_id into v_fiche, v_lid from public.republish_planifiee_candidats(louis, v_regl, 'beebs') c where c.motif = 'annonce_introuvable' limit 1;
  update annonces_plateforme set vu_le = now() where user_id = louis and platform = 'beebs' and listing_id = v_lid;
  select * into rec from public.republish_planifiee_candidats(louis, v_regl, 'beebs') c where c.item_id = v_lid;
  insert into _r values ('C1 revue par un relevé : la garde tombe', rec.motif is distinct from 'annonce_introuvable', coalesce(rec.motif, 'éligible'));
  -- D. Vinted : inchangé (même nombre de candidats éligibles avant / après la migration n'est pas testable ici ; on vérifie qu'elle répond)
  select count(*) into n_avant from public.republish_planifiee_candidats(louis, '{}'::jsonb, 'vinted');
  insert into _r values ('D1 Vinted : la branche répond (inchangée)', n_avant >= 0, n_avant::text);
end $$;
select essai, ok, left(coalesce(detail, ''), 160) detail from _r order by essai;
select count(*) filter (where ok) || ' / ' || count(*) as bilan from _r;
