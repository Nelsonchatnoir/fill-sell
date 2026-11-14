// PREUVE SUR UNE BASE JETABLE de la migration 20261114200000_ventes_releves_poste_cloud_seul (14/11/2026 soir, point 3
// de Nico) : « compte au Cloud : les ventes et relevés envoyés par un poste qui n'est pas le poste Cloud sont ignorés ».
//
//   node scripts/cloud/pg-jetable.mjs scripts/cloud/preuve-ventes-poste-cloud-seul.mjs      (npm run selftest:ventes-poste-cloud-seul)
//   (embedded-postgres + pg : npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3)
//
// Jamais la prod (refus si l'URL est celle de Supabase). Les deux fonctions de vente sont créées avec leur CORPS DE PROD
// relu le 14/11 (scripts/essais/fixtures/prod-1411-ventes-poste-cloud/, md5 vérifié ici), puis la migration est jouée
// TELLE QUELLE, puis son inverse. Ce qui est prouvé :
//   A. compte au Cloud, jeton du PC (poste noté, build du Store) : vente REFUSÉE (« compte_cloud », rien traité) ;
//   B. jeton du poste Cloud (cloud_postes) et d'un poste au build « -cloud » : vente ACCEPTÉE (le corps de prod tourne) ;
//   C. compte SANS Cloud, jeton du PC : réponse IDENTIQUE à celle d'avant la migration ;
//   D. l'app (session qui n'est pas un poste) et le rôle service : acceptés ;
//   E. commandes Vinted : mêmes règles ;
//   F. relevés (vinted_sync_runs) : ouverture et prise d'une demande par le PC ignorées ; poste Cloud, app, compte sans
//      Cloud : écrits ; l'app peut toujours clore une demande ;
//   G. garde md5 (corps changé = rien fait), rejeu sans effet, inverse = corps de prod rendus octet pour octet.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.co/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');   // un poste en CRLF ne change pas l'empreinte
const MIGRATION = lire('supabase/migrations/20261114200000_ventes_releves_poste_cloud_seul.sql');
const INVERSE = lire('supabase/rollbacks/20261114200000_ventes_releves_poste_cloud_seul_INVERSE.sql');
const CORPS = {
  ventes: { f: 'public.enregistrer_ventes_relevees(text,jsonb,uuid)', md5: 'a5d598312fbaa7b1595b441569deed7c', sql: lire('scripts/essais/fixtures/prod-1411-ventes-poste-cloud/enregistrer_ventes_relevees.sql') },
  commandes: { f: 'public.commandes_vinted_noter(jsonb)', md5: 'ab5720b5360e807042a15b75b72d53a6', sql: lire('scripts/essais/fixtures/prod-1411-ventes-poste-cloud/commandes_vinted_noter.sql') },
};
const md5 = (t) => createHash('md5').update(t).digest('hex');

const CLOUD_U = '13e274de-0000-4000-8000-000000000001';   // compte au Cloud actif
const SANS_U = '5322fa18-0000-4000-8000-000000000002';    // compte sans Cloud
const PC = '727410c6-0000-4000-8000-000000000003';         // session de l'extension du PC (build du Store)
const CLOUD = '8564d390-0000-4000-8000-000000000004';      // session du poste Cloud (cloud_postes)
const CLOUD_BUILD = '9a9a9a9a-0000-4000-8000-000000000005';// un poste noté au build « -cloud »
const APP = 'a0a0a0a0-0000-4000-8000-000000000006';        // session de l'app (jamais un poste)
const PC_SANS = 'b1b1b1b1-0000-4000-8000-000000000007';    // PC du compte sans Cloud

const c = new pg.Client({ connectionString: PG_URL });
await c.connect();
let ko = 0, n = 0;
const ok = (nom, cond, d = '') => { n++; if (!cond) ko++; console.log(`  ${cond ? 'ok  ' : 'KO  '} ${nom}${cond ? '' : `  ← ${d}`}`); };

await c.query(String.raw`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $f$;
DROP TABLE IF EXISTS public.profiles CASCADE; DROP TABLE IF EXISTS public.cloud_postes CASCADE; DROP TABLE IF EXISTS public.vinted_sync_runs CASCADE;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, cloud_voie boolean, extension_postes jsonb);
CREATE TABLE public.cloud_postes (user_id uuid PRIMARY KEY, session_fillsell_id uuid);
CREATE TABLE public.vinted_sync_runs (id bigserial PRIMARY KEY, user_id uuid, kind text, platform text, status text, declencheur text, extension_build text);
-- Ce que les corps de prod appellent avant leur boucle (identité Vinted de la boutique) : neutres ici.
CREATE OR REPLACE FUNCTION public.boutique_vinted_autre_compte(uuid, text) RETURNS boolean LANGUAGE sql AS $f$ SELECT false $f$;
CREATE OR REPLACE FUNCTION public.vinted_boutique_du_poste(uuid) RETURNS text LANGUAGE sql AS $f$ SELECT NULL::text $f$;
CREATE OR REPLACE FUNCTION public.republish_boutique_connectee(uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT NULL::jsonb $f$;
`);
for (const k of Object.keys(CORPS)) await c.query(CORPS[k].sql);
const defLue = async (f) => (await c.query('SELECT pg_get_functiondef($1::regprocedure) d', [f])).rows[0].d;
console.log('0. Les corps de prod sur le banc');
for (const k of Object.keys(CORPS)) ok(`${CORPS[k].f} : md5 du corps de prod (${CORPS[k].md5})`, md5(await defLue(CORPS[k].f)) === CORPS[k].md5, md5(await defLue(CORPS[k].f)));

await c.query(`INSERT INTO public.profiles VALUES
  ($1, true,  jsonb_build_object($3::text, jsonb_build_object('build', '2026-11-12T10:00:00Z+ba13a51'), $4::text, jsonb_build_object('build', '2026-11-14T11:39:28Z+b05bafe-cloud'))),
  ($2, false, jsonb_build_object($5::text, jsonb_build_object('build', '2026-11-12T10:00:00Z+ba13a51')))`, [CLOUD_U, SANS_U, PC, CLOUD_BUILD, PC_SANS]);
await c.query('INSERT INTO public.cloud_postes VALUES ($1, $2)', [CLOUD_U, CLOUD]);

// Un appel « comme PostgREST » : les claims du jeton posés pour la transaction.
async function comme(claims, sql, params = []) {
  await c.query('BEGIN');
  try {
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [claims ? JSON.stringify(claims) : '']);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) { await c.query('ROLLBACK'); throw e; }
}
const jeton = (u, sid) => ({ role: 'authenticated', sub: u, session_id: sid });
const VENTE = JSON.stringify([{ statut: 'done', titre: 'Robe test', prix: 12 }]);   // sans référence : compté « sans_ref » par le corps de prod
const COMMANDE = JSON.stringify([{ ref: 'pas-un-numero', statut: 'paid' }]);
const vente = async (claims, pf = 'leboncoin') => (await comme(claims, 'SELECT public.enregistrer_ventes_relevees($1, $2::jsonb) r', [pf, VENTE])).rows[0].r;
const commande = async (claims) => (await comme(claims, 'SELECT public.commandes_vinted_noter($1::jsonb) r', [COMMANDE])).rows[0].r;

// Les réponses d'AVANT la migration (référence de C).
const avantSansCloud = await vente(jeton(SANS_U, PC_SANS));
const avantSansCloudV = await vente(jeton(SANS_U, PC_SANS), 'vinted');
const avantCmdSansCloud = await commande(jeton(SANS_U, PC_SANS));
const avantPcCloud = await vente(jeton(CLOUD_U, PC));
ok('avant la migration : la vente du PC d\'un compte au Cloud était ACCEPTÉE (le défaut constaté)', avantPcCloud.sans_ref === 1 && !avantPcCloud.motif, JSON.stringify(avantPcCloud));

await c.query(MIGRATION);
const occurrences = async () => (await defLue(CORPS.ventes.f)).split('ecriture_poste_hors_cloud').length - 1;
const apresPremiere = await occurrences();
console.log('\nA. Compte au Cloud, extension du PC');
for (const pf of ['leboncoin', 'vinted', 'depop']) {
  const r = await vente(jeton(CLOUD_U, PC), pf);
  ok(`${pf} : vente refusée (« compte_cloud », rien traité)`, r.motif === 'compte_cloud' && r.creees === 0 && r.refusees === 1 && !('sans_ref' in r), JSON.stringify(r));
}
console.log('\nB. Compte au Cloud, poste Cloud');
const rCloud = await vente(jeton(CLOUD_U, CLOUD));
ok('session du poste Cloud (cloud_postes) : vente acceptée, le corps de prod la traite', !rCloud.motif && rCloud.recues === 1 && rCloud.sans_ref === 1, JSON.stringify(rCloud));
const rCloudB = await vente(jeton(CLOUD_U, CLOUD_BUILD), 'vinted');
ok('poste noté au build « -cloud » : vente acceptée', !rCloudB.motif && rCloudB.sans_ref === 1, JSON.stringify(rCloudB));
console.log('\nC. Compte sans Cloud : inchangé');
ok('PC d\'un compte sans Cloud (leboncoin) : réponse identique à celle d\'avant', JSON.stringify(await vente(jeton(SANS_U, PC_SANS))) === JSON.stringify(avantSansCloud));
ok('PC d\'un compte sans Cloud (vinted) : réponse identique à celle d\'avant', JSON.stringify(await vente(jeton(SANS_U, PC_SANS), 'vinted')) === JSON.stringify(avantSansCloudV));
await c.query('UPDATE public.profiles SET cloud_voie = false WHERE id = $1', [CLOUD_U]);
const rFin = await vente(jeton(CLOUD_U, PC));
ok('Cloud arrêté (cloud_voie faux) : le PC est accepté de nouveau, sans geste', !rFin.motif && rFin.sans_ref === 1, JSON.stringify(rFin));
await c.query('UPDATE public.profiles SET cloud_voie = true WHERE id = $1', [CLOUD_U]);
console.log('\nD. L\'app et le serveur');
const rApp = await vente(jeton(CLOUD_U, APP));
ok('session de l\'app (pas un poste) : acceptée', !rApp.motif && rApp.sans_ref === 1, JSON.stringify(rApp));
const rSrv = (await comme({ role: 'service_role' }, 'SELECT public.enregistrer_ventes_relevees($1, $2::jsonb, $3) r', ['ebay', VENTE, CLOUD_U])).rows[0].r;
ok('rôle service (ebay-ventes-sync) : accepté', !rSrv.motif && rSrv.sans_ref === 1, JSON.stringify(rSrv));
console.log('\nE. Commandes Vinted');
const cPc = await commande(jeton(CLOUD_U, PC));
ok('PC d\'un compte au Cloud : refusées (« compte_cloud »)', cPc.motif === 'compte_cloud' && cPc.composees === 0, JSON.stringify(cPc));
const cCl = await commande(jeton(CLOUD_U, CLOUD));
ok('poste Cloud : acceptées (corps de prod)', !cCl.motif && cCl.recues === 1, JSON.stringify(cCl));
ok('compte sans Cloud : réponse identique à celle d\'avant', JSON.stringify(await commande(jeton(SANS_U, PC_SANS))) === JSON.stringify(avantCmdSansCloud));

console.log('\nF. Relevés (vinted_sync_runs)');
const runs = async (u) => (await c.query('SELECT kind, status, extension_build FROM public.vinted_sync_runs WHERE user_id = $1 ORDER BY id', [u])).rows;
const ouvrir = (claims, u, build, kind = 'annonces', status = 'running') => comme(claims,
  'INSERT INTO public.vinted_sync_runs (user_id, kind, platform, status, declencheur, extension_build) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
  [u, kind, 'leboncoin', status, 'cron', build]);
const insPc = await ouvrir(jeton(CLOUD_U, PC), CLOUD_U, '2026-11-12T10:00:00Z+ba13a51');
ok('PC d\'un compte au Cloud : relevé NON créé (aucune ligne rendue, aucune erreur)', insPc.rowCount === 0 && (await runs(CLOUD_U)).length === 0);
const insInconnu = await ouvrir(jeton(CLOUD_U, 'c2c2c2c2-0000-4000-8000-000000000008'), CLOUD_U, '2026-11-12T10:00:00Z+ba13a51');
ok('poste pas encore noté qui déclare un build d\'extension : relevé non créé', insInconnu.rowCount === 0);
const insCl = await ouvrir(jeton(CLOUD_U, CLOUD), CLOUD_U, '2026-11-14T11:39:28Z+b05bafe-cloud');
ok('poste Cloud : relevé créé', insCl.rowCount === 1);
const insApp = await ouvrir(jeton(CLOUD_U, APP), CLOUD_U, null, 'connexion', 'queued');
ok('app : demande (connexion, en file) créée', insApp.rowCount === 1);
const prisePc = await comme(jeton(CLOUD_U, PC), "UPDATE public.vinted_sync_runs SET status = 'running', extension_build = '2026-11-12T10:00:00Z+ba13a51' WHERE id = $1 AND status = 'queued'", [insApp.rows[0].id]);
ok('PC : la prise de la demande en file est ignorée (elle reste au poste Cloud)', prisePc.rowCount === 0 && (await runs(CLOUD_U)).find((r) => r.kind === 'connexion')?.status === 'queued');
const finPc = await comme(jeton(CLOUD_U, PC), "UPDATE public.vinted_sync_runs SET status = 'done' WHERE id = $1", [insCl.rows[0].id]);
ok('PC : la fin d\'un relevé du poste Cloud est ignorée', finPc.rowCount === 0 && (await runs(CLOUD_U)).find((r) => r.kind === 'annonces')?.status === 'running');
const priseCl = await comme(jeton(CLOUD_U, CLOUD), "UPDATE public.vinted_sync_runs SET status = 'running', extension_build = '2026-11-14T11:39:28Z+b05bafe-cloud' WHERE id = $1 AND status = 'queued'", [insApp.rows[0].id]);
ok('poste Cloud : prend la demande', priseCl.rowCount === 1);
const expApp = await comme(jeton(CLOUD_U, APP), "UPDATE public.vinted_sync_runs SET status = 'expired' WHERE id = $1", [insCl.rows[0].id]);
ok('app : clôt une ligne écrite par le poste Cloud (build non changé)', expApp.rowCount === 1);
const insSans = await ouvrir(jeton(SANS_U, PC_SANS), SANS_U, '2026-11-12T10:00:00Z+ba13a51');
ok('compte sans Cloud : le relevé du PC est créé comme avant', insSans.rowCount === 1);
const insSrv = await ouvrir({ role: 'service_role' }, CLOUD_U, null, 'annonces', 'queued');
ok('rôle service : écrit', insSrv.rowCount === 1);

console.log('\nG. Garde md5, rejeu, inverse');
await c.query(MIGRATION);
ok(`rejeu : sans effet ni erreur (garde posée une fois : ${apresPremiere} mentions, pas plus)`, apresPremiere > 0 && (await occurrences()) === apresPremiere);
await c.query(INVERSE);
for (const k of Object.keys(CORPS)) ok(`inverse : ${CORPS[k].f} rendu octet pour octet (md5 de prod)`, md5(await defLue(CORPS[k].f)) === CORPS[k].md5);
const apresInverse = await vente(jeton(CLOUD_U, PC));
ok('inverse : la vente du PC est de nouveau acceptée (comme avant)', !apresInverse.motif && apresInverse.sans_ref === 1);
ok('inverse : relevé du PC de nouveau créé', (await ouvrir(jeton(CLOUD_U, PC), CLOUD_U, '2026-11-12T10:00:00Z+ba13a51')).rowCount === 1);
await c.query("CREATE OR REPLACE FUNCTION public.commandes_vinted_noter(p_rows jsonb) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$");
let refus = '';
try { await c.query(MIGRATION); } catch (e) { refus = e.message; }
ok('un corps changé en prod depuis sa lecture : la migration s\'arrête (rien forcé)', /a changé en prod depuis sa lecture/.test(refus), refus || 'aucune erreur');

await c.end();
console.log(`\n${n - ko}/${n} vérifications`);
process.exit(ko ? 1 : 0);
