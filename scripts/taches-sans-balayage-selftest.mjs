#!/usr/bin/env node
// ═══ selftest:taches-sans-balayage — le VERROU de P1 (11/11/2026) ═══════════════════════════════════════════════════
// RÈGLE : une lecture récurrente du PARC (tous comptes) sur une grosse table a son index partiel, prouvé par EXPLAIN
// sur une base JETABLE ; un index par migration, CONCURRENTLY. Le registre (INDEX, LECTURES) nomme chaque lecture, son
// code exact, l'index qui la sert et sa migration.
//   A. LE CODE ÉPINGLÉ — les filtres de get-pending-jobs qui doivent correspondre aux prédicats des index : une lecture
//      réécrite (`->>` ou `?` au lieu de `->`, clé renommée, OR ajouté, borne retirée…) rougit ; il faut alors revalider
//      la forme contre l'index avec C. `rayonsVintedSansColis` (code mort, un troisième balayage) ne revient pas.
//   B. LES MIGRATIONS ÉPINGLÉES — une seule instruction CREATE INDEX CONCURRENTLY IF NOT EXISTS par fichier, expression
//      et prédicat exacts, aucune transaction, l'inverse en tête et dans supabase/rollbacks/ ; aucune autre migration ne
//      touche ces index.
//   C. LE PLAN, SUR UN POSTGRES 17 JETABLE (embedded-postgres, port 60000-61499, dossier fillsell-taches-sans-balayage-*,
//      tout est arrêté et effacé à la fin) : la table de prod, ses 11 index de prod, les réglages du planificateur de prod
//      (relus le 11/11), ~60 000 lignes dont 17 % de JSON hors ligne ; les textes PostgREST EXACTS (relus dans
//      pg_stat_statements le 11/11) en requêtes préparées nommées, paramètres non typés, comme PostgREST.
//      AVANT : le balayage de la prod (Seq Scan pour les refus, parcours de cross_post_jobs_created pour les preuves,
//      ≥ 5 000 pages) — ROUGE sans les index ; APRÈS (sans ANALYZE, puis avec) : le bon index, aucun Seq Scan, des pages
//      proportionnelles aux lignes rendues, les MÊMES lignes (JSON identique, ordre compris), et rien ne change en plan
//      générique forcé ; INVERSE : le balayage revient ; migrations rejouées : sans effet ; un index INVALID est sauté
//      par IF NOT EXISTS, vu par le contrôle de la procédure, réparé par l'inverse puis la migration.
//   D. LA PROCÉDURE DE PROD (scripts/preuves/20261111_p1_*) : lecture seule, jouée sur la base jetable (contrôle des
//      index, plans, relevés et écarts : ROUGE avant, VERT après).
// P1-bis (handler-watch ×2, ebay-api-worker) : une entrée de plus dans INDEX et dans LECTURES (code exact, texte
// PostgREST relu dans pg_stat_statements, jeux de paramètres), un décor si la table diffère ; le reste ne change pas.
// TSB_RACINE=<dossier> : lire le code, les migrations et les preuves ailleurs (copies mutantes) ; jamais la prod.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RACINE = process.env.TSB_RACINE ? path.resolve(process.env.TSB_RACINE) : ICI;
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8').replace(/\r\n/g, '\n');
const existe = (rel) => fs.existsSync(path.join(RACINE, rel));

let n = 0, ko = 0;
const ok = (cond, msg, detail) => {
  n++;
  if (cond) { console.log(`  ✓ ${msg}`); return true; }
  ko++;
  console.log(`  ✗ ${msg}${detail === undefined ? '' : `\n      ← ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700)}`}`);
  return false;
};
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

// ══ LE REGISTRE ════════════════════════════════════════════════════════════════════════════════════════════════════
const TABLE = 'cross_post_jobs';
const GPJ = 'supabase/functions/get-pending-jobs/index.ts';
/** Les index partiels qui servent les lectures du parc : migration, inverse, instruction exacte, définition en base. */
const INDEX = [
  { nom: 'cross_post_jobs_preuve_colis_idx', version: '20261111170000',
    migration: 'supabase/migrations/20261111170000_index_preuve_colis_vinted.sql',
    inverse: 'supabase/rollbacks/20261111170000_index_preuve_colis_vinted_INVERSE.sql',
    creation: `CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_preuve_colis_idx
      ON public.cross_post_jobs (created_at DESC)
      WHERE (platform_fields -> 'colis_pose_envoi') IS NOT NULL;`,
    definition: `CREATE INDEX cross_post_jobs_preuve_colis_idx ON public.cross_post_jobs USING btree (created_at DESC) WHERE ((platform_fields -> 'colis_pose_envoi'::text) IS NOT NULL)` },
  { nom: 'cross_post_jobs_preuve_marque_idx', version: '20261111170100',
    migration: 'supabase/migrations/20261111170100_index_preuve_marque_vinted.sql',
    inverse: 'supabase/rollbacks/20261111170100_index_preuve_marque_vinted_INVERSE.sql',
    creation: `CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_preuve_marque_idx
      ON public.cross_post_jobs (created_at DESC)
      WHERE (platform_fields -> 'marque_pose_envoi') IS NOT NULL;`,
    definition: `CREATE INDEX cross_post_jobs_preuve_marque_idx ON public.cross_post_jobs USING btree (created_at DESC) WHERE ((platform_fields -> 'marque_pose_envoi'::text) IS NOT NULL)` },
  { nom: 'cross_post_jobs_refus_par_rayon_idx', version: '20261111170200',
    migration: 'supabase/migrations/20261111170200_index_refus_par_rayon_vinted.sql',
    inverse: 'supabase/rollbacks/20261111170200_index_refus_par_rayon_vinted_INVERSE.sql',
    creation: `CREATE INDEX CONCURRENTLY IF NOT EXISTS cross_post_jobs_refus_par_rayon_idx
      ON public.cross_post_jobs (((platform_fields -> 'republish_snapshot') ->> 'catalog_id'))
      WHERE (platform_fields -> 'server_required_fields') IS NOT NULL;`,
    definition: `CREATE INDEX cross_post_jobs_refus_par_rayon_idx ON public.cross_post_jobs USING btree ((((platform_fields -> 'republish_snapshot'::text) ->> 'catalog_id'::text))) WHERE ((platform_fields -> 'server_required_fields'::text) IS NOT NULL)` },
];

// Les textes que PostgREST envoie (pg_stat_statements, 11/11 : queryid 7319884188374725879 et 8453384118533357995 ;
// les constantes de l'enveloppe, normalisées en $n dans pg_stat_statements, rendues ici telles que PostgREST les écrit).
const ENVELOPPE = ` )  SELECT null::bigint AS total_result_set, pg_catalog.count(_postgrest_t) AS page_total, coalesce(json_agg(_postgrest_t), '[]') AS body, nullif(current_setting('response.headers', true), '') AS response_headers, nullif(current_setting('response.status', true), '') AS response_status, '' AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t`;
const SQL_PREUVE = `WITH pgrst_source AS ( SELECT "public"."cross_post_jobs"."platform_fields"->$1 AS "preuve" FROM "public"."cross_post_jobs" WHERE  "public"."cross_post_jobs"."platform" = $2 AND  "public"."cross_post_jobs"."created_at" >= $3 AND NOT "public"."cross_post_jobs"."platform_fields"->$4 IS NULL   LIMIT $5 OFFSET $6` + ENVELOPPE;
const SQL_REFUS = `WITH pgrst_source AS ( SELECT "public"."cross_post_jobs"."platform_fields"->$1 AS "server_required_fields" FROM "public"."cross_post_jobs" WHERE  "public"."cross_post_jobs"."platform" = $2 AND  "public"."cross_post_jobs"."platform_fields"->$3->>$4 = $5 AND NOT "public"."cross_post_jobs"."platform_fields"->$6 IS NULL   LIMIT $7 OFFSET $8` + ENVELOPPE;

const DEPUIS = new Date(Date.now() - 30 * 86_400_000).toISOString(); // `depuis` de get-pending-jobs, figé pour tout le test
const RE_DEPUIS_30J = /const\s+depuis\s*=\s*new\s+Date\(\s*Date\.now\(\)\s*-\s*30\s*\*\s*86_400_000\s*\)\.toISOString\(\);/;
// Les rayons du décor : 150, 41, 39, 1 (+ une valeur JSON null), 1, 0 refus (rayon peuplé), rayon absent.
const RAYONS = [['1806', 150], ['2000', 41], ['2001', 39], ['2002', 2], ['3000', 1], ['1000', 0], ['424242', 0]];
const preuve = (cle, limite) => ({ params: [cle, 'vinted', DEPUIS, cle, limite, 0] });
/** Les lectures du parc : le code exact (A), le texte PostgREST et ses jeux de paramètres (C), l'index qui la sert. */
const LECTURES = [
  { nom: 'preuve colis du parc', fichier: GPJ, fonction: 'envoiColisProuveParc', borne: RE_DEPUIS_30J,
    index: 'cross_post_jobs_preuve_colis_idx', avant: 'cross_post_jobs_created', stmt: 'tsb_preuve', sql: SQL_PREUVE,
    chaine: `.from("cross_post_jobs")
      .select("preuve:platform_fields->colis_pose_envoi")
      .eq("platform", "vinted").gte("created_at", depuis)
      .not("platform_fields->colis_pose_envoi", "is", null)
      .limit(300)`,
    jeux: [{ nom: 'colis', ...preuve('colis_pose_envoi', 300) }] },
  { nom: 'preuve marque du parc', fichier: GPJ, fonction: 'envoiMarqueProuveParc', borne: RE_DEPUIS_30J,
    index: 'cross_post_jobs_preuve_marque_idx', avant: 'cross_post_jobs_created', stmt: 'tsb_preuve', sql: SQL_PREUVE,
    chaine: `.from("cross_post_jobs")
      .select("preuve:platform_fields->marque_pose_envoi")
      .eq("platform", "vinted").gte("created_at", depuis)
      .not("platform_fields->marque_pose_envoi", "is", null)
      .limit(300)`,
    jeux: [{ nom: 'marque', ...preuve('marque_pose_envoi', 300) }] },
  { nom: 'champs exigés par rayon', fichier: GPJ, fonction: null, borne: null,
    index: 'cross_post_jobs_refus_par_rayon_idx', avant: null, stmt: 'tsb_refus', sql: SQL_REFUS,
    chaine: `.from("cross_post_jobs")
      .select("platform_fields->server_required_fields")
      .eq("platform", "vinted")
      .filter("platform_fields->republish_snapshot->>catalog_id", "eq", cat)
      .not("platform_fields->server_required_fields", "is", null)
      .limit(40)`,
    jeux: RAYONS.map(([cat, refus]) => ({ nom: `rayon ${cat} (${refus} refus)`, refus,
      params: ['server_required_fields', 'vinted', 'republish_snapshot', 'catalog_id', cat, 'server_required_fields', 40, 0] })) },
];
// Une lecture « complète » rend moins de lignes que sa limite : elle a tout lu — c'est elle qui balaie aujourd'hui.
const limiteDe = (j) => j.params.find((p) => typeof p === 'number' && p > 0);
const complete = (v) => v.p.lignes < limiteDe(v.j);

// ══ Le texte du code : chaque lecture `.from("<table>")…` compactée (commentaires et blancs hors chaînes retirés) ══════
function compacterDepuis(src, i) {
  let out = '', prof = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const f = src.indexOf('*/', i + 2); i = f < 0 ? src.length : f + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '(' || c === '[' || c === '{') prof++;
    if (c === ')' || c === ']' || c === '}') { if (prof === 0) break; prof--; }
    if (prof === 0 && (c === ';' || c === ',')) break;
    if (!/\s/.test(c)) out += c;
    i++;
  }
  return out;
}
/** Les lectures de la table dans un source : { ligne, texte } (texte = la chaîne d'appels compactée, jusqu'au « ; »). */
function lecturesDe(src, table) {
  const marque = `.from("${table}")`;
  const res = [];
  for (let i = src.indexOf(marque); i >= 0; i = src.indexOf(marque, i + 1)) {
    res.push({ ligne: src.slice(0, i).split('\n').length, texte: compacterDepuis(src, i) });
  }
  return res;
}
const compacter = (chaine) => compacterDepuis(chaine, 0);

// ══ A. LE CODE ÉPINGLÉ ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('A. Le code de get-pending-jobs : les filtres qui doivent correspondre aux prédicats des index');
const sources = new Map();
const source = (f) => { if (!sources.has(f)) sources.set(f, existe(f) ? lire(f) : ''); return sources.get(f); };
const lignesDuCode = {};
for (const L of LECTURES) {
  const src = source(L.fichier);
  const voulu = compacter(L.chaine);
  const trouves = lecturesDe(src, TABLE).filter((w) => w.texte === voulu);
  lignesDuCode[L.nom] = trouves.map((w) => `${L.fichier}:${w.ligne}`).join(', ');
  ok(trouves.length === 1, `${L.nom} : la lecture exacte est dans le code, une fois (${lignesDuCode[L.nom] || 'absente'})`,
    trouves.length ? `${trouves.length} fois` : `attendu : ${voulu}`);
  if (L.fonction) {
    const debut = src.indexOf(`async function ${L.fonction}(`);
    const fin = debut < 0 ? -1 : src.indexOf('\n}\n', debut);
    const corps = debut < 0 ? '' : src.slice(debut, fin < 0 ? undefined : fin);
    ok(debut >= 0 && L.borne.test(corps) && lecturesDe(corps, TABLE).some((w) => w.texte === voulu),
      `${L.nom} : dans ${L.fonction}, bornée à 30 jours (const depuis = now − 30 j)`);
  }
}
{
  // Cohérence registre : les clés des jeux de C sont celles du code (une clé renommée d'un seul côté rougit ici).
  const incoherents = [];
  for (const L of LECTURES) for (const j of L.jeux) {
    const cles = j.params.filter((p) => typeof p === 'string' && /^[a-z_]+$/.test(p) && p !== 'vinted');
    for (const k of cles) if (!L.chaine.includes(k)) incoherents.push(`${L.nom} : ${k}`);
    const limite = j.params.find((p) => typeof p === 'number' && p > 0);
    if (!L.chaine.includes(`.limit(${limite})`)) incoherents.push(`${L.nom} : limit ${limite}`);
  }
  ok(incoherents.length === 0, 'registre : les clés jsonb et la limite des jeux de C sont celles du code', incoherents);
  const src = source(GPJ);
  const appels = [...src.matchAll(/rayonsVintedSansColis\s*\(/g)].length;
  ok(appels === 1 && /async function rayonsVintedSansColis\s*\(/.test(src),
    'rayonsVintedSansColis (code mort, un troisième balayage) n\'est appelée nulle part — si elle revient : au registre, avec son index prouvé',
    `${appels} occurrence(s)`);
}

// ══ B. LES MIGRATIONS ÉPINGLÉES ════════════════════════════════════════════════════════════════════════════════════
console.log('B. Les migrations : une instruction CONCURRENTLY par fichier, expression et prédicat exacts, inverse prêt');
const sansCommentaires = (sql) => sql.replace(/--[^\n]*/g, '').trim();
const instructions = (sql) => sansCommentaires(sql).split(';').map((s) => s.trim()).filter(Boolean);
const migrations = existe('supabase/migrations') ? fs.readdirSync(path.join(RACINE, 'supabase/migrations')).filter((f) => f.endsWith('.sql')) : [];
for (const ix of INDEX) {
  const m = existe(ix.migration) ? lire(ix.migration) : '';
  const inst = instructions(m);
  ok(inst.length === 1 && norm(`${inst[0]};`) === norm(ix.creation), `${ix.version} : une seule instruction, exactement « ${norm(ix.creation).slice(0, 70)}… »`,
    inst.length === 1 ? norm(inst[0]) : `${inst.length} instruction(s)`);
  ok(m && !/\b(BEGIN|COMMIT|ROLLBACK|START\s+TRANSACTION|SAVEPOINT)\b/i.test(sansCommentaires(m)), `${ix.version} : aucune transaction (CONCURRENTLY la refuse)`);
  ok(m.includes(`-- Inverse : DROP INDEX CONCURRENTLY IF EXISTS public.${ix.nom};`), `${ix.version} : l'inverse en tête (DROP INDEX CONCURRENTLY IF EXISTS)`);
  const inv = existe(ix.inverse) ? instructions(lire(ix.inverse)) : [];
  ok(inv.length === 1 && norm(`${inv[0]};`) === `DROP INDEX CONCURRENTLY IF EXISTS public.${ix.nom};`, `${ix.version} : supabase/rollbacks/ porte l'inverse, seul`);
  const memeVersion = migrations.filter((f) => f.startsWith(ix.version));
  const autres = migrations.filter((f) => `supabase/migrations/${f}` !== ix.migration && lire(`supabase/migrations/${f}`).includes(ix.nom));
  ok(memeVersion.length === 1 && autres.length === 0, `${ix.version} : version unique, aucune autre migration ne touche ${ix.nom}`, { memeVersion, autres });
}
ok(LECTURES.every((L) => INDEX.some((ix) => ix.nom === L.index)) && INDEX.every((ix) => LECTURES.some((L) => L.index === ix.nom)),
  'registre : chaque lecture a son index, chaque index sert une lecture');

// ══ C. LE PLAN, SUR UN POSTGRES 17 JETABLE ═════════════════════════════════════════════════════════════════════════
console.log('C. Sur un Postgres 17 JETABLE : avant = balayage, après = le bon index, mêmes lignes');
// La forme de la table et ses index, relus en prod le 11/11/2026 (information_schema.columns, pg_indexes).
const DDL_TABLE = `CREATE TABLE public.cross_post_jobs (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL,
  inventaire_id bigint, platform text NOT NULL, status text DEFAULT 'pending'::text NOT NULL, photo_option text DEFAULT 'standard'::text NOT NULL,
  bulk_batch_id uuid, title text, description text, price numeric, photos jsonb, platform_listing_id text, generated_at timestamptz,
  published_at timestamptz, error text, created_at timestamptz DEFAULT now(), listing_url text, last_checked_at timestamptz,
  sold_at timestamptz, platform_fields jsonb, action text DEFAULT 'publish'::text NOT NULL, handler_build text, reservation_id uuid,
  reservation_settled_at timestamptz, voie text DEFAULT 'extension'::text NOT NULL, vu_en_ligne_le timestamptz,
  CONSTRAINT cross_post_jobs_pkey PRIMARY KEY (id))`;
const INDEX_DE_PROD = [
  `CREATE INDEX cross_post_jobs_api_pending_idx ON public.cross_post_jobs USING btree (created_at) WHERE ((voie = 'api'::text) AND (status = 'pending'::text))`,
  `CREATE INDEX cross_post_jobs_bulk_batch ON public.cross_post_jobs USING btree (bulk_batch_id) WHERE (bulk_batch_id IS NOT NULL)`,
  `CREATE INDEX cross_post_jobs_created ON public.cross_post_jobs USING btree (created_at DESC)`,
  `CREATE INDEX cross_post_jobs_inventaire ON public.cross_post_jobs USING btree (inventaire_id) WHERE (inventaire_id IS NOT NULL)`,
  `CREATE INDEX cross_post_jobs_reservation ON public.cross_post_jobs USING btree (reservation_id) WHERE (reservation_id IS NOT NULL)`,
  `CREATE INDEX cross_post_jobs_sans_fiche_vivantes ON public.cross_post_jobs USING btree (user_id, platform, btrim(platform_listing_id)) WHERE ((inventaire_id IS NULL) AND (status = ANY (ARRAY['published'::text, 'pending'::text, 'needs_user'::text])))`,
  `CREATE INDEX cross_post_jobs_signal_vendu_idx ON public.cross_post_jobs USING btree (user_id) WHERE ((status = 'published'::text) AND ((platform_fields ->> 'sale_signal'::text) = 'sold'::text))`,
  `CREATE UNIQUE INDEX cross_post_jobs_un_seul_publish_actif_par_article_plateforme ON public.cross_post_jobs USING btree (inventaire_id, platform) WHERE ((action = 'publish'::text) AND (status = ANY (ARRAY['pending'::text, 'processing'::text, 'needs_user'::text])) AND (inventaire_id IS NOT NULL))`,
  `CREATE INDEX cross_post_jobs_user_created_idx ON public.cross_post_jobs USING btree (user_id, created_at DESC, id DESC)`,
  `CREATE INDEX cross_post_jobs_user_status ON public.cross_post_jobs USING btree (user_id, status)`,
];
// Réglages du planificateur de prod (pg_settings, 11/11) ; effective_io_concurrency (200) n'existe pas sous Windows et
// n'entre pas dans les coûts. shared_buffers : le tas reste sous shared_buffers/4, comme en prod (16 997 < 65 536 pages),
// donc aucun parcours synchronisé ne déplace le début d'un Seq Scan.
const REGLAGES = ['random_page_cost=1.1', 'seq_page_cost=1', 'cpu_tuple_cost=0.01', 'cpu_index_tuple_cost=0.005', 'cpu_operator_cost=0.0025',
  'effective_cache_size=6GB', 'default_statistics_target=100', 'jit=off', 'max_parallel_workers_per_gather=1', 'work_mem=12MB',
  'plan_cache_mode=auto', 'shared_buffers=256MB', 'shared_preload_libraries=pg_stat_statements',
  'autovacuum=off']; // autovacuum coupé : aucune statistique neuve en douce entre deux phases (C4 se joue SANS ANALYZE)
const N = 60_000;

const sqlLit = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

let EmbeddedPostgres, pg;
try { ({ default: EmbeddedPostgres } = await import('embedded-postgres')); pg = (await import('pg')).default; }
catch { ok(false, 'embedded-postgres et pg introuvables', 'npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3'); }

const PREUVES = {
  index: 'scripts/preuves/20261111_p1_index.sql', releve: 'scripts/preuves/20261111_p1_releve.sql',
  ecarts: 'scripts/preuves/20261111_p1_ecarts.mjs',
  plans: { cross_post_jobs_preuve_colis_idx: 'scripts/preuves/20261111_p1_plan_colis.sql',
    cross_post_jobs_preuve_marque_idx: 'scripts/preuves/20261111_p1_plan_marque.sql',
    cross_post_jobs_refus_par_rayon_idx: 'scripts/preuves/20261111_p1_plan_refus.sql' },
};

if (EmbeddedPostgres && pg) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'fillsell-taches-sans-balayage-'));
  const port = 60000 + Math.floor(Math.random() * 1500);
  const base = new EmbeddedPostgres({ databaseDir: dossier, user: 'postgres', password: 'balayage', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: REGLAGES.flatMap((r) => ['-c', r]),
    onLog: () => {}, onError: () => {} });
  const clients = [];
  const ouvrir = async () => {
    const c = new pg.Client({ connectionString: `postgres://postgres:balayage@127.0.0.1:${port}/postgres` });
    await c.connect(); c.on('notice', () => {}); clients.push(c); return c;
  };
  try {
    await base.initialise();
    await base.start();
    const admin = await ouvrir();    // la session de la CLI : décor, migrations, inverses
    const pgrst = await ouvrir();    // la session de PostgREST : requêtes préparées NOMMÉES, gardées d'une phase à l'autre
    const generique = await ouvrir(); // plan générique forcé (au pire, le chemin d'aujourd'hui)
    await generique.query('SET plan_cache_mode = force_generic_plan');
    const q = async (sql, p = []) => (await admin.query(sql, p)).rows;

    // ── Le décor ────────────────────────────────────────────────────────────────────────────────────────────────────
    await q('CREATE SCHEMA extensions');
    await q('CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions');
    await q(DDL_TABLE);
    for (const d of INDEX_DE_PROD) await q(d);
    // Les refus (server_required_fields) : rayons à 150, 41, 39, 1 + une valeur JSON null, 25 rayons à 1-4, et des refus
    // d'une autre plateforme ; rayon en nombre ou en texte (->> rend le même texte) ; la moitié environ hors ligne.
    const refus = [], pris = new Set();
    const ajouter = (g, platform, cat, srf, gros) => { while (pris.has(g)) g++; pris.add(g); refus.push({ rg: g, platform, cat, srf, gros }); };
    for (let k = 0; k < 150; k++) ajouter(7 + 397 * k, 'vinted', 1806, [{ key: 'package_size' }, { key: 'model' }], k % 2 === 0);
    for (let k = 0; k < 41; k++) ajouter(13 + 1451 * k, 'vinted', '2000', [{ key: 'ram' }], k % 3 === 0);
    for (let k = 0; k < 39; k++) ajouter(17 + 1523 * k, 'vinted', 2001, [{ key: 'storage' }], k % 2 === 1);
    ajouter(30001, 'vinted', '2002', [{ key: 'charger' }], true);
    ajouter(30002, 'vinted', '2002', null, false); // valeur JSON null : `->` rend un jsonb null, pas un NULL SQL
    for (let k = 0; k < 20; k++) ajouter(19 + 2999 * k, 'leboncoin', 1806, [{ key: 'package_size' }], false);
    for (let r = 0; r < 25; r++) for (let i = 0; i < 1 + (r % 4); i++) ajouter(23 + 233 * (r * 4 + i), 'vinted', 3000 + r, [{ key: `champ_${r}` }], i % 2 === 0);
    await q(`CREATE TABLE public._blobs AS SELECT b.n, (SELECT string_agg(md5(b.n || ':' || i), '') FROM generate_series(1, 120) i) AS b
             FROM generate_series(0, 399) b(n)`);
    await q(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, created_at, title, price, voie, platform_fields)
      SELECT ('00000000-0000-4000-8000-' || lpad((g % 52)::text, 12, '0'))::uuid, g,
             coalesce(r.platform, CASE WHEN g % 3 < 2 THEN 'vinted' WHEN g % 9 = 2 THEN 'leboncoin' WHEN g % 9 = 5 THEN 'ebay' ELSE 'beebs' END),
             (ARRAY['published','published','published','published','pending','failed','needs_user','cancelled'])[1 + g % 8],
             CASE WHEN g % 10 < 7 THEN 'republish' ELSE 'publish' END,
             now() - interval '60 days' + g * (interval '60 days' / $2::int), 'Annonce ' || g, 10 + g % 90, 'extension',
             jsonb_build_object('republish_step', CASE WHEN g % 4 = 0 THEN 'captured' ELSE 'deleted' END,
                                'republish_snapshot', jsonb_build_object('catalog_id', coalesce(r.cat, to_jsonb(1000 + g % 397)), 'title', 'Annonce ' || g))
             || CASE WHEN r.rg IS NOT NULL THEN jsonb_build_object('server_required_fields', r.srf) ELSE '{}'::jsonb END
             || CASE WHEN g % 6 = 0 OR coalesce(r.gros, false) THEN jsonb_build_object('pad', bl.b) ELSE '{}'::jsonb END
      FROM generate_series(1, $2::int) g
      LEFT JOIN jsonb_to_recordset($1::jsonb) AS r(rg int, platform text, cat jsonb, srf jsonb, gros boolean) ON r.rg = g
      LEFT JOIN public._blobs bl ON bl.n = g % 400
      ORDER BY g`, [JSON.stringify(refus), N]);
    await q('ANALYZE public.cross_post_jobs');
    {
      const [t] = await q(`SELECT c.relpages, pg_relation_size(c.reltoastrelid) / 8192 AS toast,
          (SELECT setting::int FROM pg_settings WHERE name = 'shared_buffers') AS nbuffers,
          (SELECT count(*) FROM public.cross_post_jobs) AS lignes,
          (SELECT count(*) FILTER (WHERE platform = 'vinted') FROM public.cross_post_jobs) AS vinted,
          (SELECT count(*) FILTER (WHERE pg_column_size(platform_fields) > 2000) FROM public.cross_post_jobs) AS hors_ligne,
          (SELECT count(*) FILTER (WHERE (platform_fields -> 'server_required_fields') IS NOT NULL) FROM public.cross_post_jobs) AS refus
        FROM pg_class c WHERE c.oid = 'public.cross_post_jobs'::regclass`);
      const parRayon = Object.fromEntries((await q(`SELECT platform_fields -> 'republish_snapshot' ->> 'catalog_id' AS cat, count(*)::int AS n
        FROM public.cross_post_jobs WHERE platform = 'vinted' AND (platform_fields -> 'server_required_fields') IS NOT NULL GROUP BY 1`)).map((r) => [r.cat, r.n]));
      const rayonsOk = RAYONS.every(([cat, attendu]) => (parRayon[cat] ?? 0) === attendu);
      ok(Number(t.lignes) === N && Math.abs(Number(t.vinted) / N - 2 / 3) < 0.02 && Number(t.hors_ligne) / N > 0.16 && Number(t.toast) > 2000 && rayonsOk,
        `décor : ${N} lignes, ${Math.round(100 * t.vinted / N)} % Vinted, ${Math.round(100 * t.hors_ligne / N)} % de JSON hors ligne (TOAST ${t.toast} pages), ` +
        `${t.refus} refus (rayons ${RAYONS.map(([c, a]) => `${c}:${a}`).join(' ')}) ; 11 index de prod`, { t, parRayon });
      ok(Number(t.relpages) < Number(t.nbuffers) / 4, `le tas (${t.relpages} pages) sous shared_buffers/4 (${t.nbuffers / 4}), comme en prod : pas de parcours synchronisé`);
    }

    // ── Les appels de « PostgREST » et leurs plans ───────────────────────────────────────────────────────────────────
    const appeler = async (client, L, params) => (await client.query({ name: L.stmt, text: L.sql, values: params })).rows[0].body;
    const expliquer = async (client, L, params) =>
      (await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE ${L.stmt}(${params.map(sqlLit).join(', ')})`)).rows[0]['QUERY PLAN'][0].Plan;
    const analyser = (plan) => {
      const noeuds = [];
      (function marcher(p) { noeuds.push(p); for (const e of p.Plans ?? []) marcher(e); })(plan);
      const scan = noeuds.find((p) => p['Relation Name'] === TABLE) ?? {};
      const index = scan['Node Type'] === 'Bitmap Heap Scan'
        ? noeuds.filter((p) => p['Node Type'] === 'Bitmap Index Scan').map((p) => p['Index Name']).join('+')
        : scan['Index Name'] ?? null;
      return { types: noeuds.map((p) => p['Node Type']), scan: scan['Node Type'], index, lignes: scan['Actual Rows'] ?? 0,
        pages: (plan['Shared Hit Blocks'] ?? 0) + (plan['Shared Read Blocks'] ?? 0) };
    };
    /** Huit appels par requête préparée (au-delà des cinq plans « custom » : le cache de plans a choisi), puis, pour
     *  chaque jeu, la réponse (le JSON rendu) et le plan exécuté (EXPLAIN ANALYZE BUFFERS de la requête préparée). */
    const photographier = async (client = pgrst) => {
      const tous = LECTURES.flatMap((L) => L.jeux.map((j) => ({ L, j })));
      for (const stmt of new Set(LECTURES.map((L) => L.stmt))) {
        const siens = tous.filter((x) => x.L.stmt === stmt);
        for (let i = 0; i < 8; i++) await appeler(client, siens[i % siens.length].L, siens[i % siens.length].j.params);
      }
      const res = {};
      for (const { L, j } of tous) {
        const corps = JSON.stringify(await appeler(client, L, j.params));
        res[`${L.nom} / ${j.nom}`] = { L, j, corps, p: analyser(await expliquer(client, L, j.params)) };
      }
      return res;
    };
    const resume = (r) => Object.entries(r).map(([k, v]) => `${k} : ${v.p.scan}${v.p.index ? ` ${v.p.index}` : ''}, ${v.p.pages} p, ${v.p.lignes} l`).join(' | ');
    const defaut = (photo, titre) => {
      const pris = Object.entries(photo).filter(([, v]) => v.p.index && INDEX.some((ix) => v.p.index.includes(ix.nom)));
      ok(pris.length === 0, `${titre} : aucun des trois index n'est pris`, pris.map(([k, v]) => `${k} : ${v.p.index}`));
      const pasBalaye = Object.entries(photo).filter(([, v]) => complete(v) && !(v.p.pages >= 5000
        && (v.L.avant ? v.p.index === v.L.avant : v.p.scan === 'Seq Scan')));
      ok(pasBalaye.length === 0, `${titre} : le balayage de la prod — refus par Seq Scan, preuves par cross_post_jobs_created, ≥ 5 000 pages chacune`,
        pasBalaye.map(([k, v]) => `${k} : ${v.p.scan} ${v.p.index ?? ''} ${v.p.pages} p`));
    };
    const servi = (photo, titre, plafond = (l) => 10 + 8 * l) => {
      const mal = Object.entries(photo).filter(([, v]) => v.p.index !== v.L.index || v.p.types.includes('Seq Scan') || v.p.pages > plafond(v.p.lignes));
      ok(mal.length === 0, `${titre} : chaque lecture prend SON index, aucun Seq Scan, pages ≤ 10 + 8 × lignes rendues`,
        mal.map(([k, v]) => `${k} : ${v.p.types.join('>')} ${v.p.index} ${v.p.pages} p / ${v.p.lignes} l`));
    };
    const memes = (a, b, titre) => {
      const diff = Object.keys(a).filter((k) => a[k].corps !== b[k]?.corps);
      ok(diff.length === 0, `${titre} : mêmes lignes rendues, JSON identique ordre compris (${Object.keys(a).length} jeux)`,
        diff.map((k) => `${k} : ${a[k].corps.slice(0, 120)} ≠ ${String(b[k]?.corps).slice(0, 120)}`));
    };
    /** Joue un fichier SQL seul (une instruction : protocole simple, hors transaction, comme `db query -f`) ; un fichier
     *  absent ou refusé par Postgres (ex. CONCURRENTLY dans une transaction) rougit, et la suite continue sans lui. */
    const jouer = async (fichier) => {
      if (!existe(fichier)) return ok(false, `${fichier} : absent`);
      try { await admin.query(lire(fichier)); return true; } catch (e) {
        await admin.query('ROLLBACK').catch(() => {}); // un BEGIN du fichier laisserait la session dans une transaction avortée
        return ok(false, `${fichier} : refusé par Postgres`, e.message);
      }
    };
    const etatIndex = async () => q(`SELECT c.relname AS nom, x.indisvalid AS valide, pg_get_indexdef(c.oid) AS def
      FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid WHERE x.indrelid = 'public.cross_post_jobs'::regclass ORDER BY 1`);
    const releve = async () => {
      const ids = await q(`SELECT queryid::text AS id, query FROM extensions.pg_stat_statements WHERE query LIKE 'WITH pgrst_source AS ( SELECT "public"."cross_post_jobs"."platform_fields"->$1 AS %'`);
      const id = (alias) => ids.find((r) => r.query.includes(`AS "${alias}" FROM`))?.id;
      const sql = lire(PREUVES.releve).replace('7319884188374725879', id('preuve') ?? '0').replace('8453384118533357995', id('server_required_fields') ?? '0');
      return q(sql);
    };

    // C1. AVANT, état de la prod (aucune preuve colis ni marque) : le défaut se reproduit.
    const r0 = await releve();
    const A0 = await photographier();
    const r1 = await releve();
    console.log(`  — avant : ${resume(A0)}`);
    defaut(A0, 'C1 avant (comme la prod : 0 preuve)');

    // C2. AVANT, avec les cas limites : preuves colis 1 + 1 valeur JSON null + 1 de 45 j + 1 autre plateforme ; preuves
    // marque 301 (> la limite de 300, insérées dans le désordre, paires à la même date) + 5 anciennes + 3 autres plateformes.
    const s1 = [];
    const pfPreuve = (cle, v) => ({ [cle]: v, republish_snapshot: { catalog_id: 1806 } });
    s1.push({ platform: 'vinted', age: 5, pf: pfPreuve('colis_pose_envoi', { le: '2026-11-11T10:00:00Z', http: 200 }), gros: true });
    s1.push({ platform: 'vinted', age: 50, pf: pfPreuve('colis_pose_envoi', null), gros: false });
    s1.push({ platform: 'vinted', age: 45 * 24, pf: pfPreuve('colis_pose_envoi', { http: 200 }), gros: false });
    s1.push({ platform: 'leboncoin', age: 3, pf: pfPreuve('colis_pose_envoi', { http: 200 }), gros: false });
    const ordre = Array.from({ length: 301 }, (_, k) => k).sort((a, b) => ((a * 7919) % 301) - ((b * 7919) % 301));
    for (const k of ordre) s1.push({ platform: 'vinted', age: 1 + 2 * Math.floor(k / 2), pf: pfPreuve('marque_pose_envoi', { id: k, http: 200 }), gros: k % 5 === 0 });
    for (let k = 0; k < 5; k++) s1.push({ platform: 'vinted', age: (31 + k) * 24, pf: pfPreuve('marque_pose_envoi', { id: 1000 + k }), gros: false });
    for (let k = 0; k < 3; k++) s1.push({ platform: 'beebs', age: 2 + k, pf: pfPreuve('marque_pose_envoi', { id: 2000 + k }), gros: false });
    s1.forEach((s, i) => { s.ord = i; });
    await q(`INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, status, action, created_at, title, voie, platform_fields)
      SELECT '00000000-0000-4000-8000-000000000001'::uuid, NULL, s.platform, 'published', 'republish', now() - make_interval(hours => s.age), 'S1', 'extension',
             s.pf || CASE WHEN s.gros THEN jsonb_build_object('pad', (SELECT b FROM public._blobs WHERE n = s.ord % 400)) ELSE '{}'::jsonb END
      FROM jsonb_to_recordset($1::jsonb) AS s(platform text, age int, pf jsonb, gros boolean, ord int)`, [JSON.stringify(s1)]);
    const A1 = await photographier();
    const G1 = await photographier(generique);
    {
      const corps = (k) => JSON.parse(A1[k].corps);
      ok(corps('preuve colis du parc / colis').length === 2 && corps('preuve marque du parc / marque').length === 300
        && corps('preuve colis du parc / colis').some((r) => r.preuve === null),
        'C2 avant (cas limites) : colis = 2 lignes (dont la valeur JSON null), marque = 300 (la limite), rien de vieux ni d\'ailleurs');
      const tailles = RAYONS.map(([cat, n]) => corps(`champs exigés par rayon / rayon ${cat} (${n} refus)`).length);
      ok(tailles.join(',') === RAYONS.map(([, nb]) => Math.min(nb, 40)).join(','), `C2 avant : refus rendus par rayon = ${tailles.join(', ')} (40 au plus)`);
    }
    defaut(A1, 'C2 avant (cas limites)');

    // C3. Les trois migrations, chacune seule (texte du fichier, une instruction), depuis une autre session.
    const avantMig = await etatIndex();
    for (const ix of INDEX) await jouer(ix.migration);
    {
      const apres = await etatIndex();
      const neufs = apres.filter((r) => !avantMig.some((a) => a.nom === r.nom));
      ok(neufs.length === 3 && neufs.every((r) => r.valide) && INDEX.every((ix) => neufs.find((r) => r.nom === ix.nom)?.def === ix.definition),
        'C3 les trois migrations : trois index EN PLUS, valides (indisvalid), définitions exactes ; aucun index de prod touché', neufs);
      ok(avantMig.every((a) => apres.some((r) => r.nom === a.nom && r.def === a.def && r.valide)), 'C3 les 11 index de prod sont intacts');
    }

    // C4. APRÈS, sans ANALYZE (en prod, aucune statistique neuve juste après la création), sur la même session « PostgREST ».
    const B1 = await photographier();
    console.log(`  — après : ${resume(B1)}`);
    servi(B1, 'C4 après, sans ANALYZE');
    memes(A1, B1, 'C4 après, sans ANALYZE');
    const G1b = await photographier(generique);
    memes(G1, G1b, 'C4 plan générique forcé');
    ok(Object.keys(G1).every((k) => G1[k].p.scan === G1b[k].p.scan && G1[k].p.index === G1b[k].p.index),
      'C4 plan générique forcé : le même plan qu\'avant (au pire, le chemin d\'aujourd\'hui, jamais pire)');
    {
      const gain = Object.entries(A1).filter(([, v]) => complete(v)).map(([k, v]) => [k, v.p.pages / Math.max(B1[k].p.pages, 1)]);
      ok(gain.every(([, g]) => g >= 20), `C4 pages divisées par ${Math.round(Math.min(...gain.map(([, g]) => g)))} au moins sur les lectures qui balayaient`, gain);
    }

    // C5. Après ANALYZE : rien ne change.
    await q('ANALYZE public.cross_post_jobs');
    const B1a = await photographier();
    servi(B1a, 'C5 après ANALYZE');
    memes(A1, B1a, 'C5 après ANALYZE');

    // C6. Retour à l'état de la prod (cas limites retirés) : les preuves ne lisent presque rien.
    await q(`DELETE FROM public.cross_post_jobs WHERE title = 'S1'`);
    await q('VACUUM (ANALYZE) public.cross_post_jobs');
    const r2 = await releve();
    const B0 = await photographier();
    const r3 = await releve();
    servi(B0, 'C6 après, comme la prod (0 preuve)', (l) => 10 + 8 * l);
    memes(A0, B0, 'C6 après, comme la prod');
    ok(['preuve colis du parc / colis', 'preuve marque du parc / marque'].every((k) => B0[k].p.pages <= 10),
      `C6 preuves sans preuve : ${B0['preuve colis du parc / colis'].p.pages} et ${B0['preuve marque du parc / marque'].p.pages} pages (avant : ${A0['preuve colis du parc / colis'].p.pages} et ${A0['preuve marque du parc / marque'].p.pages})`);

    // C7. INVERSE : le balayage revient, les lignes rendues ne changent pas.
    for (const ix of [...INDEX].reverse()) await jouer(ix.inverse);
    ok((await etatIndex()).length === avantMig.length, 'C7 inverses joués : les trois index sont partis, les 11 de prod restent');
    const I0 = await photographier();
    defaut(I0, 'C7 après l\'inverse');
    memes(A0, I0, 'C7 après l\'inverse');

    // C8. Les migrations rejouées deux fois : IF NOT EXISTS, sans effet la deuxième fois.
    for (const ix of INDEX) await jouer(ix.migration);
    for (const ix of INDEX) await jouer(ix.migration);
    {
      const e = await etatIndex();
      ok(e.length === avantMig.length + 3 && INDEX.every((ix) => e.filter((r) => r.nom === ix.nom).length === 1 && e.find((r) => r.nom === ix.nom).valide),
        'C8 migrations rejouées deux fois : chaque index une fois, valide');
    }
    const R0b = await photographier();
    servi(R0b, 'C8 après les migrations rejouées');
    memes(A0, R0b, 'C8 après les migrations rejouées');

    // C9. Un index INVALID (construction échouée) : IF NOT EXISTS le saute sans rien dire ; le contrôle de la procédure
    // le voit ; l'inverse puis la migration le réparent.
    const cible = INDEX[2];
    await q(`UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'public.${cible.nom}'::regclass`);
    await jouer(cible.migration);
    const ctrl = async () => Object.fromEntries((await q(lire(PREUVES.index))).map((r) => [r.nom, r]));
    {
      const c = await ctrl();
      const p = (await photographier())['champs exigés par rayon / rayon 424242 (0 refus)'].p;
      ok(c[cible.nom]?.existe === true && c[cible.nom]?.valide === false && p.scan === 'Seq Scan',
        'C9 index INVALID : la migration rejouée le saute (IF NOT EXISTS), le planificateur l\'ignore (Seq Scan), le contrôle dit valide = false', { ctrl: c[cible.nom], p });
    }
    await jouer(cible.inverse);
    await jouer(cible.migration);
    {
      const c = await ctrl();
      ok(INDEX.every((ix) => c[ix.nom]?.existe && c[ix.nom]?.valide && c[ix.nom]?.pret && c[ix.nom]?.definition_attendue),
        'C9 abandon propre (inverse) puis migration : valide, définition attendue (contrôle de la procédure)', c[cible.nom]);
      servi(await photographier(), 'C9 après réparation');
    }

    // ══ D. LA PROCÉDURE DE PROD, JOUÉE SUR LA BASE JETABLE ═══════════════════════════════════════════════════════════
    console.log('D. La procédure de prod (scripts/preuves/20261111_p1_*) : lecture seule, jouée sur la base jetable');
    {
      const fichiers = [PREUVES.index, PREUVES.releve, ...Object.values(PREUVES.plans)];
      const sansChaines = (sql) => sansCommentaires(sql).replace(/'(?:[^']|'')*'/g, "''");
      const ecrit = fichiers.filter((f) => !existe(f) || /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|VACUUM|ANALYZE|COPY|SET|DO|CALL)\b/i.test(sansChaines(lire(f))));
      ok(ecrit.length === 0, `D les ${fichiers.length} requêtes de preuve existent et ne font que lire`, ecrit);
      const defs = INDEX.every((ix) => lire(PREUVES.index).includes(ix.definition.replace(/'/g, "''")));
      ok(defs, 'D le contrôle des index porte les définitions épinglées ici');
      const plans = {};
      for (const [nom, f] of Object.entries(PREUVES.plans)) plans[nom] = (await q(lire(f))).map((r) => r['QUERY PLAN']).join('\n');
      ok(Object.entries(plans).every(([nom, t]) => new RegExp(`(Index Scan using|Bitmap Index Scan on) ${nom}\\b`).test(t) && !/Seq Scan/.test(t)),
        'D les trois EXPLAIN de la procédure montrent le bon index (et aucun Seq Scan) quand les index sont là', plans);
      for (const ix of [...INDEX].reverse()) await jouer(ix.inverse);
      const sans = {};
      for (const [nom, f] of Object.entries(PREUVES.plans)) sans[nom] = (await q(lire(f))).map((r) => r['QUERY PLAN']).join('\n');
      ok(/Index Scan using cross_post_jobs_created\b/.test(sans.cross_post_jobs_preuve_colis_idx) && /Seq Scan on cross_post_jobs/.test(sans.cross_post_jobs_refus_par_rayon_idx),
        'D … et le chemin d\'aujourd\'hui sans eux (cross_post_jobs_created, Seq Scan)', sans);
      const { ecarts, verdict } = await import(pathToFileURL(path.join(RACINE, PREUVES.ecarts)).href);
      const avant = ecarts(r0, r1), apres = ecarts(r2, r3);
      const va = verdict(avant), vp = verdict(apres);
      ok(va.etat === 'ROUGE' && vp.etat === 'VERT' && apres.requetes.every((r) => r.appels > 0),
        `D relevés et écarts : avant ${va.etat} (${avant.requetes.map((r) => `${Math.round(r.pagesParAppel)} p/appel`).join(', ')}), ` +
        `après ${vp.etat} (${apres.requetes.map((r) => `${Math.round(r.pagesParAppel)} p/appel, ${r.msParAppel.toFixed(2)} ms`).join(', ')})`, { va, vp });
      const coupe = verdict(ecarts(r0, r1.map((r) => ({ ...r, demarrage: 'autre' }))));
      ok(coupe.etat === 'INVALIDE', 'D une fenêtre traversée par un redémarrage est dite INVALIDE (jamais un faux vert)');
    }
  } catch (e) {
    ok(false, 'base jetable : exception', e?.stack ?? String(e));
  } finally {
    for (const c of clients) await c.end().catch(() => {});
    await base.stop().catch(() => {});
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* dossier temporaire */ }
  }
}

console.log(`\n${n - ko}/${n} contrôles verts`);
process.exit(ko ? 1 : 0);
