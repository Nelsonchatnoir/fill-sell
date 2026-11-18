// PREUVE SUR UNE BASE JETABLE (18/11/2026, ordre de Nico, point 3A) — « aucun mail (ni push) pour une vente ANTÉRIEURE
// au début du suivi » : la migration 20261118233000_vente_avant_suivi.
//
//   node scripts/cloud/pg-jetable.mjs scripts/ventes/preuve-vente-avant-suivi.mjs   (npm run selftest:vente-avant-suivi-pg)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Le socle est fabriqué (colonnes utiles des tables de prod,
// contraintes de push_ventes, aides plateforme_normalisee et _ts_ou_null recopiées de prod) ; push_vente_deja_signalee
// (doublons, non concerné) est un témoin qui rend NULL ; pg_net est RETENU (net._appels : rien ne part).
// Les deux fonctions sous preuve partent de leur corps de PROD (l'INVERSE, md5 vérifiés), puis de la migration jouée
// TELLE QUELLE. Les arguments sont ceux que passent les appelants de prod (relus le 18/11) : push_trg_ventes('releve')
// → push_noter(user, 'commande', pf, vente, fiche, NULL, commande, annonce, titre, prix, devise, vendu_le, false) ;
// push_trg_job → push_noter(user, 'job', pf, NULL, fiche, job, NULL, annonce, titre, prix, NULL, NULL, déclarée) ;
// vente_vinted_lot_eclater → push_noter_commande_vinted(user, commande, vente, articles, total, devise, vendu_le).
// Ce qui est prouvé :
//   AVANT (prod) : les formes réelles du défaut (S1 4e0a80fe, S3 Leboncoin au 1er relevé, S5 compteur eBay, S7 commande
//     Vinted en lot) naissent « a_envoyer » et appellent push-ventes — le mail serait parti ;
//   APRÈS : S1-S9 (tableau en tête de RAPPORT) ; une note avant_suivi naît « ignoree », sans appel ; une vraie vente
//     part comme avant ; une panne de la garde = le comportement d'avant ; jamais now() comme début ;
//   INVERSE : les deux corps de prod rendus à l'octet (md5), vente_avant_suivi retirée.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)|pooler/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let MIGRATION, INVERSE;
try {
  MIGRATION = lire('supabase/migrations/20261118233000_vente_avant_suivi.sql');
  INVERSE = lire('supabase/rollbacks/20261118233000_vente_avant_suivi_INVERSE.sql');
} catch (e) {
  console.log(`  ✗ migration ou INVERSE absente (${e.code ?? e.message})`);
  console.log('\n0/1 — ROUGE');
  process.exit(1);
}
const MD5_PROD = { push_noter: '31f8991857f493e5ec277eb399689679', push_noter_commande_vinted: '2cf1bb10fe432f2b29a2677ec3b671cf' };
const SIG = {
  push_noter: 'public.push_noter(uuid,text,text,bigint,bigint,uuid,text,text,text,numeric,text,timestamp with time zone,boolean)',
  push_noter_commande_vinted: 'public.push_noter_commande_vinted(uuid,text,bigint,jsonb,numeric,text,timestamp with time zone)',
  vente_avant_suivi: 'public.vente_avant_suivi(uuid,text,timestamp with time zone,uuid)',
};
const fonctionDe = (texte, nom) => {
  const i = texte.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  const a = i < 0 ? -1 : texte.indexOf('AS $function$', i);
  const f = a < 0 ? -1 : texte.indexOf('$function$', a + 'AS $function$'.length);
  if (f < 0) throw new Error(`${nom} introuvable`);
  return `${texte.slice(i, f + '$function$'.length)}\n`;
};
const md5 = (t) => crypto.createHash('md5').update(t).digest('hex');

let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${typeof d === 'string' ? d : JSON.stringify(d)}` : ''}`); } };
const db = new pg.Client({ connectionString: PG_URL });
await db.connect();
db.on('notice', () => {});
const q = (s, p) => db.query(s, p);
const un = async (s, p) => (await q(s, p)).rows[0];
const md5Base = async (sig) => (await un(`select md5(replace(pg_get_functiondef($1::regprocedure), chr(13), '')) m`, [sig])).m;

// ── Le socle ────────────────────────────────────────────────────────────────────────────────────────────────────────
await q(String.raw`
create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create schema if not exists net;
create table auth.users (id uuid primary key, email text);
create table net._appels (id bigserial primary key, url text, body jsonb, le timestamptz default clock_timestamp());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000) returns bigint
  language sql as $f$ insert into net._appels (url, body) values (url, body) returning id $f$;
create table public.profiles (id uuid primary key references auth.users(id), email text, lang text, created_at timestamptz not null default now());
create table public.inventaire (id bigint primary key, user_id uuid, titre text, quantite integer);
create table public.vinted_sync_runs (id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text, status text,
  platform text, started_at timestamptz, updated_at timestamptz, finished_at timestamptz, queued_at timestamptz);
create index vinted_sync_runs_user_date on public.vinted_sync_runs (user_id, started_at desc);
create table public.ebay_accounts (user_id uuid primary key, connected_at timestamptz, revoked_at timestamptz);
create table public.cross_post_jobs (id uuid primary key default gen_random_uuid(), user_id uuid, inventaire_id bigint, platform text,
  status text, action text, title text, platform_listing_id text, platform_fields jsonb default '{}'::jsonb, created_at timestamptz default now());
create table public.ventes (id bigserial primary key, created_at timestamptz not null default now(), user_id uuid, titre text, prix_vente numeric,
  plateforme text, plateforme_code text, inventaire_id bigint, vendu_le timestamptz, commande_ref text, source text, annonce_id text);
create index ventes_annonce_idx on public.ventes (user_id, plateforme_code, annonce_id) where annonce_id is not null;
create table public.push_ventes (id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade, origine text,
  plateforme text, vente_id bigint, inventaire_id bigint, job_id uuid, commande_ref text, annonce_id text, titre text, prix numeric, devise text,
  vendu_le timestamptz, cles text[] not null default '{}', statut text not null default 'a_envoyer', motif text, lot bigint, essais integer not null default 0,
  cree_le timestamptz not null default now(), traite_le timestamptz, resultat jsonb, part_le timestamptz, mail_statut text, mail_essais integer not null default 0,
  mail_traite_le timestamptz, mail_motif text, preuve_recente text, articles jsonb,
  constraint push_ventes_statut_check check (statut = any (array['a_envoyer','en_envoi','envoyee','doublon','ignoree','declaree','sans_appareil','echec'])),
  constraint push_ventes_mail_statut_check check (mail_statut is null or mail_statut = any (array['a_envoyer','en_envoi','envoye','deja_envoye','sans_adresse','echec'])));
-- Recopiées de prod (pg_get_functiondef, 18/11).
CREATE OR REPLACE FUNCTION public.plateforme_normalisee(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p is null or btrim(p) = '' then null
    when lower(p) like '%vinted%' then 'vinted'
    when lower(p) like '%leboncoin%' or lower(btrim(p)) in ('lbc', 'le bon coin') then 'leboncoin'
    when lower(p) like '%beebs%' then 'beebs'
    when lower(p) like '%ebay%' then 'ebay'
    when lower(p) like '%opla%' then 'opla'
    when lower(p) like '%depop%' then 'depop'
    when lower(p) like '%ailleurs%' or lower(p) like '%main propre%' then 'ailleurs'
    else 'autre'
  end;
$function$;
CREATE OR REPLACE FUNCTION public._ts_ou_null(p text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  RETURN p::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END
$function$;
-- Témoins (hors preuve) : aucun doublon ; le secret de cron n'est jamais écrit.
create function public.push_vente_deja_signalee(p_user uuid, p_pf text, p_cles text[], p_le timestamptz, p_note bigint, p_x boolean)
  returns text language sql stable as $f$ select null::text $f$;
create function public.cron_secret() returns text language sql stable as $f$ select 'secret-de-preuve' $f$;
`);

// ── Les comptes et leurs scènes ─────────────────────────────────────────────────────────────────────────────────────
let nComptes = 0, nFiche = 9100000;
async function compte(nom, inscritIl) {
  const u = crypto.randomUUID();
  await q('insert into auth.users (id, email) values ($1, $2)', [u, `preuve-${nom}-${++nComptes}@exemple.invalid`]);
  await q(`insert into profiles (id, email, lang, created_at) values ($1, $2, 'fr', now() - $3::interval)`, [u, `preuve-${nom}-${nComptes}@exemple.invalid`, inscritIl]);
  return u;
}
const releve = (u, platform, debutIl, dureeS = 40, kind = 'annonces') => q(
  `insert into vinted_sync_runs (user_id, kind, status, platform, started_at, updated_at, finished_at)
   values ($1, $2, 'done', $3, now() - $4::interval, now() - $4::interval + make_interval(secs => $5), now() - $4::interval + make_interval(secs => $5))`,
  [u, kind, platform, debutIl, dureeS]);
async function job(u, platform, annonce, pf) {
  const fiche = nFiche++;
  await q(`insert into inventaire (id, user_id, titre, quantite) values ($1, $2, 'Article', 1)`, [fiche, u]);
  const { id } = await un(`insert into cross_post_jobs (user_id, inventaire_id, platform, status, action, title, platform_listing_id, platform_fields)
    values ($1, $2, $3, 'sold', 'publish', 'Article', $4, $5) returning id`, [u, fiche, platform, annonce, JSON.stringify(pf)]);
  return { id, fiche };
}
// Une note, dans SA transaction (l'appel pg_net est unique par transaction) : statut, motif, appels à push-ventes.
async function noter(fn, args) {
  const avant = Number((await un('select count(*) n from net._appels')).n);
  const dernier = Number((await un('select coalesce(max(id), 0) m from push_ventes')).m);
  await q('begin');
  let r;
  try {
    if (fn === 'commande_vinted') {
      await q(`select push_noter_commande_vinted($1, $2, $3, $4::jsonb, $5, 'EUR', $6)`, args);
    } else {
      await q(`select push_noter($1, $2, $3, $4, $5, $6, $7, $8, 'Article', 25, 'EUR', $9, $10)`, args);
    }
    const nees = (await q('select statut, motif, traite_le is not null traite from push_ventes where user_id = $1 and id > $2 order by id', [args[0], dernier])).rows;
    r = nees.length === 1 ? nees[0] : { statut: null, motif: `${nees.length} note(s) nées` };
    await q('commit');
  } catch (e) { await q('rollback'); throw e; }
  const apres = Number((await un('select count(*) n from net._appels')).n);
  return { ...r, appels: apres - avant };
}
// Les arguments de push_trg_ventes('releve') (commande) et de push_trg_job (job), comme en prod.
const commande = (u, pf, venduIl, ref, annonce = null) => noter('push_noter', [u, 'commande', pf, null, null, null, ref, annonce,
  venduIl == null ? null : new Date(Date.now() - venduIl * 1000), false]);
const parJob = (u, pf, j, annonce, declaree = false) => noter('push_noter', [u, 'job', pf, null, j.fiche, j.id, null, annonce, null, declaree]);
const lotVinted = (u, ref, fiche, venduIl) => noter('commande_vinted', [u, ref, null,
  JSON.stringify([{ titre: 'Article', prix: 20, inventaire_id: fiche, item_id: `77${fiche}`, cles: [`annonce:vinted:77${fiche}`] }]), 20,
  new Date(Date.now() - venduIl * 1000)]);
const H = 3600;

// Les scènes (comptes neufs à chaque phase : jamais deux phases sur les mêmes notes).
async function scenes() {
  const s = {};
  // S1 — 4e0a80fe : inscrite il y a 9 min, 1er relevé eBay il y a 10 s ; commande vendue 8 h 29 avant l'inscription.
  const cpt1 = await compte('cpt1', '9 minutes');
  await releve(cpt1, 'ebay', '10 seconds', 5);
  s.S1 = await commande(cpt1, 'ebay', 9 * 60 + 8 * H + 29 * 60, '14-15429-91453:1');
  // S2 — vraie vente : compte suivi depuis 2 jours, commande vendue il y a 5 min.
  const vrai = await compte('vrai', '3 days');
  await releve(vrai, 'ebay', '2 days');
  s.S2 = await commande(vrai, 'ebay', 5 * 60, '01-00000-00001:1');
  // S3 — compte ancien, 1er relevé Leboncoin il y a 3 h : « Achat en cours » lu 20 s après son début (rattrapage).
  const lbc = await compte('lbc', '30 days');
  await releve(lbc, 'leboncoin', '3 hours', 60);
  const premiereLecture = (await un(`select (now() - interval '3 hours' + interval '20 seconds') t`)).t.toISOString();
  const j3 = await job(lbc, 'leboncoin', '3308730114', { sale_evidence: { source: 'transaction_leboncoin', statut: 'pending', exact: true,
    rattrapage: { regle: 'lecture_fraiche_2410', premiere_lecture: premiereLecture } } });
  s.S3 = await parJob(lbc, 'leboncoin', j3, '3308730114');
  // S4 — même compte : un « Achat en cours » lu en TRANSITION (aucun rattrapage), 3 h après le 1er relevé.
  const j4 = await job(lbc, 'leboncoin', '3308730115', { sale_evidence: { source: 'transaction_leboncoin', statut: 'pending', exact: true } });
  s.S4 = await parJob(lbc, 'leboncoin', j4, '3308730115');
  // S5 — eBay : inscrit il y a 1 h, 1er relevé il y a 30 min ; tâche importée, compteur Browse « vendus: 1 » sans commande ;
  // la vente relevée de CETTE annonce date d'il y a 38 h.
  const eb = await compte('ebay', '1 hour');
  await releve(eb, 'ebay', '30 minutes');
  await q(`insert into ventes (user_id, plateforme, plateforme_code, source, annonce_id, commande_ref, vendu_le) values ($1, 'ebay', 'ebay', 'releve', '407358810335', '13-15434-28695:1', now() - interval '38 hours')`, [eb]);
  const j5 = await job(eb, 'ebay', '407358810335', { sale_evidence: { source: 'browse_api', state: 'sold', exact: true }, vente_ebay: { vendus: 1, sans_fin: true } });
  s.S5 = await parJob(eb, 'ebay', j5, '407358810335');
  // S5b — même compte, autre annonce en quantité : vente relevée ancienne, mais la preuve du job porte SA commande.
  await q(`insert into ventes (user_id, plateforme, plateforme_code, source, annonce_id, commande_ref, vendu_le) values ($1, 'ebay', 'ebay', 'releve', '407000000001', '10-00000-00001:1', now() - interval '20 days')`, [eb]);
  const j5b = await job(eb, 'ebay', '407000000001', { sale_evidence: { source: 'order_confirmation', state: 'sold', exact: true, order_id: '11-15445-07451' } });
  s.S5b = await parJob(eb, 'ebay', j5b, '407000000001');
  // S5c — la vraie 2e vente de l'annonce de S5, relevée ensuite par les commandes (après le début) : elle part.
  s.S5c = await commande(eb, 'ebay', 2 * 60, '99-00000-00002:1', '407358810335');
  // S6 — vente DÉCLARÉE par la personne (même datée d'avant) : « declaree », comme avant.
  s.S6 = await noter('push_noter', [cpt1, 'commande', 'ebay', null, null, null, 'DECL-1', null, new Date(Date.now() - 40 * H * 1000), true]);
  // S7 — commande Vinted en lot, vendue avant le 1er relevé Vinted ; S7b — vendue après.
  const vt = await compte('vinted', '2 hours');
  await releve(vt, 'vinted', '1 hour', 30, 'dressing');
  const f7 = nFiche++; await q(`insert into inventaire (id, user_id, titre, quantite) values ($1, $2, 'Article', 1)`, [f7, vt]);
  s.S7 = await lotVinted(vt, 'CMD-AVANT', f7, 5 * H);
  const f7b = nFiche++; await q(`insert into inventaire (id, user_id, titre, quantite) values ($1, $2, 'Article', 1)`, [f7b, vt]);
  s.S7b = await lotVinted(vt, 'CMD-APRES', f7b, 10 * 60);
  // S9 — aucun relevé de la plateforme, compte ancien : la date d'inscription seule borne (jamais now()) ;
  // S9b — eBay sans relevé : la connexion eBay borne.
  const sans = await compte('sans-releve', '40 days');
  s.S9 = await commande(sans, 'leboncoin', 3 * H, 'LBC-1');
  await q(`insert into ebay_accounts (user_id, connected_at) values ($1, now() - interval '1 hour')`, [sans]);
  s.S9b = await commande(sans, 'ebay', 3 * H, 'EB-1');
  // Origine sans date ni job (veille Vinted, annonce) : comme avant.
  s.S10 = await noter('push_noter', [vrai, 'vinted', 'vinted', null, null, null, null, '7700001', null, false]);
  return s;
}

console.log('A. AVANT — corps de PROD (INVERSE) : le défaut reproduit');
await q(INVERSE);
ok(await md5Base(SIG.push_noter) === MD5_PROD.push_noter, `push_noter = prod (md5 ${MD5_PROD.push_noter})`);
ok(await md5Base(SIG.push_noter_commande_vinted) === MD5_PROD.push_noter_commande_vinted, `push_noter_commande_vinted = prod (md5 ${MD5_PROD.push_noter_commande_vinted})`);
const av = await scenes();
for (const [k, quoi] of [['S1', '4e0a80fe, commande eBay vendue avant l\'inscription'], ['S3', 'Leboncoin « Achat en cours » au 1er relevé'],
  ['S5', 'compteur eBay d\'une vente relevée d\'avant'], ['S7', 'commande Vinted en lot d\'avant le 1er relevé']]) {
  ok(av[k].statut === 'a_envoyer' && av[k].appels === 1, `${k} (${quoi}) : naît « a_envoyer » et appelle push-ventes — le mail partirait`, av[k]);
}

console.log('B. APRÈS — la migration jouée TELLE QUELLE');
await q(MIGRATION);
for (const nom of ['vente_avant_suivi', 'push_noter', 'push_noter_commande_vinted']) {
  ok(await md5Base(SIG[nom]) === md5(fonctionDe(MIGRATION, nom)), `${nom} installée = texte de la migration (md5)`);
}
const droits = await un(`select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') b,
  has_function_privilege('service_role', $1, 'execute') c`, [SIG.vente_avant_suivi]);
ok(!droits.a && !droits.b && droits.c, 'vente_avant_suivi : ni anon ni authenticated ; service_role seulement', droits);
const ventesAvant = Number((await un('select count(*) n from ventes')).n);
const ap = await scenes();
const ventesApres = Number((await un('select count(*) n from ventes')).n);
const attendu = {
  S1: ['ignoree', 'avant_suivi:date', 0, '4e0a80fe : vente d\'avant l\'inscription, notée, jamais annoncée'],
  S2: ['a_envoyer', null, 1, 'vraie vente après le 1er relevé : part comme avant'],
  S3: ['ignoree', 'avant_suivi:etat_initial', 0, '« Achat en cours » déjà là au 1er relevé Leboncoin'],
  S4: ['a_envoyer', null, 1, '« Achat en cours » lu en transition, après le 1er relevé : part'],
  S5: ['ignoree', 'avant_suivi:vente_relevee', 0, 'compteur eBay d\'une vente relevée d\'avant le suivi'],
  S5b: ['a_envoyer', null, 1, '2e exemplaire eBay avec SA commande : part'],
  S5c: ['a_envoyer', null, 1, 'la vraie vente suivante de la même annonce, relevée par les commandes : part'],
  S6: ['declaree', null, 0, 'vente déclarée par la personne : inchangée'],
  S7: ['ignoree', 'avant_suivi:date', 0, 'commande Vinted en lot d\'avant le 1er relevé'],
  S7b: ['a_envoyer', null, 1, 'commande Vinted en lot d\'après : part'],
  S9: ['a_envoyer', null, 1, 'aucun relevé, compte ancien : l\'inscription borne, jamais now()'],
  S9b: ['ignoree', 'avant_suivi:date', 0, 'eBay sans relevé : la connexion eBay borne'],
  S10: ['a_envoyer', null, 1, 'note sans date ni job (veille Vinted) : comme avant'],
};
for (const [k, [statut, motif, appels, quoi]] of Object.entries(attendu)) {
  const r = ap[k];
  ok(r.statut === statut && (r.motif ?? null) === motif && r.appels === appels && (statut === 'a_envoyer' || r.traite || statut === 'declaree'),
    `${k} : ${quoi} → ${statut}${motif ? ` (${motif})` : ''}, ${appels} appel`, r);
}
ok(ventesApres - ventesAvant === 2, 'aucune vente écrite ni effacée par la garde (seules les 2 ventes de mise en scène)', { ventesAvant, ventesApres });

console.log('C. PANNE de la garde = le comportement d\'avant (jamais une vraie vente sans mail)');
await q(`create or replace function public.vente_avant_suivi(p_user uuid, p_pf text, p_vendu_le timestamp with time zone, p_job uuid default null::uuid)
  returns text language plpgsql stable as $f$ begin raise exception 'panne simulée'; end $f$`);
const pa = await compte('panne', '5 minutes');
await releve(pa, 'ebay', '1 minute');
const S8 = await commande(pa, 'ebay', 3 * H, 'PANNE-1');
ok(S8.statut === 'a_envoyer' && S8.appels === 1, 'S8 : garde en panne → « a_envoyer », comme les corps de prod', S8);
const pv = await compte('panne-vinted', '5 minutes');
const f8 = nFiche++; await q(`insert into inventaire (id, user_id, titre, quantite) values ($1, $2, 'Article', 1)`, [f8, pv]);
const S8b = await lotVinted(pv, 'PANNE-V', f8, 3 * H);
ok(S8b.statut === 'a_envoyer' && S8b.appels === 1, 'S8b : idem pour une commande Vinted en lot', S8b);

console.log('D. INVERSE — les corps de prod rendus');
await q(INVERSE);
ok(await md5Base(SIG.push_noter) === MD5_PROD.push_noter, 'push_noter rendu à l\'octet (md5 de prod)');
ok(await md5Base(SIG.push_noter_commande_vinted) === MD5_PROD.push_noter_commande_vinted, 'push_noter_commande_vinted rendu à l\'octet (md5 de prod)');
ok(!(await un(`select to_regprocedure($1) is not null e`, [SIG.vente_avant_suivi])).e, 'vente_avant_suivi retirée');

await db.end();
console.log(`\n${n - ko}/${n} — ${ko ? 'ROUGE' : 'VERT'}`);
process.exit(ko ? 1 : 0);
