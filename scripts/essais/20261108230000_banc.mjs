// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261108230000_extension_ordinateur_vu_le (08/11 nuit, URGENT jade60890 :
// le poste Cloud passait pour une extension installée) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261108230000_banc.mjs
// Décor : les colonnes de profiles et cloud_postes que la migration lit (formes relues en prod le 08/11 : extension_postes
// = objet { session: { le, build, … } }, build du poste Cloud suffixé « -cloud »). Cas = les vrais comptes du 08/11 :
//   A. compte sans Cloud (vraie extension) : extension_ordinateur_vu_le = son signe de vie ; signe de vie inchangé ;
//   B. Jade (Cloud arrêté, seul poste « -cloud », aucun build) : vraie extension = NULL ; signe de vie remis à NULL ;
//   C. wtk8 (idem, Cloud arrêté) : idem ;
//   D. Virginie (Cloud ACTIF, seul poste « -cloud ») : vraie extension NULL ; signe de vie GARDÉ (le Cloud tourne) ;
//   E. Nico (Cloud actif, poste « -cloud » + ordinateur) : vraie extension = passage de l'ordinateur ; signe de vie gardé ;
//   F. déclencheur : Virginie arrête → signe de vie NULL ; Nico arrête → passage de son ordinateur ; une mise à jour sans
//      cloud_voie ne touche à rien ; un compte qui PREND le Cloud n'est pas touché ;
//   G. migration rejouée : aucun effet de plus ;   H. INVERSE : colonne, fonction et déclencheur retirés, signes de vie remis.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }
let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-extension-vu-'));
  embarque = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55452, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
  await embarque.initialise();
  await embarque.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55452/postgres';
}
const DECOR = `
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, cloud_voie boolean NOT NULL DEFAULT false, extension_last_seen_at timestamptz,
  extension_build text, extension_postes jsonb);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, etat text NOT NULL DEFAULT 'eteint');
`;
const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const [A, B, C, D, E] = [1, 2, 3, 4, 5].map(id);
const poste = (le, build) => ({ le, build, rendu: { webgl: true } });
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };

const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
const q = (s, v) => client.query(s, v);
const lu = async (u) => (await q('SELECT cloud_voie, extension_last_seen_at AS vu, extension_ordinateur_vu_le AS pc FROM public.profiles WHERE id = $1', [u])).rows[0];
const iso = (d) => (d ? new Date(d).toISOString() : null);
try {
  await q(DECOR);
  const ins = (u, voie, vu, build, postes) => q('INSERT INTO public.profiles VALUES ($1,$2,$3,$4,$5)', [u, voie, vu, build, postes ? JSON.stringify(postes) : null]);
  await ins(A, false, '2026-11-08T20:00:00Z', '2026-11-08T18:30:10Z+bc358e9', { s1: poste('2026-11-08T20:00:00Z', '2026-11-08T18:30:10Z+bc358e9') });
  await ins(B, false, '2026-11-08T21:18:35.44Z', null, { a360: poste('2026-11-08T21:18:35.512Z', '2026-11-08T19:02:30Z+3e95540-cloud') });
  await ins(C, false, '2026-11-08T18:32:36.147Z', null, { s9: poste('2026-11-08T18:32:36.214Z', '2026-11-08T16:59:16Z+08bc9d7-cloud') });
  await ins(D, true, '2026-11-08T22:11:57.228Z', null, { s7: poste('2026-11-08T22:11:57.270Z', '2026-11-08T19:02:30Z+3e95540-cloud') });
  await ins(E, true, '2026-11-08T22:11:55.636Z', '2026-10-31T09:31:55Z+3876dc8',
    { s3: poste('2026-11-08T22:11:55.688Z', '2026-11-08T19:02:30Z+3e95540-cloud'), pc: poste('2026-11-08T17:40:00Z', '2026-10-31T09:31:55Z+3876dc8') });
  for (const u of [B, C, D, E]) await q('INSERT INTO public.cloud_postes VALUES ($1, $2)', [u, u === D || u === E ? 'actif' : 'eteint']);

  console.log('Migration');
  await q(lire('supabase/migrations/20261108230000_extension_ordinateur_vu_le.sql'));
  let a = await lu(A); ok(iso(a.pc) === '2026-11-08T20:00:00.000Z' && iso(a.vu) === '2026-11-08T20:00:00.000Z', 'A (vraie extension, jamais de Cloud) : vraie extension = son signe de vie ; inchangé');
  let b = await lu(B); ok(b.pc === null && b.vu === null, 'B Jade (Cloud arrêté, seul poste « -cloud ») : vraie extension NULL ; signe de vie du poste Cloud effacé');
  let c = await lu(C); ok(c.pc === null && c.vu === null, 'C wtk8 (Cloud arrêté) : idem');
  let d = await lu(D); ok(d.pc === null && iso(d.vu) === '2026-11-08T22:11:57.228Z', 'D Virginie (Cloud ACTIF) : vraie extension NULL ; signe de vie gardé (son Cloud tourne)');
  let e = await lu(E); ok(iso(e.pc) === '2026-11-08T17:40:00.000Z' && iso(e.vu) === '2026-11-08T22:11:55.636Z', 'E Nico (Cloud actif + ordinateur) : vraie extension = passage de l’ordinateur ; signe de vie gardé');
  const sauve = (await q('SELECT count(*)::int AS n FROM public._backup_20261108230000_extension_vu')).rows[0].n;
  ok(sauve === 5, 'les 5 signes de vie sauvegardés avant toute écriture');

  console.log('Déclencheur');
  await q('UPDATE public.profiles SET extension_build = extension_build WHERE id = $1', [D]);
  d = await lu(D); ok(iso(d.vu) === '2026-11-08T22:11:57.228Z', 'mise à jour sans cloud_voie : rien ne bouge');
  await q('UPDATE public.profiles SET cloud_voie = false WHERE id = $1', [D]);
  d = await lu(D); ok(d.vu === null, 'Virginie arrête son Cloud : le signe de vie de son poste Cloud cesse de compter (NULL)');
  await q('UPDATE public.profiles SET cloud_voie = false WHERE id = $1', [E]);
  e = await lu(E); ok(iso(e.vu) === '2026-11-08T17:40:00.000Z', 'Nico arrête : son signe de vie redevient celui de son ordinateur');
  await q("UPDATE public.profiles SET cloud_voie = true, extension_last_seen_at = '2026-11-08T23:00:00Z' WHERE id = $1", [A]);
  a = await lu(A); ok(a.cloud_voie === true && iso(a.vu) === '2026-11-08T23:00:00.000Z', 'un compte qui PREND le Cloud : rien d’effacé');

  console.log('Rejeu');
  await q(lire('supabase/migrations/20261108230000_extension_ordinateur_vu_le.sql'));
  a = await lu(A); b = await lu(B); e = await lu(E);
  ok(iso(a.pc) === '2026-11-08T20:00:00.000Z' && b.vu === null && iso(e.pc) === '2026-11-08T17:40:00.000Z', 'migration rejouée : aucun effet de plus');

  console.log('Inverse');
  await q(lire('supabase/rollbacks/20261108230000_extension_ordinateur_vu_le_INVERSE.sql'));
  const col = (await q("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'extension_ordinateur_vu_le'")).rows[0].n;
  const trig = (await q("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'profiles_zz_extension_cloud_fin'")).rows[0].n;
  const fn = (await q("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'profiles_extension_cloud_fin'")).rows[0].n;
  ok(col === 0 && trig === 0 && fn === 0, 'inverse : colonne, déclencheur et fonction retirés');
  const vb = (await q('SELECT extension_last_seen_at AS vu FROM public.profiles WHERE id = $1', [B])).rows[0].vu;
  const vd = (await q('SELECT extension_last_seen_at AS vu FROM public.profiles WHERE id = $1', [D])).rows[0].vu;
  ok(iso(vb) === '2026-11-08T21:18:35.440Z' && iso(vd) === '2026-11-08T22:11:57.228Z', 'inverse : les signes de vie effacés sont remis tels que sauvegardés');
  console.log(`\n${n}/${n} — banc vert.`);
} finally {
  await client.end().catch(() => {});
  if (embarque) await embarque.stop().catch(() => {});
}
