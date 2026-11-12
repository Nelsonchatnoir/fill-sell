// LE BANC de la migration 20261112160000_empreintes_rafales_bornees (12/11/2026, point 5, GO de Nico : pas plus de 10 appels
// d'empreintes à la fois) — SUR UN POSTGRES JETABLE (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261112160000_banc.mjs
// Décor : la définition de PROD de rapprochement_v3_empreinter (l'inverse la porte à l'octet, md5 84047aaf…), net.http_post
// remplacé par une table qui note chaque appel (comme le décor du banc L1), cron_secret() d'essai.
// Étapes : A. AVANT (prod) — 180 photos = 30 appels de 6 d'un coup ; la garde md5 refuse une définition qui n'est pas celle
// de prod ; B. MIGRATION — 10 appels de 5 au plus, une demande plus grosse est bornée ; C. INVERSE — la prod à l'octet, A de
// nouveau ; D. MIGRATION rejouée — B de nouveau.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
export const MIGRATION = 'supabase/migrations/20261112160000_empreintes_rafales_bornees.sql';
export const INVERSE = 'supabase/rollbacks/20261112160000_empreintes_rafales_bornees_INVERSE.sql';
export const MD5_PROD = '84047aafee4b325fa6f5a91db3665f3b';
const SIG = "'public.rapprochement_v3_empreinter(text[],integer,integer)'::regprocedure";

const PRELUDE = String.raw`
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA net;
CREATE TABLE net._appels (id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb, le timestamptz DEFAULT clock_timestamp());
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer DEFAULT 5000) RETURNS bigint
  LANGUAGE sql AS $f$ INSERT INTO net._appels (url, body, headers) VALUES (url, body, headers) RETURNING id $f$;
CREATE FUNCTION public.cron_secret() RETURNS text LANGUAGE sql AS $f$ SELECT 'secret-d-essai'::text $f$;
-- Les droits de PROD de la fonction (lus le 12/11) : postgres, service_role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
`;

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-empreintes-rafales-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  // La définition de prod, à l'octet (le corps de l'inverse), puis ses droits de prod.
  const inv = lire(INVERSE);
  await c.query(inv);
  await c.query(`REVOKE ALL ON FUNCTION public.rapprochement_v3_empreinter(text[],integer,integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.rapprochement_v3_empreinter(text[],integer,integer) TO service_role`);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

export const md5 = async (c) => (await c.query(`SELECT md5(pg_get_functiondef(${SIG})) m`)).rows[0].m;
export const droits = async (c) => (await c.query(`SELECT proacl::text a, prosecdef s, pg_get_userbyid(proowner) o, proconfig::text cfg FROM pg_proc WHERE oid = ${SIG}`)).rows[0];

/** Une demande d'empreintes : ce que la fonction rend, et les appels réellement mis en file (nombre, tailles). */
export async function demande(c, n, ...args) {
  await c.query('TRUNCATE net._appels');
  const urls = Array.from({ length: n }, (_, i) => `https://essai.supabase.co/storage/v1/object/public/photos/p${i}.jpg`);
  const extra = args.length ? `, ${args.map((a) => (a == null ? 'NULL' : Number(a))).join(', ')}` : '';
  const r = (await c.query(`SELECT public.rapprochement_v3_empreinter($1::text[]${extra}) r`, [urls])).rows[0].r;
  const appels = (await c.query(`SELECT jsonb_array_length(body->'urls') k, headers->>'x-cron-secret' s, url FROM net._appels ORDER BY id`)).rows;
  return { r, appels: appels.length, tailles: [...new Set(appels.map((a) => a.k))].sort((x, y) => x - y), secret: appels.every((a) => a.s === 'secret-d-essai'),
    url: appels.every((a) => /\/functions\/v1\/empreintes-urls$/.test(a.url)), photos: appels.reduce((s, a) => s + a.k, 0) };
}

/** Le tour d'une étape : les demandes types. */
export async function tour(c) {
  return {
    p180: await demande(c, 180), p12: await demande(c, 12), p0: await demande(c, 0),
    gros: await demande(c, 180, 8, 200), petit: await demande(c, 180, 3, 4), nuls: await demande(c, 180, null, null),
  };
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 600)}`}`); } };
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const { c, arreter } = await demarrer(54000 + Math.floor(Math.random() * 2000));
  try {
    ok(await md5(c) === MD5_PROD, `décor : la définition de prod à l'octet (md5 ${MD5_PROD})`);
    const D0 = await droits(c);
    console.log('A. AVANT — la prod');
    const A = await tour(c);
    ok(A.p180.appels === 30 && egal(A.p180.tailles, [6]) && A.p180.r.photos === 180, 'A : 180 photos = 30 appels de 6 d\'un coup (la rafale)', A.p180);
    ok(A.gros.appels === 23 && egal(A.gros.tailles, [4, 8]), 'A : une demande de 8 × 200 passe telle quelle (23 appels de 8)', A.gros);
    // La garde : une définition qui n'est pas celle de prod → la migration refuse, rien n'est réécrit.
    await c.query(`CREATE OR REPLACE FUNCTION public.rapprochement_v3_empreinter(p_urls text[], p_par_appel integer DEFAULT 6, p_appels_max integer DEFAULT 100)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$ BEGIN RETURN '{}'::jsonb; END $f$`);
    let refus = null;
    try { await c.query(lire(MIGRATION)); } catch (e) { refus = e.message; await c.query('ROLLBACK').catch(() => {}); }
    ok(/a changé en prod depuis sa lecture du 12\/11/.test(refus ?? ''), 'garde : la migration refuse une définition autre que celle de prod', refus);
    await c.query(lire(INVERSE));
    ok(await md5(c) === MD5_PROD, 'la prod remise (inverse)');

    console.log('B. MIGRATION');
    await c.query(lire(MIGRATION));
    const B = await tour(c);
    ok(B.p180.appels === 10 && egal(B.p180.tailles, [5]) && B.p180.r.photos === 50 && B.p180.r.appels === 10, 'B : 180 photos → 10 appels de 5 au plus (50 photos, le reste à la relance)', B.p180);
    ok(B.p12.appels === 3 && B.p12.r.photos === 12 && egal(B.p12.tailles, [2, 5]), 'B : 12 photos → 3 appels (5, 5, 2), toutes parties', B.p12);
    ok(B.p0.appels === 0 && B.p0.r.photos === 0, 'B : aucune photo → aucun appel');
    ok(B.gros.appels === 10 && egal(B.gros.tailles, [5]), 'B : une demande de 8 × 200 est BORNÉE à 10 × 5, jamais refusée', B.gros);
    ok(B.petit.appels === 4 && egal(B.petit.tailles, [3]) && B.petit.r.photos === 12, 'B : une demande plus petite (3 × 4) est respectée', B.petit);
    ok(B.nuls.appels === 10 && egal(B.nuls.tailles, [5]), 'B : des bornes nulles → 10 × 5', B.nuls);
    ok([B.p180, B.p12, B.gros].every((x) => x.secret && x.url), 'B : chaque appel vise empreintes-urls avec le secret du cron (inchangé)');
    ok(egal(await droits(c), D0), 'B : droits, SECURITY DEFINER, propriétaire, search_path inchangés', await droits(c));

    console.log('C. INVERSE');
    await c.query(lire(INVERSE));
    ok(await md5(c) === MD5_PROD && egal(await tour(c), A), 'C : la prod à l\'octet, A de nouveau');
    console.log('D. MIGRATION rejouée');
    await c.query(lire(MIGRATION));
    ok(egal(await tour(c), B), 'D : B de nouveau');
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
