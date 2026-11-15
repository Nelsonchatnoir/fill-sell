// PREUVE SUR UNE BASE JETABLE (15/11/2026, complément du lot (2) de Nico, point 4) — « une vente n'est jamais effacée
// sans que la personne l'ait choisi » : la migration 20261115140000 et la restauration des six comptes.
//
//   node scripts/cloud/pg-jetable.mjs scripts/ventes/preuve-ventes-jamais-effacees.mjs   (npm run selftest:ventes-jamais-effacees-pg)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Ce qui est prouvé :
//   A. AVANT (corps de prod du 15/11) : « Réinitialiser mon inventaire » efface TOUTES les ventes (la cause) ;
//   B. APRÈS : sans case cochée (et pour une app d'avant, appel sans argument), les ventes RESTENT, détachées de leurs
//      fiches ; le stock est vidé ; le geste est noté (usage_logs « reinitialisation_inventaire ») ;
//   C. case cochée (p_avec_ventes) : les ventes partent, chacune journalisée avec sa ligne ENTIÈRE et son motif, et la
//      pierre tombale (ventes_supprimees) porte son motif et le code qui l'a faite ;
//   D. une suppression d'une vente par l'app (par id, par fiche) et par une fonction du serveur : journalisées, motif dit ;
//   E. la RESTAURATION (scripts/reparations/20261115_ventes_reinitialisation_restaurees.sql) jouée TELLE QUELLE sur six
//      comptes fabriqués aux mêmes instants et aux mêmes nombres : 4 643 ventes rendues avec leur id d'origine, 42 doutes
//      gardés de côté, AUCUN déclencheur (aucune ligne push_ventes, rien ailleurs), déclencheurs réactivés, pierres
//      tombales marquées et jamais supprimées ; rejouée : refusée ; nombres différents : refusée sans rien écrire ;
//   F. l'INVERSE de la migration rend les corps de prod.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('supabase/migrations/20261115140000_ventes_jamais_effacees_sans_le_vouloir.sql');
const INVERSE = lire('supabase/rollbacks/20261115140000_ventes_jamais_effacees_sans_le_vouloir_INVERSE.sql');
const RESTAURATION = lire('scripts/reparations/20261115_ventes_reinitialisation_restaurees.sql');

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
const q = (s, p) => db.query(s, p);
const un = async (s, p) => (await q(s, p)).rows[0];

// ── Le socle : ce que la prod a de ces tables et fonctions (colonnes utiles, déclencheurs, droits) ────────────────────
await q(`
create extension if not exists pgcrypto;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
grant usage on schema public, auth to authenticated;
create table public.inventaire (id bigint primary key, user_id uuid, statut text);
create table public.ventes (id bigint primary key, created_at timestamptz not null default now(), titre text, prix_achat numeric, prix_vente numeric,
  benefice numeric, date date, user_id uuid references auth.users(id), marque text, type text, description text, emplacement text, plateforme text,
  quantite integer, inventaire_id bigint references public.inventaire(id), statut text, selling_fees numeric, plateforme_code text,
  plateforme_origine text, vendu_le timestamptz, commande_ref text, source text, releve_le timestamptz, devise text, frais_plateforme numeric, annonce_id text);
create table public.cross_post_jobs (id uuid primary key default gen_random_uuid(), user_id uuid, inventaire_id bigint references public.inventaire(id) on delete set null,
  action text, status text, error text, platform_fields jsonb);
create table public.ventes_supprimees (id bigserial primary key, user_id uuid, plateforme_code text, commande_ref text, annonce_id text, titre text,
  prix_vente numeric, vendu_le timestamptz, vente_id bigint, supprimee_le timestamptz default now(), source text, motif text);
create table public.usage_logs (id uuid primary key default gen_random_uuid(), user_id uuid, feature text, metadata jsonb, created_at timestamptz default now());
create table public.push_ventes (id bigserial primary key, user_id uuid, vente_id bigint, origine text);
create table public.email_logs (id bigserial primary key, user_id uuid, email_type text);
create table public.garde_annonce (vente_id bigint);
create table public._backup_0210_ventes_rattrapage as select * from public.ventes with no data;
alter table public._backup_0210_ventes_rattrapage add column sauvegarde_le timestamptz;
grant select, insert, update, delete on public.ventes, public.inventaire, public.cross_post_jobs, public.usage_logs to authenticated;
create or replace function public.plateforme_normalisee(p text) returns text language sql immutable as $$ select lower(p) $$;
-- Les déclencheurs de prod (push et garde : des témoins qui écrivent une ligne chacun).
create or replace function public.push_trg_ventes() returns trigger language plpgsql security definer as $$
begin insert into public.push_ventes (user_id, vente_id, origine) values (new.user_id, new.id, tg_argv[0]); return new; end $$;
create or replace function public.ventes_garde_annonce_de_la_vente() returns trigger language plpgsql security definer as $$
begin insert into public.garde_annonce values (new.id); return new; end $$;
create trigger ventes_garde_annonce_de_la_vente after insert on public.ventes for each row execute function ventes_garde_annonce_de_la_vente();
create trigger ventes_push_personne after insert on public.ventes for each row when ((new.source is distinct from 'releve') and (current_user = 'authenticated')) execute function push_trg_ventes('personne');
create trigger ventes_push_releve after insert on public.ventes for each row when ((new.source = 'releve')) execute function push_trg_ventes('releve');
create trigger ventes_push_serveur after insert on public.ventes for each row when ((new.source is distinct from 'releve') and (current_user <> 'authenticated')) execute function push_trg_ventes('serveur');
`);
// Les corps de prod d'AVANT (relus le 15/11) : la trace et la réinitialisation — ceux que l'INVERSE rend.
const inverseSansJournal = INVERSE.replace(/DROP TRIGGER IF EXISTS ventes_suppression_journal[^;]*;\s*DROP FUNCTION IF EXISTS public\.ventes_suppression_journal\(\);/, '')
  .replace(/DROP FUNCTION IF EXISTS public\.ventes_motif_suppression\(\);/, '').replace(/DROP FUNCTION IF EXISTS public\.supprimer_mon_stock_sans_retrait\(boolean\);/, '');
await q(inverseSansJournal);
await q(`create trigger ventes_suppression_trace after delete on public.ventes for each row when ((current_user = 'authenticated')) execute function ventes_suppression_trace();`);

const U = (p) => `${p}-0000-4000-8000-000000000000`.replace(/^(.{8})/, '$1');
const comme = async (user, fn) => { await q('begin'); await q("select set_config('request.jwt.claim.sub', $1, true)", [user]); await q('set local role authenticated'); try { const r = await fn(); await q('commit'); return r; } catch (e) { await q('rollback'); throw e; } };
const T = '11111111-0000-4000-8000-000000000001';
await q(`insert into auth.users values ($1, 't@ex.fr')`, [T]);
const remplir = async (user, base) => {
  await q(`insert into public.inventaire select g, $1, 'vendu' from generate_series($2::bigint, $2::bigint + 2) g`, [user, base]);
  await q(`insert into public.ventes (id, titre, prix_vente, prix_achat, frais_plateforme, marque, user_id, inventaire_id, plateforme, plateforme_code, commande_ref, vendu_le, source, statut)
           select g + 100, 'Article ' || g, 20, 5, 1.2, 'Nike', $1, g, 'vinted', 'vinted', 'CMD' || g, now() - interval '30 days', 'releve', 'vendu'
           from generate_series($2::bigint, $2::bigint + 2) g`, [user, base]);
  await q(`insert into public.cross_post_jobs (user_id, inventaire_id, action, status, platform_fields) select $1, g, 'publish', 'published', '{}' from generate_series($2::bigint, $2::bigint + 2) g`, [user, base]);
};

console.log('A. Avant (corps de prod) : « Réinitialiser mon inventaire » efface TOUTES les ventes');
await remplir(T, 1000);
await comme(T, () => q('select public.supprimer_mon_stock_sans_retrait()'));
ok((await un('select count(*)::int n from public.ventes where user_id = $1', [T])).n === 0, 'avant : 3 ventes → 0 (la cause)');
ok((await un('select count(*)::int n from public.usage_logs where user_id = $1', [T])).n === 0, 'avant : aucun geste tracé');
ok((await un('select count(*)::int n from public.ventes_supprimees where user_id = $1 and source is null and motif is null', [T])).n === 3, 'avant : 3 pierres tombales SANS motif');

console.log('B. Après la migration : sans case cochée, les ventes RESTENT');
await q(MIGRATION);
await remplir(T, 2000);
const r1 = await comme(T, () => un('select public.supprimer_mon_stock_sans_retrait() r'));
ok((await un('select count(*)::int n from public.ventes where user_id = $1', [T])).n === 3, 'appel sans argument (app d\'avant) : les 3 ventes restent');
ok((await un('select count(*)::int n from public.ventes where user_id = $1 and inventaire_id is null', [T])).n === 3, '…détachées de leurs fiches (FK NO ACTION respectée)');
ok((await un('select count(*)::int n from public.inventaire where user_id = $1', [T])).n === 0, 'le stock est vidé');
ok(r1.r.ventes_gardees_detachees === 3 && r1.r.ventes_effacees === 0 && r1.r.articles === 3, `réponse : ${JSON.stringify(r1.r)}`);
const g1 = await un("select metadata from public.usage_logs where user_id = $1 and feature = 'reinitialisation_inventaire' order by created_at desc limit 1", [T]);
ok(g1?.metadata?.avec_ventes === false && g1.metadata.ventes_gardees_detachees === 3, 'le geste est noté (usage_logs reinitialisation_inventaire)');
ok((await un("select count(*)::int n from public.cross_post_jobs where user_id = $1 and platform_fields ? 'reinitialisation' and status = 'cancelled'", [T])).n === 6, 'les tâches des fiches closes, comme avant');

console.log('C. Case cochée : les ventes partent, chacune journalisée et motivée');
await q('delete from public.ventes where user_id = $1', [T]);
await remplir(T, 3000);
await comme(T, () => q('select public.supprimer_mon_stock_sans_retrait(p_avec_ventes := true)'));
ok((await un('select count(*)::int n from public.ventes where user_id = $1', [T])).n === 0, 'p_avec_ventes : les ventes partent');
const j = await un("select count(*)::int n, min(motif) m, min((ligne->>'prix_achat')::numeric) pa, min(ligne->>'marque') mq, min(role) ro from public.ventes_suppressions_journal where user_id = $1 and vente_id between 3100 and 3102", [T]);
ok(j.n === 3 && j.m === 'reinitialisation_inventaire_avec_ventes' && Number(j.pa) === 5 && j.mq === 'Nike' && j.ro === 'authenticated', `journal : ligne ENTIÈRE (prix d'achat, marque), motif, rôle — ${JSON.stringify(j)}`);
const t1 = await un("select count(*)::int n, min(source) s, min(motif) m from public.ventes_supprimees where user_id = $1 and vente_id between 3100 and 3102", [T]);
ok(t1.n === 3 && t1.s === 'reinitialisation_inventaire_avec_ventes' && /supprimer_mon_stock_sans_retrait/.test(t1.m), `pierre tombale : motif et code — ${t1.s}`);

console.log('D. Les autres chemins : motif dit, ligne gardée');
await remplir(T, 4000);
await comme(T, () => q('delete from "public"."ventes" where "public"."ventes"."id" = $1', [4100]));
await comme(T, () => q('delete from "public"."ventes" where "public"."ventes"."inventaire_id" = $1 and "public"."ventes"."user_id" = $2', [4001, T]));
await q('select set_config($1, $2, false)', ['fillsell.motif_suppression_ventes', '']);
await q("create or replace function public.vente_commande_annulee(p bigint) returns void language plpgsql security definer as $$ begin delete from ventes where id = p; end $$");
await q('select public.vente_commande_annulee(4102)');
const m = (await q('select vente_id, motif, role from public.ventes_suppressions_journal where vente_id in (4100, 4101, 4102) order by vente_id')).rows;
ok(m[0]?.motif === 'suppression_vente', `suppression d'une vente par l'app : ${m[0]?.motif}`);
ok(m[1]?.motif === 'suppression_article_et_vente', `article et sa vente : ${m[1]?.motif}`);
ok(m[2]?.motif === 'fonction:vente_commande_annulee' && m[2]?.role !== 'authenticated', `fonction du serveur : ${m[2]?.motif} (${m[2]?.role})`);
ok((await un('select count(*)::int n from public.ventes_supprimees where vente_id = 4102')).n === 0, 'une suppression du serveur ne pose JAMAIS de pierre tombale (le relevé n\'est pas changé)');

console.log('E. La restauration des six comptes, jouée telle quelle');
const comptes = { '43dfb277': [['2026-10-25 11:07:54.957+00', 1569], ['2026-10-28 13:49:05.551+00', 18]], '9148e867': [['2026-10-25 12:14:07.123+00', 409]],
  '0a24c951': [['2026-10-26 06:33:09.923+00', 175]], 'cfdfda6f': [['2026-11-08 10:00:38.924+00', 746]], 'ae27133d': [['2026-11-08 17:12:45.176+00', 17]],
  '2c89e573': [['2026-11-13 18:14:53.225+00', 1732], ['2026-11-14 18:31:51.048+00', 7], ['2026-11-14 21:33:40.285+00', 12]] };
const doutes = { '2c89e573': 40, 'cfdfda6f': 2 };
let id = 900000;
for (const [p, lots] of Object.entries(comptes)) {
  const u = `${p}-1111-4111-8111-111111111111`;
  await q('insert into auth.users values ($1, $2)', [u, `${p}@ex.fr`]);
  let k = 0;
  for (const [t, nb] of lots) {
    await q(`insert into public.ventes_supprimees (user_id, plateforme_code, commande_ref, titre, prix_vente, vendu_le, vente_id, supprimee_le)
             select $1, 'vinted', $2 || '-' || g, 'Titre ' || $2 || ' ' || g, 10, now() - interval '100 days', $3::bigint + g, $4::timestamptz
             from generate_series($5::int, $5::int + $6::int - 1) g`, [u, p, id, t, k, nb]);
    k += nb;
  }
  // Les ventes d'aujourd'hui : même titre qu'une vente effacée (le doute), une seule fois chacune.
  if (doutes[p]) {
    await q(`insert into public.ventes (id, titre, user_id, plateforme, statut) select $1::bigint + 500000 + g, 'Titre ' || $2 || ' ' || g, $3, 'vinted', 'vendu' from generate_series(0, $4::int - 1) g`, [id, p, u, doutes[p]]);
  }
  id += 10000;
}
// Sandra : sa sauvegarde du 02/10 (prix d'achat, marque).
await q(`insert into public._backup_0210_ventes_rattrapage (id, titre, prix_achat, prix_vente, user_id, marque, plateforme, source, sauvegarde_le)
         select s.vente_id, s.titre, 7, 10, s.user_id, 'Zara', 'vinted', 'releve', '2026-10-02' from public.ventes_supprimees s where s.user_id::text like '9148e867%'`);
const pushAvant = (await un('select count(*)::int n from public.push_ventes')).n;
const gardeAvant = (await un('select count(*)::int n from public.garde_annonce')).n;
await q(RESTAURATION);
const bilan = (await q("select left(user_id::text,8) u, count(*)::int n from public.ventes where id between 900000 and 999999 group by 1 order by 1")).rows;
const total = bilan.reduce((s, x) => s + x.n, 0);
ok(total === 4643, `4 643 ventes rendues, par compte : ${bilan.map((x) => `${x.u} ${x.n}`).join(', ')}`);
ok((await un('select count(*)::int n from public.push_ventes')).n === pushAvant && (await un('select count(*)::int n from public.garde_annonce')).n === gardeAvant,
  'AUCUN déclencheur pendant la restauration (aucune ligne push_ventes, aucune garde d\'annonce)');
ok((await un("select count(*)::int n from pg_trigger where tgrelid = 'public.ventes'::regclass and not tgisinternal and tgenabled <> 'O'")).n === 0, 'tous les déclencheurs réactivés');
ok((await un("select count(*)::int n from public._backup_1511_ventes_reinitialisation where decision = 'doute_titre'")).n === 42, '42 doutes (même titre qu\'une vente présente) gardés de côté, jamais remis');
ok((await un("select count(*)::int n from public.ventes_supprimees where motif like 'restauree 15/11%' and source = 'reinitialisation_inventaire'")).n === 4643, 'pierres tombales marquées (4 643), aucune supprimée');
ok((await un("select count(*)::int n from public.ventes_supprimees where user_id::text in (select id::text from auth.users where email like '%@ex.fr' and email <> 't@ex.fr')")).n === 4685, 'les 4 685 pierres tombales sont toutes là');
const sandra = await un("select count(*)::int n, min(prix_achat) pa, min(marque) mq from public.ventes where user_id::text like '9148e867%'");
ok(sandra.n === 409 && Number(sandra.pa) === 7 && sandra.mq === 'Zara', `Sandra : prix d'achat et marque repris de sa sauvegarde du 02/10 (${JSON.stringify(sandra)})`);
const lud = await un("select count(*)::int n, count(prix_achat)::int pa, min(statut) st, min(source) so, min(devise) dv from public.ventes where user_id::text like '2c89e573%' and id < 1400000");
ok(lud.n === 1711 && lud.pa === 0 && lud.st === 'vendu' && lud.so === 'releve' && lud.dv === 'EUR', `Ludovic : 1 711 rendues, prix d'achat INCONNU (jamais 0), statut vendu, source relevé (${JSON.stringify(lud)})`);
let refus = null;
try { await q(RESTAURATION); } catch (e) { refus = e.message; await q('rollback').catch(() => {}); }
ok(/déjà passé/.test(String(refus)), 'rejouée : refusée (sauvegarde présente)');

console.log('F. L\'inverse de la migration');
await q(INVERSE);
ok((await un("select count(*)::int n from pg_proc where proname = 'supprimer_mon_stock_sans_retrait' and pronargs = 0")).n === 1
  && (await un("select count(*)::int n from pg_trigger where tgname = 'ventes_suppression_journal'")).n === 0, 'inverse : la fonction d\'avant rendue, le journal débranché (ses lignes gardées)');
ok((await un('select count(*)::int n from public.ventes_suppressions_journal')).n > 0, 'inverse : le journal (preuves) est gardé');

await db.end();
console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
