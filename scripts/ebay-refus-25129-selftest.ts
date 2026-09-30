import assert from "node:assert/strict";
import { lireRefus25129, type ErreurEbay } from "../supabase/functions/_shared/ebay-publication.ts";

// Refus 25129 réels du 30/09 (patrick.giry07) : l'aspect est en « 3 », la
// valeur en « 4 », « 2 » vaut « 500 ».
const refus30_09 = (valeur: string): ErreurEbay => ({
  errorId: 25129,
  message: "The product aspects for this category no longer support custom values for Taille. Your listing was not published.",
  params: [
    { name: "0", value: "Saisissez une valeur valide pour Taille." },
    { name: "1", value: `${valeur} n'est pas une valeur valide pour Taille. Sélectionnez une valeur parmi les options disponibles.` },
    { name: "2", value: "500" },
    { name: "3", value: "Taille" },
    { name: "4", value: valeur },
  ],
});
const aspects = ["Marque", "Département", "Taille", "Couleur", "Type", "Style"];

for (const v of ["38", "17-1/2", "33/32"]) {
  assert.deepEqual(lireRefus25129(refus30_09(v), aspects), { nomAspect: "Taille", valeurRefusee: v }, `30/09 ${v}`);
}

// Format relevé le 06/09 (Adidas) : aspect en « 2 », valeur en « 3 ».
assert.deepEqual(
  lireRefus25129({ errorId: 25129, message: "", params: [{ name: "2", value: "Taille" }, { name: "3", value: "T-shirt" }] }, aspects),
  { nomAspect: "Taille", valeurRefusee: "T-shirt" },
);

// Aucun nom d'aspect reconnu → rien (le worker garde son rejeu unique puis le refus tel quel).
assert.deepEqual(lireRefus25129(refus30_09("38"), ["Marque"]), { nomAspect: "", valeurRefusee: "" });
// Catalogue illisible → rien.
assert.deepEqual(lireRefus25129(refus30_09("38"), []), { nomAspect: "", valeurRefusee: "" });
// Seul le message anglais nomme l'aspect.
assert.deepEqual(
  lireRefus25129({ errorId: 25129, message: "The product aspects for this category no longer support custom values for Taille. Your listing was not published.", params: [] }, aspects),
  { nomAspect: "Taille", valeurRefusee: "" },
);

console.log("OK — refus 25129 : aspect et valeur lus par leur sens (formats 06/09 et 30/09)");
