// (28/10/2026) Vinted a remplacé ses menus (Catégorie, Marque, Taille, État, Couleur, Matériau…) par un composant
// « bloom » : le déclencheur est un <button class="select-root" data-testid="…-input">, la valeur choisie ne vit que
// dans son <span data-testid="…-input--value">, le <input class="select-proxy"> caché reste vide, et le bouton porte
// data-placeholder tant que rien n'est choisi. Relevé en réel sur /items/new (Femmes > Cardigans, compte de Nico).
// Tout le code relisait `.value` : « #brand porte «  » » après une marque posée (aucune publication Vinted du 27/10
// 22:57 au 28/10 soir), « le formulaire n'a pas accepté État » en republication (12 pauses du 28/10).
// Banc : les vraies fonctions extraites de vinted.js, sur de faux nœuds des deux composants.
import fs from "node:fs";
import assert from "node:assert/strict";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const src = fs.readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8");

globalThis.CSS = { escape: (s) => String(s).replace(/["\\]/g, "\\$&") };
const fonctions = ["estMenuVintedBloom", "valeurChampVinted", "readCommittedValue"]
  .map((n) => extraireFonctionJs(src, n)).join("\n");
const { valeurChampVinted, readCommittedValue } = new Function(`${fonctions}; return { estMenuVintedBloom, valeurChampVinted, readCommittedValue };`)();

// Faux nœuds : juste ce que les fonctions lisent.
function bouton(testid, { placeholder = false, affiche = "" } = {}) {
  const span = { textContent: affiche };
  const attrs = { "data-testid": testid, ...(placeholder ? { "data-placeholder": "" } : {}) };
  return {
    tagName: "BUTTON", value: "", classList: { contains: (c) => c === "select-root" },
    getAttribute: (k) => attrs[k] ?? null,
    hasAttribute: (k) => k in attrs,
    querySelector: (s) => (s === `[data-testid="${testid}--value"]` || s === ".select-value" ? span : null),
  };
}
const input = (value) => ({ tagName: "INPUT", value, getAttribute: () => null, hasAttribute: () => false });

// 1. Le nouveau composant : la valeur affichée, jamais le placeholder.
assert.equal(valeurChampVinted(bouton("brand-select-dropdown-input", { affiche: "Ottordram" })), "Ottordram");
assert.equal(valeurChampVinted(bouton("category-condition-single-list-input", { affiche: "Très bon état" })), "Très bon état");
assert.equal(valeurChampVinted(bouton("brand-select-dropdown-input", { placeholder: true, affiche: "Sélectionne une marque" })), "",
  "un menu encore vide (data-placeholder) se lit vide, jamais « Sélectionne une marque »");
assert.equal(valeurChampVinted(bouton("color-select-dropdown-input", { placeholder: true, affiche: "Sélectionne 2 couleurs maximum" })), "");
assert.equal(readCommittedValue(bouton("color-select-dropdown-input", { affiche: "Noir, Gris" })), "Noir, Gris",
  "la relecture « commitée » d'un menu bloom rend sa valeur affichée");
// 2. L'ancien composant : inchangé.
assert.equal(valeurChampVinted(input("Kiabi")), "Kiabi");
assert.equal(valeurChampVinted(input("")), "");
assert.equal(valeurChampVinted(null), "");
assert.equal(readCommittedValue(input("200,00")), "200,00");

// 3. Plus aucune lecture `.value` d'un déclencheur de menu dans le code.
const lecturesBrutes = src.match(/querySelector\((?:trigger|'#(?:brand|category|condition|size|color|material)[^)]*)\)\?\.value/g) ?? [];
assert.deepEqual(lecturesBrutes, [], "toute relecture d'un menu Vinted passe par valeurChampVinted");
for (const nom of ["selectVintedBrand", "attendreValeurMarque", "selectVintedNoBrand", "selectCategoryParIds"]) {
  assert.ok(extraireFonctionJs(src, nom).includes("valeurChampVinted("), `${nom} relit par valeurChampVinted`);
}
assert.ok(extraireFonctionJs(src, "caracteristiquesCaptureNonReposees").includes("valeurChampVinted(el)"),
  "le contrôle avant retrait relit les menus bloom");

// 4. Le déclencheur de la Taille « à puces ».
assert.match(src, /const TAILLE_TRIGGER_SEL = '[^']*\[data-testid="category-size-single-grid_chips-input"\][^']*'/,
  "la grille de tailles à puces (category-size-single-grid_chips-input) est trouvée");
assert.match(src, /size: '[^']*\[data-testid="category-size-single-grid_chips-input"\][^']*'/, "vintedFieldSelector(size) aussi");

console.log("vinted-menus-bloom : OK");

// 5. (28/10 soir, remialbertholl) Un libellé de chemin introuvable, l'identifiant du rayon connu : la pose par
//    identifiants, avant la question — seulement sur « niveau introuvable », sans choix de la personne.
{
  const i = src.indexOf("UN LIBELLÉ PÉRIMÉ, UN IDENTIFIANT CONNU");
  const bloc = src.slice(i, i + 2200);
  assert.ok(i > 0, "le repli par identifiant existe");
  assert.match(bloc, /e\?\.needsUserField\?\.field_key !== "categoryLevelChoice"/, "seulement sur un niveau introuvable");
  assert.match(bloc, /String\(fields\.categoryLevelChoice \?\? ""\)\.trim\(\)\) throw e;/, "jamais par-dessus un choix de la personne");
  assert.match(bloc, /if \(await selectCategoryParIds\(repli, warnings\)\) \{/, "la pose par identifiants du rayon connu");
  assert.match(bloc, /throw e;\s*\}\s*\}\);/, "sinon la question d'avant");
}
console.log("vinted-menus-bloom (repli rayon) : OK");

// 6. (28/10 soir, essai réel) La pose par identifiants conclut sur le bouton FERMÉ (aria-expanded / data-state), pas
//    seulement sur un panneau démonté : l'animation de fermeture ne finit pas dans une fenêtre minimisée.
{
  const corps = extraireFonctionJs(src, "selectCategoryParIds");
  assert.match(corps, /aria-expanded"\) === "false" \|\| t\.getAttribute\("data-state"\) === "closed"/, "bouton fermé = panneau fermé");
  assert.match(corps, /return v && ferme \? v : null;/, "la valeur ET la fermeture");
  assert.match(corps, /const depart = await waitFor\(/, "reprise au niveau affiché du panneau");
}
console.log("vinted-menus-bloom (pose par identifiants) : OK");
