-- ═══════════════════════════════════════════════════════════════════════════
-- noter_poste_extension — FUSION ATOMIQUE D'UN POSTE (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════════════
-- get-pending-jobs et update-job-status écrivaient chacun profiles.
-- extension_postes en entier après l'avoir lu : deux postes qui pollent en
-- parallèle (le cas même qu'on corrige : Louis, deux profils Chrome) se
-- perdaient leurs mises à jour — l'accès Opla appris par l'un était effacé par
-- le poll de l'autre. Ici : verrou de ligne, fusion de l'entrée du poste,
-- élagage des postes non vus depuis 48 h. Réservée au service role.
-- Cf. supabase/functions/_shared/poste-extension.ts.
-- Appliquée en prod le 24/09/2026 (execute_sql), fichier pour la trace.
create or replace function public.noter_poste_extension(p_user uuid, p_session text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb; k text; e jsonb; v_out jsonb := '{}'::jsonb;
begin
  if p_user is null or coalesce(p_session, '') = '' then return null; end if;
  select coalesce(extension_postes, '{}'::jsonb) into v from profiles where id = p_user for update;
  if not found then return null; end if;
  v := v || jsonb_build_object(p_session, coalesce(v -> p_session, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb));
  for k, e in select key, value from jsonb_each(v) loop
    begin
      if (e ->> 'le') is not null and (e ->> 'le')::timestamptz > now() - interval '48 hours' then
        v_out := v_out || jsonb_build_object(k, e);
      end if;
    exception when others then
      -- entrée illisible : on la laisse tomber
    end;
  end loop;
  update profiles set extension_postes = v_out where id = p_user;
  return v_out;
end
$$;
revoke all on function public.noter_poste_extension(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.noter_poste_extension(uuid, text, jsonb) to service_role;
