-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSITION (14/11/2026, point 4 de Nico — compte 13e274de) — NON APPLIQUÉE : feu vert NOMMÉ de Nico requis
-- « Compte sur le Cloud : l'extension du PC ne peut pas changer l'état d'une connexion ; seul le Cloud fait foi. »
-- ═══════════════════════════════════════════════════════════════════════════
-- Le cas (lu en base, heure de Paris) : le 14/11 à 12:44:09, la sonde de l'extension du PC de 13e274de (poste
-- 727410c6, build ba13a51 du Store, Windows / Intel HD D3D11) a écrit `profiles.extension_sessions.beebs = false`
-- (http.beebs null, checked_at_par_plateforme.beebs 11:44:09.553Z) ; get-pending-jobs a retenu ses 6 retraits Beebs
-- « session connue morte (relevée par l'extension) », avec « Connecte-toi à Beebs sur ton ordinateur ». Le poste Cloud
-- (8564d390, build b05bafe-cloud) n'avait rien écrit de tel.
-- Pourquoi une garde en BASE : l'extension écrit `extension_sessions` directement (PATCH profiles, son propre jeton ;
-- GRANT UPDATE (extension_sessions) TO authenticated, migration 20260727180000) — les extensions déjà installées
-- (Store) ne peuvent pas être changées, et la colonne est la même pour l'ordinateur et le poste Cloud.
-- LA RÈGLE : un compte au Cloud ACTIF (cloud_voie) n'accepte une écriture de `extension_sessions` QUE du poste Cloud :
-- la session du jeton (claims.session_id) est celle de cloud_postes.session_fillsell_id, ou un poste du compte dont le
-- build déclaré finit par « -cloud » (extension_postes, noté par get-pending-jobs). Toute autre écriture d'un client
-- (role authenticated) est IGNORÉE en silence (la colonne garde sa valeur ; la requête réussit, rien ne casse chez
-- l'extension). Inchangé : un compte sans Cloud actif (cloud_voie faux : fin d'essai non convertie, résiliation
-- effective, impayé — l'ordinateur reprend tout aussitôt), le rôle service (fonctions, SQL), une écriture sans
-- jeton lisible. Le déclencheur passe AVANT les autres (ordre alphabétique « profiles_a_… ») : profiles_identite_vinted_
-- du_poste et l'AFTER profiles_session_revue_bonne ne voient alors aucun changement (leurs WHEN sont faux).
-- Compagnon de get-pending-jobs (même lot) : le poste mis de côté ne reçoit plus rien, et la connexion d'une
-- plateforme du Cloud se lit dans cloud_coffre — cette garde ferme la dernière porte (l'écriture directe).
-- Banc jetable : scripts/cloud/preuve-sessions-poste-cloud-seul.mjs (node scripts/cloud/pg-jetable.mjs …).
--
-- Pour appliquer (après le feu vert, et APRÈS le déploiement de get-pending-jobs du même lot) :
--   npx supabase db query --linked -f supabase/migrations/20261114170000_sessions_poste_cloud_seul.sql
--   npx supabase migration repair --linked --status applied 20261114170000
-- Inverse : supabase/rollbacks/20261114170000_sessions_poste_cloud_seul_INVERSE.sql

CREATE OR REPLACE FUNCTION public.profiles_sessions_poste_cloud_seul()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_claims jsonb;
  v_sid text;
  v_build text;
begin
  if old.cloud_voie is not true then return new; end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return new;
  end;
  if v_claims is null or coalesce(v_claims ->> 'role', '') <> 'authenticated' then return new; end if;
  v_sid := nullif(btrim(coalesce(v_claims ->> 'session_id', '')), '');
  if v_sid is not null then
    if exists (select 1 from public.cloud_postes c where c.user_id = old.id and c.session_fillsell_id::text = v_sid) then
      return new;
    end if;
    if jsonb_typeof(old.extension_postes) = 'object' then
      v_build := coalesce(old.extension_postes -> v_sid ->> 'build', '');
      if v_build ~ '-cloud(\s|$|\s*·)' then return new; end if;
    end if;
  end if;
  -- Un poste qui n'est pas le poste Cloud d'un compte au Cloud actif : son état de connexion ne fait pas foi.
  new.extension_sessions := old.extension_sessions;
  return new;
exception when others then
  return new;
end
$function$;

REVOKE ALL ON FUNCTION public.profiles_sessions_poste_cloud_seul() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_a_sessions_poste_cloud_seul ON public.profiles;
CREATE TRIGGER profiles_a_sessions_poste_cloud_seul
  BEFORE UPDATE OF extension_sessions ON public.profiles
  FOR EACH ROW
  WHEN (new.extension_sessions IS DISTINCT FROM old.extension_sessions AND old.cloud_voie IS TRUE)
  EXECUTE FUNCTION public.profiles_sessions_poste_cloud_seul();
