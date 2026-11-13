// LE BANC de la migration 20261113224500_alertes_cloud_service_role_support (13/11/2026, agent ALERTE) — SUR UN POSTGRES
// JETABLE (embedded-postgres sur le poste), jamais la prod. Aucun mail ne part : pg_net est réduit à son effet (la requête
// est NOTÉE dans net.appels, rien ne sort du poste) ; la clé du vault est une valeur de banc.
//   node scripts/essais/20261113224500_banc.mjs            (A → G, vert attendu)
//   node scripts/essais/20261113224500_banc.mjs --avant    (la RÈGLE jugée sur la définition de PROD seule : rouge attendu)
// Le défaut (journal de l'orchestrateur, 13/11) : serveur-cloud/src/alertes.js appelle envoyer_mail_ponctuel par PostgREST
// avec la clé de service ; en prod la fonction n'est exécutable que par postgres ({postgres=X/postgres}, migration
// 20260923140000 l. 113-117) → « permission denied for function envoyer_mail_ponctuel » à chaque alerte (178 alertes
// journalisées dans cloud_pool_alertes depuis le 01/11, 0 ligne email_logs « cloud_alerte » — lu le 13/11).
// L'appel par l'API est rejoué COMME POSTGREST le fait : connexion « authenticator » (LOGIN NOINHERIT, membre de anon,
// authenticated, service_role — lu en prod le 13/11), puis, dans la transaction de la requête, set_config('role', …),
// set_config('request.jwt.claims', …), request.method / path / headers (is_local = true), puis l'appel de la fonction.
// Étapes : A. AVANT — la prod du 13/11 (l'inverse) : le défaut reproduit (service_role refusé), postgres envoie à tous ;
// B. MIGRATION — service_role : support@ + « support » seulement, tout le reste refusé sans requête pg_net ; postgres :
// corps envoyé IDENTIQUE à A ; anon / authenticated : refusés ; C. INVERSE — définition, commentaire et droits de la prod à
// l'octet près, le défaut revient ; D. MIGRATION rejouée — B de nouveau ; E. rejouée sur elle-même — acceptée, rien ne
// change ; F. GARDE md5 / droits — une définition ou des droits inattendus : la migration s'arrête, rien n'est changé.
// G. LA SONDE — ce que voit une fonction SECURITY DEFINER appelée par PostgREST (current_user = le propriétaire).
import pg from 'pg';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261113224500_alertes_cloud_service_role_support.sql';
export const INVERSE = 'supabase/rollbacks/20261113224500_alertes_cloud_service_role_support_INVERSE.sql';
export const MD5_PROD = '2c3472191b62804602bfbde4819fecd5';
export const MD5_MIGREE = '9de0aadea7ece71a2a6baf984e299cd7';
export const ACL_PROD = '{postgres=X/postgres}';
export const ACL_MIGREE = '{postgres=X/postgres,service_role=X/postgres}';
export const COMMENTAIRE_PROD = 'Envoie un mail ponctuel via la fonction edge envoi-ponctuel (pg_net + clé de service lue dans le vault). Remplace les fonctions send-<prénom>-<date> supprimées le 23/09/2026.';
export const REFUS = 'service_role : alertes à support@ seulement — rien n\'est envoyé';
const SIG = 'public.envoyer_mail_ponctuel(jsonb,text,text,text,text,boolean)';
const SUPPORT = 'support@fillsell.app';
const CLIENT = 'client@exemple.invalid';
const U = '4e2a0000-0000-4000-8000-000000000001'; // un compte d'essai (jeton « authenticated »)

const PRELUDE = String.raw`
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'banc';
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Comme Supabase : une fonction créée dans public reçoit EXECUTE pour les trois rôles de l'API (droits par défaut) —
-- l'inverse doit donc tout retirer pour revenir à {postgres=X/postgres}.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
INSERT INTO auth.users VALUES ('${U}', 'compte-essai@exemple.invalid');
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
INSERT INTO vault.decrypted_secrets VALUES ('service_role_key', 'cle-de-banc-jamais-la-vraie');
CREATE SCHEMA net;
CREATE TABLE net.appels (id bigserial PRIMARY KEY, url text, headers jsonb, body jsonb);
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
 RETURNS bigint LANGUAGE sql AS $f$ INSERT INTO net.appels (url, headers, body) VALUES (url, headers, body) RETURNING id $f$;
-- LA SONDE : ce que voit une fonction SECURITY DEFINER (propriétaire postgres), comme envoyer_mail_ponctuel.
CREATE FUNCTION public.sonde_appelant() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  SELECT jsonb_build_object('current_user', current_user::text, 'session_user', session_user::text,
    'role_claims', nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') $f$;
`;
// Un appelant IMBRIQUÉ (fonction SECURITY DEFINER de postgres ouverte à authenticated). Il n'en existe AUCUN en prod au
// 13/11 (0 fonction SQL, 0 cron ne nomme envoyer_mail_ponctuel) : le banc montre que la garde le couvrirait quand même.
const RELAIS = String.raw`
CREATE OR REPLACE FUNCTION public.relais_imbrique(p_email text) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $f$
  SELECT public.envoyer_mail_ponctuel(jsonb_build_array(jsonb_build_object('email', p_email)), 's', '<p>h</p>', 't', 'support', true) $f$;
`;

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-alertes-cloud-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  // La connexion de PostgREST : authenticator.
  const a = new pg.Client({ connectionString: `postgres://authenticator:banc@127.0.0.1:${port}/postgres` });
  await a.connect(); a.on('notice', () => {});
  const arreter = async () => {
    await a.end().catch(() => {}); await c.end().catch(() => {}); await base.stop().catch(() => {});
    try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ }
  };
  return { c, a, arreter };
}

const CLAIMS = {
  service_role: { iss: 'supabase', ref: 'tojihnuawsoohlolangc', role: 'service_role' },
  anon: { iss: 'supabase', ref: 'tojihnuawsoohlolangc', role: 'anon' },
  authenticated: { iss: 'supabase', sub: U, aud: 'authenticated', role: 'authenticated' },
};

/** Une requête comme PostgREST la joue : transaction, rôle et claims posés en local, puis l'appel. */
async function api(a, role, sql, params = []) {
  await a.query('BEGIN');
  try {
    await a.query(`SELECT set_config('search_path', 'public, extensions', true), set_config('role', $1, true),
      set_config('request.jwt.claims', $2, true), set_config('request.method', 'POST', true),
      set_config('request.path', '/rpc/envoyer_mail_ponctuel', true), set_config('request.headers', '{}', true)`,
    [role, JSON.stringify(CLAIMS[role])]);
    const r = await a.query(sql, params);
    await a.query('COMMIT');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await a.query('ROLLBACK').catch(() => {});
    return { ok: false, erreur: e.message };
  }
}
async function direct(c, sql, params = []) {
  try { return { ok: true, rows: (await c.query(sql, params)).rows }; } catch (e) { return { ok: false, erreur: e.message }; }
}

const APPEL = 'SELECT public.envoyer_mail_ponctuel(p_destinataires := $1::jsonb, p_sujet := $2, p_html := $3, p_type := $4, p_categorie := $5, p_simulation := $6) AS id';
const nAppels = async (c) => Number((await c.query('SELECT count(*) n FROM net.appels')).rows[0].n);
const dernierCorps = async (c) => (await c.query('SELECT body, headers FROM net.appels ORDER BY id DESC LIMIT 1')).rows[0] ?? null;

/** Un envoi : qui (postgres | service_role | anon | authenticated), destinataires, catégorie, simulation. */
async function envoi(ctx, qui, dest, { categorie = 'support', simulation = false, sujet = '[FillSell Cloud] serveur — [TEST] banc', type = 'cloud_alerte' } = {}) {
  const avant = await nAppels(ctx.c);
  const params = [JSON.stringify(dest), sujet, '<p>[TEST] banc</p>', type, categorie, simulation];
  const r = qui === 'postgres' ? await direct(ctx.c, APPEL, params) : await api(ctx.a, qui, APPEL, params);
  const apres = await nAppels(ctx.c);
  return { ...r, requetes: apres - avant, corps: apres > avant ? await dernierCorps(ctx.c) : null };
}

// L'appel EXACT de serveur-cloud/src/alertes.js (destinataire = config.alertesDestinataire, support@ en prod).
const ORCHESTRATEUR = [{ email: SUPPORT, user_id: null, variables: {} }];
const CAS_POSTGRES = [
  ['support@ (objet), « support »', ORCHESTRATEUR, {}],
  ['un client (objet), « marketing »', [{ email: CLIENT }], { categorie: 'marketing' }],
  ['un client (adresse seule), « support »', [CLIENT], {}],
  ['support@ + un client, « support »', [SUPPORT, { email: CLIENT, user_id: null }], {}],
  ['le compte d\'essai (user_id complété depuis auth.users), « marketing », simulation', [{ email: 'compte-essai@exemple.invalid' }], { categorie: 'marketing', simulation: true }],
];
const CAS_REFUSES_SERVICE = [
  ['un client', [{ email: CLIENT, user_id: null, variables: {} }], {}],
  ['support@ + un client', [{ email: SUPPORT }, { email: CLIENT }], {}],
  ['support@ en catégorie « marketing »', ORCHESTRATEUR, { categorie: 'marketing' }],
  ['« to » seul, vers un client', [{ to: CLIENT }], {}],
  ['email null, « to » vers un client', [{ email: null, to: CLIENT }], {}],
  ['une adresse qui COMMENCE par support@', ['support@fillsell.app.exemple.invalid'], {}],
  ['un destinataire null', [null], {}],
  ['liste vide', [], {}],
  ['un objet au lieu d\'une liste', { email: SUPPORT }, {}],
];

/** A / C : la prod du 13/11 — le défaut. */
async function tourAvant(ctx, ok, prefixe) {
  const s = await envoi(ctx, 'service_role', ORCHESTRATEUR);
  ok(!s.ok && /permission denied for function envoyer_mail_ponctuel/.test(s.erreur) && s.requetes === 0,
    `${prefixe} : l'appel EXACT de l'orchestrateur (clé de service) → « permission denied for function envoyer_mail_ponctuel » — le défaut du 13/11`, s);
  for (const qui of ['anon', 'authenticated']) {
    const r = await envoi(ctx, qui, ORCHESTRATEUR);
    ok(!r.ok && /permission denied/.test(r.erreur), `${prefixe} : ${qui} → refusé (aucun droit)`, r);
  }
  const corps = [];
  for (const [nom, dest, o] of CAS_POSTGRES) {
    const r = await envoi(ctx, 'postgres', dest, o);
    ok(r.ok && r.requetes === 1, `${prefixe} : postgres (opérateur), ${nom} → une requête pg_net`, r);
    corps.push(r.corps);
  }
  const n = await api(ctx.a, 'authenticated', 'SELECT public.relais_imbrique($1) AS id', [CLIENT]);
  ok(n.ok, `${prefixe} : (le trou, s'il existait) un relais SECURITY DEFINER ouvert à authenticated écrirait à un client`, n);
  return corps;
}

/** B / D / E : la règle. */
async function tourRegle(ctx, ok, prefixe, corpsAvant = null) {
  const s = await envoi(ctx, 'service_role', ORCHESTRATEUR);
  ok(s.ok && s.requetes === 1, `${prefixe} : l'appel EXACT de l'orchestrateur (clé de service) → PERMIS, une requête pg_net`, s);
  const b = s.corps?.body ?? {};
  ok(s.corps && b.categorie === 'support' && b.type === 'cloud_alerte' && b.simulation === false && JSON.stringify(b.destinataires) === JSON.stringify([{ email: SUPPORT, user_id: null, variables: {} }])
    && /\/functions\/v1\/envoi-ponctuel$/.test((await ctx.c.query('SELECT url FROM net.appels ORDER BY id DESC LIMIT 1')).rows[0]?.url ?? '')
    && s.corps.headers?.Authorization === 'Bearer cle-de-banc-jamais-la-vraie',
  `${prefixe} : … vers envoi-ponctuel, destinataire support@ seul, « support », type cloud_alerte, clé lue dans le vault`, s.corps);
  const sim = await envoi(ctx, 'service_role', ORCHESTRATEUR, { simulation: true });
  ok(sim.ok && sim.requetes === 1 && sim.corps?.body?.simulation === true, `${prefixe} : la même en simulation → permise (simulation transmise)`, sim);
  const casse = await envoi(ctx, 'service_role', [' SUPPORT@FillSell.app ']);
  ok(casse.ok && casse.requetes === 1, `${prefixe} : « SUPPORT@FillSell.app » (casse, espaces : la porte edge la ramène à support@) → permise`, casse);
  for (const [nom, dest, o] of CAS_REFUSES_SERVICE) {
    const r = await envoi(ctx, 'service_role', dest, o);
    ok(!r.ok && r.erreur === REFUS && r.requetes === 0, `${prefixe} : clé de service, ${nom} → « ${REFUS} », aucune requête pg_net`, r);
  }
  for (const qui of ['anon', 'authenticated']) {
    const r = await envoi(ctx, qui, ORCHESTRATEUR);
    ok(!r.ok && /permission denied for function envoyer_mail_ponctuel/.test(r.erreur) && r.requetes === 0, `${prefixe} : ${qui} → toujours refusé (aucun droit)`, r);
  }
  for (const [i, [nom, dest, o]] of CAS_POSTGRES.entries()) {
    const r = await envoi(ctx, 'postgres', dest, o);
    const identique = corpsAvant ? JSON.stringify(r.corps) === JSON.stringify(corpsAvant[i]) : true;
    ok(r.ok && r.requetes === 1 && identique, `${prefixe} : postgres (opérateur), ${nom} → inchangé${corpsAvant ? ' (corps envoyé IDENTIQUE à l\'avant)' : ''}`, { r, avant: corpsAvant?.[i] });
  }
  // Une session postgres qui a porté des claims dans une transaction finie (le réglage revient à '') : inchangée.
  await ctx.c.query(`BEGIN; SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true); COMMIT;`);
  const vide = await envoi(ctx, 'postgres', [{ email: CLIENT }], { categorie: 'marketing' });
  ok(vide.ok && vide.requetes === 1, `${prefixe} : postgres après des claims locales terminées (réglage vide '') → inchangé`, vide);
  const n1 = await api(ctx.a, 'authenticated', 'SELECT public.relais_imbrique($1) AS id', [CLIENT]);
  ok(!n1.ok && n1.erreur === REFUS, `${prefixe} : un relais SECURITY DEFINER appelé par l'API (session « authenticator ») vers un client → refusé aussi`, n1);
  const n2 = await api(ctx.a, 'authenticated', 'SELECT public.relais_imbrique($1) AS id', [SUPPORT]);
  ok(n2.ok, `${prefixe} : … et vers support@ → permis`, n2);
}

const lireFonction = async (c) => (await c.query(`SELECT md5(pg_get_functiondef('${SIG}'::regprocedure)) h, pg_get_functiondef('${SIG}'::regprocedure) d,
  p.proacl::text acl, p.prosecdef s, p.proowner::regrole::text o, p.proconfig::text cfg, obj_description(p.oid, 'pg_proc') com,
  has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth,
  has_function_privilege('service_role', p.oid, 'EXECUTE') srv
  FROM pg_proc p WHERE p.oid = '${SIG}'::regprocedure`)).rows[0];

async function appliquer(c, fichier) {
  try { await c.query(lire(fichier)); return { ok: true }; } catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, erreur: e.message }; }
}

async function etatProd(c, ok, prefixe) {
  const f = await lireFonction(c);
  ok(f.h === MD5_PROD, `${prefixe} : pg_get_functiondef identique à la prod (md5 ${MD5_PROD})`, f.h);
  ok(f.acl === ACL_PROD && !f.anon && !f.auth && !f.srv, `${prefixe} : droits de la prod ${ACL_PROD} (anon, authenticated, service_role sans droit)`, f.acl);
  ok(f.com === COMMENTAIRE_PROD && f.s === true && f.o === 'postgres' && f.cfg === '{"search_path=public, vault, pg_temp"}',
    `${prefixe} : commentaire, SECURITY DEFINER, propriétaire et search_path de la prod`, { com: f.com, s: f.s, o: f.o, cfg: f.cfg });
  return f;
}
async function etatMigre(c, ok, prefixe, defProd) {
  const f = await lireFonction(c);
  ok(f.h === MD5_MIGREE, `${prefixe} : définition migrée (md5 ${MD5_MIGREE})`, f.h);
  ok(f.acl === ACL_MIGREE && !f.anon && !f.auth && f.srv, `${prefixe} : droits ${ACL_MIGREE} — service_role seul ajouté ; anon, authenticated, PUBLIC sans droit`, f.acl);
  ok(f.com === COMMENTAIRE_PROD && f.s === true && f.o === 'postgres' && f.cfg === '{"search_path=public, vault, pg_temp"}',
    `${prefixe} : commentaire, SECURITY DEFINER, propriétaire et search_path gardés`, { com: f.com, s: f.s, o: f.o, cfg: f.cfg });
  if (defProd) {
    const lm = f.d.split('\n');
    const iBegin = lm.indexOf('begin');
    const iProd = lm.indexOf('  if p_categorie is null or p_categorie not in (\'marketing\', \'support\') then');
    const declarations = lm.slice(0, iBegin).filter((l) => /^  v_(role_api|support)\b/.test(l));
    const garde = lm.slice(iBegin + 1, iProd);
    const sans = [...lm.slice(0, iBegin + 1), ...lm.slice(iProd)].filter((l) => !declarations.includes(l)).join('\n');
    ok(iBegin > 0 && iProd > iBegin && declarations.length === 2 && sans === defProd,
      `B : la prod à l'octet près + 2 déclarations (v_role_api, v_support) + la garde (${garde.length} lignes) en tête du corps, avant les contrôles de la prod ; rien d'autre`,
      { declarations, garde: garde.length });
  }
  return f;
}

async function tourGardes(ctx, ok) {
  // F1. Une définition inattendue (la prod a changé depuis la lecture) → la migration s'arrête, rien n'est changé.
  const def = (await lireFonction(ctx.c)).d;
  await ctx.c.query(def.replace('  v_dest jsonb;\n', '  v_dest jsonb;\n  -- changée depuis la lecture\n'));
  const avant = await lireFonction(ctx.c);
  const r1 = await appliquer(ctx.c, MIGRATION);
  const apres = await lireFonction(ctx.c);
  ok(!r1.ok && /ON S'ARRÊTE/.test(r1.erreur) && apres.h === avant.h && apres.acl === avant.acl,
    'F : définition différente de la prod lue → la migration S\'ARRÊTE (garde md5), définition et droits inchangés', { r1, avant: avant.h, apres: apres.h });
  await appliquer(ctx.c, INVERSE);
  // F2. Des droits inattendus (authenticated ajouté) → la migration s'arrête aussi.
  await ctx.c.query(`GRANT EXECUTE ON FUNCTION ${SIG} TO authenticated`);
  const r2 = await appliquer(ctx.c, MIGRATION);
  const f2 = await lireFonction(ctx.c);
  ok(!r2.ok && /ON S'ARRÊTE/.test(r2.erreur) && f2.h === MD5_PROD && f2.auth === true,
    'F : droits différents de ceux lus (authenticated ajouté) → la migration S\'ARRÊTE, rien n\'est changé', { r2, acl: f2.acl });
  await appliquer(ctx.c, INVERSE);
}

async function tourSonde(ctx, ok) {
  await ctx.c.query(`GRANT EXECUTE ON FUNCTION public.sonde_appelant() TO service_role`);
  const s = await api(ctx.a, 'service_role', 'SELECT public.sonde_appelant() AS v');
  const v = s.rows?.[0]?.v ?? {};
  ok(s.ok && v.current_user === 'postgres' && v.session_user === 'authenticator' && v.role_claims === 'service_role',
    'G : appelée par PostgREST avec la clé de service, une fonction SECURITY DEFINER voit current_user = postgres (inutilisable), session_user = authenticator, claims.role = service_role', v);
  const p = await direct(ctx.c, 'SELECT public.sonde_appelant() AS v');
  const w = p.rows?.[0]?.v ?? {};
  ok(p.ok && w.current_user === 'postgres' && w.session_user === 'postgres' && w.role_claims == null,
    'G : appelée par l\'opérateur (postgres) : session_user = postgres, aucune claims — les deux signaux se taisent', w);
}

export async function executer(ok, { avantSeulement = false, port = 58000 + Math.floor(Math.random() * 2000) } = {}) {
  const ctx = await demarrer(port);
  try {
    console.log('A. AVANT — la prod du 13/11 (la définition de l\'inverse)');
    const r0 = await appliquer(ctx.c, INVERSE);
    ok(r0.ok, 'A : l\'inverse (la prod) s\'applique sur une base neuve', r0);
    await ctx.c.query(RELAIS);
    const fA = await etatProd(ctx.c, ok, 'A');
    if (avantSeulement || !existsSync(join(ROOT, MIGRATION))) {
      if (!avantSeulement) ok(false, `migration absente : ${MIGRATION}`);
      console.log('   — la RÈGLE jugée sur la prod seule (rouge attendu : le défaut) —');
      await tourRegle(ctx, ok, 'A (règle)');
      return;
    }
    const corpsAvant = await tourAvant(ctx, ok, 'A');

    console.log('B. MIGRATION');
    const r1 = await appliquer(ctx.c, MIGRATION);
    ok(r1.ok, 'B : la migration s\'applique (garde md5 et droits passées)', r1);
    await etatMigre(ctx.c, ok, 'B', fA.d);
    await tourRegle(ctx, ok, 'B', corpsAvant);

    console.log('C. INVERSE');
    const r2 = await appliquer(ctx.c, INVERSE);
    ok(r2.ok, 'C : l\'inverse s\'applique', r2);
    await etatProd(ctx.c, ok, 'C');
    await tourAvant(ctx, ok, 'C');

    console.log('D. MIGRATION rejouée');
    ok((await appliquer(ctx.c, MIGRATION)).ok, 'D : la migration se rejoue après l\'inverse');
    await etatMigre(ctx.c, ok, 'D');
    await tourRegle(ctx, ok, 'D', corpsAvant);

    console.log('E. MIGRATION rejouée sur elle-même');
    const r3 = await appliquer(ctx.c, MIGRATION);
    ok(r3.ok, 'E : acceptée (la garde reconnaît la définition migrée)', r3);
    await etatMigre(ctx.c, ok, 'E');
    await tourRegle(ctx, ok, 'E', corpsAvant);

    console.log('F. GARDES de la migration');
    await appliquer(ctx.c, INVERSE);
    await tourGardes(ctx, ok);

    console.log('G. LA SONDE');
    await tourSonde(ctx, ok);
  } finally { await ctx.arreter(); }
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  await executer(ok, { avantSeulement: process.argv.includes('--avant') });
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
