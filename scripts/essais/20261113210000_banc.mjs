// LE BANC de la migration 20261113210000_comptes_plateformes (M1, étape 4 « comptes hors France », L1, 13/11/2026) et du
// remplissage initial scripts/reparations/20261113_comptes_plateformes_remplissage.sql — SUR UN POSTGRES JETABLE
// (embedded-postgres sur le poste), jamais la prod.
//   node scripts/essais/20261113210000_banc.mjs
// Décor : auth.users + auth.uid(), rôles anon / authenticated / service_role (BYPASSRLS, comme Supabase), ebay_accounts et
// profiles réduits aux colonnes lues. Comptes : préfixes RÉELS (id8), suffixes et identifiants de plateforme inventés.
// La porte d'écriture JS (_shared/comptes-plateformes.js) est jouée CONTRE CETTE BASE par un petit adaptateur
// (from/select/eq/insert/update → SQL, en service_role) : la preuve « une écriture » se lit sur xmin.
// Étapes : A. AVANT M1 — la porte ne casse rien (table absente), le script refuse ; B. M1 (deux fois) — RLS, droits,
// gardes (jamais EBAY_FR étranger) ; C. la porte — 1 insert, puis 0 écriture à l'identique (xmin), 1 update ciblé, pilote
// gardé, UPDATE identique sans nouvelle version ; D. le script — chaque ligne = celle du module, lignes des fonctions
// jamais réécrites, rejoué → refusé ; preuve SQL ; E. inverse du script — retire ses lignes inchangées seulement ;
// F. inverse de M1 — la porte retombe sur « table absente » ; G. M1 rejouée.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = 'supabase/migrations/20261113210000_comptes_plateformes.sql';
const INVERSE = 'supabase/rollbacks/20261113210000_comptes_plateformes_INVERSE.sql';
const SCRIPT = 'scripts/reparations/20261113_comptes_plateformes_remplissage.sql';
const SCRIPT_INV = 'scripts/reparations/20261113_comptes_plateformes_remplissage_INVERSE.sql';
const PREUVE = 'scripts/reparations/20261113_comptes_plateformes_remplissage_PREUVE.sql';
const S = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/sites-plateformes.js')).href);
const C = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/comptes-plateformes.js')).href);

const u = (id8, n) => `${id8}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EBAY = [ // [user, eias, site GetUser, lu le, révoqué]
  [u('c7c382b7', 1), 'eias-essai-c7c382b7', 'UK', '2026-11-12T17:30:00Z', false],
  [u('9ea76b27', 2), 'eias-essai-9ea76b27', 'US', '2026-11-09T09:46:00Z', false],
  [u('9324a9b7', 3), 'eias-essai-9324a9b7', 'Belgium_French', '2026-10-14T10:08:00Z', false],
  [u('04699046', 4), 'eias-essai-04699046', 'France', '2026-11-13T09:00:00Z', false],
  [u('fa461c41', 5), 'eias-essai-fa461c41', 'Austria', '2026-10-13T17:43:00Z', false],
  [u('0a0829b8', 6), 'eias-essai-0a0829b8', 'Germany', '2026-10-21T09:35:00Z', false],
  [u('ac19c8c9', 7), 'eias-essai-ac19c8c9', 'Italy', '2026-10-24T07:49:00Z', false],
  [u('00ca4ff3', 8), 'eias-essai-00ca4ff3', 'Canada', '2026-10-14T12:40:00Z', true],
  [u('11111111', 9), 'eias-essai-jamais-lu', null, null, false], // site jamais lu → aucune ligne
  [u('22222222', 10), 'eias-essai-malaisie', 'Malaysia', '2026-11-13T09:00:00Z', false], // fictif : sans marketplace Inventory
];
const VINTED = [ // [user, vinted_identite]
  [u('ac19c8c9', 7), { user_id: '100000001', login: 'vendeur-essai-1', pays: 'IT', langue: 'it-fr' }],
  [u('c5df477d', 11), { user_id: '100000002', login: 'vendeur-essai-2', pays: 'IT', langue: 'it-fr', domaine: 'www.vinted.it' }],
  [u('2c89e573', 12), { user_id: '100000003', login: 'vendeur-essai-3', pays: 'BE', langue: 'fr' }],
  [u('9f64d78e', 13), { user_id: '100000004', login: 'vendeur-essai-4', pays: 'PT', langue: 'en-fr' }],
  [u('04699046', 4), { user_id: '100000005', login: 'vendeur-essai-5', pays: 'FR', langue: 'fr' }],
  [u('33333333', 14), { user_id: '100000006', login: 'vendeur-essai-6' }], // sonde sans pays → aucune ligne
  [u('44444444', 15), null], // sonde muette → aucune ligne
  [u('55555555', 16), { user_id: '100000007', login: 'vendeur-essai-7', pays: 'GB', langue: 'en-gb' }], // fictif : hors euro
];

const PRELUDE = String.raw`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.ebay_accounts (user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE, ebay_user_id text,
  ebay_eias_token text, ebay_site text, ebay_site_lu_le timestamptz, revoked_at timestamptz);
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE, extension_sessions jsonb);
`;

async function decor(c) {
  const ids = new Set([...EBAY.map((e) => e[0]), ...VINTED.map((v) => v[0])]);
  for (const id of ids) await c.query('INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  await c.query('TRUNCATE public.ebay_accounts, public.profiles');
  for (const [id, eias, site, le, rev] of EBAY) {
    await c.query('INSERT INTO public.ebay_accounts (user_id, ebay_user_id, ebay_eias_token, ebay_site, ebay_site_lu_le, revoked_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, `pseudo-essai-${id.slice(0, 8)}`, eias, site, le, rev ? '2026-10-26T00:00:00Z' : null]);
  }
  for (const id of ids) {
    const v = VINTED.find((x) => x[0] === id);
    await c.query('INSERT INTO public.profiles (id, extension_sessions) VALUES ($1, $2::jsonb)', [id, JSON.stringify(v ? { vinted: v[1] ? true : null, vinted_identite: v[1] } : {})]);
  }
}

// ── Un adaptateur « supabase-js » minimal, en service_role, qui compte les écritures ──────────────────────────────────
function adaptateur(c) {
  const journal = [];
  const from = (table) => {
    const e = { table, op: null, cols: '*', val: null, f: [] };
    const b = {
      select(cols) { if (!e.op) { e.op = 'select'; e.cols = cols ?? '*'; } return b; },
      eq(k, v) { e.f.push([k, v]); return b; },
      insert(v) { e.op = 'insert'; e.val = v; return b; },
      update(v) { e.op = 'update'; e.val = v; return b; },
      maybeSingle() { return b.then((x) => x); },
      async then(res, rej) {
        try {
          const params = [];
          const ou = e.f.map(([k, v]) => { params.push(v); return `${k} = $${params.length}`; }).join(' AND ');
          let sql;
          if (e.op === 'select') sql = `SELECT ${e.cols} FROM public.${table}${ou ? ` WHERE ${ou}` : ''} LIMIT 2`;
          else if (e.op === 'insert') {
            const ks = Object.keys(e.val);
            const p0 = params.length;
            ks.forEach((k) => params.push(k === 'brut' ? JSON.stringify(e.val[k]) : e.val[k]));
            sql = `INSERT INTO public.${table} (${ks.join(', ')}) VALUES (${ks.map((k, i) => `$${p0 + i + 1}${k === 'brut' ? '::jsonb' : ''}`).join(', ')})`;
          } else if (e.op === 'update') {
            const ks = Object.keys(e.val);
            const sets = ks.map((k) => { params.push(k === 'brut' ? JSON.stringify(e.val[k]) : e.val[k]); return `${k} = $${params.length}${k === 'brut' ? '::jsonb' : ''}`; });
            sql = `UPDATE public.${table} SET ${sets.join(', ')}${ou ? ` WHERE ${ou}` : ''}`;
          } else throw Object.assign(new Error(`opération ${e.op}`), { code: 'XX' });
          await c.query('SET ROLE service_role');
          let r;
          try { r = await c.query(sql, params); } finally { await c.query('RESET ROLE'); }
          journal.push(e.op);
          const lignes = r.rows ?? [];
          return res({ data: e.op === 'select' ? (lignes[0] ? { ...lignes[0], lu_le: new Date(lignes[0].lu_le).toISOString() } : null) : null, error: null });
        } catch (err) {
          journal.push(`${e.op}!`);
          return res({ data: null, error: { code: err.code ?? 'XX', message: String(err.message) } });
        }
      },
    };
    return b;
  };
  return { from, journal, ecritures: () => journal.filter((x) => x === 'insert' || x === 'update').length };
}

export async function demarrer(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-comptes-plateformes-'));
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await base.initialise(); await base.start();
  const c = new pg.Client({ connectionString: `postgres://postgres:banc@127.0.0.1:${port}/postgres` });
  await c.connect(); c.on('notice', () => {});
  await c.query(PRELUDE);
  const arreter = async () => { await c.end().catch(() => {}); await base.stop().catch(() => {}); try { rmSync(dossier, { recursive: true, force: true }); } catch { /* temp */ } };
  return { c, arreter };
}

const echoue = async (c, sql, params) => { try { await c.query(sql, params); return null; } catch (e) { await c.query('ROLLBACK').catch(() => {}); return `${e.code} ${e.message}`; } };
const ligneBase = async (c, user, plateforme, compte) => (await c.query(
  `SELECT *, xmin::text x FROM public.comptes_plateformes WHERE user_id = $1 AND plateforme = $2 AND compte = $3`, [user, plateforme, compte])).rows[0] ?? null;
const egalSite = (a, b) => a && b && S.CHAMPS_SITE.every((k) => JSON.stringify(k === 'brut' ? Object.fromEntries(Object.entries(a[k] ?? {}).sort()) : a[k] ?? null)
  === JSON.stringify(k === 'brut' ? Object.fromEntries(Object.entries(b[k] ?? {}).sort()) : b[k] ?? null));

async function tourMigration(c, ok, prefixe) {
  const t = (await c.query(`SELECT relrowsecurity r FROM pg_class WHERE oid = 'public.comptes_plateformes'::regclass`)).rows[0];
  ok(t?.r === true, `${prefixe} : RLS active`);
  const pol = (await c.query(`SELECT polname, polcmd, pg_get_expr(polqual, polrelid) q, polroles::regrole[]::text r FROM pg_policy WHERE polrelid = 'public.comptes_plateformes'::regclass`)).rows;
  ok(pol.length === 1 && pol[0].polcmd === 'r' && /auth\.uid\(\)/.test(pol[0].q) && /authenticated/.test(pol[0].r), `${prefixe} : une seule policy, LECTURE par le propriétaire`, pol);
  const dr = (await c.query(`SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'comptes_plateformes' AND grantee IN ('anon','authenticated','service_role') GROUP BY 1 ORDER BY 1`)).rows;
  ok(JSON.stringify(dr) === JSON.stringify([{ grantee: 'authenticated', p: 'SELECT' }, { grantee: 'service_role', p: 'DELETE,INSERT,SELECT,UPDATE' }]),
    `${prefixe} : droits — authenticated SELECT seul, service_role écrit, anon rien`, dr);
  const tg = (await c.query(`SELECT tgname, tgfoid::regproc::text f FROM pg_trigger WHERE tgrelid = 'public.comptes_plateformes'::regclass AND NOT tgisinternal`)).rows;
  ok(tg.length === 1 && tg[0].f === 'suppress_redundant_updates_trigger', `${prefixe} : déclencheur suppress_redundant_updates_trigger`, tg);
}

const principal = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (principal) {
  let n = 0, ko = 0;
  const ok = (cond, msg, d) => { n++; if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 700)}`}`); } };
  const { c, arreter } = await demarrer(58000 + Math.floor(Math.random() * 2000));
  const T0 = Date.parse('2026-11-13T12:00:00Z');
  try {
    await decor(c);
    const lE = (i) => S.ligneCompteEbay({ userId: EBAY[i][0], compte: EBAY[i][1], siteGetUser: EBAY[i][2] });
    const lV = (i, ident = VINTED[i][1]) => S.ligneCompteVinted({ userId: VINTED[i][0], identite: ident });

    console.log('A. AVANT M1 — la porte ne casse rien, le script refuse');
    C._reinitialiserMemo();
    let a = adaptateur(c);
    const rA = await C.noterComptePlateforme(a, lE(0), { maintenant: T0 });
    ok(rA.ecrit === false && rA.motif === 'table_absente' && a.ecritures() === 0, 'A : la porte → « table_absente », aucune écriture, aucune erreur levée', { rA, j: a.journal });
    ok(await C.lireComptePlateforme(a, { userId: EBAY[0][0], plateforme: 'ebay', compte: EBAY[0][1] }) === null, 'A : la lecture → null (etatPublic retombe sur le site GetUser)');
    const eS = await echoue(c, lire(SCRIPT));
    ok(/M1, comptes_plateformes\) absente/.test(eS ?? '') && (await c.query(`SELECT to_regclass('public._backup_1311_comptes_plateformes') t`)).rows[0].t === null,
      'A : le script refuse sans M1 et n\'écrit rien (pas même sa sauvegarde)', eS);

    console.log('B. MIGRATION (deux fois)');
    await c.query(lire(MIGRATION));
    await c.query(lire(MIGRATION));
    await tourMigration(c, ok, 'B');
    const U0 = EBAY[0][0];
    const base = `INSERT INTO public.comptes_plateformes (user_id, plateforme, compte, site, pays, langue, devise, domaine, source, brut) VALUES`;
    ok(/comptes_plateformes_jamais_ebay_fr_etranger/.test(await echoue(c, `${base} ($1, 'ebay', 'x', 'EBAY_FR', 'GB', 'fr-FR', 'EUR', 'ebay.fr', 'ebay_getuser', '{}')`, [U0]) ?? ''),
      'B : la base REFUSE EBAY_FR pour un compte d\'un autre pays');
    ok(/check/i.test(await echoue(c, `${base} ($1, 'vinted', '1', 'VINTED_IT', 'FR', 'fr', 'EUR', 'vinted.fr', 'vinted_sonde', '{}')`, [U0]) ?? ''), 'B : VINTED_IT pour un compte français : refusé');
    ok(/check/i.test(await echoue(c, `${base} ($1, 'ebay', 'x', 'Royaume-Uni', 'GB', 'en-GB', 'GBP', 'ebay.co.uk', 'ebay_getuser', '{}')`, [U0]) ?? ''), 'B : un libellé au lieu d\'un identifiant : refusé');
    ok(/check/i.test(await echoue(c, `${base} ($1, 'depop', ' 2 ', 'DEPOP_GB', 'GB', null, 'GBP', 'depop.com', 'depop_sonde', '{}')`, [U0]) ?? ''), 'B : un compte mal formé (espaces) : refusé');
    // RLS : un compte authentifié ne lit que SES lignes et n'écrit jamais.
    await c.query(`INSERT INTO public.comptes_plateformes (user_id, plateforme, compte, site, pays, langue, devise, domaine, source, brut)
      VALUES ($1, 'ebay', 'rls-a', 'EBAY_GB', 'GB', 'en-GB', 'GBP', 'ebay.co.uk', 'ebay_getuser', '{"site":"UK"}'),
             ($2, 'ebay', 'rls-b', 'EBAY_US', 'US', 'en-US', 'USD', 'ebay.com', 'ebay_getuser', '{"site":"US"}')`, [EBAY[0][0], EBAY[1][0]]);
    await c.query('BEGIN'); await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [EBAY[0][0]]); await c.query('SET LOCAL ROLE authenticated');
    const vus = (await c.query('SELECT compte FROM public.comptes_plateformes')).rows.map((r) => r.compte);
    await c.query('COMMIT');
    ok(JSON.stringify(vus) === JSON.stringify(['rls-a']), 'B : authenticated (c7c382b7) ne lit que SA ligne', vus);
    for (const [quoi, sql] of [['insert', `${base} ($1, 'ebay', 'rls-c', 'EBAY_GB', 'GB', 'en-GB', 'GBP', 'ebay.co.uk', 'ebay_getuser', '{}')`],
      ['update', `UPDATE public.comptes_plateformes SET pilote = true WHERE user_id = $1`], ['delete', `DELETE FROM public.comptes_plateformes WHERE user_id = $1`]]) {
      await c.query('BEGIN'); await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [EBAY[0][0]]); await c.query('SET LOCAL ROLE authenticated');
      const e = await echoue(c, sql, [EBAY[0][0]]);
      if (!e) await c.query('ROLLBACK');
      ok(/permission denied/.test(e ?? ''), `B : authenticated ne peut pas ${quoi} (écriture serveur seulement)`, e);
    }
    await c.query('BEGIN'); await c.query('SET LOCAL ROLE anon');
    const eAnon = await echoue(c, 'SELECT 1 FROM public.comptes_plateformes');
    ok(/permission denied/.test(eAnon ?? ''), 'B : anon ne lit rien', eAnon);
    await c.query(`DELETE FROM public.comptes_plateformes WHERE compte IN ('rls-a', 'rls-b')`);

    console.log('C. LA PORTE (JS) contre la base — une écriture, jamais une ligne inchangée réécrite');
    C._reinitialiserMemo(); a = adaptateur(c);
    const r1 = await C.noterComptePlateforme(a, lE(0), { maintenant: T0 });
    const b1 = await ligneBase(c, EBAY[0][0], 'ebay', EBAY[0][1]);
    ok(r1.motif === 'inseree' && a.ecritures() === 1 && egalSite(b1, lE(0)) && b1.site === 'EBAY_GB' && b1.pilote === false, 'C : c7c382b7 (UK) → UN insert, EBAY_GB, pilote false', { r1, b1 });
    C._reinitialiserMemo();
    const r2 = await C.noterComptePlateforme(a, lE(0), { maintenant: T0 + 60_000 });
    const b2 = await ligneBase(c, EBAY[0][0], 'ebay', EBAY[0][1]);
    ok(r2.motif === 'inchangee' && a.ecritures() === 1 && b2.x === b1.x, 'C : relue à l\'identique (autre isolat) → 0 écriture, xmin inchangé', { r2, x: [b1.x, b2.x] });
    const r2b = await C.noterComptePlateforme(a, lE(0), { maintenant: T0 + 120_000 });
    ok(r2b.motif === 'deja_vue' && a.journal.length === 3, 'C : même isolat → aucune requête', { r2b, j: a.journal });
    const rV = await C.noterComptesDesSessions(a, VINTED[0][0], { vinted: true, vinted_identite: VINTED[0][1] }, { maintenant: T0 });
    ok(rV.length === 1 && rV[0].motif === 'inseree' && egalSite(await ligneBase(c, VINTED[0][0], 'vinted', '100000001'), lV(0)), 'C : ac19c8c9 (sonde Vinted IT « it-fr ») → VINTED_IT', rV);
    await c.query(`UPDATE public.comptes_plateformes SET pilote = true WHERE user_id = $1 AND plateforme = 'vinted'`, [VINTED[0][0]]); // le geste de Nico (L6)
    const bV0 = await ligneBase(c, VINTED[0][0], 'vinted', '100000001');
    C._reinitialiserMemo();
    const nouvelle = lV(0, { ...VINTED[0][1], langue: 'en-fr' });
    const avantE = a.ecritures();
    const rV2 = await C.noterComptePlateforme(a, nouvelle, { maintenant: T0 + 3_600_000 });
    const bV1 = await ligneBase(c, VINTED[0][0], 'vinted', '100000001');
    ok(rV2.motif === 'modifiee' && a.ecritures() === avantE + 1 && bV1.langue === 'en' && bV1.pilote === true && bV1.lu_le.getTime() === T0 + 3_600_000 && bV1.x !== bV0.x,
      'C : la langue change → UN update (langue, brut, lu_le), pilote GARDÉ', { rV2, bV1 });
    await c.query(`UPDATE public.comptes_plateformes SET site = site, brut = brut WHERE user_id = $1 AND plateforme = 'vinted'`, [VINTED[0][0]]);
    ok((await ligneBase(c, VINTED[0][0], 'vinted', '100000001')).x === bV1.x, 'C : un UPDATE identique en SQL n\'écrit aucune version (suppress_redundant_updates_trigger, xmin)');
    const vide = await C.noterComptesDesSessions(a, VINTED[6][0], { vinted: null, vinted_identite: null });
    ok(vide.length === 0, 'C : sonde muette → rien (jamais une ligne effacée)');

    console.log('D. LE SCRIPT de remplissage — chaque ligne = celle du module');
    const xAvant = { e: (await ligneBase(c, EBAY[0][0], 'ebay', EBAY[0][1])).x, v: (await ligneBase(c, VINTED[0][0], 'vinted', '100000001')).x };
    const rs = await c.query(lire(SCRIPT));
    const compte = Object.fromEntries((rs.find?.((x) => x.command === 'SELECT' && x.rows.length) ?? rs[rs.length - 2] ?? { rows: [] }).rows.map((r) => [`${r.plateforme}:${r.site}`, Number(r.lignes)]));
    ok(JSON.stringify(Object.fromEntries(Object.entries(compte).sort())) === JSON.stringify({ 'ebay:EBAY_AT': 1, 'ebay:EBAY_BE': 1, 'ebay:EBAY_CA': 1, 'ebay:EBAY_DE': 1, 'ebay:EBAY_FR': 1, 'ebay:EBAY_IT': 1, 'ebay:EBAY_US': 2, 'vinted:VINTED_BE': 1, 'vinted:VINTED_FR': 1, 'vinted:VINTED_GB': 1, 'vinted:VINTED_IT': 1, 'vinted:VINTED_PT': 1 }),
      'D : 8 lignes eBay + 5 Vinted écrites (c7c382b7 eBay et ac19c8c9 Vinted, déjà notés par la porte, ne sont pas réécrits ; site jamais lu, sonde sans pays ou muette → rien)', compte);
    ok((await ligneBase(c, EBAY[0][0], 'ebay', EBAY[0][1])).x === xAvant.e && (await ligneBase(c, VINTED[0][0], 'vinted', '100000001')).x === xAvant.v
      && (await c.query(`SELECT count(*)::int n FROM public._backup_1311_comptes_plateformes WHERE (user_id = $1 AND plateforme = 'ebay') OR (user_id = $2 AND plateforme = 'vinted')`, [EBAY[0][0], VINTED[0][0]])).rows[0].n === 0,
      'D : ON CONFLICT DO NOTHING — les lignes des fonctions ne sont ni réécrites (xmin) ni sauvegardées');
    let diff = [];
    for (let i = 1; i < EBAY.length; i++) {
      const attendu = lE(i); const b = await ligneBase(c, EBAY[i][0], 'ebay', EBAY[i][1]);
      if (!attendu) { if (b) diff.push(['ebay sans site', EBAY[i][0].slice(0, 8)]); continue; }
      if (!egalSite(b, attendu) || b.lu_le.toISOString() !== new Date(EBAY[i][3]).toISOString()) diff.push(['ebay', EBAY[i][0].slice(0, 8), b, attendu]);
    }
    for (let i = 1; i < VINTED.length; i++) {
      const attendu = lV(i); const b = attendu ? await ligneBase(c, VINTED[i][0], 'vinted', attendu.compte) : null;
      if (!attendu) { const n0 = (await c.query(`SELECT count(*)::int n FROM public.comptes_plateformes WHERE user_id = $1 AND plateforme = 'vinted'`, [VINTED[i][0]])).rows[0].n; if (n0) diff.push(['vinted sans pays', VINTED[i][0].slice(0, 8)]); continue; }
      if (!egalSite(b, attendu)) diff.push(['vinted', VINTED[i][0].slice(0, 8), b, attendu]);
    }
    ok(diff.length === 0, 'D : chaque ligne du script = celle que le module écrirait (site, pays, langue, devise, domaine, source, brut ; lu_le eBay = la lecture GetUser)', diff);
    const cas = Object.fromEntries((await c.query(`SELECT left(user_id::text, 8) u, plateforme, site, langue, devise, domaine FROM public.comptes_plateformes`)).rows.map((r) => [`${r.u}:${r.plateforme}`, `${r.site} ${r.langue} ${r.devise} ${r.domaine}`]));
    ok(cas['c7c382b7:ebay'] === 'EBAY_GB en-GB GBP ebay.co.uk' && cas['9324a9b7:ebay'] === 'EBAY_BE fr-BE EUR befr.ebay.be' && cas['9ea76b27:ebay'] === 'EBAY_US en-US USD ebay.com'
      && cas['04699046:ebay'] === 'EBAY_FR fr-FR EUR ebay.fr' && cas['22222222:ebay'] === 'EBAY_US en-US USD ebay.com' && cas['c5df477d:vinted'] === 'VINTED_IT it EUR vinted.it'
      && cas['9f64d78e:vinted'] === 'VINTED_PT en EUR vinted.pt' && cas['55555555:vinted'] === 'VINTED_GB en null null', 'D : les cas réels, ligne par ligne', cas);
    const eRejeu = await echoue(c, lire(SCRIPT));
    ok(/déjà passé/.test(eRejeu ?? ''), 'D : rejoué → refusé, rien n\'est écrit', eRejeu);
    const pv = await c.query(lire(PREUVE));
    const res = (q) => pv.filter((x) => x.command === 'SELECT').flatMap((x) => x.rows).filter((r) => r.quoi === q);
    ok(res('ebay_fr_etranger')[0]?.n === '0' && res('ecart_ebay').length === 0 && res('ecart_vinted').length === 0 && res('cas').length === 10,
      'D : la PREUVE (lecture seule) passe : 0 EBAY_FR étranger, 0 écart, 10 lignes des cas réels (4 comptes eBay, 5 comptes Vinted dont 04699046 et ac19c8c9 sur les deux)', { fr: res('ebay_fr_etranger'), ee: res('ecart_ebay'), ev: res('ecart_vinted'), cas: res('cas').length });

    console.log('E. INVERSE DU SCRIPT — ses lignes inchangées seulement');
    C._reinitialiserMemo(); a = adaptateur(c);
    await C.noterComptePlateforme(a, lV(3, { ...VINTED[3][1], langue: 'pt-fr' }), { maintenant: T0 + 7_200_000 }); // 9f64d78e relu par une fonction, changé
    const ri = await c.query(lire(SCRIPT_INV));
    const bilan = ri.filter((x) => x.command === 'SELECT').flatMap((x) => x.rows).map((r) => `${r.quoi}:${r.plateforme}:${r.lignes}`).sort();
    ok(JSON.stringify(bilan) === JSON.stringify(['gardees_changees_depuis:vinted:1', 'retirees:ebay:8', 'retirees:vinted:4']), 'E : 12 lignes retirées, la ligne relue depuis (9f64d78e) gardée', bilan);
    const reste = (await c.query(`SELECT left(user_id::text, 8) u, plateforme FROM public.comptes_plateformes ORDER BY 1, 2`)).rows.map((r) => `${r.u}:${r.plateforme}`);
    ok(JSON.stringify(reste) === JSON.stringify(['9f64d78e:vinted', 'ac19c8c9:vinted', 'c7c382b7:ebay']), 'E : restent les lignes des fonctions (c7c382b7, ac19c8c9) et la ligne relue', reste);
    ok((await c.query(`SELECT to_regclass('public._backup_1311_comptes_plateformes') t`)).rows[0].t === null, 'E : la sauvegarde est retirée');
    await c.query(lire(SCRIPT));
    ok((await c.query('SELECT count(*)::int n FROM public.comptes_plateformes')).rows[0].n === 15, 'E : le script se rejoue après son inverse (15 lignes : 3 gardées + 12)');
    await c.query(lire(SCRIPT_INV));

    console.log('F. INVERSE DE M1');
    await c.query(lire(INVERSE));
    ok((await c.query(`SELECT to_regclass('public.comptes_plateformes') t`)).rows[0].t === null, 'F : la table est retirée');
    C._reinitialiserMemo(); a = adaptateur(c);
    const rF = await C.noterComptePlateforme(a, lE(1), { maintenant: T0 });
    ok(rF.motif === 'table_absente' && a.ecritures() === 0, 'F : la porte retombe sur « table absente », sans erreur', rF);

    console.log('G. M1 rejouée');
    await c.query(lire(MIGRATION));
    await tourMigration(c, ok, 'G');
    C._reinitialiserMemo(); a = adaptateur(c);
    ok((await C.noterComptePlateforme(a, lE(1), { maintenant: T0 })).motif === 'inseree', 'G : la porte écrit de nouveau (9ea76b27 → EBAY_US)');
  } finally { await arreter(); }
  console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}
