// LE BANC de la migration 20261112000000_profiles_cloud_formule (12/11/2026, offres Cloud) — SUR UN POSTGRES JETABLE
// (embedded-postgres, port 52000-53999, dossier à part), jamais la prod.   node scripts/essais/20261112000000_banc.mjs
// Décor : la table profiles aux colonnes de PROD (fixtures/prod-1111-palier-essai-cloud/catalogue.json, lu le 11/11) et
// ses droits de PROD relus le 12/11 : table — anon INSERT/SELECT/UPDATE/DELETE, authenticated INSERT/SELECT/DELETE,
// service_role tout ; UPDATE d'authenticated par colonne (13 colonnes nommées) ; RLS, politiques « select own profile »
// et « update own profile » (auth.uid() = id).
//   AVANT : pas de colonne ; APRÈS (jouée deux fois) : la colonne, sa contrainte, lisible par la personne sur SA ligne,
//   jamais écrite par elle, écrite par le serveur ; les 3 valeurs et NULL passent, toute autre est refusée ; rien d'autre ne
//   change (colonnes, contraintes, droits, politiques) ; INVERSE : l'état d'avant exactement ; de nouveau la migration.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrerBase, ouvrir } from './20261111140000_decor.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const MIG = lire('supabase/migrations/20261112000000_profiles_cloud_formule.sql');
const INV = lire('supabase/rollbacks/20261112000000_profiles_cloud_formule_INVERSE.sql');
const FX = JSON.parse(lire('scripts/essais/fixtures/prod-1111-palier-essai-cloud/catalogue.json'));
const UPDATE_AUTHENTICATED = ['currency', 'extension_sessions', 'lang', 'lens_count_date', 'lens_count_today', 'onboarded_at', 'platform_settings',
  'push_token', 'stats_analysis_cache', 'username', 'vinted_sync_pin', 'voice_count_date', 'voice_count_today'];

let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };
const id = (s) => `"${String(s).replace(/"/g, '""')}"`;
const base = await demarrerBase({ port: 52000 + Math.floor(Math.random() * 2000), nom: 'fillsell-banc-cloud-formule-' });
const c = await ouvrir(base.url);
const q = async (sql, p = []) => (await c.query(sql, p)).rows;
const A = 'b0000000-0000-4000-8000-00000000000a', B = 'b0000000-0000-4000-8000-00000000000b';
async function etat() {
  const cols = await q(`SELECT column_name || ':' || data_type || ':' || is_nullable AS x FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' ORDER BY 1`);
  const cons = await q(`SELECT conname || ':' || pg_get_constraintdef(oid) AS x FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass ORDER BY 1`);
  const droits = await q(`SELECT grantee || ':' || privilege_type || ':' || column_name AS x FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name = 'profiles' AND grantee IN ('anon', 'authenticated', 'service_role') ORDER BY 1`);
  const tab = await q(`SELECT coalesce(relacl::text, '') AS x FROM pg_class WHERE oid = 'public.profiles'::regclass`);
  const pol = await q(`SELECT policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') AS x FROM pg_policies WHERE tablename = 'profiles' ORDER BY 1`);
  return JSON.stringify({ cols: cols.map((r) => r.x), cons: cons.map((r) => r.x), droits: droits.map((r) => r.x), tab: tab.map((r) => r.x), pol: pol.map((r) => r.x) });
}
const enSession = async (uid, sql, p = []) => {
  await c.query('BEGIN');
  try {
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await c.query('SET LOCAL ROLE authenticated');
    const r = await c.query(sql, p);
    await c.query('COMMIT');
    return { ok: true, rows: r.rows, n: r.rowCount };
  } catch (e) { await c.query('ROLLBACK'); return { ok: false, err: e.message }; }
};
try {
  await c.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $f$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;`);
  const t = FX.tables.find((x) => x.nom === 'profiles');
  await c.query(`CREATE TABLE public.profiles (${t.cols.filter((k) => !k.g).map((k) => `${id(k.n)} ${k.t}`).join(', ')})`);
  for (const k of t.cons) await c.query(`ALTER TABLE public.profiles ADD CONSTRAINT ${id(k.n)} ${k.def}`);
  await c.query(`REVOKE ALL ON public.profiles FROM anon, authenticated, service_role;
    GRANT INSERT, SELECT, UPDATE, DELETE ON public.profiles TO anon;
    GRANT INSERT, SELECT, DELETE ON public.profiles TO authenticated;
    GRANT ALL ON public.profiles TO service_role;
    GRANT UPDATE (${UPDATE_AUTHENTICATED.map(id).join(', ')}) ON public.profiles TO authenticated;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "select own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
    CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);`);
  await c.query(`INSERT INTO public.profiles (id) VALUES ($1), ($2)`, [A, B]);
  ok(true, `décor : profiles aux ${t.cols.length} colonnes de prod, droits et politiques de prod`);

  console.log('A. AVANT');
  const AVANT = await etat();
  ok(!AVANT.includes('cloud_formule'), 'pas de colonne cloud_formule');
  console.log('B. MIGRATION (jouée deux fois)');
  await c.query(MIG); await c.query(MIG);
  const APRES = await etat();
  const av = JSON.parse(AVANT), ap = JSON.parse(APRES);
  ok(ap.cols.length === av.cols.length + 1 && ap.cols.includes('cloud_formule:text:YES'), 'une colonne de plus : cloud_formule text NULL');
  ok(ap.cons.length === av.cons.length + 1 && ap.cons.some((x) => x.startsWith('profiles_cloud_formule_connue:CHECK')), 'une contrainte de plus (les 3 valeurs)');
  ok(JSON.stringify(ap.pol) === JSON.stringify(av.pol) && JSON.stringify(ap.tab) === JSON.stringify(av.tab), 'politiques et droits de table inchangés');
  const nouveauxDroits = ap.droits.filter((x) => !av.droits.includes(x));
  ok(nouveauxDroits.every((x) => x.endsWith(':cloud_formule')) && !nouveauxDroits.includes('authenticated:UPDATE:cloud_formule')
    && nouveauxDroits.includes('authenticated:SELECT:cloud_formule') && ap.droits.filter((x) => !x.endsWith(':cloud_formule')).join() === av.droits.join(),
    'droits : ceux des colonnes Cloud — SELECT pour authenticated (table), JAMAIS UPDATE ; rien d\'autre ne bouge', nouveauxDroits);
  console.log('C. Les cas');
  for (const v of ['premium_cloud', 'pro_cloud', 'business_cloud', null]) {
    const r = await c.query(`UPDATE public.profiles SET cloud_formule = $2 WHERE id = $1`, [A, v]).then(() => true, () => false);
    ok(r, `le serveur écrit ${v === null ? 'NULL' : v}`);
  }
  for (const v of ['pro', 'cloud', 'Premium_cloud', '']) {
    const r = await c.query(`UPDATE public.profiles SET cloud_formule = $2 WHERE id = $1`, [A, v]).then(() => true, () => false);
    ok(!r, `« ${v} » refusé par la contrainte`);
  }
  await c.query(`UPDATE public.profiles SET cloud_formule = 'pro_cloud' WHERE id = $1`, [A]);
  await c.query(`UPDATE public.profiles SET cloud_formule = 'premium_cloud' WHERE id = $1`, [B]);
  const lu = await enSession(A, `SELECT id, cloud_formule FROM public.profiles`);
  ok(lu.ok && lu.rows.length === 1 && lu.rows[0].cloud_formule === 'pro_cloud', 'la personne lit SA formule, et seulement la sienne (RLS)', lu);
  const ecrit = await enSession(A, `UPDATE public.profiles SET cloud_formule = 'business_cloud' WHERE id = $1`, [A]);
  ok(!ecrit.ok && /permission denied/.test(ecrit.err ?? ''), 'la personne ne peut PAS l\'écrire (permission refusée)', ecrit);
  const autre = await enSession(A, `UPDATE public.profiles SET lang = 'en' WHERE id = $1`, [A]);
  ok(autre.ok && autre.n === 1, 'ses colonnes permises (lang) restent écrivables : rien d\'autre ne change');
  console.log('D. INVERSE');
  await c.query(INV);
  ok(await etat() === AVANT, 'l\'inverse rend l\'état d\'AVANT exactement (colonnes, contraintes, droits, politiques)');
  console.log('E. DE NOUVEAU la migration');
  await c.query(MIG);
  ok(await etat() === APRES, 'l\'état d\'APRÈS exactement');
} catch (e) {
  ko++; console.log(`  ✗ exception : ${e.stack ?? e}`);
} finally {
  await c.end().catch(() => {});
  await base.arreter();
}
console.log(`\n${n - ko}/${n} vérifications${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
process.exit(ko ? 1 : 0);
