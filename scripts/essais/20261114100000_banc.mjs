// ESSAI, SUR UN POSTGRES JETABLE, de la migration 20261114100000_origine_plateforme_inscription (14/11, bloc E1 : la
// plateforme d'inscription quitte acquisition_source) — jamais la prod.
//   PREUVE_PG=embarque node scripts/essais/20261114100000_banc.mjs
// Décor : les migrations EN SERVICE rejouées telles quelles (20260913130000_acquisition_source, puis
// 20261025013000_origine_inscription_survit_au_compte) sur un profiles réduit ; le banc vérifie d'abord que les
// fonctions et la vue obtenues ont les md5 de la PROD lus le 14/11 (sinon il ne prouve rien et s'arrête).
//   A. AVANT : un Android venu de la pub (source « meta ») est compté « web » ; l'appel à 8 paramètres n'existe pas
//      (ce que PostgREST rend en PGRST202, d'où le repli de l'app) ;
//   B. la migration (deux fois : la 2e passe la garde de rejeu), puis :
//      1. aucune ligne existante réécrite (xmin inchangés), aucune plateforme posée d'office ;
//      2. l'appel d'AUJOURD'HUI (7 paramètres nommés, web / iPhone) passe, plateforme NULL, règle d'avant dans la vue ;
//      3. l'appel de DEMAIN (8 paramètres, Android Google Play) : android dans la colonne et dans la vue ;
//      4. première pose gagne (2e appel refusé), verrou d'immuabilité (UPDATE direct ignoré, plateforme comprise) ;
//      5. valeur hors liste → NULL sans erreur ; anon refusé, authenticated permis ;
//      6. archive à la suppression : android ; un iPhone d'avant : ios ;
//      7. une seule fonction poser_origine_inscription (jamais deux : PGRST203) ;
//   C. une garde qui ne reconnaît pas la base → la migration s'arrête sans rien changer ;
//   D. l'INVERSE remet les md5 de la prod, garde les plateformes dans la sauvegarde, l'appel à 7 paramètres repasse ;
//      la migration se rejoue.
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lire = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod), ou « embarque ».'); process.exit(2); }

const MIGRATION = lire('supabase/migrations/20261114100000_origine_plateforme_inscription.sql');
const INVERSE = lire('supabase/rollbacks/20261114100000_origine_plateforme_inscription_INVERSE.sql');
const PROD = { rpc7: '0915de0d5fa3e33176a2bbe05729ba9a', imm: 'aec47bda23057b6eb38751b4854d35ff', survit: '0fa3e0d510e18fc4ec776622571c9d85', vue: '04b03db9afbfe7bb60bfec9340a2e906' };

let embarque = null;
if (PG_URL === 'embarque') {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dossier = mkdtempSync(join(tmpdir(), 'fillsell-banc-origine-plateforme-'));
  embarque = { pg: new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'banc', port: 55473, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} }), dossier };
  await embarque.pg.initialise();
  await embarque.pg.start();
  PG_URL = 'postgres://postgres:banc@127.0.0.1:55473/postgres';
}

let verts = 0, rouges = 0;
const ok = (c, m, d = '') => {
  if (c) { verts++; console.log(`  ok   ${m}`); }
  else { rouges++; console.log(`  RATÉ ${m}${d ? `\n         ← ${String(d).slice(0, 500)}` : ''}`); }
};

const U = {
  web: '00000000-0000-4000-8000-0000000000a1', ios: '00000000-0000-4000-8000-0000000000a2', android: '00000000-0000-4000-8000-0000000000a3',
  hors: '00000000-0000-4000-8000-0000000000a4', ancien: '00000000-0000-4000-8000-0000000000a5', avant: '00000000-0000-4000-8000-0000000000a6',
  apres: '00000000-0000-4000-8000-0000000000a7',
};
const PRELUDE = String.raw`
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'banc';
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now(), raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $f$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id), email text, created_at timestamptz NOT NULL DEFAULT now(),
  stripe_customer_id text, apple_original_transaction_id text, google_purchase_token text, prenom text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.palier_de(p_user uuid) RETURNS text LANGUAGE sql STABLE AS $f$ SELECT 'free'::text $f$;
`;

const c = new pg.Client({ connectionString: PG_URL });
await c.connect(); c.on('notice', () => {});
const a = new pg.Client({ connectionString: PG_URL.replace('postgres:banc@', 'authenticator:banc@') });
// Un fichier BEGIN … COMMIT qui échoue laisse la transaction ouverte (requête simple) : ROLLBACK.
const sql = async (q, p = []) => { try { return { ok: true, rows: (await c.query(q, p)).rows }; } catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, erreur: e.message }; } };
/** Un appel comme PostgREST le joue : transaction, rôle et claims posés en local. */
async function api(role, uid, q, p = []) {
  await a.query('BEGIN');
  try {
    await a.query(`SELECT set_config('role', $1, true), set_config('request.jwt.claims', $2, true)`, [role, JSON.stringify({ role, sub: uid })]);
    const r = await a.query(q, p);
    await a.query('COMMIT');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await a.query('ROLLBACK').catch(() => {});
    return { ok: false, erreur: e.message };
  }
}
const md5s = async () => (await c.query(`SELECT
  (SELECT md5(pg_get_functiondef(to_regprocedure('public.poser_origine_inscription(text,text,text,text,text,text,timestamptz)')))) AS rpc7,
  (SELECT md5(pg_get_functiondef(to_regprocedure('public.poser_origine_inscription(text,text,text,text,text,text,timestamptz,text)')))) AS rpc8,
  md5(pg_get_functiondef('public.profiles_acquisition_immuable()'::regprocedure)) AS imm,
  md5(pg_get_functiondef('public.profiles_origine_survit()'::regprocedure)) AS survit,
  md5(pg_get_viewdef('public.origines_inscriptions'::regclass, true)) AS vue,
  (SELECT count(*) FROM pg_proc WHERE proname = 'poser_origine_inscription')::int AS nb_rpc,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'acquisition_plateforme') AS colonne`)).rows[0];
const ajouter = async (id, ilYa = '1 hour') => {
  await c.query(`INSERT INTO auth.users (id, email, created_at) VALUES ($1, $2, now() - $3::interval)`, [id, `${id.slice(-4)}@exemple.invalid`, ilYa]);
  await c.query(`INSERT INTO public.profiles (id, email, created_at) VALUES ($1, $2, now() - $3::interval)`, [id, `${id.slice(-4)}@exemple.invalid`, ilYa]);
};
const APPEL7 = `SELECT public.poser_origine_inscription(p_source := $1, p_medium := $2, p_campaign := $3, p_content := $4, p_fbclid := $5,
  p_referrer := $6, p_captee_le := $7) AS r`;
const APPEL8 = `SELECT public.poser_origine_inscription(p_source := $1, p_medium := $2, p_campaign := $3, p_content := $4, p_fbclid := $5,
  p_referrer := $6, p_captee_le := $7, p_plateforme := $8) AS r`;
const AVANT_CPT = () => new Date(Date.now() - 2 * 3600e3).toISOString();
// Un utm_content PROPRE à chaque compte : la vue n'a pas d'identifiant, on la lit par son contenu.
const meta = (contenu) => ['meta', 'paid', 'installer-continu', contenu, null, 'https://play.google.com'];
const plateformeVue = async (contenu) => {
  const r = (await c.query(`SELECT plateforme_inscription FROM public.origines_inscriptions WHERE NOT parti AND content = $1`, [contenu])).rows;
  return r.length === 1 ? r[0].plateforme_inscription : `(${r.length} lignes)`;
};
const ligne = async (id, cols = 'acquisition_source, acquisition_medium, acquisition_campaign, acquisition_referrer, acquisition_captured_at') =>
  (await c.query(`SELECT ${cols} FROM public.profiles WHERE id = $1`, [id])).rows[0] ?? null;

try {
  await c.query(PRELUDE);
  await a.connect(); a.on('notice', () => {});
  await c.query(lire('supabase/migrations/20260913130000_acquisition_source.sql'));
  await c.query(lire('supabase/migrations/20261025013000_origine_inscription_survit_au_compte.sql'));

  console.log('0. Le décor reproduit la prod (md5 lus le 14/11)');
  const m0 = await md5s();
  ok(m0.rpc7 === PROD.rpc7 && m0.imm === PROD.imm && m0.survit === PROD.survit && m0.vue === PROD.vue && m0.rpc8 === null && m0.nb_rpc === 1 && m0.colonne === false,
    'poser_origine_inscription, profiles_acquisition_immuable, profiles_origine_survit, origines_inscriptions = la prod', JSON.stringify(m0));
  if (rouges) throw new Error('décor ≠ prod : le banc ne prouverait rien');

  console.log('\nA. AVANT');
  await ajouter(U.avant); await ajouter(U.ancien, '2 hours');
  const r0 = await api('authenticated', U.avant, APPEL7, [...meta('c-avant'), AVANT_CPT()]);
  ok(r0.ok && r0.rows[0].r === true, 'appel à 7 paramètres : posé', r0.erreur);
  ok((await plateformeVue('c-avant')) === 'web', 'DÉFAUT : un Android venu de la pub (source meta) est compté « web »', await plateformeVue('c-avant'));
  const r0b = await api('authenticated', U.avant, APPEL8, [...meta('c-avant'), AVANT_CPT(), 'android']);
  ok(!r0b.ok && /does not exist/.test(r0b.erreur), 'appel à 8 paramètres : la fonction n’existe pas (PostgREST : PGRST202 → l’app rejoue à 7)', r0b.erreur);
  await api('authenticated', U.ancien, APPEL7, ['app_ios', 'store', null, 'c-ancien', null, null, new Date(Date.now() - 3 * 3600e3).toISOString()]);
  const xminAvant = (await c.query(`SELECT id, xmin::text FROM public.profiles ORDER BY id`)).rows;

  console.log('\nB. La migration, deux fois');
  const p1 = await sql(MIGRATION);
  ok(p1.ok, '1re passe', p1.erreur);
  const m1 = await md5s();
  console.log(`       md5 après migration : rpc8 ${m1.rpc8} · immuable ${m1.imm} · survit ${m1.survit} · vue ${m1.vue}`);
  const p2 = await sql(MIGRATION);
  ok(p2.ok, '2e passe (garde de rejeu)', p2.erreur);
  ok(m1.rpc7 === null && m1.rpc8 && m1.nb_rpc === 1 && m1.colonne === true, 'une seule poser_origine_inscription (8 paramètres) : jamais deux (PGRST203)', JSON.stringify(m1));
  const xminApres = (await c.query(`SELECT id, xmin::text FROM public.profiles ORDER BY id`)).rows;
  ok(JSON.stringify(xminApres) === JSON.stringify(xminAvant), 'aucune ligne existante réécrite (xmin inchangés)');
  ok(Number((await c.query(`SELECT count(*) n FROM public.profiles WHERE acquisition_plateforme IS NOT NULL`)).rows[0].n) === 0, 'aucune plateforme posée d’office');
  ok((await plateformeVue('c-ancien')) === 'ios' && (await plateformeVue('c-avant')) === 'web', 'lignes d’avant : la règle d’avant répond (coalesce)');

  await ajouter(U.web); await ajouter(U.ios); await ajouter(U.android); await ajouter(U.hors);
  const rw = await api('authenticated', U.web, APPEL7, ['meta', 'paid', 'installer-continu', 'c-web', 'IwAR', 'https://l.facebook.com', AVANT_CPT()]);
  ok(rw.ok && rw.rows[0].r === true && (await ligne(U.web, 'acquisition_plateforme')).acquisition_plateforme === null && (await plateformeVue('c-web')) === 'web',
    'appel d’AUJOURD’HUI (web, 7 paramètres nommés) : posé, plateforme NULL, « web » par la règle d’avant', rw.erreur);
  const ri = await api('authenticated', U.ios, APPEL7, ['app_ios', 'store', null, 'c-ios', null, null, AVANT_CPT()]);
  ok(ri.ok && (await plateformeVue('c-ios')) === 'ios', 'appel d’aujourd’hui (iPhone) : « ios »');
  const ra = await api('authenticated', U.android, APPEL8, [...meta('c-android'), AVANT_CPT(), 'android']);
  const la = await ligne(U.android, 'acquisition_source, acquisition_campaign, acquisition_referrer, acquisition_plateforme');
  ok(ra.ok && ra.rows[0].r === true && la.acquisition_source === 'meta' && la.acquisition_campaign === 'installer-continu' && la.acquisition_referrer === 'https://play.google.com'
    && la.acquisition_plateforme === 'android', 'appel de DEMAIN (Android Google Play, 8 paramètres) : meta / installer-continu, plateforme android', JSON.stringify({ ra, la }));
  ok((await plateformeVue('c-android')) === 'android', 'vue : « android » (et plus « web »)', await plateformeVue('c-android'));

  const ra2 = await api('authenticated', U.android, APPEL8, ['autre', 'x', null, null, null, null, AVANT_CPT(), 'ios']);
  ok(ra2.ok && ra2.rows[0].r === false && (await ligne(U.android, 'acquisition_source, acquisition_plateforme')).acquisition_plateforme === 'android', 'deuxième pose refusée : la première source gagne');
  await c.query(`UPDATE public.profiles SET acquisition_plateforme = 'ios', acquisition_source = 'x', prenom = 'Banc' WHERE id = $1`, [U.android]);
  const lv = await ligne(U.android, 'acquisition_source, acquisition_plateforme, prenom');
  ok(lv.acquisition_source === 'meta' && lv.acquisition_plateforme === 'android' && lv.prenom === 'Banc', 'verrou d’immuabilité : la plateforme tient, le reste de la ligne passe', JSON.stringify(lv));
  const rh = await api('authenticated', U.hors, APPEL8, ['meta', 'paid', null, null, null, null, AVANT_CPT(), 'tablette']);
  ok(rh.ok && rh.rows[0].r === true && (await ligne(U.hors, 'acquisition_plateforme')).acquisition_plateforme === null, 'valeur hors liste → NULL, sans erreur');
  const ran = await api('anon', null, APPEL8, [...meta('c-anon'), AVANT_CPT(), 'android']);
  ok(!ran.ok && /permission denied/.test(ran.erreur), 'anon : refusé', ran.erreur);
  const acl = (await c.query(`SELECT array_agg(r.rolname::text ORDER BY r.rolname) AS roles FROM pg_proc p, aclexplode(p.proacl) x JOIN pg_roles r ON r.oid = x.grantee
    WHERE p.proname = 'poser_origine_inscription'`)).rows[0].roles;
  ok(JSON.stringify(acl) === JSON.stringify(['authenticated', 'postgres', 'service_role']), 'droits : authenticated, service_role (et le propriétaire), jamais anon ni PUBLIC', JSON.stringify(acl));
  const vueAcl = (await c.query(`SELECT array_agg(grantee || ':' || privilege_type ORDER BY grantee) AS d FROM information_schema.role_table_grants
    WHERE table_name = 'origines_inscriptions' AND grantee <> 'postgres'`)).rows[0].d;
  ok(JSON.stringify(vueAcl) === JSON.stringify(['service_role:SELECT']), 'vue : service_role en lecture seule', JSON.stringify(vueAcl));

  await c.query(`DELETE FROM public.profiles WHERE id = $1`, [U.android]);
  await c.query(`DELETE FROM public.profiles WHERE id = $1`, [U.ancien]);
  const arch = (await c.query(`SELECT source, plateforme_inscription FROM public.origines_comptes_supprimes ORDER BY id`)).rows;
  ok(JSON.stringify(arch) === JSON.stringify([{ source: 'meta', plateforme_inscription: 'android' }, { source: 'app_ios', plateforme_inscription: 'ios' }]),
    'archive à la suppression : android (colonne), ios (règle d’avant)', JSON.stringify(arch));

  console.log('\nC. Une base que la garde ne reconnaît pas');
  const avantGarde = await md5s();
  await c.query(`CREATE OR REPLACE FUNCTION public.profiles_acquisition_immuable() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END; $f$`);
  const pg1 = await sql(MIGRATION);
  const apresGarde = await md5s();
  ok(!pg1.ok && /ON S'ARRÊTE/.test(pg1.erreur) && apresGarde.survit === avantGarde.survit && apresGarde.vue === avantGarde.vue && apresGarde.rpc8 === avantGarde.rpc8
    && apresGarde.imm !== m1.imm, 'fonction changée depuis la lecture → la migration s’arrête, rien n’est changé', pg1.erreur);
  // Remise de la définition de la migration (le banc continue sur l'état « migré »).
  const corpsImm = /CREATE OR REPLACE FUNCTION public\.profiles_acquisition_immuable\(\)[\s\S]*?\$function\$;/.exec(MIGRATION)[0];
  await c.query(corpsImm);
  ok((await md5s()).imm === m1.imm, 'définition migrée remise');

  console.log('\nD. L’INVERSE, puis la migration rejouée');
  await ajouter(U.apres);
  await api('authenticated', U.apres, APPEL8, [...meta('c-apres'), AVANT_CPT(), 'android']);
  const inv = await sql(INVERSE);
  ok(inv.ok, 'inverse joué', inv.erreur);
  const m2 = await md5s();
  ok(m2.rpc7 === PROD.rpc7 && m2.imm === PROD.imm && m2.survit === PROD.survit && m2.vue === PROD.vue && m2.rpc8 === null && m2.nb_rpc === 1 && m2.colonne === false,
    'inverse : md5 de la prod, une seule fonction (7 paramètres), colonne partie', JSON.stringify(m2));
  const sauv = (await c.query(`SELECT id::text, acquisition_plateforme FROM public._sauvegarde_acquisition_plateforme_20261114 ORDER BY id`)).rows;
  ok(sauv.some((x) => x.id === U.apres && x.acquisition_plateforme === 'android'), 'les plateformes posées sont gardées dans la sauvegarde', JSON.stringify(sauv));
  await ajouter('00000000-0000-4000-8000-0000000000a8');
  const r7 = await api('authenticated', '00000000-0000-4000-8000-0000000000a8', APPEL7, ['meta', 'paid', null, null, null, null, AVANT_CPT()]);
  ok(r7.ok && r7.rows[0].r === true, 'après l’inverse, l’appel à 7 paramètres repasse', r7.erreur);
  const p3 = await sql(MIGRATION);
  const m3 = await md5s();
  ok(p3.ok && m3.rpc8 === m1.rpc8 && m3.imm === m1.imm && m3.survit === m1.survit && m3.vue === m1.vue, 'la migration se rejoue (mêmes md5)', p3.erreur);
  ok(MIGRATION.includes(m1.rpc8) && MIGRATION.includes(m1.imm) && MIGRATION.includes(m1.survit) && MIGRATION.includes(m1.vue),
    'la garde de rejeu de la migration porte les md5 obtenus ici');
} catch (e) {
  ok(false, 'banc', e?.stack ?? e);
} finally {
  await a.end().catch(() => {}); await c.end().catch(() => {});
  if (embarque) { await embarque.pg.stop().catch(() => {}); try { rmSync(embarque.dossier, { recursive: true, force: true }); } catch { /* temp */ } }
}
console.log(`\n${rouges === 0 ? '✓' : '✗'} banc 20261114100000 : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges === 0 ? 0 : 1);
