// BANC FIGÉ des correspondances apprises (18/10, lot 2) — lecture seule, AUCUN appel IA.
//   node scripts/banc-deduction-apprise.mjs [AAAA-MM-JJ de coupe, défaut 2026-10-06]
// Apprend sur les annonces acceptées AVANT la coupe, teste sur celles acceptées APRÈS (vérité : la valeur en ligne),
// par plateforme et par champ ; écrit docs/enquetes/zero-orange-1810/banc-deduction.json (articles du banc compris :
// le banc est FIGÉ, il se rejoue sur les mêmes articles). Règle de Nico : un seul faux = le champ n'est pas servi.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coupe = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] ?? "") ? process.argv[2] : "2026-10-06";
const sql = fs.readFileSync(path.join(RACINE, "scripts/bancs/banc-deduction-apprise.sql"), "utf8").replaceAll("__COUPE__", coupe);
const tmp = path.join(os.tmpdir(), `banc-deduction-${process.pid}.sql`);
fs.writeFileSync(tmp, sql);
const sortie = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", tmp, "-o", "json"], { cwd: RACINE, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
fs.unlinkSync(tmp);
const lignes = JSON.parse(sortie.slice(sortie.indexOf("{"))).rows ?? [];
const champs = lignes.map((r) => ({
  platform: r.platform, champ: r.champ, test: Number(r.test), couverts: Number(r.couverts), justes: Number(r.justes), faux: Number(r.faux),
  servi: Number(r.faux) === 0 && Number(r.couverts) >= 2, articles: r.articles ?? [],
}));
const resultat = {
  banc: "correspondances apprises", fait_le: new Date().toISOString(), coupe,
  regle: "unanime : ≥ 4 articles de ≥ 2 comptes (catégorie + catalogue Vinted), ≥ 8 de ≥ 3 (catégorie seule) ; champs interdits : deduction_champ_interdit()",
  verite: "valeur acceptée en ligne (jobs publiés/vendus après la coupe)",
  champs,
};
const dest = path.join(RACINE, "docs/enquetes/zero-orange-1810/banc-deduction.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${JSON.stringify(resultat, null, 2)}\n`);
console.table(champs.map(({ articles, ...c }) => c));
console.log(`→ ${path.relative(RACINE, dest)} (${champs.filter((c) => c.servi).length} champ(s) sans un faux, ${champs.filter((c) => c.faux > 0).length} avec au moins un faux)`);
