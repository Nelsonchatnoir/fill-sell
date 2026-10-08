// ═══════════════════════════════════════════════════════════════════════════
// BANC LOCAL DE LA MIGRATION 20261008230000 (drapeau Depop) — PGlite, en
// mémoire, JAMAIS la prod. Même pratique que scripts/cloud/banc-sql-socle.mjs.
//   npm i --no-save @electric-sql/pglite@0.3.16   (une fois ; rien n'entre dans package.json)
//   node scripts/depop-migration-banc.mjs
//   (ou PGLITE=<chemin du paquet> node scripts/depop-migration-banc.mjs)
//
// Ce qu'il prouve, sur les tables telles que le dépôt les définit
// (coin_config : 20260706100000 ; journal et déclencheur : 20261004101000) :
//   1. la migration pose depop_ouvert = 0 et une ligne de journal ;
//   2. rejouée, elle ne change rien (idempotente, pas de 2e journal) ;
//   3. un drapeau DÉJÀ présent (même à 1) n'est jamais réécrit : elle ne peut
//      ni armer ni désarmer Depop ;
//   4. aucune autre clé de coin_config ne bouge.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let PGlite;
try {
  const cible = process.env.PGLITE ? pathToFileURL(join(process.env.PGLITE, "dist/index.js")).href : "@electric-sql/pglite";
  ({ PGlite } = await import(cible));
} catch {
  console.error("PGlite absent : npm i --no-save @electric-sql/pglite@0.3.16 (ou PGLITE=<chemin du paquet>)");
  process.exit(2);
}

const lire = (rel) => fs.readFileSync(join(ROOT, rel), "utf8");
const MIGRATION = lire("supabase/migrations/20261008230000_depop_drapeau_inerte.sql");
// Le journal et son déclencheur, tels que le dépôt les définit (les GRANT
// visent des rôles Supabase absents d'un Postgres nu : on les retire).
const JOURNAL = lire("supabase/migrations/20261004101000_coin_config_journal.sql")
  .split("\n").filter((l) => !/^\s*(GRANT|ALTER TABLE .* ENABLE ROW LEVEL SECURITY)/.test(l)).join("\n");

let ko = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) ko++; };

async function base() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.coin_config (key text PRIMARY KEY, value integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.coin_config (key, value) VALUES ('opla_sortie_le', 1791583200), ('rapprochement_remise_en_ligne', 0), ('price_original', 3);
  `);
  await db.exec(JOURNAL);
  return db;
}
const etat = async (db) => (await db.query("select key, value from coin_config order by key")).rows.map((r) => `${r.key}=${r.value}`).join(",");
const journal = async (db) => (await db.query("select key, avant, apres, par from coin_config_journal order by id")).rows;

// 1 + 2 + 4
{
  const db = await base();
  const avant = await etat(db);
  await db.exec(MIGRATION);
  const r = (await db.query("select value from coin_config where key = 'depop_ouvert'")).rows;
  ok(r.length === 1 && Number(r[0].value) === 0, "posée : depop_ouvert = 0");
  const j = await journal(db);
  ok(j.length === 1 && j[0].key === "depop_ouvert" && j[0].avant === null && Number(j[0].apres) === 0 && j[0].par === "migration 20261008230000", "une ligne de journal (NULL → 0, par la migration)");
  await db.exec(MIGRATION);
  ok((await journal(db)).length === 1, "rejouée : aucun second journal");
  ok((await db.query("select count(*)::int n from coin_config where key = 'depop_ouvert'")).rows[0].n === 1, "rejouée : une seule ligne");
  const apres = await etat(db);
  ok(apres.split(",").filter((x) => !x.startsWith("depop_ouvert=")).join(",") === avant, "aucune autre clé ne bouge");
  await db.close();
}
// 3 : déjà armé (cas d'école) → jamais réécrit, jamais désarmé ni réarmé en silence
{
  const db = await base();
  await db.exec("INSERT INTO coin_config (key, value) VALUES ('depop_ouvert', 1)");
  await db.exec(MIGRATION);
  ok(Number((await db.query("select value from coin_config where key = 'depop_ouvert'")).rows[0].value) === 1, "ligne existante (1) : inchangée");
  ok((await journal(db)).length === 0, "ligne existante : aucun journal");
  await db.close();
}

console.log(ko ? `\n${ko} échec(s)` : "\nBanc de la migration 20261008230000 : tout est vert.");
process.exit(ko ? 1 : 0);
