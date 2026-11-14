-- ═══════════════════════════════════════════════════════════════════════════
-- (14/11/2026 soir, point 3 de Nico) COMPTE AU CLOUD : LES VENTES ET LES RELEVÉS D'UN POSTE QUI N'EST PAS LE POSTE
-- CLOUD SONT IGNORÉS, COMME LE RESTE — feu vert explicite de Nico requis avant de jouer ce fichier.
-- ═══════════════════════════════════════════════════════════════════════════
-- Le reste du lot précédent : get-pending-jobs 375 ne sert plus rien à un poste qui n'est pas le poste Cloud
-- (`compte_cloud`) et 20261114170000 ignore ses écritures de sessions. Mais une extension d'ordinateur ANTÉRIEURE à la
-- 0.6.190 (qui ne se met pas en pause) relève encore d'ELLE-MÊME, par ses alarmes (relevé Vinted « cron », relevé
-- quotidien des annonces et des ventes), et le serveur acceptait :
--   · ses VENTES : rpc enregistrer_ventes_relevees (POST direct, son jeton) et rpc commandes_vinted_noter ;
--   · ses RELEVÉS : POST / PATCH directs de vinted_sync_runs (ouverture, prise d'une demande en file, progrès, fin).
-- LA RÈGLE (tous les comptes, décidée en base — les extensions déjà installées ne peuvent pas être changées) :
--   un compte au Cloud ACTIF (profiles.cloud_voie) n'accepte ces écritures d'un client (rôle authenticated) que du
--   POSTE CLOUD : la session du jeton est cloud_postes.session_fillsell_id, ou un poste noté au build « -cloud », ou le
--   relevé déclare lui-même un build « -cloud ». Une écriture d'un AUTRE POSTE D'EXTENSION du compte (session notée
--   dans extension_postes par get-pending-jobs, ou relevé qui déclare un build d'extension) est IGNORÉE sans erreur :
--   les ventes rendent « compte_cloud » (rien enregistré, aucun mail), le relevé n'est pas créé (l'extension lit
--   « run non créé » et passe à la suite — même geste que garde_plateforme_ecartee_sync_runs).
-- Inchangé : un compte sans Cloud actif (cloud_voie faux : l'ordinateur reprend tout aussitôt), le rôle service
-- (fonctions, ebay-ventes-sync, SQL), une écriture sans jeton lisible, l'APP (sa session n'est pas un poste d'extension :
-- demandes de connexion, demander_sync_plateforme), le poste Cloud. Les ventes déjà enregistrées ne sont pas touchées.
-- Aucune vraie vente perdue : le relevé du poste Cloud les lit (même porte, sa session) ; une plateforme pas encore
-- connectée au Cloud n'est relevée par personne tant qu'elle ne l'est pas (règle du lot précédent).
-- Les deux fonctions de vente sont réécrites DEPUIS LEUR CORPS DE PROD (pg_get_functiondef, md5 relu le 14/11 à 19:40),
-- par l'ajout d'UNE sortie anticipée juste après l'identification du compte — rien d'autre ne bouge ; un corps changé
-- depuis arrête tout. Banc jetable : node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-ventes-poste-cloud-seul.mjs
-- (corps de prod : scripts/essais/fixtures/prod-1411-ventes-poste-cloud/).
--
-- Pour appliquer (feu vert de Nico) :
--   npx supabase db query --linked -f supabase/migrations/20261114200000_ventes_releves_poste_cloud_seul.sql
--   npx supabase migration repair --linked --status applied 20261114200000
-- Inverse : supabase/rollbacks/20261114200000_ventes_releves_poste_cloud_seul_INVERSE.sql

-- 1. Qui écrit ? (même lecture que profiles_sessions_poste_cloud_seul, 20261114170000)
CREATE OR REPLACE FUNCTION public.ecriture_poste_hors_cloud(p_user uuid, p_build text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_claims jsonb;
  v_sid text;
  v_cloud boolean;
  v_postes jsonb;
  v_build text := nullif(btrim(coalesce(p_build, '')), '');
begin
  if p_user is null then return false; end if;
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return false;
  end;
  if v_claims is null or coalesce(v_claims ->> 'role', '') <> 'authenticated' then return false; end if;
  select p.cloud_voie is true, p.extension_postes into v_cloud, v_postes from public.profiles p where p.id = p_user;
  if not coalesce(v_cloud, false) then return false; end if;
  -- Le poste Cloud : le build déclaré par la requête, sa session (cloud_postes), ou le build noté pour sa session.
  if v_build ~ '-cloud(\s|$|\s*·)' then return false; end if;
  v_sid := nullif(btrim(coalesce(v_claims ->> 'session_id', '')), '');
  if v_sid is not null then
    if exists (select 1 from public.cloud_postes c where c.user_id = p_user and c.session_fillsell_id::text = v_sid) then
      return false;
    end if;
    if jsonb_typeof(v_postes) = 'object' and v_postes ? v_sid then
      return coalesce(v_postes -> v_sid ->> 'build', '') !~ '-cloud(\s|$|\s*·)';
    end if;
  end if;
  -- Une session qui n'est pas un poste d'extension (l'app) : jamais ignorée — sauf un relevé qui déclare un build
  -- d'extension (un poste pas encore noté).
  return v_build is not null;
exception when others then
  return false;
end
$function$;
REVOKE ALL ON FUNCTION public.ecriture_poste_hors_cloud(uuid, text) FROM PUBLIC, anon, authenticated;

-- 2. Les relevés (vinted_sync_runs, toutes plateformes) : ouverture, prise, progrès et fin d'un poste hors Cloud ignorés.
CREATE OR REPLACE FUNCTION public.garde_releve_poste_cloud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_build text;   -- le build que CETTE écriture déclare (jamais celui d'une ligne écrite avant par un autre)
begin
  if tg_op = 'INSERT' then
    v_build := new.extension_build;
  elsif new.extension_build is distinct from old.extension_build then
    v_build := new.extension_build;
  end if;
  if public.ecriture_poste_hors_cloud(new.user_id, v_build) then
    raise log 'garde_releve_poste_cloud : % ignoré (user %, kind %, plateforme %, build %) — compte au Cloud, poste hors Cloud',
      tg_op, new.user_id, new.kind, new.platform, new.extension_build;
    return null;
  end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION public.garde_releve_poste_cloud() FROM PUBLIC, anon, authenticated;
-- « garde_a_… » : avant les autres gardes BEFORE (ordre alphabétique) — une écriture ignorée ne les réveille pas.
DROP TRIGGER IF EXISTS garde_a_releve_poste_cloud ON public.vinted_sync_runs;
CREATE TRIGGER garde_a_releve_poste_cloud
  BEFORE INSERT OR UPDATE ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_releve_poste_cloud();

-- 3. Les ventes : une sortie anticipée dans les deux portes, injectée dans le corps de PROD (md5 relu).
DO $migration$
DECLARE
  r record;
  v_def text;
  v_n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.enregistrer_ventes_relevees(text,jsonb,uuid)', 'a5d598312fbaa7b1595b441569deed7c',
     E'  IF v_user IS NULL THEN RAISE EXCEPTION ''utilisateur inconnu''; END IF;\n',
     E'  -- (14/11/2026 soir, point 3 de Nico) Compte au Cloud ACTIF : seules les ventes relevées par le POSTE CLOUD (ou le\n'
     || E'  -- serveur) s''enregistrent ; celles d''un autre poste d''extension du compte sont ignorées (le relevé du poste Cloud\n'
     || E'  -- les lit). public.ecriture_poste_hors_cloud, migration 20261114200000.\n'
     || E'  IF public.ecriture_poste_hors_cloud(v_user) THEN\n'
     || E'    RETURN jsonb_build_object(''plateforme'', p_platform, ''recues'', CASE WHEN jsonb_typeof(p_rows) = ''array'' THEN jsonb_array_length(p_rows) ELSE 0 END,\n'
     || E'      ''creees'', 0, ''refusees'', CASE WHEN jsonb_typeof(p_rows) = ''array'' THEN jsonb_array_length(p_rows) ELSE 0 END, ''motif'', ''compte_cloud'');\n'
     || E'  END IF;\n'),
    ('public.commandes_vinted_noter(jsonb)', 'ab5720b5360e807042a15b75b72d53a6',
     E'  IF jsonb_typeof(p_rows) IS DISTINCT FROM ''array'' THEN RETURN jsonb_build_object(''recues'', 0); END IF;\n',
     E'  -- (14/11/2026 soir, point 3 de Nico) Compte au Cloud ACTIF : les commandes lues par un autre poste d''extension que\n'
     || E'  -- le poste Cloud sont ignorées (public.ecriture_poste_hors_cloud, migration 20261114200000).\n'
     || E'  IF public.ecriture_poste_hors_cloud(v_user) THEN\n'
     || E'    RETURN jsonb_build_object(''recues'', jsonb_array_length(p_rows), ''composees'', 0, ''refusees'', jsonb_array_length(p_rows),\n'
     || E'                              ''motif'', ''compte_cloud'');\n'
     || E'  END IF;\n')
  ) AS t(f, m, ancre, ajout)
  LOOP
    v_def := pg_get_functiondef(r.f::regprocedure);
    IF position('ecriture_poste_hors_cloud' IN v_def) > 0 THEN
      RAISE NOTICE '% : garde déjà posée, rien fait', r.f;
      CONTINUE;
    END IF;
    IF md5(v_def) <> r.m THEN
      RAISE EXCEPTION '% a changé en prod depuis sa lecture du 14/11 (md5 attendu %, lu %) : relire, reconstruire, jamais forcer', r.f, r.m, md5(v_def);
    END IF;
    v_n := (length(v_def) - length(replace(v_def, r.ancre, ''))) / length(r.ancre);
    IF v_n <> 1 THEN RAISE EXCEPTION '% : ancre trouvée % fois (1 attendue) — rien fait', r.f, v_n; END IF;
    EXECUTE replace(v_def, r.ancre, r.ancre || r.ajout);
    RAISE NOTICE '% : sortie anticipée « compte_cloud » posée', r.f;
  END LOOP;
END
$migration$;
