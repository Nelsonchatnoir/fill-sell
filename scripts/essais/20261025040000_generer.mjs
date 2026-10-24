// Assemble l'essai à blanc de 20261025040000 : corps de la migration (sans BEGIN/COMMIT, SANS la section 10 — le cron
// n'est jamais créé par un essai) + tests, dans une transaction ANNULÉE.
//   node scripts/essais/20261025040000_generer.mjs   →   scripts/essais/20261025040000_essai.sql
//   npx supabase db query --linked -f scripts/essais/20261025040000_essai.sql      (après le feu vert de l'essai)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const M = path.join(RACINE, "supabase/migrations/20261025040000_push_vente_annulee.sql");
const T = path.join(RACINE, "scripts/essais/20261025040000_tests.sql");
const O = path.join(RACINE, "scripts/essais/20261025040000_essai.sql");
const migration = fs.readFileSync(M, "utf8").replace(/\r\n/g, "\n");
const debutCron = migration.indexOf("\n-- 10. Le réveil");
const fin = migration.indexOf("\nCOMMIT;");
if (debutCron < 0 || fin < 0 || fin < debutCron) throw new Error("migration : sections introuvables");
const corps = migration.slice(0, debutCron).split("\n").filter((l) => !/^(BEGIN|COMMIT);$/.test(l)).join("\n");
if (/cron\.schedule/.test(corps)) throw new Error("le cron ne doit jamais entrer dans l'essai");
const sortie = [
  "-- Essai à blanc de 20261025040000_push_vente_annulee : ROLLBACK, rien ne reste (ni table, ni cron, ni note).",
  "-- Généré par scripts/essais/20261025040000_generer.mjs — ne pas modifier à la main.",
  "begin;",
  "set local statement_timeout = '120s';",
  "set local lock_timeout = '5s';",
  corps,
  "-- ═══ TESTS",
  fs.readFileSync(T, "utf8").replace(/\r\n/g, "\n"),
  "rollback;",
  "",
].join("\n");
fs.writeFileSync(O, sortie);
console.log(`écrit : ${path.relative(RACINE, O)} (${sortie.length} caractères)`);
