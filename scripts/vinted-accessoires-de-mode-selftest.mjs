// ═══════════════════════════════════════════════════════════════════════════
// Selftest « Vinted : le niveau Accessoires a disparu, Accessoires de mode est une racine » (06/11, Nico, point 8)
//   node scripts/vinted-accessoires-de-mode-selftest.mjs
// LE CAS : Jean-Luc LASSARAT (Premium), publication Vinted arrêtée « Vinted ne propose pas « Accessoires » à cet
// endroit de son catalogue » — chemin Hommes > Accessoires > Autres (#99), qui n'existe plus. Arbre VIVANT relu le
// 06/11 (/api/v2/item_upload/catalogs, 2 874 nœuds) : racines Accessoires de mode #5496, Femmes, Hommes, Enfants, Maison,
// Électronique, Livres et médias, Loisirs et collections, Sport ; Hommes = Vêtements, Chaussures, Sacs et sacoches (#94),
// Chapeaux et casquettes (#86), Soins ; Femmes = Vêtements, Chaussures, Sacs, Chapeaux et casquettes, Beauté ;
// Accessoires de mode = Bandanas et foulards, Ceintures #5542, Bretelles, Gants #5547, Accessoires pour cheveux,
// Mouchoirs, Bijoux #5498 (10 feuilles), Porte-clés #5552, Pochettes de costume, Écharpes et châles #5555, Lunettes de
// soleil #5546, Cravates et nœuds papillon #5553, Parapluies #5557, Montres #5570.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { getVintedCategoryPath, vintedGenreRequired, vintedCategoryStatus, feuilleBijouVinted } from "../src/utils/vintedCategories.js";

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Les feuilles de l'arbre vivant du 06/11 que la règle peut produire (ids relevés).
const VIVANT = {
  "Hommes > Sacs et sacoches > Sacs à bandoulière": 247, "Hommes > Sacs et sacoches > Porte-monnaie": 248,
  "Hommes > Sacs et sacoches > Sacs à dos": 246, "Hommes > Sacs et sacoches > Sacs de sport": 2961,
  "Hommes > Sacs et sacoches > Sacs banane": 1799, "Hommes > Sacs et sacoches > Bagages et valises": 1862,
  "Femmes > Chapeaux et casquettes > Casquettes": 230, "Hommes > Chapeaux et casquettes > Casquettes": 287,
  "Enfants > Vêtements pour filles > Chapeaux et casquettes": 1577, "Enfants > Vêtements pour filles > Porte-monnaie": 1584,
  "Enfants > Vêtements pour garçons > Porte-monnaie": 1745,
  "Accessoires de mode > Écharpes et châles": 5555, "Accessoires de mode > Gants": 5547, "Accessoires de mode > Lunettes de soleil": 5546,
  "Accessoires de mode > Montres": 5570, "Accessoires de mode > Ceintures": 5542, "Accessoires de mode > Cravates et nœuds papillon": 5553,
  "Accessoires de mode > Parapluies": 5557, "Accessoires de mode > Porte-clés": 5552,
  "Accessoires de mode > Bijoux > Bagues": 5569, "Accessoires de mode > Bijoux > Colliers": 5568, "Accessoires de mode > Bijoux > Bracelets": 5561,
  "Accessoires de mode > Bijoux > Boucles d'oreilles": 5565, "Accessoires de mode > Bijoux > Bracelets de cheville": 5559,
};
const vit = (p) => p != null && Object.prototype.hasOwnProperty.call(VIVANT, p.join(" > "));

console.log("1. Plus aucun chemin par un niveau « Accessoires » (il n'existe plus nulle part)");
const src = readFileSync(new URL("../src/utils/vintedCategories.js", import.meta.url), "utf8");
ok("vintedCategories.js : aucun segment \"Accessoires\"", !/"Accessoires"/.test(src));

console.log("2. Sacs et chapeaux : par genre, un niveau plus haut");
for (const [i, g] of [["👜", "Homme"], ["👛", "Homme"], ["🎒", "Homme"], ["🎽", "Homme"], ["👝", "Homme"], ["🧳", "Homme"], ["🧢", "Femme"], ["🧢", "Homme"], ["🧢", "Fille"], ["👛", "Fille"], ["👛", "Garçon"]]) {
  const p = getVintedCategoryPath(i, g); ok(`${i} ${g} → ${p?.join(" > ")}`, vit(p), JSON.stringify(p));
}

console.log("3. Accessoires de mode : sans genre, pour tous");
for (const i of ["🧣", "🧤", "🕶️", "⌚", "🪢", "🎀", "☂️", "🗝️"]) {
  const pF = getVintedCategoryPath(i, "Femme"), pH = getVintedCategoryPath(i, "Homme"), pE = getVintedCategoryPath(i, "Garçon");
  ok(`${i} → ${pF?.join(" > ")} (Femme, Homme, Garçon identiques, aucun genre demandé)`, vit(pF) && eq(pF, pH) && eq(pF, pE) && !vintedGenreRequired(i), JSON.stringify([pF, pH, pE]));
}

console.log("4. Bijoux : la feuille que le titre nomme, sinon la question");
ok("« Bague argent 925 » → Bagues", eq(getVintedCategoryPath("💍", "Femme", "Bague argent 925"), ["Accessoires de mode", "Bijoux", "Bagues"]));
ok("« Boucles d'oreilles créoles » → Boucles d'oreilles (avant « bagues »)", eq(feuilleBijouVinted("Boucles d'oreilles créoles"), ["Accessoires de mode", "Bijoux", "Boucles d'oreilles"]));
ok("« Bracelet de cheville » → Bracelets de cheville (avant « bracelet »)", eq(feuilleBijouVinted("Bracelet de cheville"), ["Accessoires de mode", "Bijoux", "Bracelets de cheville"]));
ok("« Collier homme acier » → Colliers", vit(getVintedCategoryPath("💍", "Homme", "Collier homme acier")));
ok("« Bijou fantaisie » → null (aucune feuille devinée), statut no_default (la branche existe)", getVintedCategoryPath("💍", "Femme", "Bijou fantaisie") === null && vintedCategoryStatus("💍") === "no_default");
ok("« Baguette magique » : jamais « Bagues » (mot entier)", feuilleBijouVinted("Baguette magique") === null);

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
