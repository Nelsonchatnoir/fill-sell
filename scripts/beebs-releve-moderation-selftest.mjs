import fs from "node:fs";
import assert from "node:assert/strict";

const background = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");

// Forme réelle du flux RSC relevée sur « En cours de vérification » le
// 29/09/2026. La clé React de chaque ligne est l'identifiant produit exact.
const flux = String.raw`self.__next_f.push([1,"100:[\"$\",\"div\",\"34076509\",{\"className\":\"px-section w-section border-grey-metal flex flex-wrap items-center gap-x-10 gap-y-2 border-b border-solid py-5\",\"children\":[]}]
101:[\"$\",\"div\",\"33640171\",{\"className\":\"px-section w-section border-grey-metal flex flex-wrap items-center gap-x-10 gap-y-2 border-b border-solid py-5\",\"children\":[]}]\n"]);`;
const cleCarteRsc = /\\?"div\\?",\\?"(\d{6,})\\?",\{\\?"className\\?":\\?"px-section w-section border-grey-metal flex flex-wrap items-center gap-x-10 gap-y-2 border-b border-solid py-5\\?"/g;

assert.deepEqual([...flux.matchAll(cleCarteRsc)].map((m) => m[1]), ["34076509", "33640171"],
  "les deux identifiants exacts sont lus dans l'ordre rendu par Beebs");

const bruit = String.raw`[\"$\",\"div\",\"99999999\",{\"className\":\"une-autre-carte\"}]`;
assert.deepEqual([...bruit.matchAll(cleCarteRsc)].map((m) => m[1]), [],
  "un nombre d'une autre carte n'est jamais pris pour un identifiant d'annonce");

assert.match(background, /plateforme === "beebs" && \/\\\/account\\\/my-adverts\\\/creating/,
  "le lecteur est borné à la page Beebs En cours de vérification");
assert.match(background, /idsRsc\.length > 0 && idsRsc\.length === cartesRsc\.length/,
  "un désaccord entre identifiants et cartes ferme le relevé");
assert.match(background, /source_releve: "cle_rsc_exacte"/,
  "la provenance exacte est conservée");
assert.doesNotMatch(background.slice(background.indexOf("BEEBS « EN COURS DE VÉRIFICATION »"), background.indexOf("const suivant", background.indexOf("BEEBS « EN COURS DE VÉRIFICATION »"))), /includes\(titre|titre.*===.*id|match.*titre/i,
  "le titre ne sert jamais à choisir l'identifiant");

console.log("✓ Beebs : les annonces en modération livrent leur identifiant durable exact, jamais par titre");
