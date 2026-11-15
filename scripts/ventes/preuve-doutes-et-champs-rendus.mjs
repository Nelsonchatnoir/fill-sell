// PREUVE SUR UNE BASE JETABLE (15/11/2026, décisions (a) et (b) de Nico, point 4 — ventes effacées) : les deux scripts
// de réparation joués TELS QUELS, avec leurs inverses.
//   node scripts/cloud/pg-jetable.mjs scripts/ventes/preuve-doutes-et-champs-rendus.mjs   (npm run selftest:ventes-champs-rendus-pg)
// Jamais la prod (refus si l'URL est celle de Supabase). Ce qui est prouvé :
//   G. 20261115_ventes_doutes_remises.sql : sur 42 doutes fabriqués aux mêmes ids, 14 remis (commande présente, ventes du
//      même titre toutes d'autres annonces), 26 « déjà là » (même numéro d'annonce que la fiche d'une vente présente),
//      2 « sans commande » ; id d'origine, AUCUN déclencheur (aucune ligne push), déclencheurs réactivés, pierres tombales
//      marquées ; rejoué : refusé ;
//   H. 20261115_ventes_champs_rendus.sql : une vente qui ne correspond plus (prix changé) → refus, RIEN d'écrit ; puis
//      2 459 ventes complétées (prix d'achat, marge, frais, marque, lien vers la fiche), rien d'écrasé (une marque et un
//      prix d'achat saisis depuis restent, la marge n'est pas reprise sur un prix d'achat saisi), liens seulement vers la
//      fiche unique « vendu » du même numéro et libre, aucune fiche modifiée, aucun push ; rejoué : refusé ;
//   I. les inverses : champs rendus vidés sauf ceux changés depuis ; doutes retirés, suppression JOURNALISÉE, pierres
//      tombales rendues à leur motif d'avant.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)/.test(PG_URL)) { console.error('base jetable seulement (PREUVE_PG)'); process.exit(2); }
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = lire('supabase/migrations/20261115140000_ventes_jamais_effacees_sans_le_vouloir.sql');
const DOUTES = lire('scripts/reparations/20261115_ventes_doutes_remises.sql');
const DOUTES_INVERSE = lire('scripts/reparations/20261115_ventes_doutes_remises_INVERSE.sql');
const CHAMPS = lire('scripts/reparations/20261115_ventes_champs_rendus.sql');
const CHAMPS_INVERSE = lire('scripts/reparations/20261115_ventes_champs_rendus_INVERSE.sql');

let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
const q = (s, p) => db.query(s, p);
const un = async (s, p) => (await q(s, p)).rows[0];
const refus = async (sql) => { try { await q(sql); return null; } catch (e) { await q('rollback').catch(() => {}); return e.message; } };

// ── Le socle : les tables et déclencheurs de prod utiles (déclencheurs de ventes : INSERT et DELETE seulement, comme en prod)
await q(`
create extension if not exists pgcrypto;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create table public.inventaire (id bigint primary key, user_id uuid, statut text, vinted_item_id text);
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
create or replace function public.plateforme_normalisee(p text) returns text language sql immutable as $$ select lower(p) $$;
create or replace function public.push_trg_ventes() returns trigger language plpgsql security definer as $$
begin insert into public.push_ventes (user_id, vente_id, origine) values (new.user_id, new.id, tg_argv[0]); return new; end $$;
create or replace function public.ventes_garde_annonce_de_la_vente() returns trigger language plpgsql security definer as $$
begin insert into public.garde_annonce values (new.id); return new; end $$;
create trigger ventes_garde_annonce_de_la_vente after insert on public.ventes for each row execute function ventes_garde_annonce_de_la_vente();
create trigger ventes_push_personne after insert on public.ventes for each row when ((new.source is distinct from 'releve') and (current_user = 'authenticated')) execute function push_trg_ventes('personne');
create trigger ventes_push_releve after insert on public.ventes for each row when ((new.source = 'releve')) execute function push_trg_ventes('releve');
create trigger ventes_push_serveur after insert on public.ventes for each row when ((new.source is distinct from 'releve') and (current_user <> 'authenticated')) execute function push_trg_ventes('serveur');
create table public._backup_1511_ventes_reinitialisation (sauve_le timestamptz, supprimee_id bigint, user_id uuid, vente_id bigint, plateforme_code text,
  commande_ref text, annonce_id text, titre text, prix_vente numeric, vendu_le timestamptz, supprimee_le timestamptz, source_avant text, motif_avant text, decision text);
`);
await q("set statement_timeout = '120s'");
// Une erreur journalise le texte ENTIER de la requête (200 Ko ici) dans le journal du serveur jetable, dont le tuyau n'est pas
// vidé : le processus se bloque. Le texte de la requête n'est donc pas journalisé ici (sans effet sur ce qui est prouvé).
await q("set log_min_error_statement = 'panic'");
await q(MIGRATION);
await q(`create trigger ventes_suppression_trace after delete on public.ventes for each row when ((current_user = 'authenticated')) execute function ventes_suppression_trace();`);

// ── Les ventes rendues le 15/11, fabriquées depuis les valeurs MÊMES du script (id, compte, commande, prix) ──────────────
const bloc = CHAMPS.slice(CHAMPS.indexOf('INSERT INTO _champs_lus VALUES'), CHAMPS.indexOf('CREATE TABLE public._backup_1511c_ventes_champs_rendus'));
const lus = bloc.split('\n').filter((l) => l.startsWith('(')).map((l) => {
  const t = l.slice(1, l.lastIndexOf(')')).match(/NULL|'(?:[^']|'')*'|-?[0-9.]+/g).map((x) => (x === 'NULL' ? null : x.startsWith("'") ? x.slice(1, -1).replace(/''/g, "'") : Number(x)));
  const [id, compte, commande, prix, pa, benef, sf, fp, marque, fiche, copie] = t;
  return { id, compte, commande, prix, pa, benef, sf, fp, marque, fiche, copie };
});
const REMISES = (DOUTES.match(/v_attendues constant bigint\[\] := ARRAY\[([\d,\s]+)\]/)[1]).split(',').map((x) => Number(x.trim()));
const user = (c) => `${c}-1111-4111-8111-111111111111`;
for (const c of new Set(lus.map((x) => x.compte))) await q('insert into auth.users values ($1, $2)', [user(c), `${c}@exemple.invalid`]);
const ins = async (table, cols, rows) => {
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const vals = part.map((r, j) => `(${cols.map((_, k) => `$${j * cols.length + k + 1}`).join(',')})`).join(',');
    await q(`insert into ${table} (${cols.join(',')}) values ${vals}`, part.flat());
  }
};
await q('alter table public.ventes disable trigger user');
await ins('public.ventes', ['id', 'user_id', 'titre', 'commande_ref', 'prix_vente', 'statut', 'plateforme', 'plateforme_code', 'source'],
  lus.filter((x) => !REMISES.includes(x.id)).map((x) => [x.id, user(x.compte), `T ${x.id}`, x.commande, x.prix, 'vendu', 'vinted', 'vinted', 'releve']));
await q('alter table public.ventes enable trigger user');
await ins('public._backup_1511_ventes_reinitialisation', ['vente_id', 'user_id', 'plateforme_code', 'commande_ref', 'prix_vente', 'titre', 'decision'],
  lus.filter((x) => !REMISES.includes(x.id)).map((x) => [x.id, user(x.compte), 'vinted', x.commande, x.prix, `T ${x.id}`, 'restauree']));

// ── Les 42 doutes : 14 remis (+ un « déjà là » dans leur groupe), 12 autres « déjà là », 2 sans commande (ayadi007) ──────
const L = user('2c89e573'), A = user('cfdfda6f');
const tombe = async (u, venteId, cmd, ann, titre, prix) => (await un(
  `insert into public.ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vente_id, source, motif)
   values ($1, 'vinted', $2, $3, $4, $5, $6, 'reinitialisation_inventaire', 'avant') returning id`, [u, cmd, ann, titre, prix, venteId])).id;
const doute = async (u, venteId, cmd, ann, titre, prix) => {
  const s = await tombe(u, venteId, cmd, ann, titre, prix);
  await q(`insert into public._backup_1511_ventes_reinitialisation (supprimee_id, user_id, vente_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, decision, source_avant, motif_avant)
           values ($1, $2, $3, 'vinted', $4, $5, $6, $7, now() - interval '400 days', 'doute_titre', 'reinitialisation_inventaire', 'avant')`, [s, u, venteId, cmd, ann, titre, prix]);
};
const presente = async (u, k, titre) => {  // la vente ressaisie le 15/11 : sans commande, reliée à la fiche du numéro N<k>
  await q(`insert into public.inventaire values ($1, $2, 'vendu', $3)`, [600000 + k, u, `N${k}`]);
  await q(`insert into public.ventes (id, user_id, titre, statut, plateforme, plateforme_code, inventaire_id, source) values ($1, $2, $3, 'vendu', 'vinted', 'vinted', $4, null)`,
    [800000 + k, u, titre, 600000 + k]);
};
for (let k = 0; k < 26; k++) {
  const titre = `Lego ${k}`;
  await presente(L, k, titre);
  await doute(L, 700000 + k, `DL${k}`, `N${k}`, titre, 20);                 // « déjà là » : même numéro d'annonce
  if (k < 14) {
    const r = lus.find((x) => x.id === REMISES[k]);
    await doute(L, r.id, r.commande, null, titre, r.prix);                   // remis : commande présente, autre vente
  }
}
for (let k = 0; k < 2; k++) {
  await q(`insert into public.ventes (id, user_id, titre, statut, plateforme, plateforme_code) values ($1, $2, $3, 'vendu', 'leboncoin', 'vinted')`, [810000 + k, A, `Boitier ${k}`]);
  await doute(A, 710000 + k, null, `33${k}`, `Boitier ${k}`, 48);            // sans numéro de commande
}
// Les fiches des numéros lus : la plupart « vendu » et libres ; une absente, une encore en vente, une déjà à une autre vente.
const avecFiche = lus.filter((x) => x.fiche);
let f = 900000;
for (const [i, x] of avecFiche.entries()) {
  if (i === 0) continue;                                                      // fiche_absente
  await q(`insert into public.inventaire values ($1, $2, $3, $4)`, [++f, user(x.compte), i === 1 ? 'en_vente' : 'vendu', x.fiche]);
  if (i === 2) await q(`insert into public.ventes (id, user_id, titre, statut, inventaire_id) values (850000, $1, 'autre', 'vendu', $2)`, [user(x.compte), f]);
}

console.log('G. Les doutes, tranchés par les numéros (20261115_ventes_doutes_remises.sql, tel quel)');
const push0 = (await un('select count(*)::int n from public.push_ventes')).n;
const garde0 = (await un('select count(*)::int n from public.garde_annonce')).n;
const e1 = await refus(DOUTES);
ok(e1 === null, `joué sans erreur ${e1 ?? ''}`);
const dec = Object.fromEntries((await q('select decision, count(*)::int n from public._backup_1511b_ventes_doutes group by 1')).rows.map((r) => [r.decision, r.n]));
ok(JSON.stringify(dec) === JSON.stringify({ deja_la: 26, remise: 14, sans_commande: 2 }) || (dec.deja_la === 26 && dec.remise === 14 && dec.sans_commande === 2), `décisions 26 / 14 / 2 (${JSON.stringify(dec)})`);
const rem = await un(`select count(*)::int n, min(statut) st, min(source) so, min(devise) dv from public.ventes where id = any($1::bigint[])`, [REMISES]);
ok(rem.n === 14 && rem.st === 'vendu' && rem.so === 'releve' && rem.dv === 'EUR', `14 ventes remises avec leur id d'origine (${JSON.stringify(rem)})`);
ok((await un('select count(*)::int n from public.ventes where id between 700000 and 711000')).n === 0, 'aucun « déjà là » ni « sans commande » remis');
ok((await un('select count(*)::int n from public.push_ventes')).n === push0 && (await un('select count(*)::int n from public.garde_annonce')).n === garde0, 'aucun déclencheur : aucune ligne push, aucune garde');
ok((await un("select count(*)::int n from pg_trigger where tgrelid = 'public.ventes'::regclass and not tgisinternal and tgenabled <> 'O'")).n === 0, 'déclencheurs réactivés');
ok((await un("select count(*)::int n from public.ventes_supprimees where vente_id = any($1::bigint[]) and motif like 'restauree 15/11 (doute levé%'", [REMISES])).n === 14, 'pierres tombales des 14 marquées, jamais supprimées');
ok(/déjà joué/.test(String(await refus(DOUTES))), 'rejoué : refusé');

console.log('H. Les champs perdus (20261115_ventes_champs_rendus.sql, tel quel)');
const cible = lus.find((x) => x.compte === '2c89e573' && !REMISES.includes(x.id) && !x.fiche);
await q('update public.ventes set prix_vente = prix_vente + 1 where id = $1', [cible.id]);
const e2 = await refus(CHAMPS);
ok(/ventes retrouvées/.test(String(e2)) && (await un("select to_regclass('public._backup_1511c_ventes_champs_rendus') t")).t === null
  && (await un('select count(*)::int n from public.ventes where selling_fees is not null')).n === 0, 'une vente qui ne correspond plus (prix changé) : refus, RIEN d\'écrit');
await q('update public.ventes set prix_vente = prix_vente - 1 where id = $1', [cible.id]);
const avecMarque = lus.find((x) => x.marque && !x.fiche);
const avecPa = lus.find((x) => x.pa !== null && x.benef !== null);
await q("update public.ventes set marque = 'Ma marque' where id = $1", [avecMarque.id]);
await q('update public.ventes set prix_achat = 12 where id = $1', [avecPa.id]);
const inv0 = await un("select count(*)::int n, sum(hashtext(id::text || coalesce(statut, '')))::bigint h from public.inventaire");
const e3 = await refus(CHAMPS);
ok(e3 === null, `joué sans erreur ${e3 ?? ''}`);
const tot = await un('select count(*)::int n from public._backup_1511c_ventes_champs_rendus');
ok(tot.n === lus.length, `${lus.length} ventes retrouvées par id + commande + prix (${tot.n})`);
ok((await un('select count(*)::int n from public.ventes v join public._backup_1511c_ventes_champs_rendus b on b.id = v.id where v.selling_fees is not distinct from b.selling_fees_lu')).n === lus.length, 'frais rendus sur chaque vente');
const nPa = lus.filter((x) => x.pa !== null).length;
ok((await un('select count(*)::int n from public.ventes v join public._backup_1511c_ventes_champs_rendus b on b.id = v.id where b.prix_achat_lu is not null and v.prix_achat = b.prix_achat_lu')).n === nPa - 1
  && (await un('select prix_achat::int pa, benefice from public.ventes where id = $1', [avecPa.id])).pa === 12
  && (await un('select benefice from public.ventes where id = $1', [avecPa.id])).benefice === null, `prix d'achat rendus (${nPa - 1}) ; celui saisi depuis (12) gardé, sa marge pas reprise`);
ok((await un('select marque from public.ventes where id = $1', [avecMarque.id])).marque === 'Ma marque'
  && (await un('select count(*)::int n from public.ventes v join public._backup_1511c_ventes_champs_rendus b on b.id = v.id where b.marque_lu is not null and v.marque = b.marque_lu')).n === lus.filter((x) => x.marque).length - 1, 'marques rendues ; celle saisie depuis gardée');
const liens = Object.fromEntries((await q('select lien, count(*)::int n from public._backup_1511c_ventes_champs_rendus where lien is not null group by 1')).rows.map((r) => [r.lien, r.n]));
ok(liens.fiche_absente === 1 && liens.fiche_pas_vendue === 1 && liens.fiche_deja_a_une_vente === 1 && liens.reliee === avecFiche.length - 3, `liens : seulement vers la fiche unique « vendu » libre du même numéro (${JSON.stringify(liens)})`);
ok((await un("select count(*)::int n from public.ventes v join public._backup_1511c_ventes_champs_rendus b on b.id = v.id where b.lien = 'reliee' and v.inventaire_id = b.fiche_id")).n === avecFiche.length - 3, 'ventes reliées à leur fiche');
const inv1 = await un("select count(*)::int n, sum(hashtext(id::text || coalesce(statut, '')))::bigint h from public.inventaire");
ok(inv1.n === inv0.n && inv1.h === inv0.h && (await un('select count(*)::int n from public.push_ventes')).n === push0, 'aucune fiche touchée, aucun push');
ok(/déjà joué/.test(String(await refus(CHAMPS))), 'rejoué : refusé');

console.log('I. Les inverses (champs, puis doutes)');
await q("update public.ventes set marque = 'Changée' where id = (select b.id from public._backup_1511c_ventes_champs_rendus b where b.marque_lu is not null and b.id <> $1 limit 1)", [avecMarque.id]);
const e4 = await refus(CHAMPS_INVERSE);
ok(e4 === null, `inverse des champs joué ${e4 ?? ''}`);
ok((await un('select count(*)::int n from public.ventes where id <> 850000 and (selling_fees is not null or inventaire_id between 900000 and 999999)')).n === 0, 'frais et liens rendus vidés (la vente « autre » garde sa fiche)');
ok((await un("select count(*)::int n from public.ventes where marque in ('Ma marque', 'Changée')")).n === 2 && (await un('select prix_achat::int pa from public.ventes where id = $1', [avecPa.id])).pa === 12, 'ce qui a été changé depuis est gardé');
const j0 = (await un('select count(*)::int n from public.ventes_suppressions_journal')).n;
const t0 = (await un('select count(*)::int n from public.ventes_supprimees')).n;
const e5 = await refus(DOUTES_INVERSE);
ok(e5 === null, `inverse des doutes joué ${e5 ?? ''}`);
ok((await un('select count(*)::int n from public.ventes where id = any($1::bigint[])', [REMISES])).n === 0, 'les 14 remises retirées');
ok((await un("select count(*)::int n from public.ventes_suppressions_journal where motif = 'inverse_doutes_remises_1511'")).n === 14 && j0 + 14 === (await un('select count(*)::int n from public.ventes_suppressions_journal')).n, 'suppression JOURNALISÉE (14, motif posé)');
ok((await un('select count(*)::int n from public.ventes_supprimees')).n === t0 && (await un("select count(*)::int n from public.ventes_supprimees where vente_id = any($1::bigint[]) and motif = 'avant'", [REMISES])).n === 14, 'aucune pierre tombale neuve ; motif d\'avant rendu');

await db.end();
console.log(`\n${ko ? '✗' : '✓'} ${n - ko} vert(s), ${ko} rouge(s) sur ${n}`);
process.exit(ko ? 1 : 0);
