// ═══════════════════════════════════════════════════════════════════════════
// LES FEUILLES DEPOP QUE LA PERSONNE PEUT CHOISIR — pour l'app (09/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Source : docs/plateformes/depop/arbre.json (relevé du 08/10, généré par
// gen-depop-referentiel.mjs). Sortie : src/utils/arbres/depopFeuilles.js.
//
// ⛔ CETTE LISTE NE SERT QU'AU CHOIX À LA MAIN (CarteRayon, « rayon à
//    choisir »). Elle n'entre JAMAIS dans une résolution automatique par le mot
//    (categorieParMot.feuillesDe('depop') rend [] exprès) : les libellés
//    français de Depop sont parfois faux ou en double — une personne qui lit
//    « Femme › Hauts › T-shirts (Shirts) » choisit en connaissance de cause, une
//    recherche automatique se tromperait. Un libellé français en double parmi
//    ses frères porte donc son libellé anglais entre parenthèses.
// Chaque feuille garde son IDENTIFIANT (département/groupe/type) : c'est lui,
// et lui seul, qui part dans le job (depopCategoryPath).
// Seules les feuilles ACTIVES que le formulaire de Depop propose sont là.
//
//   node scripts/gen-depop-feuilles-app.mjs            → régénère
//   node scripts/gen-depop-feuilles-app.mjs --verifier → échoue si le fichier diffère
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(RACINE, "docs/plateformes/depop/arbre.json");
const CIBLE = path.join(RACINE, "src/utils/arbres/depopFeuilles.js");

export function construire(arbre) {
  const noeuds = Array.isArray(arbre.noeuds) ? arbre.noeuds : Object.values(arbre.noeuds ?? {});
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  // Libellé d'un nœud, désambiguïsé par l'anglais quand un frère porte le même.
  const freres = new Map();
  for (const n of noeuds) {
    const k = `${n.parent ?? ""}|${String(n.libelle_fr ?? "").trim().toLowerCase()}`;
    freres.set(k, (freres.get(k) ?? 0) + 1);
  }
  const libelle = (n) => {
    const fr = String(n.libelle_fr ?? n.libelle_en ?? n.id).trim();
    const k = `${n.parent ?? ""}|${fr.toLowerCase()}`;
    const en = String(n.libelle_en_gb ?? n.libelle_en ?? "").trim();
    return (freres.get(k) ?? 0) > 1 && en && en.toLowerCase() !== fr.toLowerCase() ? `${fr} (${en})` : fr;
  };
  const feuilles = [];
  for (const n of noeuds) {
    if (!n.feuille || n.statut !== "active" || n.proposee_par_formulaire !== true) continue;
    const chemin = [];
    for (let c = n; c; c = c.parent ? parId.get(c.parent) : null) chemin.unshift(libelle(c));
    if (String(n.id).split("/").length !== 3) continue;
    feuilles.push({ id: n.id, chemin });
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
    "//   node scripts/gen-depop-feuilles-app.mjs",
    `// Source : docs/plateformes/depop/arbre.json (relevé du ${String(arbre.releve_le ?? "").slice(0, 10)}).`,
    "// Pour le CHOIX À LA MAIN seulement (CarteRayon) : jamais une résolution",
    "// automatique par le mot (cf. categorieParMot.feuillesDe('depop')).",
    "// `id` = département/groupe/type — c'est lui qui part dans le job.",
    `export const FEUILLES = ${JSON.stringify(feuilles, null, 0).replace(/\},\{/g, "},\n  {").replace(/^\[\{/, "[\n  {").replace(/\}\]$/, "},\n]")};`,
    "",
  ].join("\n");
  if (process.argv.includes("--verifier")) {
    const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, "utf8").split("\r\n").join("\n") : "";
    if (actuel !== texte) { console.error(`⛔ ${path.relative(RACINE, CIBLE)} ne correspond plus à arbre.json — node scripts/gen-depop-feuilles-app.mjs`); process.exit(1); }
    console.log(`✓ ${path.relative(RACINE, CIBLE)} à jour (${feuilles.length} feuilles).`);
  } else {
    fs.writeFileSync(CIBLE, texte);
    console.log(`${path.relative(RACINE, CIBLE)} : ${feuilles.length} feuilles.`);
  }
}
