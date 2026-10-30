-- Essai à blanc de 20261030130000 (lot D partie 2), rejoué DANS la transaction de l'essai, puis ROLLBACK.
-- Compte de Nico seulement (f44b5917…). Rien ne survit au ROLLBACK.
do $$
declare r jsonb; n int; v text; u uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
begin
  -- A. Rotation levée : Nico, option offerte (comme le script de test du 05/10), est servi SANS IP attribuée.
  update public.profiles set is_cloud = true, cloud_canal = 'offert' where id = u;
  select count(*) into n from public.cloud_comptes_a_servir() s where s.user_id = u and s.ip_id is null;
  if n <> 1 then raise exception 'A1 Nico non servi en rotation (%)', n; end if;
  select count(*) into n from public.cloud_ips where user_id = u;
  if n <> 0 then raise exception 'A2 une IP a été attribuée en rotation'; end if;
  r := public.cloud_compte_synchroniser(u);
  if r->>'action' <> 'rotation' then raise exception 'A3 synchroniser : %', r; end if;
  -- B. Sans rotation : le modèle dédié du 05/10 revient tel quel (Nico non servi sans IP).
  update public.coin_config set value = 0 where key = 'cloud_ip_rotation';
  select count(*) into n from public.cloud_comptes_a_servir() s where s.user_id = u;
  if n <> 0 then raise exception 'B1 servi sans IP hors rotation (%)', n; end if;
  update public.coin_config set value = 1 where key = 'cloud_ip_rotation';
  -- C. Les comptes sans Cloud ne sont jamais servis.
  select count(*) into n from public.cloud_comptes_a_servir() s where s.user_id <> u;
  if n <> 0 then raise exception 'C1 un autre compte est servi (%)', n; end if;
  update public.profiles set is_cloud = null, cloud_canal = null where id = u;
  -- D. Les conditions : sous les claims de Nico, version datée seulement ; colonnes fermées à l'écriture directe.
  perform set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
  set local role authenticated;
  r := public.cloud_cgu_accepter_moi('2026-10-30');
  if (r->>'ok')::boolean is not true then raise exception 'D1 acceptation : %', r; end if;
  r := public.cloud_cgu_accepter_moi('n''importe quoi');
  if (r->>'ok')::boolean is not false then raise exception 'D2 version libre acceptée : %', r; end if;
  begin
    update public.profiles set cloud_cgu_version = '2099-01-01' where id = u;
    raise exception 'D3 écriture directe permise';
  exception when insufficient_privilege then null;
  end;
  select cloud_cgu_version into v from public.profiles where id = u;
  if v <> '2026-10-30' then raise exception 'D4 version lue : %', v; end if;
  -- E. L'état de l'exécutant se lit (clés présentes, même vides).
  r := public.cloud_executant_moi();
  if r is null or not (r ? 'poste') or not (r ? 'derniere_action') or not (r ? 'dernier_releve') then raise exception 'E1 : %', r; end if;
  -- F. La préparation d'un essai ne répond plus « pool_vide » en rotation (le sel est au vault).
  r := public.cloud_essai_preparer_moi('appareil-essai-lot-d');
  if (r->>'ok')::boolean is not true then raise exception 'F1 préparation : %', r; end if;
  reset role;
  -- G. Depop entre au coffre (la contrainte l'accepte), une plateforme inconnue toujours pas.
  insert into public.cloud_coffre (user_id, plateforme, chiffre, iv, cle_version, connecte, maj_le)
  values (u, 'depop', repeat('x', 32), 'AAAAAAAAAAAAAAAA', 1, false, now());
  begin
    insert into public.cloud_coffre (user_id, plateforme, chiffre, iv, cle_version, connecte, maj_le)
    values (u, 'opla', repeat('x', 32), 'AAAAAAAAAAAAAAAA', 1, false, now());
    raise exception 'G1 plateforme inconnue acceptée';
  exception when check_violation then null;
  end;
  raise notice 'ESSAI 20261030130000 : A→G verts';
end $$;
