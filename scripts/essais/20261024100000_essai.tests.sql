-- Tests de 20261024100000_boutiques_liberees_a_la_suppression (assemblés par 20261024100000_generer.sh, ROLLBACK).
create temp table _r (essai text, ok boolean, detail text);
grant all on _r to public;
do $$
declare
  n integer; n2 integer; v_user uuid := gen_random_uuid(); v_user2 uuid := gen_random_uuid();
  v_reglox uuid := 'fa2011a6-9b49-40b0-b2ff-2dee4f2fadde';
begin
  -- B1 les 7 orphelines connues sont sauvegardées, puis libérées.
  select count(*) into n from public._backup_2410_boutiques_orphelines;
  insert into _r values ('B1 sauvegarde : 7 orphelines (15685736, 28713404, 277637638, 393141, 282387723, 3139310768, 32668712)',
    n = 7 and (select count(*) from public._backup_2410_boutiques_orphelines where compte_ref in
      ('15685736','28713404','277637638','393141','282387723','3139310768','32668712')) = 7, n::text);
  select count(*) into n from public.boutiques_plateforme b where not exists (select 1 from auth.users u where u.id = b.user_id);
  insert into _r values ('B2 plus aucune orpheline', n = 0, n::text);
  select count(*) into n from public.boutiques_plateforme;
  insert into _r values ('B3 les boutiques des comptes vivants restent (273 - 7 = 266)', n = 266, n::text);
  select count(*) into n from public.boutiques_plateforme where user_id = v_reglox;
  insert into _r values ('B4 reglox560 garde sa boutique', n = 1, n::text);

  -- P1 la sauvegarde est née protégée.
  insert into _r values ('P1 sauvegarde : RLS active, aucun droit anon ni authenticated',
    (select relrowsecurity from pg_class where oid = 'public._backup_2410_boutiques_orphelines'::regclass)
    and not has_table_privilege('anon', 'public._backup_2410_boutiques_orphelines', 'SELECT')
    and not has_table_privilege('authenticated', 'public._backup_2410_boutiques_orphelines', 'SELECT'), null);

  -- R1 la règle : chaque réservation et chaque lien entre comptes suit son compte (ON DELETE CASCADE vers auth.users).
  -- (Aucun compte n'est créé ni supprimé ici : un INSERT dans auth.users déclencherait handle_new_user — mail de
  -- bienvenue. La cascade est une garantie de Postgres ; on vérifie qu'elle est posée, et qu'elle refuse l'orphelin.)
  select count(*) into n from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c'
     and c.conname in ('boutiques_plateforme_user_id_fkey', 'comptes_lies_user_a_fkey', 'comptes_lies_user_b_fkey',
                       'fiches_liees_comptes_user_a_fkey', 'fiches_liees_comptes_user_b_fkey');
  insert into _r values ('R1 5 liens vers auth.users en ON DELETE CASCADE (boutiques, comptes liés, fiches liées)', n = 5, n::text);
  -- R4 une boutique libérée se réserve par un compte vivant (le pin passe).
  insert into public.boutiques_plateforme (platform, compte_ref, user_id, source)
    values ('vinted', '15685736', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai');
  insert into _r values ('R4 la boutique libérée 15685736 se réserve par un compte vivant', true, null);
  perform v_user, v_user2;
  -- R5 une réservation vers un compte inexistant est refusée.
  begin
    insert into public.boutiques_plateforme (platform, compte_ref, user_id, source) values ('vinted', 'essai-2410-d', gen_random_uuid(), 'essai');
    insert into _r values ('R5 réservation pour un compte inexistant refusée', false, 'acceptée');
  exception when foreign_key_violation then
    insert into _r values ('R5 réservation pour un compte inexistant refusée', true, 'refusée (23503)');
  end;
end $$;
select essai, ok, detail from _r order by essai;
select count(*) filter (where ok) as verts, count(*) as total from _r;
