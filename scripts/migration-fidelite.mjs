// ═══════════════════════════════════════════════════════════════════════════
// FIDÉLITÉ D'UNE MIGRATION AU CORPS EN PROD (2026-09-24)
//   node scripts/migration-fidelite.mjs <fichier.sql> <fonction>=<md5 prod> [...]
//
// Règle de Nico (23/09) : une migration qui réécrit une fonction part TOUJOURS
// de `pg_get_functiondef`, jamais du fichier du dépôt, et le rapport montre le
// diff. Ce script rend le diff VÉRIFIABLE : il extrait chaque
// `CREATE OR REPLACE FUNCTION public.<fonction>` de la migration, RETIRE les
// lignes marquées « -- AJOUT 2026-09-24 » (les seules qu'on a le droit
// d'ajouter), et compare le md5 du reste au md5 de `pg_get_functiondef` relevé
// en prod. Identique = la copie est fidèle et l'ajout est tout le diff.
//
// Exemple :
//   node scripts/migration-fidelite.mjs supabase/migrations/20260924090000_photo_empreintes_et_variantes_de_titre.sql \
//     rapprocher_classer=eb881db9419359de3a40d52dee070c1f rapprocher_importer=66ad9e3152e1a02ad5d239f44919f6d9
// ═══════════════════════════════════════════════════════════════════════════
import { createHash } from "node:crypto";
import fs from "node:fs";

const [fichier, ...attentes] = process.argv.slice(2);
if (!fichier || !attentes.length) { console.error("usage : migration-fidelite.mjs <fichier.sql> <fonction>=<md5> …"); process.exit(2); }
const sql = fs.readFileSync(fichier, "utf8").split("\r\n").join("\n");
let ko = 0;
for (const att of attentes) {
  const [nom, md5Prod] = att.split("=");
  const debut = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nom}(`);
  if (debut < 0) { console.log(`  ✗ ${nom} : introuvable dans ${fichier}`); ko++; continue; }
  const fin = sql.indexOf("\n$function$;", debut);
  if (fin < 0) { console.log(`  ✗ ${nom} : fin de corps ($function$;) introuvable`); ko++; continue; }
  const bloc = sql.slice(debut, fin + "\n$function$".length) + "\n";
  const lignes = bloc.split("\n");
  const ajouts = lignes.filter((l) => /-- AJOUT 2026-09-24/.test(l));
  const sansAjouts = lignes.filter((l) => !/-- AJOUT 2026-09-24/.test(l)).join("\n");
  const md5 = createHash("md5").update(sansAjouts).digest("hex");
  const ok = md5 === md5Prod;
  if (!ok) ko++;
  console.log(`  ${ok ? "✓" : "✗"} ${nom} : md5 sans les ajouts = ${md5}${ok ? " (= prod)" : ` ≠ prod ${md5Prod}`} · ${ajouts.length} ligne(s) ajoutée(s)`);
  for (const a of ajouts) console.log(`      + ${a.trim()}`);
}
process.exit(ko ? 1 : 0);
