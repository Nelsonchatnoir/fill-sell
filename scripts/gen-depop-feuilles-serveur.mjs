// ═══════════════════════════════════════════════════════════════════════════
// LES FEUILLES DEPOP DU MOTEUR DE RAYON — partagées app / serveur (11/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Source : docs/plateformes/depop/arbre.json (relevé du 08/10, généré par
// gen-depop-referentiel.mjs). Sortie : supabase/functions/_shared/depop-feuilles.js,
// lue par _shared/depop-rayon.js (le moteur : l'IA choisit DANS ces feuilles,
// sous des libellés corrigés), donc par l'app ET par le serveur (handler-watch,
// get-pending-jobs) — un seul référentiel, aucun import de src/ côté Deno.
//
// Chaque feuille : son IDENTIFIANT (département/groupe/type — le seul qui part
// dans le job), ses libellés français et anglais TELS QUE DEPOP LES SERT (les
// corrections vivent dans depop-rayon.js, à la main, nommées une par une),
// `officielle` (l'API rattache le type au département : seules ces feuilles
// ont une grille de tailles — cf. utils/depopCategories.js) et `enfant`
// (genre enfant requis par le formulaire).
//
//   node scripts/gen-depop-feuilles-serveur.mjs            → régénère
//   node scripts/gen-depop-feuilles-serveur.mjs --verifier → échoue si le fichier diffère
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(RACINE, "docs/plateformes/depop/arbre.json");
const CIBLE = path.join(RACINE, "supabase/functions/_shared/depop-feuilles.js");

export function construire(arbre) {
  const noeuds = Array.isArray(arbre.noeuds) ? arbre.noeuds : Object.values(arbre.noeuds ?? {});
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  const fr = (n) => String(n?.libelle_fr ?? n?.libelle_en ?? n?.id ?? "").trim();
  const en = (n) => String(n?.libelle_en_gb ?? n?.libelle_en ?? n?.id ?? "").trim();
  const feuilles = [];
  for (const n of noeuds) {
    if (!n.feuille || n.statut !== "active" || n.proposee_par_formulaire !== true) continue;
    const parts = String(n.id).split("/");
    if (parts.length !== 3) continue;
    const d = parId.get(parts[0]);
    const g = parId.get(parts.slice(0, 2).join("/"));
    feuilles.push({
      id: n.id,
      fr: [fr(d), fr(g), fr(n)],
      en: [en(d), en(g), en(n)],
      officielle: n.liste_officielle === true,
      enfant: n.genre_enfant_requis === true,
    });
  }
  feuilles.sort((a, b) => a.id.localeCompare(b.id));
  return feuilles;
}

const estPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (estPrincipal) {
  const arbre = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const feuilles = construire(arbre);
  const texte = [
    "// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.",
    "//   node scripts/gen-depop-feuilles-serveur.mjs",
    `// Source : docs/plateformes/depop/arbre.json (relevé du ${String(arbre.releve_le ?? "").slice(0, 10)}).`,
    "// Lu par _shared/depop-rayon.js (moteur de rayon Depop, app ET serveur).",
    "// `id` = département/groupe/type — c'est lui, et lui seul, qui part dans le job.",
    `export const FEUILLES_DEPOP = ${JSON.stringify(feuilles, null, 0).replace(/\},\{/g, "},\n  {").replace(/^\[\{/, "[\n  {").replace(/\}\]$/, "},\n]")};`,
    "",
  ].join("\n");
  if (process.argv.includes("--verifier")) {
    const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, "utf8").split("\r\n").join("\n") : "";
    if (actuel !== texte) { console.error(`⛔ ${path.relative(RACINE, CIBLE)} ne correspond plus à arbre.json — node scripts/gen-depop-feuilles-serveur.mjs`); process.exit(1); }
    console.log(`✓ ${path.relative(RACINE, CIBLE)} à jour (${feuilles.length} feuilles).`);
  } else {
    fs.writeFileSync(CIBLE, texte);
    console.log(`${path.relative(RACINE, CIBLE)} : ${feuilles.length} feuilles.`);
  }
}
