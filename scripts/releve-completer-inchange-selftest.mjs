// ═══════════════════════════════════════════════════════════════════════════
// RELEVÉ SERVEUR : AUCUNE LIGNE INCHANGÉE RÉÉCRITE — garde (25/10/2026)
//   node scripts/releve-completer-inchange-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré le 25/10 : releve-completer (cron 28) écrivait « 600 écrites, 0 inchangée » à chaque passage Beebs depuis au
// moins le 18/10 (≈ 57 600 réécritures par jour, chacune relançant annonce_vers_fiche) : memeContenu comparait
// JSON.stringify d'un jsonb relu (clés rangées par Postgres) à celui d'un objet JS (ordre d'insertion). Ce test
// EXÉCUTE la comparaison du fichier (types retirés) sur un cas réel de forme : mêmes valeurs, autre ordre.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "supabase/functions/releve-completer/index.ts"), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

const extraire = (nom) => {
  const i = src.indexOf(`function ${nom}(`);
  if (i < 0) throw new Error(`${nom} introuvable`);
  let j = src.indexOf("{", i), prof = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === "{") prof++; else if (src[k] === "}") { prof--; if (!prof) return src.slice(i, k + 1); } }
  throw new Error(`${nom} non fermée`);
};
const sansTypes = (s) => s
  .replace(/\(x: unknown, y: Record<string, unknown>\): boolean/, "(x, y)")
  .replace(/\(v: unknown\): string/, "(v)")
  .replace(/ as Record<string, unknown>/g, "")
  .replace(/\(k\) =>/g, "(k) =>");
const code = `${sansTypes(extraire("canonique"))}\n${sansTypes(extraire("memeContenu"))}\nreturn { canonique, memeContenu };`;
const { memeContenu } = new Function(code)();

// Un jsonb relu : Postgres range les clés (longueur puis octets) ; l'objet JS garde l'ordre d'insertion.
const js = { titre: "Robe fleurie", description: "Très bon état", marque: "Kiabi", etat: "Très bon état", taille: "38",
  prix: 12.5, attributs: { size: "38", brand: "Kiabi", color: ["Bleu", "Blanc"] }, lu_le: "2026-10-25T10:00:00Z" };
const relu = { etat: "Très bon état", prix: 12.5, titre: "Robe fleurie", marque: "Kiabi", taille: "38",
  attributs: { size: "38", brand: "Kiabi", color: ["Bleu", "Blanc"] }, description: "Très bon état", lu_le: "2026-10-24T09:00:00Z" };
ok(memeContenu(relu, js), "mêmes valeurs, autre ordre des clés (jsonb relu) : INCHANGÉE — aucune écriture");
ok(!memeContenu({ ...relu, prix: 13 }, js), "un prix qui change : écrite");
ok(!memeContenu({ ...relu, attributs: { ...relu.attributs, color: ["Bleu"] } }, js), "une couleur qui change (niveau imbriqué) : écrite");
ok(!memeContenu({ ...relu, attributs: { ...relu.attributs, color: ["Blanc", "Bleu"] } }, js), "l'ordre d'une LISTE compte (photos, couleurs) : écrite");
ok(!memeContenu(null, js) && !memeContenu("x", js), "rien de relu : écrite");
ok(/if \(memeContenu\(l\.donnees_index, d\)\) \{ bilan\.inchangees\+\+; continue; \}/.test(src), "Beebs : une annonce inchangée n'est jamais réécrite (bilan.inchangees)");

console.log(`\n${rouges ? "✗" : "✓"} releve-completer-inchange : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
