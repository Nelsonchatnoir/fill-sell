// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN MAISON & JARDIN — LA FEUILLE QU'ON N'AVAIT PAS PRÉVUE (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module LIVRÉ (src/utils/lbcMaisonJardin.js) sur les DEUX titres
// réels de jocabroc8 restés bloqués le 22/09, plus des cas voisins.
//
// Ce qu'il garantit :
//   1. on ne rend JAMAIS une valeur absente des listes Leboncoin relevées ;
//   2. la paire rendue est COHÉRENTE — le Produit appartient bien à l'Univers
//      rendu avec lui (c'est la dépendance qui a fait échouer « Autre ») ;
//   3. on ne touche jamais aux clés de NOTRE propre feuille ;
//   4. sans correspondance, on ne pose RIEN (pas de repli « Autre/Autre » :
//      il ne survit pas à `skipIfPrefilled` côté extension) ;
//   5. le cas fondateur rend exactement ce que Leboncoin pré-remplit lui-même,
//      mesuré en direct sur son formulaire le 22/09 : Univers « Accessoire de
//      table », Produit « Plateau ».
//
//   node scripts/lbc-maison-jardin-secours-selftest.mjs

import {
  LBC_MAISON_JARDIN_DEPENDANTS,
  pairesMaisonJardinDeSecours,
} from "../src/utils/lbcMaisonJardin.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };

// Index inverse : clé `for=` → feuille, pour vérifier cohérence et périmètre.
const feuilleDeCle = {};
for (const [feuille, def] of Object.entries(LBC_MAISON_JARDIN_DEPENDANTS)) {
  feuilleDeCle[def.typeKey] = feuille;
  feuilleDeCle[def.produitKey] = feuille;
}

/** La paire posée pour une feuille est-elle dans les vraies listes, et cohérente ? */
function pairesValides(sortie) {
  const erreurs = [];
  const parFeuille = new Map();
  for (const [cle, valeur] of Object.entries(sortie)) {
    const feuille = feuilleDeCle[cle];
    if (!feuille) { erreurs.push(`clé inconnue « ${cle} »`); continue; }
    const e = parFeuille.get(feuille) ?? {};
    const def = LBC_MAISON_JARDIN_DEPENDANTS[feuille];
    if (cle === def.typeKey) e.univers = valeur; else e.produit = valeur;
    parFeuille.set(feuille, e);
  }
  for (const [feuille, e] of parFeuille) {
    const def = LBC_MAISON_JARDIN_DEPENDANTS[feuille];
    if (!e.univers || !e.produit) { erreurs.push(`${feuille} : paire incomplète`); continue; }
    const liste = def.produits[e.univers];
    if (!liste) { erreurs.push(`${feuille} : Univers « ${e.univers} » hors liste`); continue; }
    if (!liste.includes(e.produit)) {
      erreurs.push(`${feuille} : Produit « ${e.produit} » absent de la liste de « ${e.univers} »`);
    }
  }
  return erreurs;
}

console.log("\n── 1. Le cas fondateur, mesuré sur le vrai formulaire ──────────");
// Job 206cd33b, jocabroc8, 22/09. Notre feuille : Décoration. Leboncoin, lui,
// propose Arts de la table EN TÊTE et pré-remplit Accessoire de table /
// Plateau / Faïence (vérifié en direct le 22/09 sur leboncoin.fr).
const plateau = pairesMaisonJardinDeSecours(
  "Ancien plateau à olives faïence peint main", "Maison & Jardin > Décoration");
ok(plateau.table_art_type === "Accessoire de table",
  `Univers Arts de la table = « ${plateau.table_art_type} » (Leboncoin pré-remplit « Accessoire de table »)`);
ok(plateau.table_art_product === "Plateau",
  `Produit Arts de la table = « ${plateau.table_art_product} » (Leboncoin pré-remplit « Plateau »)`);
ok(!("house_and_garden_type" in plateau) && !("decoration_type" in plateau),
  "aucune clé de NOTRE feuille (Décoration) n'est réécrite");
ok(pairesValides(plateau).length === 0,
  `toutes les paires rendues sont dans les vraies listes et cohérentes${pairesValides(plateau).length ? " — " + pairesValides(plateau).join(" · ") : ""}`);

console.log("\n── 2. Le second cas : rien à proposer, donc on ne pose rien ────");
// Job fc5e4bff, « Présentoir vintage en bois sculpté ». Aucune liste Maison &
// Jardin ne porte « présentoir » : on se TAIT, et la personne choisit dans la
// vraie liste que le job porte déjà (needsUserField.allowed_values).
const presentoir = pairesMaisonJardinDeSecours(
  "Présentoir vintage en bois sculpté – 3 compartiments", "Maison & Jardin > Arts de la table");
ok(Object.keys(presentoir).length === 0,
  `aucun mot des listes dans ce titre → 0 clé posée (et surtout pas « Autre/Autre »)`);

console.log("\n── 3. On ne rend jamais une valeur inventée ────────────────────");
const cas = [
  ["Lot de 6 assiettes en porcelaine", "Maison & Jardin > Décoration"],
  ["Miroir mural doré ancien", "Maison & Jardin > Arts de la table"],
  ["Perceuse visseuse sans fil Bosch", "Maison & Jardin > Décoration"],
  ["Service à café en porcelaine de Limoges", "Maison & Jardin > Bricolage"],
  ["Objet sans nom connu de personne", "Maison & Jardin > Décoration"],
  ["Tapis berbère 200x300", "Maison & Jardin > Arts de la table"],
];
let erreursTotales = [];
for (const [titre, feuille] of cas) {
  const s = pairesMaisonJardinDeSecours(titre, feuille);
  const e = pairesValides(s);
  erreursTotales = erreursTotales.concat(e.map((x) => `« ${titre} » : ${x}`));
  const resume = Object.keys(s).length
    ? Object.entries(s).map(([k, v]) => `${k}=${v}`).join(" · ") : "rien";
  console.log(`    ${titre.padEnd(42)} → ${resume}`);
}
ok(erreursTotales.length === 0,
  `${cas.length} titres, 0 valeur hors liste${erreursTotales.length ? " — " + erreursTotales.join(" | ") : ""}`);

console.log("\n── 4. Jamais la feuille de départ, jamais un fourre-tout seul ──");
let fuites = 0, fourreTout = 0;
for (const feuille of Object.keys(LBC_MAISON_JARDIN_DEPENDANTS)) {
  const def = LBC_MAISON_JARDIN_DEPENDANTS[feuille];
  for (const [titre] of cas) {
    const s = pairesMaisonJardinDeSecours(titre, feuille);
    if (def.typeKey in s || def.produitKey in s) fuites++;
    // Un Produit posé sans son Univers (ou l'inverse) serait exactement la
    // panne d'origine : la dépendance rompue.
    for (const [f2, d2] of Object.entries(LBC_MAISON_JARDIN_DEPENDANTS)) {
      if (f2 === feuille) continue;
      if ((d2.typeKey in s) !== (d2.produitKey in s)) fourreTout++;
    }
  }
}
ok(fuites === 0, "aucune paire ne réécrit la feuille de départ");
ok(fourreTout === 0, "aucun Produit posé sans son Univers (la dépendance tient)");

console.log(ko === 0 ? "\n✅ MAISON & JARDIN : tout est vert.\n" : `\n❌ ${ko} contrôle(s) en échec.\n`);
process.exit(ko === 0 ? 0 : 1);
