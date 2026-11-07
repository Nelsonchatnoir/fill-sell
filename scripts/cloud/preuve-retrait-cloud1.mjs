// PREUVE, SUR UN POSTGRES JETABLE, du retrait de cloud-1 (07/11/2026, décision 8 de Nico) :
//   scripts/reparations/20261107_cloud1_retire.sql (+ _INVERSE).
//
//   PREUVE_PG=embarque node scripts/cloud/preuve-retrait-cloud1.mjs   (Postgres 17 jetable sur le PC ;
//   embedded-postgres et pg sont dans node_modules)
//
// Jamais la prod (refus si l'URL est celle de Supabase). cloud_places_libres et cloud_serveur_battre sont ceux de la
// PROD (pg_get_functiondef lu le 07/11 vers 10:35) ; le reste est un décor réduit aux colonnes qu'ils lisent.
import pg from 'pg';
import { readFileSync } from 'node:fs';

let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-cloud1-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55439, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55439/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY CHECK (nom ~ '^[a-z0-9][a-z0-9-]{0,40}$'), domaine text, ipv4 inet,
  hetzner_id bigint, type text, capacite integer NOT NULL DEFAULT 0 CHECK (capacite >= 0), ouverts integer NOT NULL DEFAULT 0 CHECK (ouverts >= 0),
  comptes integer NOT NULL DEFAULT 0 CHECK (comptes >= 0),
  etat text NOT NULL DEFAULT 'actif' CHECK (etat = ANY (ARRAY['actif','en_creation','retire'])), vu_le timestamptz,
  cree_le timestamptz DEFAULT now(), details jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, serveur text, serveur_origine text, etat text);
CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, reserve_pour uuid, reserve_jusqu_au timestamptz);
CREATE FUNCTION public.cloud_comptes_a_servir() RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE AS
  $f$ SELECT '${NICO}'::uuid $f$;
-- PROD, 07/11 :
CREATE OR REPLACE FUNCTION public.cloud_places_libres() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp' AS $function$
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
CREATE OR REPLACE FUNCTION public.cloud_serveur_battre(p_nom text, p_domaine text, p_ipv4 inet, p_capacite integer, p_ouverts integer, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
#variable_conflict use_column
DECLARE
  v_comptes int;
  v_cap int := GREATEST(COALESCE(p_capacite, 0), 0);
BEGIN
  IF p_nom IS NULL OR btrim(p_nom) = '' OR p_domaine IS NULL OR btrim(p_domaine) = '' THEN
    RAISE EXCEPTION 'cloud_serveur_battre : nom et domaine requis';
  END IF;
  SELECT count(*)::int INTO v_comptes
    FROM public.cloud_comptes_a_servir() c JOIN public.cloud_postes po ON po.user_id = c.user_id
   WHERE po.serveur = p_nom;
  INSERT INTO public.cloud_serveurs AS s (nom, domaine, ipv4, capacite, ouverts, comptes, etat, vu_le, details)
  VALUES (p_nom, p_domaine, p_ipv4, v_cap, GREATEST(COALESCE(p_ouverts, 0), 0), v_comptes, 'actif', now(), COALESCE(p_details, '{}'::jsonb))
  ON CONFLICT (nom) DO UPDATE SET
    domaine = EXCLUDED.domaine, ipv4 = COALESCE(EXCLUDED.ipv4, s.ipv4), capacite = EXCLUDED.capacite,
    ouverts = EXCLUDED.ouverts, comptes = EXCLUDED.comptes,
    etat = CASE WHEN s.etat = 'retire' THEN 'retire' ELSE 'actif' END,
    vu_le = now(),
    details = (COALESCE(s.details, '{}'::jsonb) - 'service') || EXCLUDED.details;
  RETURN jsonb_build_object('comptes', v_comptes, 'places', GREATEST(v_cap - v_comptes, 0), 'places_libres', public.cloud_places_libres());
END;
$function$;
`;
// L'état relu en prod le 07/11 vers 10:35 : cloud-1 actif, muet depuis le 06/11 19:27 ; cloud-2 apte, Nico dessus.
const ETAT = String.raw`
INSERT INTO public.cloud_serveurs (nom, domaine, capacite, comptes, ouverts, etat, vu_le, details) VALUES
  ('cloud-1', 'cloud.fillsell.app', 7, 0, 0, 'actif', '2026-11-06 18:27:35+00', '{"capacite_auto":true,"memoire_navigateur":"2g"}'),
  ('cloud-2', 'cloud-2.fillsell.app', 15, 1, 1, 'actif', now(), '{"service":{"apte":true,"comptes":"liste"}}');
INSERT INTO public.cloud_postes VALUES ('${NICO}', 'cloud-2', NULL, 'actif');
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
async function script(f) {
  try { const r = await c.query(lire(`../reparations/${f}`)); return { ok: true, r }; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, erreur: e.message }; }
}
const un = async (q, p) => (await c.query(q, p)).rows[0];
const etat1 = async () => (await un(`SELECT etat FROM public.cloud_serveurs WHERE nom = 'cloud-1'`)).etat;
const places = async () => (await un(`SELECT public.cloud_places_libres() AS n`)).n;
const sauvegarde = async () => (await un(`SELECT to_regclass('public._backup_0711_cloud1_serveur') AS t`)).t;

try {
  await c.query(DECOR);
  await c.query(ETAT);
  const placesAvant = await places();
  verifier('décor : 14 places libres (15 sur cloud-2 − Nico), cloud-1 n\'en donne aucune', placesAvant === 14, String(placesAvant));

  // Gardes
  await c.query(`UPDATE public.cloud_postes SET serveur_origine = 'cloud-1' WHERE user_id = $1`, [NICO]);
  let r = await script('20261107_cloud1_retire.sql');
  verifier('refusé si un compte a cloud-1 pour serveur d\'origine', !r.ok && /encore attribué/.test(r.erreur), r.erreur);
  await c.query(`UPDATE public.cloud_postes SET serveur_origine = NULL, serveur = 'cloud-1' WHERE user_id = $1`, [NICO]);
  r = await script('20261107_cloud1_retire.sql');
  verifier('refusé si un compte est sur cloud-1', !r.ok && /encore attribué/.test(r.erreur), r.erreur);
  await c.query(`UPDATE public.cloud_postes SET serveur = 'cloud-2' WHERE user_id = $1`, [NICO]);
  await c.query(`UPDATE public.cloud_serveurs SET vu_le = now() - interval '2 minutes' WHERE nom = 'cloud-1'`);
  r = await script('20261107_cloud1_retire.sql');
  verifier('refusé si cloud-1 a battu il y a moins de 15 min', !r.ok && /15 dernières minutes/.test(r.erreur), r.erreur);
  await c.query(`UPDATE public.cloud_serveurs SET vu_le = '2026-11-06 18:27:35+00' WHERE nom = 'cloud-1'`);
  verifier('les refus n\'ont rien écrit (ni sauvegarde, ni état)', (await sauvegarde()) === null && (await etat1()) === 'actif');

  // Le retrait
  r = await script('20261107_cloud1_retire.sql');
  verifier('le script passe une fois les gardes levées', r.ok, r.erreur);
  verifier('cloud-1 « retire »', (await etat1()) === 'retire');
  verifier('sauvegarde : la ligne d\'avant (« actif », capacité 7)', (await un(`SELECT ligne->>'etat' AS e, (ligne->>'capacite')::int AS cap FROM public._backup_0711_cloud1_serveur`)).e === 'actif');
  verifier('cloud-2 inchangé (actif), places libres inchangées (14)', (await un(`SELECT etat FROM public.cloud_serveurs WHERE nom = 'cloud-2'`)).etat === 'actif' && (await places()) === placesAvant);
  await c.query(`SELECT public.cloud_serveur_battre('cloud-1', 'cloud.fillsell.app', NULL, 7, 0, '{"service":{"apte":true}}'::jsonb)`);
  verifier('un battement de cloud-1 le laisse « retire » et ne crée aucune place', (await etat1()) === 'retire' && (await places()) === placesAvant);
  r = await script('20261107_cloud1_retire.sql');
  verifier('rejoué : refusé (sauvegarde présente)', !r.ok && /existe déjà/.test(r.erreur), r.erreur);

  // L'inverse
  r = await script('20261107_cloud1_retire_INVERSE.sql');
  verifier('INVERSE : cloud-1 redevient « actif »', r.ok && (await etat1()) === 'actif', r.erreur);
  r = await script('20261107_cloud1_retire_INVERSE.sql');
  verifier('INVERSE rejoué : refusé (rien à défaire)', !r.ok && /pas « retire »/.test(r.erreur), r.erreur);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); embarque.rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `✗ ${echecs} échec(s)` : '✓ preuve complète');
process.exit(echecs ? 1 : 0);
