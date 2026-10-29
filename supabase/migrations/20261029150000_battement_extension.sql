-- ═══════════════════════════════════════════════════════════════════════════
-- (29/10, point 5 — Johan Désiré, job 098cab75) LA PRÉSENCE BAT AUSSI PENDANT UN LONG TRAVAIL
-- ═══════════════════════════════════════════════════════════════════════════
-- profiles.extension_last_seen_at n'était stampé QUE par get-pending-jobs, en tête de cycle de l'extension ; un cycle
-- tient le verrou de flux jusqu'à sa dernière tâche (27/10 : recréation Leboncoin 11:37:39 → 12:13:17, aucun signe).
-- L'extension (≥ 0.6.15x) appelle cette RPC toutes les 5 min tant qu'un flux tient son verrou, et seulement si aucun
-- poll n'a stampé depuis. UNE écriture (la ligne du compte), AUCUNE lecture de table, aucune fonction edge.
--   · extension_last_seen_at = now() ;
--   · extension_postes[session] : le, battement_le, travail { flux, job, plateforme, depuis, le } (session = claim
--     session_id du JWT, la clé déjà utilisée par get-pending-jobs et update-job-status) ;
--   · anti-rafale : rien n'est écrit si CE poste a déjà battu il y a moins de 60 s (aucune ligne réécrite pour rien).
--   · pas d'élagage des postes ici (noter_poste_extension le fait à chaque poll) : la ligne reste celle du poll.
-- ⛔ Migration : feu vert explicite de Nico, puis `npx supabase db query --linked -f <ce fichier>` et
--    `npx supabase migration repair --linked --status applied 20261029150000`. Jamais `db push`.
create or replace function public.battement_extension(p_travail jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session text := nullif(left(coalesce(auth.jwt() ->> 'session_id', ''), 64), '');
  v_le text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_travail jsonb := null;
  v_n int;
begin
  if v_uid is null then return jsonb_build_object('ok', false); end if;
  if jsonb_typeof(p_travail) = 'object' then
    v_travail := jsonb_strip_nulls(jsonb_build_object(
      'flux', left(p_travail ->> 'flux', 40),
      'job', case when (p_travail ->> 'job') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_travail ->> 'job' end,
      'plateforme', left(p_travail ->> 'plateforme', 20),
      'depuis', left(p_travail ->> 'depuis', 30),
      'le', v_le));
  end if;
  update public.profiles p
     set extension_last_seen_at = now(),
         extension_postes = case when v_session is null then p.extension_postes
           else coalesce(p.extension_postes, '{}'::jsonb) || jsonb_build_object(v_session,
                  coalesce(p.extension_postes -> v_session, '{}'::jsonb)
                  || jsonb_build_object('le', v_le, 'battement_le', v_le, 'travail', v_travail)) end
   where p.id = v_uid
     and case when v_session is null
           then p.extension_last_seen_at is null or p.extension_last_seen_at < now() - interval '60 seconds'
           -- par POSTE (un autre poste du compte qui polle ne doit pas éteindre ce battement) ; ISO 'Z' : ordre texte sûr
           else coalesce(p.extension_postes -> v_session ->> 'battement_le', '')
                < to_char((now() - interval '60 seconds') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'ecrit', v_n > 0);
end
$$;

revoke all on function public.battement_extension(jsonb) from public, anon;
grant execute on function public.battement_extension(jsonb) to authenticated;
