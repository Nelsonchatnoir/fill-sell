// ═══════════════════════════════════════════════════════════════════════════
// BANC — LES VENTES PROUVÉES S'ENREGISTRENT SEULES (migrations 20261008233000
// + 20261008233100), sur un VRAI Postgres 17 JETABLE — JAMAIS la prod.
//   npm i --no-save embedded-postgres@17.10.0-beta.17 pg@8.16.3
//   node scripts/cloud/pg-jetable.mjs scripts/ventes-prouvees-banc.mjs
//   (ou PREUVE_PG=postgres://… vers un Postgres jetable ; PREUVE_MODULES=<node_modules> si pg est installé ailleurs)
//
// Les fonctions de vente et de retrait sont celles de la PROD, relues le 08/10
// (pg_get_functiondef, lecture seule) dans scripts/fixtures/ventes-prouvees-prod-0810.json :
// enregistrer_vente_atomique, armer_retrait_job(_pour), armer_retraits_copies,
// poser_questions_copies_non_prouvees, retrait_job_prouve, fiche_annonces_vivantes…,
// et le déclencheur inventaire_vendu_retire_ses_copies. Les deux migrations sont
// rejouées TELLES QUELLES (fichiers du dépôt). Tables réduites à leurs colonnes de prod.
//
// Ce qui est prouvé (chaque cas sur des comptes distincts) :
//   S1  idempotence : une vente prouvée est enregistrée UNE fois, la copie
//       Leboncoin prouvée reçoit UN retrait ; ni un second passage, ni la
//       re-vérification, ni le clic de la personne n'en créent une seconde ;
//   S2  « unavailable » seul (et « sold » démenti par le dressing, cas Louis)
//       n'enregistre RIEN et ne retire rien ;
//   S3  une preuve d'AVANT l'armement n'est jamais traitée par le cron (arriéré) ;
//   S4  passage borné : 25 annonces au plus, puis le reste au passage suivant ;
//       budget de temps : un passage lent s'arrête et reporte le reste ;
//   S5  deux passages SIMULTANÉS (deux connexions) : jamais deux ventes ni deux
//       retraits pour une fiche ; le clic de la personne pendant le passage non plus ;
//   S6  un refus d'une garde est mémorisé et n'est pas rejoué au passage suivant ;
//   S7  coupé (drapeau à 0) : rien lu, rien écrit ;
//   S8  relevé en cours : la vente attend, ni vente ni refus ;
//   S9  la veille : retard, arriéré, silence du cron → alerte (module partagé) ;
//   S10 copie NON prouvée : pas de retrait, la question « Déjà vendu ? » ;
//   S11 vente partielle (quantité 2) : 1 vendue, stock 1, aucune copie retirée ;
//   S12 le rattrapage (requêtes du script) puis son INVERSE : tout revient comme avant.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)/.test(PG_URL)) { console.error('PREUVE_PG : un Postgres JETABLE (jamais la prod).'); process.exit(2); }
const requirePg = createRequire(process.env.PREUVE_MODULES ? path.join(process.env.PREUVE_MODULES, 'x.js') : import.meta.url);
const pg = requirePg('pg');
const { deciderAlerteVentesProuvees } = await import('../supabase/functions/_shared/ventes-prouvees.js');

const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const FIX = JSON.parse(lire('scripts/fixtures/ventes-prouvees-prod-0810.json'));
const MIG_INDEX = lire('supabase/migrations/20261008233000_ventes_prouvees_index.sql');
// BANC_MIGRATION : une copie MODIFIÉE de la migration, pour vérifier que le banc mord (mutations).
const MIG = process.env.BANC_MIGRATION ? fs.readFileSync(process.env.BANC_MIGRATION, 'utf8') : lire('supabase/migrations/20261008233100_ventes_prouvees_automatiques.sql');

let ko = 0, n = 0;
const ok = (cond, msg) => { n++; console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) ko++; };

// ── Le schéma ───────────────────────────────────────────────────────────────
const PK = { inventaire: 'id', inventaire_fusions: 'id', usage_logs: 'id', coin_config: 'key', coin_config_journal: 'id', vinted_sync_runs: 'id' };
function ddl() {
  const out = [
    "DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
    "CREATE SCHEMA IF NOT EXISTS auth;",
    "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;",
    // pg_cron réduit à ce que la migration appelle
    "CREATE SCHEMA IF NOT EXISTS cron;",
    "CREATE TABLE IF NOT EXISTS cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);",
    "CREATE OR REPLACE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job (jobname, schedule, command) VALUES (n, s, c) RETURNING jobid $$;",
    "CREATE OR REPLACE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = n RETURNING true $$;",
  ];
  for (const [t, cols] of Object.entries(FIX.colonnes)) {
    const defs = cols.map((c) => {
      const ident = c.identite || /^nextval\(/.test(c.defaut ?? '');
      const type = c.type === 'timestamp with time zone' ? 'timestamptz' : c.type === 'timestamp without time zone' ? 'timestamp' : c.type;
      if (ident) return `"${c.n}" ${type === 'integer' ? 'integer' : 'bigint'} GENERATED BY DEFAULT AS IDENTITY`;
      return `"${c.n}" ${type}${c.defaut ? ` DEFAULT ${c.defaut}` : ''}`;
    });
    if (PK[t]) defs.push(`PRIMARY KEY ("${PK[t]}")`);
    out.push(`CREATE TABLE public.${t} (${defs.join(', ')});`);
  }
  for (const i of FIX.index) out.push(i.replace(/^CREATE UNIQUE INDEX/, 'CREATE UNIQUE INDEX IF NOT EXISTS') + ';');
  out.push('SET check_function_bodies = off;');
  for (const f of FIX.fonctions) out.push(f.def + ';');
  for (const d of FIX.declencheurs) out.push(d + ';');
  return out.join('\n');
}

const U = (k) => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`;
const J = (k) => `10000000-0000-4000-8000-${String(k).padStart(12, '0')}`;
let seq = 1;
const nouvelId = () => 9400000000000 + (seq++);

async function main() {
  const a = new pg.Client({ connectionString: PG_URL }); await a.connect();
  const b = new pg.Client({ connectionString: PG_URL }); await b.connect();
  const q = (sql, p) => a.query(sql, p);
  const un = async (sql, p) => (await a.query(sql, p)).rows[0];
  const val = async (sql, p) => Object.values((await a.query(sql, p)).rows[0] ?? {})[0];

  await q(ddl());
  await q(MIG_INDEX);            // CONCURRENTLY, hors transaction, comme en prod
  await q(MIG);
  ok(Number(await val("SELECT count(*) FROM cron.job WHERE jobname = 'ventes-prouvees-2min' AND schedule = '1-59/2 * * * *' AND command ILIKE '%ventes_prouvees_tick()%'")) === 1, 'migration : cron SQL ventes-prouvees-2min (minutes impaires) posé une fois');
  await q(MIG);                  // rejouée : idempotente
  ok(Number(await val("SELECT count(*) FROM cron.job WHERE jobname = 'ventes-prouvees-2min'")) === 1, 'migration rejouée : toujours UN cron');
  ok(Number(await val("SELECT count(*) FROM coin_config_journal WHERE key = 'ventes_prouvees_auto_depuis'")) === 1, 'armement journalisé une fois (rejeu : pas de second journal)');
  const plan = (await q("EXPLAIN SELECT * FROM ventes_prouvees_a_enregistrer('-infinity'::timestamptz, 25)")).rows.map((r) => r['QUERY PLAN']).join('\n');
  // (le planificateur choisit l'index partiel quand la table est grande ; ici on vérifie qu'il est UTILISABLE)
  await q('SET enable_seqscan = off');
  const plan2 = (await q(`EXPLAIN SELECT c.id FROM cross_post_jobs c WHERE c.status = 'published' AND (c.platform_fields ->> 'sale_signal') = 'sold'`)).rows.map((r) => r['QUERY PLAN']).join('\n');
  await q('SET enable_seqscan = on');
  ok(/cross_post_jobs_signal_vendu_idx/.test(plan2), "l'index partiel couvre le filtre de la sélection (status published + sale_signal sold)");
  void plan;

  // armement « il y a 1 h » pour que les preuves des cas soient postérieures
  const armer = (expr) => q(`UPDATE coin_config SET value = extract(epoch FROM ${expr})::integer WHERE key = 'ventes_prouvees_auto_depuis'`);
  await armer("now() - interval '1 hour'");

  // ── fabrique ──
  async function fiche(user, { q: quantite = 1, titre = 'Robe test', statut = 'stock' } = {}) {
    const id = nouvelId();
    await q(`INSERT INTO inventaire (id, user_id, titre, prix_vente, prix_achat, statut, quantite, plateforme, origine, created_at)
             VALUES ($1, $2, $3, 20, 5, $4, $5, 'vinted', 'vinted_sync', now() - interval '20 days')`, [id, user, titre, statut, quantite]);
    return id;
  }
  async function job(id, user, inv, pf, lid, pfFields = {}, { status = 'published', publie = "now() - interval '10 days'" } = {}) {
    await q(`INSERT INTO cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, platform_listing_id, listing_url, published_at, platform_fields, created_at)
             VALUES ($1, $2, $3, $4, 'publish', $5, 'Robe test', 20, $6, $7, ${publie}, $8::jsonb, ${publie})`,
      [id, user, inv, pf, status, lid, `https://example.test/${pf}/${lid}`, JSON.stringify(pfFields)]);
  }
  async function releve(user, lid, status, quand = 'now()') {
    await q(`INSERT INTO vinted_listing_snapshots (user_id, vinted_item_id, captured_at, captured_on, price, status)
             VALUES ($1, $2, ${quand}, (${quand})::date, 20, $3)
             ON CONFLICT (user_id, vinted_item_id, captured_on) DO UPDATE SET captured_at = excluded.captured_at, status = excluded.status`, [user, lid, status]);
  }
  const SOLD = { sale_signal: 'sold', unavailable_since: new Date().toISOString() };
  const ventesDe = (inv) => val('SELECT count(*) FROM ventes WHERE inventaire_id = $1', [inv]).then(Number);
  const retraitsDe = (inv, pf) => val("SELECT count(*) FROM cross_post_jobs WHERE inventaire_id = $1 AND platform = $2 AND action = 'delete' AND status IN ('pending','processing','needs_user')", [inv, pf]).then(Number);
  const tick = async (cli = a, max = 25, budget = 4000) => (await cli.query('SELECT ventes_prouvees_tick($1, $2) r', [max, budget])).rows[0].r;
  const vider = async () => { await q(`TRUNCATE cross_post_jobs, inventaire, ventes, ventes_operations, vinted_listing_snapshots, vinted_sync_runs,
                                       annonces_plateforme, inventaire_doublons, usage_logs, ventes_prouvees_passages, ventes_prouvees_refus RESTART IDENTITY`); };

  // ── S1 idempotence ──
  {
    const u = U(1), f = await fiche(u);
    await job(J(11), u, f, 'vinted', '111', SOLD); await releve(u, '111', 'sold');
    await job(J(12), u, f, 'leboncoin', '3000000001');
    const r1 = await tick();
    ok(r1.issue === 'fait' && r1.enregistrees === 1, `S1 premier passage : 1 vente enregistrée (${JSON.stringify(r1)})`);
    ok(await ventesDe(f) === 1, 'S1 une ligne de vente');
    const fi = await un('SELECT statut, quantite FROM inventaire WHERE id = $1', [f]);
    ok(fi.statut === 'vendu' && Number(fi.quantite) === 0, 'S1 la fiche passe « vendu », stock 0');
    ok((await un('SELECT status FROM cross_post_jobs WHERE id = $1', [J(11)])).status === 'sold', "S1 l'annonce Vinted passe « sold »");
    ok(await retraitsDe(f, 'leboncoin') === 1, 'S1 la copie Leboncoin prouvée reçoit UN retrait (chaîne existante)');
    const r2 = await tick();
    ok(r2.candidates === 0 && r2.enregistrees === 0, 'S1 second passage : plus rien à enregistrer');
    const r3 = (await q('SELECT enregistrer_vente_prouvee($1) r', [J(11)])).rows[0].r;
    ok(r3.issue === 'plus_a_enregistrer', 'S1 re-vérification de la même annonce : plus à enregistrer');
    const clic = (await q('SELECT enregistrer_vente_atomique($1, NULL, p_job := $2, p_prix := 20) r', [u, J(11)])).rows[0].r;
    ok(clic.venteCreated === false, `S1 le clic « Vendue » de la personne ensuite : aucune seconde vente (${clic.rejouee ? 'rejouée' : clic.reason})`);
    ok(await ventesDe(f) === 1 && await retraitsDe(f, 'leboncoin') === 1, 'S1 toujours UNE vente et UN retrait');
    ok(Number(await val("SELECT count(*) FROM ventes_operations WHERE cle = 'annonce:vinted:111'")) === 1, 'S1 un seul reçu ventes_operations');
  }
  await vider();

  // ── S2 « unavailable » seul ──
  {
    const u = U(2);
    const f1 = await fiche(u), f2 = await fiche(u), f3 = await fiche(u), f4 = await fiche(u);
    await job(J(21), u, f1, 'vinted', '211', { sale_signal: 'unavailable', unavailable_since: new Date().toISOString() });
    await releve(u, '211', 'active', "now() - interval '2 days'");
    await job(J(22), u, f2, 'vinted', '221', SOLD); await releve(u, '221', 'active');          // « sold » démenti par le dressing (Louis)
    await job(J(23), u, f3, 'vinted', '231', { sale_signal: 'unavailable' });                   // disparue, aucun relevé
    await job(J(24), u, f4, 'leboncoin', '3000000024', { sale_signal: 'unavailable' });         // plateforme non Vinted, « unavailable »
    for (const f of [f1, f2, f3]) await job(`${J(25).slice(0, -3)}${String(f).slice(-3)}`, u, f, 'leboncoin', `30000${f}`);
    const r = await tick();
    ok(r.candidates === 0 && r.enregistrees === 0, `S2 aucune candidate (${JSON.stringify(r)})`);
    ok(Number(await val('SELECT count(*) FROM ventes')) === 0, 'S2 aucune vente');
    ok(Number(await val("SELECT count(*) FROM cross_post_jobs WHERE action = 'delete'")) === 0, 'S2 aucun retrait');
    ok(Number(await val("SELECT count(*) FROM ventes_prouvees_a_enregistrer('-infinity'::timestamptz, 1000, NULL, NULL, true)")) === 0, "S2 même sans borne d'armement : rien n'est une preuve");
  }
  await vider();

  // ── S3 arriéré ──
  {
    const u = U(3), f = await fiche(u);
    await job(J(31), u, f, 'vinted', '311', SOLD); await releve(u, '311', 'sold', "now() - interval '2 days'");
    const r = await tick();
    ok(r.candidates === 0 && await ventesDe(f) === 0, "S3 preuve d'AVANT l'armement : le cron n'y touche pas");
    const v = (await q('SELECT ventes_prouvees_veille() v')).rows[0].v;
    ok(Number(v.anterieures) === 1 && Number(v.en_retard) === 0, 'S3 la veille la compte dans l’arriéré, pas en retard');
  }
  await vider();

  // ── S4 borné (nombre, puis temps) ──
  {
    const u = U(4);
    for (let i = 0; i < 40; i++) { const f = await fiche(u); const id = `4${String(i).padStart(3, '0')}`; await job(J(4000 + i), u, f, 'vinted', id, SOLD); await releve(u, id, 'sold'); }
    const r1 = await tick(a, 25);
    ok(r1.candidates === 25 && r1.enregistrees === 25, `S4 premier passage : 25 au plus (${r1.enregistrees})`);
    const r2 = await tick(a, 25);
    ok(r2.candidates === 15 && r2.enregistrees === 15, `S4 second passage : les 15 restantes (${r2.enregistrees})`);
    ok(Number(await val('SELECT count(*) FROM ventes')) === 40, 'S4 40 ventes au total, aucune en double');
    await vider();
    // budget : chaque vente ralentie de 300 ms ; budget 500 ms → le passage s'arrête et reporte
    await q(`CREATE OR REPLACE FUNCTION _lente() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;
             CREATE TRIGGER _lente BEFORE INSERT ON ventes FOR EACH ROW EXECUTE FUNCTION _lente();`);
    for (let i = 0; i < 10; i++) { const f = await fiche(u); const id = `5${String(i).padStart(3, '0')}`; await job(J(5000 + i), u, f, 'vinted', id, SOLD); await releve(u, id, 'sold'); }
    const t0 = Date.now(); const r3 = await tick(a, 25, 500); const ms = Date.now() - t0;
    ok(r3.budget_atteint === true && r3.enregistrees >= 1 && r3.enregistrees <= 3 && r3.reportees === 10 - r3.enregistrees,
      `S4 budget 500 ms : ${r3.enregistrees} enregistrée(s), ${r3.reportees} reportée(s), ${ms} ms`);
    ok(ms < 2500, `S4 le passage reste court (${ms} ms)`);
    await q('DROP TRIGGER _lente ON ventes; DROP FUNCTION _lente();');
  }
  await vider();

  // ── S5 deux passages simultanés + clic pendant le passage ──
  {
    const u = U(5); const fiches = [];
    await q(`CREATE OR REPLACE FUNCTION _lente() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.05); RETURN NEW; END $$;
             CREATE TRIGGER _lente BEFORE INSERT ON ventes FOR EACH ROW EXECUTE FUNCTION _lente();`);
    for (let i = 0; i < 20; i++) { const f = await fiche(u); fiches.push(f); const id = `6${String(i).padStart(3, '0')}`; await job(J(6000 + i), u, f, 'vinted', id, SOLD); await releve(u, id, 'sold'); await job(J(7000 + i), u, f, 'leboncoin', `31${String(i).padStart(8, '0')}`); }
    const [ra, rb] = await Promise.all([tick(a), tick(b)]);
    const issues = [ra.issue, rb.issue].sort().join('+');
    ok(issues === 'deja_en_cours+fait', `S5 deux passages simultanés : l'un travaille, l'autre s'efface (${issues})`);
    // le clic de la personne pendant un passage : la même annonce, deux connexions
    await vider();
    for (let i = 0; i < 5; i++) { const f = await fiche(u); fiches.push(f); const id = `8${String(i).padStart(3, '0')}`; await job(J(8000 + i), u, f, 'vinted', id, SOLD); await releve(u, id, 'sold'); await job(J(9000 + i), u, f, 'leboncoin', `32${String(i).padStart(8, '0')}`); }
    const [rt, rc] = await Promise.all([tick(a), b.query('SELECT enregistrer_vente_atomique($1, NULL, p_job := $2, p_prix := 20) r', [u, J(8004)]).then((x) => x.rows[0].r)]);
    const doubles = Number(await val('SELECT count(*) FROM (SELECT inventaire_id FROM ventes GROUP BY 1 HAVING count(*) > 1) z'));
    const retraitsDoubles = Number(await val("SELECT count(*) FROM (SELECT inventaire_id, platform FROM cross_post_jobs WHERE action = 'delete' GROUP BY 1, 2 HAVING count(*) > 1) z"));
    ok(doubles === 0 && retraitsDoubles === 0, `S5 passage + clic simultanés : 0 fiche à deux ventes, 0 double retrait (passage ${rt.enregistrees}, clic ${rc.venteCreated ? 'a écrit' : 'rejoué/refusé'})`);
    ok(Number(await val('SELECT count(*) FROM ventes')) === 5, 'S5 exactement 5 ventes pour 5 fiches');
    await q('DROP TRIGGER _lente ON ventes; DROP FUNCTION _lente();');
  }
  await vider();
  // S5 bis : deux passages simultanés sur 20 fiches, puis un troisième — compte final exact
  {
    const u = U(55);
    for (let i = 0; i < 20; i++) { const f = await fiche(u); const id = `9${String(i).padStart(3, '0')}`; await job(J(9500 + i), u, f, 'vinted', id, SOLD); await releve(u, id, 'sold'); await job(J(9600 + i), u, f, 'leboncoin', `33${String(i).padStart(8, '0')}`); }
    await Promise.all([tick(a), tick(b)]); await tick(a);
    ok(Number(await val('SELECT count(*) FROM ventes')) === 20 && Number(await val('SELECT count(DISTINCT inventaire_id) FROM ventes')) === 20, 'S5 bis 20 ventes, 20 fiches distinctes');
    ok(Number(await val("SELECT count(*) FROM cross_post_jobs WHERE action = 'delete' AND platform = 'leboncoin'")) === 20, 'S5 bis 20 retraits Leboncoin, un par fiche');
  }
  await vider();

  // ── S6 refus mémorisé ──
  {
    const u = U(6), f = await fiche(u);
    await job(J(61), u, f, 'vinted', '611', SOLD); await releve(u, '611', 'sold');
    await q(`INSERT INTO ventes (user_id, inventaire_id, titre, prix_vente, plateforme, created_at) VALUES ($1, $2, 'déjà là', 20, 'Vinted', now())`, [u, f]);
    const r1 = await tick();
    ok(r1.refusees === 1 && r1.enregistrees === 0, 'S6 la garde « vente déjà liée » refuse');
    const ref = await un('SELECT raison, reessayer_apres > now() + interval \'5 hours\' AS six_h FROM ventes_prouvees_refus WHERE job_id = $1', [J(61)]);
    ok(ref && /déjà liée/.test(ref.raison) && ref.six_h, 'S6 refus mémorisé, réexaminé dans 6 h');
    const r2 = await tick();
    ok(r2.candidates === 0, 'S6 passage suivant : pas rejoué');
    const v = (await q('SELECT ventes_prouvees_veille() v')).rows[0].v;
    ok(Number(v.refus_actifs) === 1 && Number(v.en_retard) === 0, 'S6 la veille le compte en refus, pas en retard');
  }
  await vider();

  // ── S7 coupé ──
  {
    const u = U(7), f = await fiche(u);
    await job(J(71), u, f, 'vinted', '711', SOLD); await releve(u, '711', 'sold');
    await q("UPDATE coin_config SET value = 0 WHERE key = 'ventes_prouvees_auto_depuis'");
    const r = await tick();
    ok(r.issue === 'coupe' && Number(await val('SELECT count(*) FROM ventes_prouvees_passages')) === 0 && await ventesDe(f) === 0, 'S7 coupé : rien lu, rien écrit');
    await armer("now() - interval '1 hour'");
  }
  await vider();

  // ── S8 relevé en cours ──
  {
    const u = U(8), f = await fiche(u);
    await job(J(81), u, f, 'vinted', '811', SOLD); await releve(u, '811', 'sold');
    await q(`INSERT INTO vinted_sync_runs (id, user_id, kind, platform, status, started_at) VALUES (gen_random_uuid(), $1, 'dressing', 'vinted', 'running', now())`, [u]);
    const r = await tick();
    ok(r.reportees === 1 && r.enregistrees === 0 && r.refusees === 0 && await ventesDe(f) === 0, 'S8 relevé en cours : reportée, ni vente ni refus');
    await q("UPDATE vinted_sync_runs SET status = 'done'");
    const r2 = await tick();
    ok(r2.enregistrees === 1, 'S8 relevé fini : enregistrée au passage suivant');
  }
  await vider();

  // ── S9 la veille et l'alerte ──
  {
    const u = U(9), f = await fiche(u);
    await armer("now() - interval '2 hours'");
    await job(J(91), u, f, 'vinted', '911', SOLD); await releve(u, '911', 'sold', "now() - interval '40 minutes'");
    let v = (await q('SELECT ventes_prouvees_veille() v')).rows[0].v;
    ok(Number(v.en_retard) === 1 && v.minutes_depuis_dernier_passage === null, 'S9 preuve de 40 min non enregistrée : en retard ; aucun passage');
    let d = deciderAlerteVentesProuvees({ veille: v, maintenant: Date.now() });
    ok(d.action === 'alerte' && d.anomalies.some((x) => x.code === 'ventes_en_retard') && d.anomalies.some((x) => x.code === 'jamais_tourne'), 'S9 alerte : en retard + jamais tourné');
    await q(`INSERT INTO ventes_prouvees_passages (debut, fin, duree_ms, issue) VALUES (now() - interval '25 minutes', now() - interval '25 minutes', 3, 'fait')`);
    v = (await q('SELECT ventes_prouvees_veille() v')).rows[0].v;
    d = deciderAlerteVentesProuvees({ veille: v, maintenant: Date.now() });
    ok(d.anomalies.some((x) => x.code === 'ne_tourne_plus'), `S9 dernier passage il y a ${v.minutes_depuis_dernier_passage} min : « ne tourne plus »`);
    d = deciderAlerteVentesProuvees({ veille: v, derniereAlerte: new Date(Date.now() - 10 * 60_000).toISOString(), maintenant: Date.now() });
    ok(d.action === null, 'S9 une alerte par heure au plus');
    await tick();
    v = (await q('SELECT ventes_prouvees_veille() v')).rows[0].v;
    d = deciderAlerteVentesProuvees({ veille: v, maintenant: Date.now() });
    ok(Number(v.en_retard) === 0 && d.action === null, 'S9 après le passage : plus rien en retard, plus d’alerte');
    await armer("now() - interval '1 hour'");
  }
  await vider();

  // ── S10 copie non prouvée → question ──
  {
    const u = U(10), f = await fiche(u);
    await job(J(101), u, f, 'vinted', '1011', SOLD); await releve(u, '1011', 'sold');
    await job(J(102), u, f, 'leboncoin', '3000000102', { source: 'releve', rattachement: { par: 'moteur', motif: 'titre_exact' } });
    await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, inventaire_id, job_id, vu_le)
             VALUES ($1, 'leboncoin', '3000000102', 'https://example.test/lbc/102', 'Robe test', 'en_ligne', $2, $3, now())`, [u, f, J(102)]);
    const r = await tick();
    ok(r.enregistrees === 1 && await retraitsDe(f, 'leboncoin') === 0, 'S10 vente enregistrée, copie NON prouvée jamais retirée');
    ok(Number(await val("SELECT count(*) FROM inventaire_doublons WHERE motif = 'copie_non_prouvee' AND statut = 'proposee'")) === 1, 'S10 la question « Déjà vendu ? » est posée (chaîne existante)');
  }
  await vider();

  // ── S11 vente partielle ──
  {
    const u = U(11), f = await fiche(u, { q: 2 });
    await job(J(111), u, f, 'vinted', '1111', SOLD); await releve(u, '1111', 'sold');
    await job(J(112), u, f, 'leboncoin', '3000000112');
    const r = await tick();
    const fi = await un('SELECT statut, quantite FROM inventaire WHERE id = $1', [f]);
    ok(r.enregistrees === 1 && fi.statut === 'stock' && Number(fi.quantite) === 1 && await retraitsDe(f, 'leboncoin') === 0, 'S11 quantité 2 : une vendue, stock 1, aucune copie retirée');
  }

  await vider();

  // ── S12 rattrapage appliqué, puis son INVERSE (les requêtes du script, telles quelles) ──
  {
    const { sqlSauvegarde, sqlLot } = await import('./reparations/20261008_rattrapage_ventes_prouvees.mjs');
    const INVERSE = lire('scripts/reparations/20261008_rattrapage_ventes_prouvees_INVERSE.sql');
    await q('CREATE TABLE IF NOT EXISTS public.ventes_supprimees (id bigserial, user_id uuid, plateforme_code text, commande_ref text, annonce_id text, titre text, prix_vente numeric, vendu_le timestamptz, vente_id bigint)');
    const u = U(12), f = await fiche(u);
    await job(J(121), u, f, 'vinted', '1211', SOLD); await releve(u, '1211', 'sold', "now() - interval '3 days'");   // arriéré
    await job(J(122), u, f, 'leboncoin', '3000000122');                                                               // copie prouvée
    await job(J(123), u, f, 'ebay', '400000000123', { source: 'releve', rattachement: { par: 'moteur', motif: 'titre_exact' } });
    await q(`INSERT INTO annonces_plateforme (user_id, platform, listing_id, url, titre, statut_plateforme, inventaire_id, job_id, vu_le)
             VALUES ($1, 'ebay', '400000000123', 'https://example.test/ebay/123', 'Robe test', 'en_ligne', $2, $3, now())`, [u, f, J(123)]);
    await job(J(124), u, f, 'beebs', null, {}, { status: 'pending' });                                                // publication en attente
    ok((await tick()).candidates === 0, 'S12 arriéré : le cron ne le prend pas');
    await q(sqlSauvegarde([f]));
    await q(sqlLot([`'${J(121)}'::uuid`]));
    const jr = await un('SELECT resultat ->> \'issue\' issue, cardinality(retraits) r, cardinality(questions) qn, cardinality(publications_arretees) pa FROM _rattrapage_0810_ventes_prouvees WHERE job_id = $1', [J(121)]);
    ok(jr.issue === 'enregistree' && jr.r === 1 && jr.qn === 1 && jr.pa === 1, `S12 rattrapage : vente, 1 retrait, 1 question, 1 publication arrêtée — journalisés (${JSON.stringify(jr)})`);
    ok(await ventesDe(f) === 1 && (await un('SELECT statut FROM inventaire WHERE id = $1', [f])).statut === 'vendu', 'S12 la fiche est vendue');
    await q(INVERSE);
    const fi = await un('SELECT statut, quantite FROM inventaire WHERE id = $1', [f]);
    ok(await ventesDe(f) === 0 && Number(await val('SELECT count(*) FROM ventes_operations')) === 0, 'S12 inverse : vente et reçu supprimés');
    ok(fi.statut === 'stock' && Number(fi.quantite) === 1, 'S12 inverse : la fiche revient en stock, quantité 1');
    const jv = await un('SELECT status, platform_fields ->> \'sale_signal\' s FROM cross_post_jobs WHERE id = $1', [J(121)]);
    ok(jv.status === 'published' && jv.s === 'sold', "S12 inverse : l'annonce Vinted reprend son état (publiée, signal « sold »)");
    ok(await retraitsDe(f, 'leboncoin') === 0 && (await un("SELECT status FROM cross_post_jobs WHERE inventaire_id = $1 AND platform = 'leboncoin' AND action = 'delete'", [f])).status === 'cancelled', 'S12 inverse : le retrait Leboncoin encore en attente est annulé');
    ok(!(await un('SELECT platform_fields ? \'retrait_arme\' x FROM cross_post_jobs WHERE id = $1', [J(122)])).x, 'S12 inverse : la copie Leboncoin perd son marqueur « retrait armé »');
    ok((await un('SELECT status FROM cross_post_jobs WHERE id = $1', [J(124)])).status === 'pending', 'S12 inverse : la publication Beebs arrêtée reprend « pending »');
    ok(Number(await val("SELECT count(*) FROM inventaire_doublons WHERE motif = 'copie_non_prouvee'")) === 0, 'S12 inverse : la question « Déjà vendu ? » est retirée');
    ok(Number(await val("SELECT count(*) FROM _rattrapage_0810_ventes_prouvees WHERE resultat ? 'defait_le'")) === 1, 'S12 inverse : le journal garde la trace (defait_le)');
    await q(INVERSE);
    ok(fi.statut === 'stock' && Number(await val('SELECT count(*) FROM ventes')) === 0, 'S12 inverse rejoué : sans effet');
  }

  await a.end(); await b.end();
  console.log(`\n${n - ko}/${n} vérifications vertes${ko ? ` — ${ko} ROUGE(S)` : ''}`);
  process.exit(ko ? 1 : 0);
}

main().catch((e) => { console.error('ÉCHEC du banc :', e.message); process.exit(1); });
