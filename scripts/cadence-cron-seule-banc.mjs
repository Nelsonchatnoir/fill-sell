// ═══════════════════════════════════════════════════════════════════════════
// BANC — migration 20261113170500_cadence_cron_seule (bloc 6 P2, 13/11) sur un VRAI Postgres JETABLE — JAMAIS la prod.
//   node scripts/cloud/pg-jetable.mjs scripts/cadence-cron-seule-banc.mjs
//   (ou PREUVE_PG=postgres://… vers un Postgres jetable)
// A. la PROD (définition lue par pg_get_functiondef le 13/11 = l'inverse, à l'octet) : le cas 447d920c est REFUSÉ ;
// B. la migration : il PASSE ; tout le reste de la garde est inchangé ;
// C. l'inverse : la définition revient à l'octet (md5 de prod), le refus d'avant aussi ;
// D. la migration rejouée : idempotente.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG_URL = process.env.PREUVE_PG;
if (!PG_URL || /supabase\.(co|com)/.test(PG_URL)) { console.error("PREUVE_PG : un Postgres JETABLE (jamais la prod)."); process.exit(2); }
const require = createRequire(import.meta.url);
const { Client } = require(process.env.PREUVE_MODULES ? path.join(process.env.PREUVE_MODULES, "pg") : "pg");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
const MIGRATION = lire("supabase/migrations/20261113170500_cadence_cron_seule.sql");
const INVERSE = lire("supabase/rollbacks/20261113170500_cadence_cron_seule_INVERSE.sql");
const MD5_PROD = "304ab0f8261de9e747757ce51a534833";

const db = new Client({ connectionString: PG_URL });
await db.connect();
let verts = 0, rouges = 0;
const ok = (c, m, d) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 300)}`}`); } };

await db.query(`
  DROP SCHEMA IF EXISTS banc CASCADE;
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  DROP TABLE IF EXISTS public.vinted_sync_runs CASCADE; DROP TABLE IF EXISTS public.inventaire CASCADE;
  CREATE TABLE public.vinted_sync_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, kind text NOT NULL,
    status text NOT NULL, declencheur text, started_at timestamptz DEFAULT now(), finished_at timestamptz, erreur text);
  CREATE TABLE public.inventaire (id bigserial PRIMARY KEY, user_id uuid NOT NULL, statut text, fusionne_dans bigint);
`);
await db.query(INVERSE); // la prod
await db.query("CREATE TRIGGER garde_cadence_sync_runs BEFORE INSERT ON public.vinted_sync_runs FOR EACH ROW EXECUTE FUNCTION garde_cadence_sync_runs()");

const md5 = async () => (await db.query("SELECT md5(pg_get_functiondef('public.garde_cadence_sync_runs()'::regprocedure)) m")).rows[0].m;
const U = {
  louis: "447d920c-0000-4000-8000-000000000001",       // 447d920c : geste le soir, cron le matin
  amiral: "faf5021a-0000-4000-8000-000000000002",      // faf5021a : automatiques seuls
  neuf: "0e0e0e0e-0000-4000-8000-000000000003",        // aucun relevé
  stock: "5a5a5a5a-0000-4000-8000-000000000004",       // gestes à 15 min, stock plein / vide
};
const MAINTENANT = "now()";
async function decor() {
  await db.query("DELETE FROM public.vinted_sync_runs; DELETE FROM public.inventaire;");
  const ins = (u, decl, il) => db.query(`ALTER TABLE public.vinted_sync_runs DISABLE TRIGGER garde_cadence_sync_runs;
    INSERT INTO public.vinted_sync_runs (user_id, kind, status, declencheur, finished_at) VALUES ('${u}', 'dressing', 'done', '${decl}', ${MAINTENANT} - interval '${il}');
    ALTER TABLE public.vinted_sync_runs ENABLE TRIGGER garde_cadence_sync_runs;`);
  // 447d920c : relevé de geste fini il y a 14 h (11/11 20:29 → 12/11 10:34), dernier automatique il y a 2 jours 20 h.
  await ins(U.louis, "bouton", "14 hours");
  await ins(U.louis, "cron", "68 hours");
  // faf5021a : un automatique fini il y a 9 h.
  await ins(U.amiral, "cron", "9 hours");
  // compte aux gestes : un geste il y a 5 min.
  await ins(U.stock, "bouton", "5 minutes");
  await db.query(`INSERT INTO public.inventaire (user_id, statut) VALUES ('${U.stock}', 'stock')`);
}
const essai = async (u, decl, kind = "dressing", status = "running") => {
  try {
    await db.query("INSERT INTO public.vinted_sync_runs (user_id, kind, status, declencheur) VALUES ($1, $2, $3, $4)", [u, kind, status, decl]);
    return "accepté";
  } catch (e) { return String(e.message).split(":")[0]; }
};

async function regleCommune(etiquette) {
  ok(await essai(U.amiral, "cron") === "SYNC_CRON_CADENCE", `${etiquette} : faf5021a, automatique fini il y a 9 h → refusé (SYNC_CRON_CADENCE)`);
  ok(await essai(U.neuf, "cron") === "SYNC_CRON_SANS_PREMIERE_SYNC", `${etiquette} : aucun relevé → le cron n'inaugure jamais`);
  ok(await essai(U.stock, "bouton") === "SYNC_CADENCE", `${etiquette} : geste 5 min après un geste, stock plein → SYNC_CADENCE (inchangé)`);
  await db.query(`UPDATE public.inventaire SET statut = 'vendu' WHERE user_id = '${U.stock}'`);
  ok(await essai(U.stock, "bouton") === "accepté", `${etiquette} : stock vide → le geste passe (exception du 08/11 inchangée)`);
  ok(await essai(U.amiral, "cron", "annonces") === "accepté", `${etiquette} : relevé « annonces » → jamais borné ici`);
  ok(await essai(U.amiral, "cron", "dressing", "done") === "accepté", `${etiquette} : ligne écrite « done » → jamais bornée ici`);
}

console.log("A. AVANT — la prod");
await decor();
ok(await md5() === MD5_PROD, "la définition installée est celle de la prod (md5 304ab0f8…)", await md5());
ok(await essai(U.louis, "cron") === "SYNC_CRON_CADENCE", "447d920c : geste il y a 14 h → le relevé automatique est REFUSÉ (le défaut)");
await regleCommune("A");

console.log("B. MIGRATION");
await db.query(MIGRATION);
await decor();
ok(await md5() !== MD5_PROD, "définition changée");
ok(await essai(U.louis, "cron") === "accepté", "447d920c : seul l'automatique d'il y a 68 h compte → le relevé automatique PART");
await regleCommune("B");
{
  const r = (await db.query("SELECT prosecdef, proconfig FROM pg_proc WHERE oid = 'public.garde_cadence_sync_runs()'::regprocedure")).rows[0];
  ok(r.prosecdef === true && JSON.stringify(r.proconfig) === JSON.stringify(["search_path=public"]), "SECURITY DEFINER et search_path inchangés", r);
  const c = (await db.query("SELECT obj_description('public.garde_cadence_sync_runs()'::regprocedure, 'pg_proc') c")).rows[0].c;
  ok(/relevés AUTOMATIQUES/.test(c), "commentaire de la fonction à jour");
  const t = (await db.query("SELECT count(*)::int n FROM pg_trigger WHERE tgrelid = 'public.vinted_sync_runs'::regclass AND NOT tgisinternal")).rows[0].n;
  ok(t === 1, "aucun déclencheur posé ni retiré");
}

console.log("C. INVERSE");
await db.query(INVERSE);
await decor();
ok(await md5() === MD5_PROD, "la définition revient à l'octet (md5 de prod)", await md5());
ok(await essai(U.louis, "cron") === "SYNC_CRON_CADENCE", "447d920c refusé comme avant");
{
  const c = (await db.query("SELECT obj_description('public.garde_cadence_sync_runs()'::regprocedure, 'pg_proc') c")).rows[0].c;
  ok(/^Cadence des syncs du dressing tenue en BASE : cron = jamais sans un premier run done \+ 20 h entre deux ;/.test(c), "commentaire de prod remis");
}

console.log("D. MIGRATION rejouée");
await db.query(MIGRATION);
await db.query(MIGRATION);
await decor();
ok(await essai(U.louis, "cron") === "accepté", "447d920c : le relevé automatique part (rejouée deux fois : idempotente)");
await regleCommune("D");

await db.end();
console.log(`\n${verts}/${verts + rouges} contrôles verts`);
if (rouges) process.exit(1);
