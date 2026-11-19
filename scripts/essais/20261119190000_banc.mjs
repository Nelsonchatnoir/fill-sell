// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261119190000_cloud_ip_fin_de_compte (19/11/2026, demande de Nico :
// « IP du Cloud : tout nettoyer, aucune IP payée en trop ») — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261119190000_banc.mjs
// Corps de PROD relus le 19/11 ~12:00 (pg_get_functiondef) : les 4 fonctions réécrites viennent du fichier INVERSE (leur
// corps de prod à l'octet) ; leurs dépendances sont recopiées plus bas, mot pour mot (CORPS_PROD).
//   A. AVANT (corps de prod) — les défauts : un essai Apple au renouvellement coupé et un essai Stripe annulé gardent
//      leur IP 48 h (« grace ») ; la réservation de la 2e IP d'un compte qui tient déjà la sienne n'est jamais levée ;
//      la vente dit « complet » quand le serveur a des places mais aucune IP prête ;
//   B. APRÈS (migration) — fin d'essai (Apple, Google, Stripe), résiliation, arrêt, compte supprimé, réservation levée,
//      cloud_ip_titulaires, raison « ip_en_preparation », préparation inscrite, droits ;
//   C. l'INVERSE rend les 4 corps de prod à l'octet (md5) et retire la fonction neuve.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8');
const MIGRATION = lire('supabase/migrations/20261119190000_cloud_ip_fin_de_compte.sql');
const INVERSE = lire('supabase/rollbacks/20261119190000_cloud_ip_fin_de_compte_INVERSE.sql');
const MD5_PROD = {
  'public.cloud_compte_synchroniser_pool(uuid)': '1714a0018cd818e2fb2ba5077bf111e9',
  'public.cloud_pool_entretien()': 'c914c95ed3f11c1dc4715aa482844fef',
  'public.cloud_vente_etat(uuid)': '80f7ff7f67a9d39e4655d311102dc137',
  'public.cloud_essai_preparer_moi(text)': 'cf96cdc12218d4e34dd33b4056ac75ed',
};

// Les dépendances des 4 fonctions réécrites, corps de PROD relus le 19/11 (pg_get_functiondef), mot pour mot.
const CORPS_PROD = String.raw`
-- cloud_param (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_param(p_cle text, p_defaut integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value FROM public.coin_config WHERE key = 'cloud_' || p_cle), p_defaut);
$function$;

-- cloud_ts (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_ts(p text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- cloud_journal (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_journal(p_ip bigint, p_nature text, p_user uuid, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO public.cloud_ip_evenements (ip_id, nature, user_id, details)
  VALUES (p_ip, p_nature, p_user, COALESCE(p_details, '{}'::jsonb));
$function$;

-- cloud_ip_refus_prouve (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_ip_refus_prouve(p_refus jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(jsonb_typeof(p_refus) = 'object'
         AND EXISTS (SELECT 1 FROM jsonb_each(p_refus) e WHERE (e.value ->> 'prouvee')::boolean IS TRUE), false);
$function$;

-- cloud_ip_rang_operateur (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_ip_rang_operateur(p_sante jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_sante -> 'operateur' -> 'rang') = 'number'
               AND (p_sante -> 'operateur' ->> 'rang') IN ('0', '1', '2')
              THEN (p_sante -> 'operateur' ->> 'rang')::integer
              ELSE 1 END;
$function$;

-- cloud_ip_attribuable (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_ip_attribuable(p cloud_ips, p_user uuid, p_nature text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.expire_le >= CASE WHEN p_nature = 'essai'
                             THEN now() + make_interval(days => 7 + public.cloud_param('grace_jours', 2)
                                                              + public.cloud_param('marge_expiration_jours', 1))
                             ELSE now() + make_interval(days => public.cloud_param('renouvellement_avant_jours', 3)) END
     AND COALESCE(p.sante ->> 'verdict', '') <> 'grillee'
     AND CASE
           WHEN p.etat = 'repos' THEN p_user IS NOT NULL AND p.dernier_user_id = p_user
           WHEN p.etat = 'disponible' THEN p.attributions < public.cloud_param('attributions_max', 6)
                AND (p.reserve_pour IS NULL OR p.reserve_pour = p_user OR p.reserve_jusqu_au < now())
           ELSE false END;
$function$;

-- cloud_etat (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_etat(p_user uuid, p_maintenant timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- ⛔ MÊME VALEUR que CLOUD_EXIGE_UN_PALIER (palier.js), changée le même jour.
  c_exige_un_palier CONSTANT boolean := false;
  v_now timestamptz := date_trunc('milliseconds', p_maintenant);
  v_is_cloud boolean; v_debut timestamptz; v_fin timestamptz; v_arrete boolean;
  v_periode timestamptz; v_arret_fp boolean;
  v_business boolean; v_pro boolean; v_premium boolean; v_comped boolean;
  v_essai_pris boolean; v_en_cours boolean; v_paye boolean; v_avec_formule boolean; v_palier_ok boolean;
  v_base jsonb;
BEGIN
  SELECT p.is_cloud, date_trunc('milliseconds', p.cloud_essai_debut), date_trunc('milliseconds', p.cloud_essai_fin),
         p.cloud_essai_arrete, date_trunc('milliseconds', p.cloud_periode_fin), p.cloud_arret_fin_periode,
         p.is_business, p.is_pro, p.is_premium, p.is_comped
    INTO v_is_cloud, v_debut, v_fin, v_arrete, v_periode, v_arret_fp, v_business, v_pro, v_premium, v_comped
    FROM public.profiles p WHERE p.id = p_user;
  v_essai_pris := v_debut IS NOT NULL;
  -- un essai arrêté s'arrête TOUT DE SUITE, même si la fin n'a pas bougé
  v_en_cours := v_debut IS NOT NULL AND v_fin IS NOT NULL AND v_debut <= v_now AND v_now < v_fin AND v_arrete IS NOT TRUE;
  v_paye := v_is_cloud IS TRUE;
  v_avec_formule := (v_business IS TRUE OR v_pro IS TRUE OR v_premium IS TRUE OR v_comped IS TRUE);
  v_palier_ok := NOT c_exige_un_palier OR v_avec_formule;
  v_base := jsonb_build_object(
    'essaiPris', v_essai_pris,
    'essaiArrete', v_essai_pris AND v_arrete IS TRUE,
    'essaiFin', CASE WHEN v_fin IS NULL THEN NULL
                     ELSE to_char(v_fin AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'joursRestants', NULL,
    'avecFormule', v_avec_formule,
    'periodeFin', CASE WHEN v_paye AND v_periode IS NOT NULL
                       THEN to_char(v_periode AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'arretPrevuLe', CASE WHEN v_paye AND v_arret_fp IS TRUE AND v_periode IS NOT NULL
                         THEN to_char(v_periode AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END);
  IF (v_paye OR v_en_cours) AND NOT v_palier_ok THEN
    RETURN v_base || jsonb_build_object('etat', 'suspendu', 'actif', false);
  END IF;
  IF v_paye THEN
    RETURN v_base || jsonb_build_object('etat', 'paye', 'actif', true);
  END IF;
  IF v_en_cours THEN
    RETURN v_base || jsonb_build_object('etat', 'essai', 'actif', true,
      'joursRestants', GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_fin - v_now)) / 86400)::integer));
  END IF;
  IF v_essai_pris AND (v_arrete IS TRUE OR (v_fin IS NOT NULL AND v_now >= v_fin)) THEN
    RETURN v_base || jsonb_build_object('etat', 'essai_termine', 'actif', false);
  END IF;
  RETURN v_base || jsonb_build_object('etat', 'aucun', 'actif', false);
END;
$function$;

-- cloud_ip_liberer (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_ip_liberer(p_user uuid, p_raison text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ip bigint; v_etat text;
BEGIN
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user;
  SELECT id, etat INTO v_ip, v_etat FROM public.cloud_ips WHERE user_id = p_user FOR UPDATE;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips
     SET etat = 'repos', user_id = NULL, liberee_le = now(),
         repos_fin = now() + make_interval(days => public.cloud_param('repos_jours', 7)),
         purge_preuve = NULL, purge_prouvee_le = NULL, maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'liberation', p_user, jsonb_build_object('raison', p_raison, 'etat_avant', v_etat));
  RETURN v_ip;
END;
$function$;

-- cloud_ip_reserver (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_ip_reserver(p_user uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ip bigint;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cloud_ip:' || p_user::text, 0));
  SELECT id INTO v_ip FROM public.cloud_ips WHERE user_id = p_user;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'repos' AND i.dernier_user_id = p_user AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY i.liberee_le DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NOT NULL THEN RETURN v_ip; END IF;   -- la sienne : rien à réserver, personne d'autre ne la prend
  SELECT id INTO v_ip FROM public.cloud_ips i
   WHERE i.etat = 'disponible' AND public.cloud_ip_attribuable(i, p_user, 'essai')
   ORDER BY (i.reserve_pour = p_user) DESC NULLS LAST, public.cloud_ip_refus_prouve(i.refus),
            public.cloud_ip_rang_operateur(i.sante), (i.refus = '{}'::jsonb) DESC,
            i.expire_le, i.attributions, i.id
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_ip IS NULL THEN RETURN NULL; END IF;
  UPDATE public.cloud_ips SET reserve_pour = NULL, reserve_jusqu_au = NULL WHERE reserve_pour = p_user AND id <> v_ip;
  UPDATE public.cloud_ips
     SET reserve_pour = p_user, reserve_jusqu_au = now() + make_interval(mins => public.cloud_param('reservation_min', 30)), maj_le = now()
   WHERE id = v_ip;
  PERFORM public.cloud_journal(v_ip, 'reservation', p_user, '{}'::jsonb);
  RETURN v_ip;
END;
$function$;

-- cloud_compte_synchroniser (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_compte_synchroniser(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_voie jsonb;
  v_pool jsonb;
BEGIN
  -- (03/11) Le drapeau du compte suit son état Cloud, tous canaux. Un échec ici ne bloque jamais l'IP.
  BEGIN
    v_voie := public.cloud_voie_appliquer(p_user);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cloud_compte_synchroniser : drapeau du compte % : %', p_user, SQLERRM;
    v_voie := jsonb_build_object('ok', false, 'erreur', left(SQLERRM, 200));
  END;
  v_pool := public.cloud_compte_synchroniser_pool(p_user);
  RETURN COALESCE(v_pool, '{}'::jsonb) || jsonb_build_object('voie', v_voie);
END;
$function$;

-- cloud_comptes_a_servir (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_comptes_a_servir()
 RETURNS TABLE(user_id uuid, ip_id bigint, ip text, port integer, etat_cloud text, poste_etat text, session_fillsell_id uuid, plateformes_connectees text[], delai_sessions_min integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH t AS (
    SELECT i.user_id AS u, i.id AS ip_id, host(i.ip) AS ip, i.port, public.cloud_etat(i.user_id) AS e
      FROM public.cloud_ips i WHERE i.etat IN ('attribuee_essai', 'attribuee_client')
    UNION ALL
    -- (30/10, lot D) Rotation : les comptes actifs SANS IP attribuée, sortie choisie par l'orchestrateur.
    SELECT p.id, NULL::bigint, NULL::text, NULL::integer, public.cloud_etat(p.id)
      FROM public.profiles p
     WHERE public.cloud_param('ip_rotation', 0) = 1
       AND (p.is_cloud IS TRUE OR p.cloud_essai_debut IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.cloud_ips i2 WHERE i2.user_id = p.id))
  SELECT t.u, t.ip_id, t.ip, t.port, t.e ->> 'etat', po.etat, po.session_fillsell_id,
         COALESCE((SELECT array_agg(c.plateforme ORDER BY c.plateforme) FROM public.cloud_coffre c
                    WHERE c.user_id = t.u AND c.connecte AND c.plateforme <> 'fillsell'), '{}'),
         NULLIF(public.cloud_param('delai_sessions_min', -1), -1)
    FROM t LEFT JOIN public.cloud_postes po ON po.user_id = t.u
   -- actif, ou essai fini pendant sa grâce (le navigateur peut finir ses jobs) ;
   -- un compte inactif hors grâce n'a déjà plus d'IP (cloud_compte_synchroniser).
   WHERE COALESCE((t.e ->> 'actif')::boolean, false) OR t.e ->> 'etat' = 'essai_termine';
$function$;

-- cloud_places_libres (prod, pg_get_functiondef du 19/11)
CREATE OR REPLACE FUNCTION public.cloud_places_libres()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH servis AS (SELECT c.user_id FROM public.cloud_comptes_a_servir() c),
       reserves AS (
         SELECT DISTINCT i.reserve_pour AS u FROM public.cloud_ips i
          WHERE i.reserve_pour IS NOT NULL AND i.reserve_jusqu_au > now()
            AND NOT EXISTS (SELECT 1 FROM servis s WHERE s.user_id = i.reserve_pour))
  SELECT GREATEST(
    COALESCE((SELECT sum(s.capacite) FROM public.cloud_serveurs s
               WHERE s.etat = 'actif' AND s.vu_le > now() - interval '5 minutes'
                 AND COALESCE(s.details -> 'service' ->> 'apte', '') = 'true'), 0)::int
    - (SELECT count(*) FROM servis)::int
    - (SELECT count(*) FROM reserves)::int, 0);
$function$;
`;

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-ip-fin-de-compte-'));
const PORT = 55461;
const bd = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: PORT, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
await bd.initialise();
await bd.start();
const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${PORT}/postgres` });
await c.connect();
let verts = 0, rouges = 0;
const verifier = (m, ok, d = '') => { if (ok) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d ? `\n      ← ${String(d).slice(0, 600)}` : ''}`); } };
const un = async (q, a = []) => (await c.query(q, a)).rows[0];

// Les comptes du banc (aucun vrai compte).
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('banc.uid', true), '')::uuid $$;
  CREATE SCHEMA vault;
  CREATE TABLE vault.secrets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, secret text);
  CREATE FUNCTION vault.update_secret(secret_id uuid, new_secret text) RETURNS void LANGUAGE sql AS $$ UPDATE vault.secrets SET secret = new_secret WHERE id = secret_id $$;
  CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer);
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, created_at timestamptz DEFAULT now(), is_cloud boolean, cloud_canal text,
    cloud_essai_debut timestamptz, cloud_essai_fin timestamptz, cloud_essai_arrete boolean, cloud_periode_fin timestamptz,
    cloud_arret_fin_periode boolean, is_business boolean, is_pro boolean, is_premium boolean, is_comped boolean);
  CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, commande text, ip inet DEFAULT '10.0.0.1', port integer DEFAULT 12323,
    pays text DEFAULT 'FR', ville text, asn text, etat text NOT NULL, user_id uuid, dernier_user_id uuid, derniere_origine text, reserve_pour uuid,
    reserve_jusqu_au timestamptz, attribuee_le timestamptz, liberee_le timestamptz, repos_fin timestamptz, purge_preuve jsonb,
    purge_prouvee_le timestamptz, expire_le timestamptz, livree_le timestamptz, attributions integer DEFAULT 1, secret_nom text,
    rebut_critere text, rebut_le timestamptz, cree_le timestamptz DEFAULT now(), maj_le timestamptz DEFAULT now(),
    refus jsonb DEFAULT '{}'::jsonb, sante jsonb, quarantaine jsonb,
    CONSTRAINT cloud_ips_titulaire CHECK (((etat = ANY (ARRAY['attribuee_essai'::text, 'attribuee_client'::text])) = (user_id IS NOT NULL))),
    CONSTRAINT cloud_ips_reservation CHECK (((reserve_pour IS NULL) = (reserve_jusqu_au IS NULL))),
    CONSTRAINT cloud_ips_repos CHECK (((etat <> 'repos'::text) OR ((liberee_le IS NOT NULL) AND (repos_fin IS NOT NULL)))));
  CREATE UNIQUE INDEX cloud_ips_un_titulaire ON public.cloud_ips (user_id) WHERE user_id IS NOT NULL;
  CREATE UNIQUE INDEX cloud_ips_une_reservation ON public.cloud_ips (reserve_pour) WHERE reserve_pour IS NOT NULL;
  CREATE TABLE public.cloud_ip_evenements (id bigserial PRIMARY KEY, ip_id bigint REFERENCES public.cloud_ips(id), le timestamptz DEFAULT now(),
    nature text NOT NULL, user_id uuid, details jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT cloud_ip_evenements_nature_check CHECK ((nature = ANY (ARRAY['achat'::text, 'controle_entree'::text, 'reservation'::text,
      'attribution'::text, 'retour_meme_compte'::text, 'conversion'::text, 'liberation'::text, 'purge'::text, 'sortie_repos'::text,
      'signalement'::text, 'rebut'::text, 'renouvellement'::text, 'identifiants_changes'::text, 'expiration'::text, 'incident'::text,
      'refus'::text, 'refus_leve'::text, 'refus_prouve'::text, 'visite_controle'::text, 'depense'::text, 'quarantaine'::text,
      'sortie_quarantaine'::text]))));
  CREATE TABLE public.cloud_attente (user_id uuid PRIMARY KEY, demande_le timestamptz DEFAULT now(), derniere_le timestamptz DEFAULT now(),
    essais integer DEFAULT 1, inscrit_le timestamptz, notifie_le timestamptz);
  CREATE TABLE public.cloud_essai_empreintes (nature text, empreinte text, user_id uuid, conserver_jusqu_au timestamptz);
  CREATE TABLE public.cloud_essai_demandes (user_id uuid PRIMARY KEY, appareil_h text, comptes_h jsonb, essai_permis boolean, raison text,
    demande_le timestamptz DEFAULT now());
  CREATE TABLE public.cloud_connexions (id bigserial PRIMARY KEY, ouverte_le timestamptz DEFAULT now());
  CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY, etat text, capacite integer, vu_le timestamptz, details jsonb);
  CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, etat text, session_fillsell_id uuid);
  CREATE TABLE public.cloud_coffre (user_id uuid, plateforme text, connecte boolean);
  CREATE TABLE public.vinted_sync_runs (user_id uuid, vinted_user_id bigint);
  -- Bouchons (hors du sujet : le drapeau du compte, les empreintes d'essai, le hachage, l'attribution d'une IP neuve).
  CREATE FUNCTION public.cloud_voie_appliquer(p_user uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"ok": true}'::jsonb $$;
  CREATE FUNCTION public.cloud_voie_attendue(p_user uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION public.cloud_empreintes_engager(p_user uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION public.cloud_hacher(p_espace text, p_valeur text) RETURNS text LANGUAGE sql AS $$ SELECT md5(p_espace || p_valeur) $$;
  CREATE FUNCTION public.cloud_ip_attribuer(p_user uuid, p_nature text) RETURNS bigint LANGUAGE sql AS $$ SELECT NULL::bigint $$;
`;

const ESSAI_IP = (id, user, { etat = 'attribuee_essai', expire = "now() + interval '20 days'" } = {}) =>
  `INSERT INTO public.cloud_ips (id, commande, etat, user_id, dernier_user_id, derniere_origine, attribuee_le, expire_le, secret_nom)
   VALUES (${id}, 'c${id}', '${etat}', '${user}', '${user}', '${etat === 'attribuee_client' ? 'client' : 'essai'}', now() - interval '8 days', ${expire}, 's${id}')`;
const PROFIL = (user, cols) => {
  const k = Object.keys(cols);
  return `INSERT INTO public.profiles (id${k.map((x) => `, ${x}`).join('')}) VALUES ('${user}'${k.map((x) => `, ${cols[x]}`).join('')})`;
};
const vider = () => c.query(`TRUNCATE public.cloud_ip_evenements, public.cloud_attente, public.cloud_essai_demandes, public.cloud_postes,
  public.cloud_coffre, public.cloud_serveurs; DELETE FROM public.cloud_ips; DELETE FROM public.profiles; DELETE FROM public.coin_config;`);
const sync = async (user) => (await un('SELECT public.cloud_compte_synchroniser_pool($1::uuid) AS r', [user])).r;
const etatIp = async (id) => un('SELECT etat, user_id, reserve_pour, repos_fin > now() + interval \'6 days\' AS repos_7j FROM public.cloud_ips WHERE id = $1', [id]);

// Les scénarios de fin d'essai, rejoués avant puis après.
async function poserFinsEssai() {
  await vider();
  // 1. Apple, renouvellement COUPÉ, essai fini il y a 1 h.
  await c.query(PROFIL(U(1), { cloud_canal: "'apple'", cloud_essai_debut: "now() - interval '7 days 1 hour'", cloud_essai_fin: "now() - interval '1 hour'",
    cloud_arret_fin_periode: 'true', cloud_periode_fin: "now() - interval '1 hour'" }));
  await c.query(ESSAI_IP(101, U(1)));
  // 2. Stripe, essai annulé (Stripe a remis cloud_arret_fin_periode à faux en le terminant), jamais converti, fini il y a 3 h.
  await c.query(PROFIL(U(2), { cloud_canal: "'stripe'", cloud_essai_debut: "now() - interval '7 days 3 hours'", cloud_essai_fin: "now() - interval '3 hours'",
    cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(102, U(2)));
}

try {
  await c.query(SCHEMA);
  await c.query(CORPS_PROD);
  // Les 4 corps de prod seulement (l'inverse sans ses retraits : fonctions neuves, contrainte du journal).
  await c.query(INVERSE.slice(0, INVERSE.indexOf('DROP FUNCTION IF EXISTS public.cloud_ip_titulaires();')));
  for (const [sig, m] of Object.entries(MD5_PROD)) {
    const lu = (await un(`SELECT md5(pg_get_functiondef('${sig}'::regprocedure)) m`)).m;
    verifier(`0. corps de prod installé à l'octet : ${sig}`, lu === m, lu);
  }

  // ── A. AVANT ─────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('A. AVANT (corps de prod)');
  await poserFinsEssai();
  const a1 = await sync(U(1));
  verifier(`A1. (défaut) essai Apple au renouvellement COUPÉ, fini il y a 1 h : l'IP est GARDÉE (${a1.action})`, a1.action === 'grace', JSON.stringify(a1));
  const a2 = await sync(U(2));
  verifier(`A2. (défaut) essai Stripe annulé, jamais converti, fini il y a 3 h : l'IP est GARDÉE (${a2.action})`, a2.action === 'grace', JSON.stringify(a2));
  await vider();
  await c.query(PROFIL(U(10), { is_cloud: 'true', cloud_canal: "'offert'", is_comped: 'true' }));
  await c.query(ESSAI_IP(110, U(10), { etat: 'attribuee_client' }));
  await c.query(`INSERT INTO public.cloud_ips (id, commande, etat, attributions, reserve_pour, reserve_jusqu_au, expire_le, liberee_le)
    VALUES (111, 'c111', 'disponible', 1, '${U(10)}', now() + interval '14 days', now() + interval '14 days', now() - interval '15 days')`);
  await un('SELECT public.cloud_pool_entretien() AS r');
  verifier('A3. (défaut) la 2e IP réservée à un compte qui tient déjà la sienne le reste après l\'entretien',
    (await etatIp(111)).reserve_pour === U(10));
  await c.query(`INSERT INTO public.cloud_serveurs VALUES ('banc', 'actif', 5, now(), '{"service": {"apte": true}}')`);
  await c.query(PROFIL(U(20), {}));
  const a4 = (await un(`SELECT public.cloud_vente_etat('${U(20)}'::uuid) AS r`)).r;
  verifier(`A4. (défaut) serveur avec places, aucune IP prête : la vente dit « ${a4.raison} »`, a4.raison === 'complet', JSON.stringify(a4));

  // ── B. APRÈS ─────────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('B. APRÈS (migration 20261119190000)');
  await c.query(MIGRATION);
  await poserFinsEssai();
  const b1 = await sync(U(1));
  const ip101 = await etatIp(101);
  verifier(`B1. essai Apple au renouvellement coupé, fini : l'IP part au REPOS au premier passage (${b1.action}, ${ip101.etat}, repos 7 j)`,
    b1.action === 'repos' && ip101.etat === 'repos' && ip101.repos_7j === true, JSON.stringify({ b1, ip101 }));
  const b2 = await sync(U(2));
  verifier(`B2. essai Stripe annulé (jamais converti), fini il y a 3 h : REPOS (${b2.action})`, b2.action === 'repos', JSON.stringify(b2));
  const journalLib = await un(`SELECT count(*)::int n FROM public.cloud_ip_evenements WHERE nature = 'liberation' AND ip_id IN (101, 102)`);
  verifier('B2 bis. les deux libérations sont au journal (chemin normal : cloud_ip_liberer)', journalLib.n === 2);

  await vider();
  // 3. Stripe jamais converti, fini il y a 30 min : le message de Stripe peut être en retard → 2 h.
  await c.query(PROFIL(U(3), { cloud_canal: "'stripe'", cloud_essai_debut: "now() - interval '7 days 30 minutes'", cloud_essai_fin: "now() - interval '30 minutes'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(103, U(3)));
  // 4. Stripe converti (IP de client) puis impayé : Stripe relance → 2 jours.
  await c.query(PROFIL(U(4), { is_cloud: 'false', cloud_canal: "'stripe'", cloud_essai_debut: "now() - interval '7 days 5 hours'", cloud_essai_fin: "now() - interval '5 hours'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(104, U(4), { etat: 'attribuee_client' }));
  // 5. Google, renouvellement NON coupé, fini il y a 5 h (1er paiement attendu) → 2 jours ; 6. fini il y a 49 h → repos.
  await c.query(PROFIL(U(5), { cloud_canal: "'google'", cloud_essai_debut: "now() - interval '7 days 5 hours'", cloud_essai_fin: "now() - interval '5 hours'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(105, U(5)));
  await c.query(PROFIL(U(6), { cloud_canal: "'google'", cloud_essai_debut: "now() - interval '9 days 1 hour'", cloud_essai_fin: "now() - interval '49 hours'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(106, U(6)));
  // 7. essai arrêté ; 8. client résilié (période finie, is_cloud faux) ; 9. compte supprimé ; 10. client actif.
  await c.query(PROFIL(U(7), { cloud_canal: "'apple'", cloud_essai_debut: "now() - interval '2 days'", cloud_essai_fin: "now() - interval '1 hour'", cloud_essai_arrete: 'true' }));
  await c.query(ESSAI_IP(107, U(7)));
  await c.query(PROFIL(U(8), { is_cloud: 'false', cloud_canal: "'apple'", cloud_essai_debut: "now() - interval '40 days'", cloud_essai_fin: "now() - interval '33 days'", cloud_periode_fin: "now() - interval '10 minutes'", cloud_arret_fin_periode: 'true' }));
  await c.query(ESSAI_IP(108, U(8), { etat: 'attribuee_client' }));
  await c.query(ESSAI_IP(109, U(9), { etat: 'attribuee_client' }));
  await c.query(PROFIL(U(11), { is_cloud: 'true', cloud_canal: "'stripe'", cloud_periode_fin: "now() + interval '20 days'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(112, U(11), { etat: 'attribuee_client' }));
  const att = { [U(3)]: 'grace', [U(4)]: 'repos', [U(5)]: 'grace', [U(6)]: 'repos', [U(7)]: 'repos', [U(8)]: 'repos', [U(9)]: 'repos', [U(11)]: 'rien' };
  const noms = { [U(3)]: 'B3. Stripe jamais converti, fini il y a 30 min (message en retard possible) : grâce de 2 h',
    [U(4)]: 'B4. compte payé puis arrêté (IP convertie, Stripe), 5 h après la fin d\'essai : REPOS (décision de Nico du 19/11 ; avant : 48 h)',
    [U(5)]: 'B5. Google au renouvellement NON coupé, fini il y a 5 h : grâce de 2 jours (1er paiement attendu)',
    [U(6)]: 'B6. le même, fini il y a 49 h : REPOS',
    [U(7)]: 'B7. essai arrêté : REPOS tout de suite',
    [U(8)]: 'B8. résiliation arrivée à terme (client, is_cloud faux) : REPOS',
    [U(9)]: 'B9. compte supprimé (aucun profil) : REPOS',
    [U(11)]: 'B10. client actif : rien, il garde son IP' };
  for (const [u, a] of Object.entries(att)) {
    const r = await sync(u);
    verifier(`${noms[u]} (${r.action})`, r.action === a, JSON.stringify(r));
  }
  // Le Stripe du B3 après 2 h 05 : repos.
  await c.query(`UPDATE public.profiles SET cloud_essai_fin = now() - interval '2 hours 5 minutes' WHERE id = '${U(3)}'`);
  const b3b = await sync(U(3));
  verifier(`B3 bis. le même 2 h 05 après la fin : REPOS (${b3b.action})`, b3b.action === 'repos', JSON.stringify(b3b));
  // Le réglage se change sans migration.
  await c.query(`INSERT INTO public.coin_config VALUES ('cloud_grace_jours', 0)`);
  const b4b = await sync(U(5));
  verifier(`B4 bis. cloud_grace_jours = 0 dans coin_config : plus de grâce (${b4b.action})`, b4b.action === 'repos', JSON.stringify(b4b));

  // La réservation d'un compte qui tient déjà une IP : levée par l'entretien, dite au journal ; une réservation ordinaire reste.
  await vider();
  await c.query(PROFIL(U(10), { is_cloud: 'true', cloud_canal: "'offert'", is_comped: 'true' }));
  await c.query(ESSAI_IP(110, U(10), { etat: 'attribuee_client' }));
  await c.query(`INSERT INTO public.cloud_ips (id, commande, etat, attributions, reserve_pour, reserve_jusqu_au, expire_le, liberee_le)
    VALUES (111, 'c111', 'disponible', 1, '${U(10)}', now() + interval '14 days', now() + interval '14 days', now() - interval '15 days')`);
  await c.query(PROFIL(U(21), {}));
  await c.query(`INSERT INTO public.cloud_ips (id, commande, etat, attributions, reserve_pour, reserve_jusqu_au, expire_le)
    VALUES (113, 'c113', 'disponible', 0, '${U(21)}', now() + interval '30 minutes', now() + interval '25 days')`);
  const e1 = (await un('SELECT public.cloud_pool_entretien() AS r')).r;
  const r111 = await etatIp(111), r113 = await etatIp(113), r110 = await etatIp(110);
  const j111 = await un(`SELECT count(*)::int n FROM public.cloud_ip_evenements WHERE ip_id = 111 AND nature = 'reservation' AND details ->> 'levee' = 'titulaire_d_une_autre_ip' AND user_id = '${U(10)}'`);
  verifier(`B11. entretien : la réservation de la 2e IP d'un compte qui tient la sienne est LEVÉE (reservations_levees ${e1.reservations_levees}), dite au journal`,
    r111.reserve_pour == null && e1.reservations_levees === 1 && j111.n === 1, JSON.stringify({ e1, r111 }));
  verifier('B11 bis. une réservation ordinaire (30 min, compte sans IP) reste ; le titulaire garde son IP', r113.reserve_pour === U(21) && r110.user_id === U(10));
  const e2 = (await un('SELECT public.cloud_pool_entretien() AS r')).r;
  verifier('B11 ter. un 2e passage ne lève plus rien (aucune ligne réécrite)', e2.reservations_levees === 0, JSON.stringify(e2));

  // cloud_ip_titulaires : la fin connue de chaque titulaire.
  await vider();
  await c.query(PROFIL(U(30), { is_cloud: 'true', cloud_canal: "'apple'", cloud_periode_fin: "now() + interval '20 days'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(130, U(30), { etat: 'attribuee_client' }));
  await c.query(PROFIL(U(31), { is_cloud: 'true', cloud_canal: "'stripe'", cloud_periode_fin: "now() + interval '2 days'", cloud_arret_fin_periode: 'true' }));
  await c.query(ESSAI_IP(131, U(31), { etat: 'attribuee_client' }));
  await c.query(PROFIL(U(32), { cloud_canal: "'apple'", cloud_essai_debut: "now() - interval '3 days'", cloud_essai_fin: "now() + interval '4 days'", cloud_arret_fin_periode: 'true' }));
  await c.query(ESSAI_IP(132, U(32)));
  await c.query(PROFIL(U(33), { cloud_canal: "'google'", cloud_essai_debut: "now() - interval '3 days'", cloud_essai_fin: "now() + interval '4 days'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(133, U(33)));
  await c.query(PROFIL(U(34), { cloud_canal: "'google'", cloud_essai_debut: "now() - interval '8 days'", cloud_essai_fin: "now() - interval '1 day'", cloud_arret_fin_periode: 'false' }));
  await c.query(ESSAI_IP(134, U(34)));
  await c.query(PROFIL(U(35), { is_cloud: 'true', cloud_canal: "'offert'", is_comped: 'true' }));
  await c.query(ESSAI_IP(135, U(35), { etat: 'attribuee_client' }));
  const t = Object.fromEntries((await c.query(`SELECT ip_id, etat_cloud, actif, fin_connue,
      abs(extract(epoch FROM fin_connue - now())) < 60 AS maintenant,
      (SELECT p.cloud_periode_fin FROM public.profiles p JOIN public.cloud_ips i ON i.user_id = p.id WHERE i.id = x.ip_id) = fin_connue AS periode,
      (SELECT p.cloud_essai_fin FROM public.profiles p JOIN public.cloud_ips i ON i.user_id = p.id WHERE i.id = x.ip_id) = fin_connue AS essai
    FROM public.cloud_ip_titulaires() x`)).rows.map((r) => [Number(r.ip_id), r]));
  verifier('B12. titulaires : client sans arrêt → actif, aucune fin connue', t[130]?.actif === true && t[130]?.fin_connue == null, JSON.stringify(t[130]));
  verifier('B12. titulaires : client à l\'arrêt programmé → sa fin de période', t[131]?.actif === true && t[131]?.periode === true, JSON.stringify(t[131]));
  verifier('B12. titulaires : essai au renouvellement coupé → sa fin d\'essai', t[132]?.etat_cloud === 'essai' && t[132]?.essai === true, JSON.stringify(t[132]));
  verifier('B12. titulaires : essai non coupé → aucune fin connue (il deviendra client)', t[133]?.actif === true && t[133]?.fin_connue == null, JSON.stringify(t[133]));
  verifier('B12. titulaires : essai fini (en grâce) → inactif, fin = maintenant', t[134]?.actif === false && t[134]?.maintenant === true, JSON.stringify(t[134]));
  verifier('B12. titulaires : compte offert (Nico) → actif, aucune fin connue', t[135]?.actif === true && t[135]?.fin_connue == null, JSON.stringify(t[135]));

  // La vente : « ip_en_preparation » quand le serveur a des places mais aucune IP prête.
  await vider();
  await c.query(`INSERT INTO public.cloud_serveurs VALUES ('banc', 'actif', 5, now(), '{"service": {"apte": true}}')`);
  await c.query(PROFIL(U(20), {}));
  const v1 = (await un(`SELECT public.cloud_vente_etat('${U(20)}'::uuid) AS r`)).r;
  verifier(`B13. serveur avec places, aucune IP prête : « ${v1.raison} » (vente fermée, 0 place)`, v1.raison === 'ip_en_preparation' && v1.vente_possible === false && v1.places === 0, JSON.stringify(v1));
  await c.query(`UPDATE public.cloud_serveurs SET capacite = 0`);
  const v2 = (await un(`SELECT public.cloud_vente_etat('${U(20)}'::uuid) AS r`)).r;
  verifier(`B13 bis. serveur plein : « ${v2.raison} »`, v2.raison === 'complet', JSON.stringify(v2));
  await c.query(`UPDATE public.cloud_serveurs SET capacite = 5`);
  await c.query(`INSERT INTO public.cloud_ips (id, commande, etat, attributions, expire_le) VALUES (140, 'c140', 'disponible', 0, now() + interval '25 days')`);
  const v3 = (await un(`SELECT public.cloud_vente_etat('${U(20)}'::uuid) AS r`)).r;
  verifier(`B13 ter. une IP prête : vente possible (${v3.places} place)`, v3.vente_possible === true && v3.places === 1 && v3.raison == null, JSON.stringify(v3));
  // Une IP prête mais la seule place gardée à un inscrit prévenu : « ip_en_preparation » pour les autres (le serveur a de la place).
  await c.query(PROFIL(U(22), {}));
  await c.query(`INSERT INTO public.cloud_attente (user_id, inscrit_le, notifie_le) VALUES ('${U(22)}', now() - interval '1 hour', now() - interval '5 minutes')`);
  const v4 = (await un(`SELECT public.cloud_vente_etat('${U(20)}'::uuid) AS r`)).r;
  const v5 = (await un(`SELECT public.cloud_vente_etat('${U(22)}'::uuid) AS r`)).r;
  verifier(`B13 quater. la seule IP gardée 24 h à un inscrit prévenu : lui peut acheter, les autres lisent « ${v4.raison} »`,
    v5.vente_possible === true && v4.vente_possible === false && v4.raison === 'ip_en_preparation', JSON.stringify({ v4, v5 }));

  // La préparation : « ip_en_preparation » inscrit à la liste d'attente.
  await c.query(`DELETE FROM public.cloud_ips; DELETE FROM public.cloud_attente`);
  await c.query(`SELECT set_config('banc.uid', '${U(20)}', false)`);
  const p1 = (await un(`SELECT public.cloud_essai_preparer_moi('appareil-banc') AS r`)).r;
  const inscrit = await un(`SELECT count(*)::int n FROM public.cloud_attente WHERE user_id = '${U(20)}'`);
  verifier(`B14. préparation sans IP prête : refus « ${p1.raison} », inscrit à la liste d'attente`, p1.ok === false && p1.raison === 'ip_en_preparation' && inscrit.n === 1, JSON.stringify(p1));
  await c.query(`SELECT set_config('banc.uid', '', false)`);

  // Les droits de la fonction neuve.
  const d = await un(`SELECT has_function_privilege('anon', 'public.cloud_ip_titulaires()', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.cloud_ip_titulaires()', 'EXECUTE') b,
    has_function_privilege('service_role', 'public.cloud_ip_titulaires()', 'EXECUTE') s`);
  verifier('B15. cloud_ip_titulaires : service_role seulement (ni anon, ni authenticated)', d.a === false && d.b === false && d.s === true, JSON.stringify(d));

  // Le remplacement d'une adresse par IPRoyal (cloud_ip_remplacee) : l'IP libre grillée reçoit la nouvelle adresse et repasse
  // le contrôle d'entrée ; une IP tenue, un repos pas purgé, la même adresse, une adresse déjà au pool : refusés.
  await vider();
  await c.query(`DELETE FROM vault.secrets`);
  const ipLibre = (id, etat, x = '') => c.query(`INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, secret_nom, sante, refus${x ? ', ' + x.split('=')[0] : ''})
    VALUES (${id}, 'c${id}', '10.0.${id}.1', '${etat}', 0, now() + interval '27 days', 's${id}', '{"verdict": "grillee", "grillee_le": "2026-11-16T17:53:42Z"}',
            '{"beebs": {"cause": "restreint"}}'${x ? ', ' + x.split('=')[1] : ''})`);
  for (const id of [180, 181, 182, 183]) await c.query(`INSERT INTO vault.secrets (name, secret) VALUES ('s${id}', 'http://u:p@10.0.${id}.1:12323')`);
  await ipLibre(180, 'disponible');
  await c.query(PROFIL(U(40), { is_cloud: 'true', cloud_canal: "'apple'" }));
  await c.query(ESSAI_IP(181, U(40), { etat: 'attribuee_client' }));
  await c.query(`UPDATE public.cloud_ips SET ip = '10.0.181.1', secret_nom = 's181' WHERE id = 181`);
  await c.query(`INSERT INTO public.cloud_ips (id, commande, ip, etat, attributions, expire_le, secret_nom, dernier_user_id, liberee_le, repos_fin)
    VALUES (182, 'c182', '10.0.182.1', 'repos', 1, now() + interval '27 days', 's182', '${U(41)}', now() - interval '10 minutes', now() + interval '7 days')`);
  await ipLibre(183, 'disponible');
  const rp = async (id, adr) => (await un(`SELECT public.cloud_ip_remplacee(${id}, '${adr}'::inet, 12324, 'http://u2:p2@${adr}:12324') AS r`)).r;
  const r180 = await rp(180, '10.9.9.1');
  const l180 = await un(`SELECT host(ip) ip, port, etat, sante, refus, livree_le > now() - interval '1 minute' AS livree_maintenant,
    (SELECT secret FROM vault.secrets WHERE name = 's180') secret FROM public.cloud_ips WHERE id = 180`);
  const j180 = await un(`SELECT details FROM public.cloud_ip_evenements WHERE ip_id = 180 AND nature = 'remplacement'`);
  verifier(`B16. IP libre GRILLÉE remplacée par IPRoyal : nouvelle adresse, port et identifiants ; santé et refus effacés ; « achetee » (contrôle d'entrée à refaire)`,
    r180.ok === true && l180.ip === '10.9.9.1' && l180.port === 12324 && l180.etat === 'achetee' && l180.sante == null
      && JSON.stringify(l180.refus) === '{}' && l180.livree_maintenant === true && l180.secret === 'http://u2:p2@10.9.9.1:12324'
      && j180?.details?.ancienne === '10.0.180.1' && j180?.details?.nouvelle === '10.9.9.1' && j180?.details?.sante_avant === 'grillee',
    JSON.stringify({ r180, l180, j180 }));
  const r181 = await rp(181, '10.9.9.2');
  verifier(`B16 bis. IP TENUE par un compte : jamais changée seule (${r181.raison})`, r181.ok === false && r181.raison === 'pas_libre'
    && (await un(`SELECT host(ip) ip FROM public.cloud_ips WHERE id = 181`)).ip === '10.0.181.1', JSON.stringify(r181));
  const r182 = await rp(182, '10.9.9.3');
  verifier(`B16 ter. repos dont la purge n'est pas prouvée : refusé (${r182.raison}) — la purge du dernier compte d'abord`, r182.ok === false && r182.raison === 'purge_en_attente', JSON.stringify(r182));
  const r183a = await rp(183, '10.0.183.1'), r183b = await rp(183, '10.9.9.1');
  verifier(`B16 quater. même adresse (${r183a.raison}) ou adresse déjà au pool (${r183b.raison}) : refusés`,
    r183a.raison === 'meme_adresse' && r183b.raison === 'adresse_deja_au_pool', JSON.stringify({ r183a, r183b }));
  const dr = await un(`SELECT has_function_privilege('anon', 'public.cloud_ip_remplacee(bigint, inet, integer, text)', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.cloud_ip_remplacee(bigint, inet, integer, text)', 'EXECUTE') b`);
  verifier('B16 quinquies. cloud_ip_remplacee : ni anon, ni authenticated', dr.a === false && dr.b === false, JSON.stringify(dr));

  // ── C. L'INVERSE ─────────────────────────────────────────────────────────────────────────────────────────────────
  console.log('C. INVERSE');
  await c.query(INVERSE);
  for (const [sig, m] of Object.entries(MD5_PROD)) {
    const lu = (await un(`SELECT md5(pg_get_functiondef('${sig}'::regprocedure)) m`)).m;
    verifier(`C. corps de prod revenu à l'octet : ${sig}`, lu === m, lu);
  }
  verifier('C. les fonctions neuves sont retirées', (await un(`SELECT to_regprocedure('public.cloud_ip_titulaires()') AS f`)).f == null
    && (await un(`SELECT to_regprocedure('public.cloud_ip_remplacee(bigint, inet, integer, text)') AS f`)).f == null);
  const ck = await un(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'cloud_ip_evenements_nature_check'`);
  const garde = (await un(`SELECT count(*)::int n FROM public.cloud_ip_evenements WHERE nature = 'remplacement'`)).n;
  verifier(`C. la nature « remplacement » retirée (NOT VALID : les ${garde} ligne(s) écrite(s) restent)`, !/'remplacement'/.test(ck.d) && /NOT VALID/.test(ck.d) && garde >= 1, ck.d);
} finally {
  await c.end().catch(() => {});
  await bd.stop().catch(() => {});
  try { rmSync(dossier, { recursive: true, force: true }); } catch { /* */ }
}
console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
