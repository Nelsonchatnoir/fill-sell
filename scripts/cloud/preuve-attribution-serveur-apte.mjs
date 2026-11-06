// PREUVE, SUR UN POSTGRES JETABLE, de la migration 20261106200000 (06/11/2026 soir, ordre de Nico : « un compte ne doit
// JAMAIS être attribué à un serveur incapable de le servir, et un compte basculé doit revenir sur son serveur dès qu'il
// rebat » — pour tous les serveurs, pas seulement en retirant cloud-1).
//
//   PREUVE_PG=embarque node scripts/cloud/preuve-attribution-serveur-apte.mjs   (Postgres 17 jetable sur le PC)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Point de départ = la PROD du 06/11 vers 18:00 : les trois
// fonctions que la migration remplace, mot pour mot (elles sont dans son INVERSE), et l'état relu (cloud-1 vivant sans
// compte, cloud-2 vivant avec Nico). Le reste est un décor réduit aux colonnes lues.
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
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-preuve-attribution-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'preuve', port: 55439, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} }), dossier, rmSync };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:preuve@127.0.0.1:55439/postgres';
}
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('../../supabase/migrations/20261106200000_cloud_attribution_serveur_apte.sql');
const INVERSE = lire('../../supabase/rollbacks/20261106200000_cloud_attribution_serveur_apte_INVERSE.sql');
const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
const RELECTURE = 'd6a9e726-b6f1-4b7f-a927-2487668d6d96';
const NEUF = '11111111-2222-4333-8444-555555555555';

const DECOR = String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE public.cloud_serveurs (nom text PRIMARY KEY CHECK (nom ~ '^[a-z0-9][a-z0-9-]{0,40}$'), domaine text, ipv4 inet,
  capacite integer NOT NULL DEFAULT 0 CHECK (capacite >= 0), ouverts integer NOT NULL DEFAULT 0 CHECK (ouverts >= 0),
  comptes integer NOT NULL DEFAULT 0 CHECK (comptes >= 0),
  etat text NOT NULL DEFAULT 'actif' CHECK (etat = ANY (ARRAY['actif','en_creation','retire'])), vu_le timestamptz,
  cree_le timestamptz DEFAULT now(), details jsonb DEFAULT '{}'::jsonb);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, serveur text, conteneur text,
  etat text CHECK (etat = ANY (ARRAY['eteint','demarrage','actif','arret','erreur'])), session_fillsell_id uuid, derniere_erreur text,
  details jsonb DEFAULT '{}'::jsonb, maj_le timestamptz);
CREATE TABLE public.cloud_ips (id bigint PRIMARY KEY, etat text, user_id uuid, reserve_pour uuid, reserve_jusqu_au timestamptz);
CREATE TABLE public.cross_post_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text);
-- Bouchon : les comptes à servir (une table du décor, modifiable par la preuve).
CREATE TABLE public._servis (user_id uuid PRIMARY KEY);
CREATE FUNCTION public.cloud_comptes_a_servir() RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE AS $f$ SELECT user_id FROM public._servis $f$;
`;
const ETAT = String.raw`
INSERT INTO auth.users VALUES ('${NICO}', 'nico@exemple'), ('${RELECTURE}', 'test@fillsell.app'), ('${NEUF}', 'neuf@exemple');
INSERT INTO public._servis VALUES ('${NICO}'), ('${RELECTURE}');
INSERT INTO public.cloud_serveurs (nom, domaine, capacite, comptes, ouverts, etat, vu_le, details) VALUES
  ('cloud-1', 'cloud.fillsell.app', 7, 0, 0, 'actif', now(), '{"capacite_auto":true,"memoire_navigateur":"2g"}'),
  ('cloud-2', 'cloud-2.fillsell.app', 30, 1, 1, 'actif', now(), '{"capacite_auto":true,"memoire_navigateur":"2g"}');
INSERT INTO public.cloud_postes (user_id, serveur, etat, details, maj_le) VALUES ('${NICO}', 'cloud-2', 'actif', '{"profil":"p-f44b5917-x"}', now());
INSERT INTO public.cloud_ips VALUES (42, 'attribuee_client', '${NICO}', NULL, NULL), (39, 'disponible', NULL, '${NICO}', now() + interval '20 days');
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let echecs = 0;
const verifier = (nom, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${nom}${!cond && detail ? ` — ${detail}` : ''}`); if (!cond) echecs++; };
const un = async (q, p) => (await c.query(q, p)).rows[0];
const SERVICE = (o = {}) => ({ v: 1, apte: true, incapable: false, raisons: [], moteur: 'chrome', puce: true, rendu: 'ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S))', comptes: 'tous', ...o });
const battre = (nom, { cap = 30, service = null } = {}) => c.query(`SELECT public.cloud_serveur_battre($1, $2, NULL, $3, 0, $4::jsonb)`,
  [nom, `${nom}.fillsell.app`, cap, JSON.stringify({ capacite_auto: true, ...(service ? { service } : {}) })]);
const vieillir = (nom, min) => c.query(`UPDATE public.cloud_serveurs SET vu_le = now() - make_interval(mins => $2) WHERE nom = $1`, [nom, min]);
const choisir = async (u = NICO) => (await un(`SELECT public.cloud_serveur_choisir($1) AS s`, [u])).s;
const poste = async (u = NICO) => un(`SELECT serveur, serveur_origine, xmin::text AS x FROM public.cloud_postes WHERE user_id = $1`, [u]);
const places = async () => (await un(`SELECT public.cloud_places_libres() AS n`)).n;
const tour = async () => { for (const u of [NICO, RELECTURE, NEUF]) await choisir(u); };   // ce que fait cloud_comptes_du_serveur, compte par compte

try {
  await c.query(DECOR);
  await c.query(INVERSE.replace(/^ALTER TABLE public\.cloud_postes DROP COLUMN.*$/m, ''));   // les trois fonctions de la PROD
  await c.query(ETAT);
  verifier('point de départ = la prod : cloud-1 offre 7 places fantômes (37 − 1 servi − 1 servi sans poste)', (await places()) === 35, String(await places()));

  // ── La migration, deux fois (idempotente) ───────────────────────────────────
  await c.query(MIGRATION); await c.query(MIGRATION);
  verifier('migration appliquée deux fois sans erreur', true);
  verifier('Nico RESTE sur cloud-2 (aucune déclaration : on ne bouge rien par ignorance)', (await choisir()) === 'cloud-2');
  verifier('aucun serveur apte déclaré → aucune place à vendre (fermé, jamais faux)', (await places()) === 0);
  verifier('le compte de relecture (servi, sans poste) n’est donné à PERSONNE', (await choisir(RELECTURE)) === null && !(await poste(RELECTURE)));

  // ── Les déclarations ──────────────────────────────────────────────────────
  await battre('cloud-1', { cap: 7, service: SERVICE({ apte: false, incapable: true, raisons: ['moteur_sans_chrome_officiel', 'sans_puce'], moteur: 'steel', puce: false, rendu: null, comptes: ['00000000-0000-0000-0000-000000000000'] }) });
  await battre('cloud-2', { cap: 30, service: SERVICE({ comptes: [NICO, RELECTURE] }) });
  verifier('places : seules celles de cloud-2 (apte) comptent : 30 − 2 servis', (await places()) === 28, String(await places()));
  verifier('relecture → cloud-2 (apte, dans sa liste)', (await choisir(RELECTURE)) === 'cloud-2');
  await c.query(`INSERT INTO public._servis VALUES ('${NEUF}')`);
  verifier('un compte HORS de la liste de cloud-2 n’est donné ni à cloud-2 ni à cloud-1', (await choisir(NEUF)) === null && !(await poste(NEUF)));
  const avant = await poste();
  await tour(); await tour();
  verifier('aucune ligne inchangée réécrite (xmin du poste de Nico identique)', (await poste()).x === avant.x);

  // ── LE PIÈGE du 06/11 : cloud-2 muet 16 min, cloud-1 vivant ──────────────────────────
  await vieillir('cloud-2', 16);
  await battre('cloud-1', { cap: 7, service: SERVICE({ apte: false, incapable: true, moteur: 'steel', puce: false, rendu: null, comptes: ['00000000-0000-0000-0000-000000000000'] }) });
  await tour();
  verifier('cloud-2 muet : Nico NE part PAS sur cloud-1 (sans puce, liste fermée) — il attend son serveur', (await poste()).serveur === 'cloud-2');
  await c.query(`UPDATE public.cloud_serveurs SET details = details - 'service' WHERE nom = 'cloud-1'`);
  await tour();
  verifier('…ni sur un cloud-1 SANS déclaration (ancien orchestrateur cce5eba)', (await poste()).serveur === 'cloud-2');
  await battre('cloud-1', { cap: 7, service: SERVICE({ comptes: 'tous' }) });
  await c.query(`UPDATE public.cloud_serveurs SET capacite = 0 WHERE nom = 'cloud-1'`);
  await tour();
  verifier('…ni sur un serveur apte mais PLEIN (capacité 0)', (await poste()).serveur === 'cloud-2');

  // ── Bascule vers un serveur apte, puis RETOUR dès que le sien rebat ──────────────────────
  await battre('cloud-1', { cap: 7, service: SERVICE({ apte: false, incapable: true, moteur: 'steel', puce: false, rendu: null, comptes: ['00000000-0000-0000-0000-000000000000'] }) });
  await battre('cloud-3', { cap: 30, service: SERVICE({ comptes: [NICO, RELECTURE] }) });
  await tour();
  let p = await poste();
  verifier('cloud-2 muet, cloud-3 apte : Nico basculé sur cloud-3, origine notée cloud-2', p.serveur === 'cloud-3' && p.serveur_origine === 'cloud-2', JSON.stringify(p));
  await c.query(`INSERT INTO public.cross_post_jobs (user_id, status) VALUES ($1, 'processing')`, [NICO]);
  await battre('cloud-2', { cap: 30, service: SERVICE({ comptes: [NICO, RELECTURE] }) });
  await tour();
  verifier('cloud-2 rebat, mais une tâche « processing » : Nico reste le temps de la finir', (await poste()).serveur === 'cloud-3');
  await c.query(`UPDATE public.cross_post_jobs SET status = 'published' WHERE user_id = $1`, [NICO]);
  await tour();
  p = await poste();
  verifier('tâche finie : Nico REVENU sur cloud-2, origine effacée', p.serveur === 'cloud-2' && p.serveur_origine === null, JSON.stringify(p));
  verifier('le compte de relecture, lui aussi revenu sur cloud-2', (await poste(RELECTURE)).serveur === 'cloud-2' && (await poste(RELECTURE)).serveur_origine === null);

  // ── Double bascule : l'origine reste le PREMIER serveur quitté ───────────────────────────
  await battre('cloud-4', { cap: 30, service: SERVICE() });
  await vieillir('cloud-2', 16); await vieillir('cloud-4', 16);
  await tour();
  verifier('cloud-2 muet → cloud-3', (await poste()).serveur === 'cloud-3');
  await battre('cloud-4', { cap: 30, service: SERVICE() });
  await vieillir('cloud-3', 16);
  await tour();
  p = await poste();
  verifier('cloud-3 muet à son tour → cloud-4, origine toujours cloud-2', p.serveur === 'cloud-4' && p.serveur_origine === 'cloud-2', JSON.stringify(p));
  await battre('cloud-2', { cap: 30, service: SERVICE({ comptes: [NICO, RELECTURE] }) });
  await tour();
  verifier('cloud-2 rebat → retour direct sur cloud-2', (await poste()).serveur === 'cloud-2' && (await poste()).serveur_origine === null);

  // ── Un serveur VIVANT qui devient incapable (rendu logiciel lu) ─────────────────────────
  await battre('cloud-3', { cap: 30, service: SERVICE({ comptes: [NICO, RELECTURE] }) });
  await battre('cloud-2', { cap: 30, service: SERVICE({ apte: false, incapable: true, raisons: ['rendu_logiciel'], comptes: [NICO, RELECTURE] }) });
  verifier('cloud-2 incapable : ses places ne comptent plus', (await places()) === 30 + 30 - 3, String(await places()));
  await tour();
  p = await poste();
  verifier('cloud-2 vivant mais rendu logiciel : Nico part sur un serveur apte, origine cloud-2', p.serveur !== 'cloud-2' && p.serveur_origine === 'cloud-2', JSON.stringify(p));
  await battre('cloud-2', { cap: 30, service: SERVICE({ comptes: [NICO, RELECTURE] }) });
  await tour();
  verifier('cloud-2 de nouveau apte → Nico revient', (await poste()).serveur === 'cloud-2');
  await battre('cloud-2', { cap: 30, service: SERVICE({ apte: false, incapable: false, raisons: ['rendu_inconnu'], comptes: [NICO, RELECTURE] }) });
  await tour();
  verifier('rendu inconnu (juste après un redémarrage) : Nico GARDÉ sur cloud-2', (await poste()).serveur === 'cloud-2');
  await battre('cloud-2', { cap: 30, service: SERVICE({ comptes: [RELECTURE] }) });
  await tour();
  verifier('Nico retiré de la liste de cloud-2 : il part vers un serveur qui l’admet', (await poste()).serveur !== 'cloud-2');
  await battre('cloud-2', { cap: 30, service: SERVICE({ comptes: [NICO, RELECTURE] }) });
  await tour();
  verifier('remis dans la liste : il revient', (await poste()).serveur === 'cloud-2');

  // ── Le battement REMPLACE la déclaration ─────────────────────────────────────────
  await battre('cloud-3');
  verifier('cloud-3 bat SANS déclaration : sa déclaration d’avant est retirée (plus apte)',
    (await un(`SELECT details ? 'service' AS a FROM public.cloud_serveurs WHERE nom = 'cloud-3'`)).a === false);
  verifier('…et ses places ne comptent plus', (await places()) === 30 + 30 - 3, String(await places()));

  // ── Origine retirée, serveur inconnu, en création ─────────────────────────────────────
  await vieillir('cloud-2', 16); await battre('cloud-4', { cap: 30, service: SERVICE() });
  await tour();
  verifier('cloud-2 muet → cloud-4, origine cloud-2', (await poste()).serveur === 'cloud-4' && (await poste()).serveur_origine === 'cloud-2');
  await c.query(`UPDATE public.cloud_serveurs SET etat = 'retire' WHERE nom = 'cloud-2'`);
  await tour();
  p = await poste();
  verifier('cloud-2 retiré : l’origine s’efface, Nico reste sur cloud-4', p.serveur === 'cloud-4' && p.serveur_origine === null, JSON.stringify(p));
  await c.query(`UPDATE public.cloud_postes SET serveur = 'cloud-9' WHERE user_id = $1`, [NICO]);
  verifier('serveur inconnu de la table : jamais volé avant son premier battement', (await choisir()) === 'cloud-9');
  await c.query(`INSERT INTO public.cloud_serveurs (nom, domaine, capacite, etat) VALUES ('cloud-9', 'cloud-9.fillsell.app', 30, 'en_creation')`);
  verifier('serveur en création : gardé', (await choisir()) === 'cloud-9');
  await c.query(`DELETE FROM public._servis WHERE user_id = $1`, [NICO]);
  await c.query(`UPDATE public.cloud_postes SET serveur = 'cloud-2' WHERE user_id = $1`, [NICO]);
  verifier('compte qui n’est plus à servir : il garde ce qu’il a (même un serveur retiré)', (await choisir()) === 'cloud-2' && (await poste()).serveur === 'cloud-2');

  // ── L'INVERSE, puis la migration rejouée ────────────────────────────────────────
  await c.query(INVERSE); await c.query(INVERSE);
  const def = async (f) => (await un(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE p.proname = $1`, [f])).d.replace(/\s+/g, ' ').trim();
  const prod = (f) => INVERSE.slice(INVERSE.indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`)).split('\n;\n')[0].replace(/\s+/g, ' ').trim();
  for (const f of ['cloud_serveur_battre', 'cloud_places_libres', 'cloud_serveur_choisir']) verifier(`INVERSE : ${f} = la prod du 06/11, mot pour mot`, (await def(f)) === prod(f));
  verifier('INVERSE : colonne et fonctions de déclaration retirées',
    (await un(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'cloud_postes' AND column_name = 'serveur_origine'`)).n === 0
    && (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('cloud_serveur_admet','cloud_serveur_peut_recevoir','cloud_serveur_ne_peut_garder')`)).n === 0);
  await c.query(MIGRATION);
  verifier('migration rejouée après l’inverse', (await un(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'cloud_serveur_peut_recevoir'`)).n === 1);
  verifier('droits : service_role seul sur choisir et battre ; places lisibles par les connectés',
    (await un(`SELECT has_function_privilege('authenticated', 'public.cloud_serveur_choisir(uuid, uuid[])', 'EXECUTE') AS a,
                      has_function_privilege('anon', 'public.cloud_serveur_battre(text, text, inet, integer, integer, jsonb)', 'EXECUTE') AS b`)).a === false);
} catch (e) {
  echecs++;
  console.log(`✗ ERREUR : ${e.message}`);
} finally {
  await c.end();
  if (embarque) { await embarque.pg.stop(); embarque.rmSync(embarque.dossier, { recursive: true, force: true }); }
}
console.log(echecs ? `\n${echecs} échec(s)` : '\nTOUT VERT');
process.exit(echecs ? 1 : 0);
