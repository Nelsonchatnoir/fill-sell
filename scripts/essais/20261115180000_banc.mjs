// LE BANC de la migration 20261115180000_republication_prix_de_la_fiche (15/11/2026, point 5 de Nico — nino57270,
// 7153db13) — SUR UN POSTGRES JETABLE (embedded-postgres via scripts/cloud/pg-jetable.mjs), jamais la prod.
//   node scripts/cloud/pg-jetable.mjs scripts/essais/20261115180000_banc.mjs   (npm run selftest:prix-republication-pg)
// Décor : inventaire, cross_post_jobs, annonces_plateforme, vinted_listing_snapshots, coin_wallets réduits aux colonnes
// lues. Ce qui est prouvé :
//   A. la migration s'applique (spend_coins_and_republish compilé, 6 arguments ; l'ancienne à 5 n'existe plus) et se
//      rejoue ; l'inverse rend la fonction à 5 arguments et retire la règle ;
//   B. LE CAS RÉEL : fiche 225 → 200 € changée dans l'app à 13:22:04, annonce Leboncoin mise en ligne avant → 200 € ;
//   C. la fiche changée AVANT la mise en ligne, ou changée par un relevé / le serveur → le prix de l'annonce (inchangé) ;
//   D. −10 % sur le prix de la fiche changée ; −10 % sur le prix RELEVÉ de l'annonce (14 j), sinon sur celui de la tâche ;
//      plancher 2 € ; un prix choisi gagne ;
//   E. Vinted : la fiche changée après la dernière mise en ligne → son prix ; sinon rien (l'annonce capturée garde le
//      sien) ; −15 % sur le prix relevé de l'annonce ; sans prix connu → rien (jamais 0) ;
//   F. la règle est LA MÊME pour toutes les voies : spend_coins_and_republish l'appelle dans ses deux branches, avec le
//      prix choisi et la baisse ; les republications automatiques et planifiées passent par elle (aucun prix à elles).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)/.test(PG_URL)) { console.error('base jetable seulement (PREUVE_PG)'); process.exit(2); }
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('supabase/migrations/20261115180000_republication_prix_de_la_fiche.sql');
const INVERSE = lire('supabase/rollbacks/20261115180000_republication_prix_de_la_fiche_INVERSE.sql');
const MIGRATION2 = lire('supabase/migrations/20261115190000_prix_republication_moment_du_prix.sql');
const INVERSE2 = lire('supabase/rollbacks/20261115190000_prix_republication_moment_du_prix_INVERSE.sql');

let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? '' : `\n      ← ${JSON.stringify(d).slice(0, 600)}`}`); } };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
db.on('notice', () => {});
const q = (s, p) => db.query(s, p);
await q("set statement_timeout = '60s'");
await q("set log_min_error_statement = 'panic'");
await q(`
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;
create table public.inventaire (id bigint primary key, user_id uuid, prix_vente numeric, prix_vente_change_le timestamptz, prix_vente_change_par text, vinted_item_id text);
create table public.cross_post_jobs (id uuid primary key default gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text, action text, status text,
  published_at timestamptz, created_at timestamptz default now(), price numeric, title text, description text, photos jsonb, photo_option text,
  listing_url text, platform_listing_id text, platform_fields jsonb);
create table public.annonces_plateforme (user_id uuid, platform text, listing_id text, prix numeric, vu_le timestamptz);
create table public.vinted_listing_snapshots (user_id uuid, vinted_item_id text, price numeric, captured_at timestamptz);
create table public.coin_wallets (user_id uuid primary key, included_balance integer, purchased_balance integer);
`);

console.log('A. La migration s\'applique, se rejoue ; l\'inverse rend l\'ancienne');
// L'ancienne signature (5 arguments) existe d'abord, comme en prod (un corps neutre : la garde md5 ne la reconnaît pas,
// d'où un corps de prod... on pose donc le corps de l'INVERSE, qui EST le corps de prod).
await q(INVERSE.replace(/DROP FUNCTION IF EXISTS public\.prix_de_republication[^;]*;/, ''));
let e = null;
try { await q(MIGRATION); await q(MIGRATION2); } catch (x) { e = x.message; }
ok(e === null, `appliquée sur le corps de prod ${e ?? ''}`);
const sig = (await q("select pronargs from pg_proc where proname = 'spend_coins_and_republish' order by 1")).rows.map((r) => r.pronargs);
ok(JSON.stringify(sig) === '[6]', `spend_coins_and_republish : une seule, à 6 arguments (${sig})`);
e = null; try { await q(MIGRATION); await q(MIGRATION2); } catch (x) { e = x.message; }
ok(e === null, `rejouée sans erreur ${e ?? ''}`);
const acl = (await q("select proacl::text a, prosecdef s from pg_proc where proname = 'spend_coins_and_republish'")).rows[0];
ok(acl.s === true && /authenticated=X/.test(acl.a) && !/anon=X/.test(acl.a), 'toujours SECURITY DEFINER, exécutable par authenticated, pas par anon', acl);
const acl2 = (await q("select proacl::text a from pg_proc where proname = 'prix_de_republication'")).rows[0];
ok(!/authenticated=X|anon=X/.test(acl2.a ?? '') , 'prix_de_republication : fermée aux clients', acl2);

const U = '7153db13-0000-4000-8000-000000000001';
const T = (iso) => new Date(iso).toISOString();
const decide = async (args) => (await q('select public.prix_de_republication($1, $2, $3, $4, $5, $6, $7) d', args)).rows[0].d;
const fiche = async (id, prix, le, par, vinted = null) => q('insert into public.inventaire values ($1, $2, $3, $4, $5, $6)', [id, U, prix, le, par, vinted]);
const tache = async (inv, pf, prix, publie, recree = null, lid = null, extra = {}) => (await q(
  `insert into public.cross_post_jobs (user_id, inventaire_id, platform, action, status, published_at, price, platform_listing_id, platform_fields)
   values ($1, $2, $3, $4, 'published', $5, $6, $7, $8) returning id`,
  [U, inv, pf, recree ? 'republish' : 'publish', publie, prix, lid, { ...(recree ? { recreated_at: recree } : {}), ...extra }])).rows[0].id;

console.log('B. Le cas réel : Calandre Audi A7 (Leboncoin), fiche 225 → 200 € à 13:22:04, republiée à 13:22:50');
// L'historique réel : dépôt 18/10 à 250 €, republication AVEC prix (225 €) le 24/10, republications SANS prix le 13/11 et
// le 15/11 à 13:31 — celle-ci APRÈS la fiche changée (13:22:04) : elle a recopié 225 €, elle n'a pas fixé le prix.
await fiche(1, 200, T('2026-11-15T12:22:04.143Z'), 'app');
await tache(1, 'leboncoin', 250, T('2026-10-18T12:17:02Z'), null, '3001');
await tache(1, 'leboncoin', 225, T('2026-10-24T10:13:19Z'), '2026-10-24T10:13:19.447Z', '3001', { prix_republication: 225 });
await tache(1, 'leboncoin', 225, T('2026-11-13T16:05:22Z'), '2026-11-13T16:05:22.895Z', '3001');
const s1 = await tache(1, 'leboncoin', 225, T('2026-11-15T12:31:12Z'), '2026-11-15T12:31:13.787Z', '3001');
const d1 = await decide([1, 'leboncoin', s1, '3001', null, null, null]);
ok(Number(d1.prix) === 200 && d1.raison === 'prix_de_la_fiche' && d1.base_de === 'fiche', 'prochaine republication → 200 € (la fiche), jamais 225 € — même après la republication de 13:31 qui avait recopié 225 €', d1);
await fiche(9, 300, T('2026-11-10T10:00:00Z'), 'app');
await tache(9, 'leboncoin', 320, T('2026-11-01T10:00:00Z'), null, '3009');
const s9 = await tache(9, 'leboncoin', 280, T('2026-11-12T10:00:00Z'), '2026-11-12T10:00:00Z', '3009', { prix_republication: 280 });
const d9b = await decide([9, 'leboncoin', s9, '3009', null, null, null]);
ok(d9b.prix === null, "un prix CHOISI à une republication après la fiche (280 €) reste celui de l'annonce", d9b);

console.log('C. La fiche pas changée par la personne depuis la mise en ligne → le prix de l\'annonce');
await fiche(2, 180, T('2026-11-01T10:00:00Z'), 'app');
const s2 = await tache(2, 'leboncoin', 150, T('2026-11-10T10:00:00Z'), null, '3002');
const d2 = await decide([2, 'leboncoin', s2, '3002', null, null, null]);
ok(d2.prix === null && d2.raison === 'prix_de_l_annonce', 'fiche changée AVANT la mise en ligne → rien (l\'annonce garde 150 €)', d2);
await fiche(3, 143.56, T('2026-11-14T10:00:00Z'), 'plateforme:ebay');
const s3 = await tache(3, 'leboncoin', 129, T('2026-11-10T10:00:00Z'), null, '3003');
const d3 = await decide([3, 'leboncoin', s3, '3003', null, null, null]);
ok(d3.prix === null, 'fiche changée par un relevé eBay (pas la personne) → rien (l\'annonce Leboncoin garde 129 €)', d3);
await fiche(4, 399, T('2026-11-14T10:00:00Z'), 'serveur');
const s4 = await tache(4, 'leboncoin', 359, T('2026-11-10T10:00:00Z'), null, '3004');
ok((await decide([4, 'leboncoin', s4, '3004', null, null, null])).prix === null, 'fiche changée par le serveur → rien');

console.log('D. Les baisses s\'appliquent sur CE prix-là ; un prix choisi gagne ; jamais 0');
const d5 = await decide([1, 'leboncoin', s1, '3001', null, null, 10]);
ok(Number(d5.prix) === 180 && d5.base_de === 'fiche', '−10 % sur la fiche changée : 200 → 180 €', d5);
await q("insert into public.annonces_plateforme values ($1, 'leboncoin', '3003', 125, now() - interval '2 days')", [U]);
const d6 = await decide([3, 'leboncoin', s3, '3003', null, null, 10]);
ok(Number(d6.prix) === 112 && d6.base_de === 'annonce' && Number(d6.annonce_prix) === 125, '−10 % sur le prix RELEVÉ de l\'annonce (125 → 112 €), pas sur la fiche eBay', d6);
await q("insert into public.annonces_plateforme values ($1, 'leboncoin', '3002', 99, now() - interval '20 days')", [U]);
const d7 = await decide([2, 'leboncoin', s2, '3002', null, null, 15]);
ok(Number(d7.prix) === 127, '−15 % : relevé de plus de 14 jours ignoré → prix de la tâche (150 → 127 €)', d7);
await fiche(5, 2, T('2026-11-15T10:00:00Z'), 'app');
const s5 = await tache(5, 'beebs', 2, T('2026-11-01T10:00:00Z'), null, '3005');
ok(Number((await decide([5, 'beebs', s5, '3005', null, null, 15])).prix) === 2, 'plancher : 2 € −15 % → 2 € (jamais 1, jamais 0)');
const d8 = await decide([1, 'leboncoin', s1, '3001', null, 139, null]);
ok(Number(d8.prix) === 139 && d8.raison === 'prix_choisi', 'un prix choisi (« Autre prix » 139 €) gagne', d8);

console.log('E. Vinted');
await fiche(6, 45, T('2026-11-15T09:00:00Z'), 'app', '777');
await tache(6, 'vinted', 50, T('2026-11-10T10:00:00Z'));
await q("insert into public.vinted_listing_snapshots values ($1, '777', 50, now() - interval '1 day')", [U]);
const d9 = await decide([6, 'vinted', null, null, '777', null, null]);
ok(Number(d9.prix) === 45 && d9.raison === 'prix_de_la_fiche', 'fiche changée après la mise en ligne Vinted → 45 €', d9);
await fiche(7, 60, T('2026-11-01T09:00:00Z'), 'app', '778');
await tache(7, 'vinted', 50, T('2026-11-10T10:00:00Z'));
await q("insert into public.vinted_listing_snapshots values ($1, '778', 48, now() - interval '1 day')", [U]);
const d10 = await decide([7, 'vinted', null, null, '778', null, null]);
ok(d10.prix === null, 'fiche changée avant → rien (l\'annonce capturée garde son prix)', d10);
ok(Number((await decide([7, 'vinted', null, null, '778', null, 15])).prix) === 40, '−15 % sur le prix relevé de l\'annonce Vinted (48 → 40 €)');
await fiche(8, null, null, null, '779');
const d11 = await decide([8, 'vinted', null, null, '779', null, 10]);
ok(d11.prix === null && d11.raison === 'baisse_sans_prix_connu', 'aucun prix connu → rien (jamais un prix à 0)', d11);

console.log('F. Une seule règle pour toutes les voies');
const corps = (await q("select pg_get_functiondef(p.oid) d from pg_proc p where proname = 'spend_coins_and_republish'")).rows[0].d;
ok(/v_prix_decision := public\.prix_de_republication\(p_inventaire_id, v_platform,[\s\S]{0,200}p_prix_republication, p_baisse_pct\);/.test(corps)
  && /v_prix := NULLIF\(v_prix_decision ->> 'prix', ''\)::numeric;/.test(corps), 'spend_coins_and_republish décide par la règle (prix choisi, baisse), une fois, avant ses deux branches');
ok((corps.match(/'prix_decision', v_prix_decision/g) ?? []).length === 2 && /'prix_republication', 'prix_decision', 'orphan_alerted_at'/.test(corps),
  'le pourquoi est gardé sur la tâche (Vinted et autres), jamais recopié d\'une republication à l\'autre');
ok(!/v_prix := p_prix_republication;/.test(corps), 'plus jamais « le prix choisi, sinon rien » en direct');

console.log('A bis. L\'inverse');
e = null; try { await q(INVERSE2); await q(INVERSE); } catch (x) { e = x.message; }
const apres = (await q("select (select array_agg(pronargs) from pg_proc where proname = 'spend_coins_and_republish') s, (select count(*)::int from pg_proc where proname = 'prix_de_republication') r")).rows[0];
ok(e === null && JSON.stringify(apres.s) === '[5]' && apres.r === 0, `inverse : l'ancienne fonction (5 arguments), la règle retirée ${e ?? ''}`, apres);

await db.end();
console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
