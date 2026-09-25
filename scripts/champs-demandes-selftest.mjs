// ═══════════════════════════════════════════════════════════════════════════
// UNE QUESTION À PLUSIEURS CHAMPS S'AFFICHE EN ENTIER, AVEC SES UNITÉS (25/09)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : Jocabroc, job 80d0704f (eBay, « Panier décoratif vintage
// Walther ») — needsUserField = Hauteur, needsUserFields = Largeur, Longueur
// (le handler eBay ne répète pas le premier). La liste « à compléter » disait
// « Largeur et Longueur », la fiche « Hauteur » : aucun écran ne disait les
// trois, et aucune case ne disait « cm ». Ce contrôle exécute le code livré
// (utils/etatsPublication, utils/stockFiltres, utils/shared,
// utils/champsDimension) sur la ligne réelle.
//
//   node --import ./scripts/loader-ext.mjs scripts/champs-demandes-selftest.mjs

import { libellesChampsDemandes, natureAttente } from "../src/utils/etatsPublication.js";
import { champManquant } from "../src/utils/stockFiltres.js";
import { needsUserOuvrable } from "../src/utils/shared.js";
import { uniteDuChamp, valeurAvecUnite, nombreSansUnite } from "../src/utils/champsDimension.js";

let ko = 0;
const ok = (c, quoi, vu) => { if (!c) { ko++; console.log(`  ✗ ${quoi}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); } else console.log(`  ✓ ${quoi}`); };

const jocabroc = {
  id: "80d0704f-d32f-4eda-b506-a80f0f18364c", platform: "ebay", action: "publish", status: "needs_user",
  error: "eBay a besoin de ces informations pour publier l'article : Hauteur, Largeur, Longueur.",
  platform_fields: {
    needsUserField: { target: { key: "Hauteur", root: "ebayAspects" }, platform: "ebay", field_key: "Hauteur", field_label: "Hauteur" },
    needsUserFields: [
      { target: { key: "Largeur", root: "ebayAspects" }, platform: "ebay", field_key: "Largeur", field_label: "Largeur" },
      { target: { key: "Longueur", root: "ebayAspects" }, platform: "ebay", field_key: "Longueur", field_label: "Longueur" },
    ],
  },
};
// Référentiel eBay réel (catégorie 125072) : saisie libre, suggestions avec unité.
const SUGG_HAUTEUR = ["20 cm", "15 cm", "31 cm", "9\"", "10\"", "14\"", "15\"", "18\"", "20\"", "21\"", "22\"", "24\"", "25\"", "26\"", "30\""];

console.log("1. Les trois champs sont nommés, partout");
ok(JSON.stringify(libellesChampsDemandes(jocabroc.platform_fields)) === JSON.stringify(["Hauteur", "Largeur", "Longueur"]),
  "libellés : Hauteur, Largeur, Longueur", libellesChampsDemandes(jocabroc.platform_fields));
ok(natureAttente(jocabroc).kind === "attente_champ" && natureAttente(jocabroc).champ === "Hauteur, Largeur, Longueur",
  "fiche / stepper : « Compléter « Hauteur, Largeur, Longueur » »", natureAttente(jocabroc));
ok(champManquant(jocabroc) === "Hauteur, Largeur et Longueur", "liste « à compléter » : « il manque Hauteur, Largeur et Longueur »", champManquant(jocabroc));
ok(champManquant(jocabroc, "en") === "Hauteur, Largeur and Longueur", "anglais : « … and Longueur »", champManquant(jocabroc, "en"));

console.log("2. Ce qui s'affichait déjà juste ne bouge pas");
{
  const un = { platform: "leboncoin", status: "needs_user", platform_fields: { needsUserField: { field_key: "decoration_type", field_label: "Produit" } } };
  ok(natureAttente(un).champ === "Produit", "un seul champ : « Produit », comme avant", natureAttente(un));
  ok(champManquant(un) === "le produit", "liste : « le produit », comme avant", champManquant(un));
  // Leboncoin PRO répète le premier dans needsUserFields : pas de doublon.
  const lbc = { platform: "leboncoin", status: "needs_user", platform_fields: {
    needsUserField: { field_key: "condition", field_label: "État" },
    needsUserFields: [{ field_key: "condition", field_label: "État" }, { field_key: "poids", field_label: "Poids du colis" }],
  } };
  ok(champManquant(lbc) === "État et Poids du colis", "Leboncoin : « État et Poids du colis », sans doublon (libellés comme avant)", champManquant(lbc));
  const cac = { platform: "vinted", status: "needs_user", platform_fields: { champs_a_completer: ["taille"] } };
  ok(natureAttente(cac).champ === "taille", "champs_a_completer : inchangé", natureAttente(cac));
}

console.log("3. Une question sans champ principal a son écran");
{
  const sansPrincipal = { status: "needs_user", platform_fields: { needsUserFields: [{ field_key: "Largeur", field_label: "Largeur" }] } };
  ok(needsUserOuvrable(sansPrincipal) === true, "needsUserFields seuls : la modale s'ouvre");
  ok(needsUserOuvrable(jocabroc) === true, "Jocabroc : la modale s'ouvre");
  ok(needsUserOuvrable({ status: "needs_user", platform_fields: {} }) === false, "rien à demander : pas de bouton vide");
  ok(needsUserOuvrable({ ...jocabroc, status: "pending" }) === false, "hors needs_user : rien");
}

console.log("4. Les dimensions eBay se saisissent librement, avec leur unité");
ok(uniteDuChamp("ebay", "Hauteur", "Hauteur", SUGG_HAUTEUR) === "cm", "Hauteur : cm");
ok(uniteDuChamp("ebay", "Largeur", "Largeur", []) === "cm" && uniteDuChamp("ebay", "Longueur", "Longueur", null) === "cm",
  "Largeur / Longueur sans suggestions : cm (reconnus par leur nom)");
ok(uniteDuChamp("ebay", "Matière doublure externe", "Matière doublure externe", ["Coton", "Lin"]) === null, "un aspect ordinaire : pas d'unité");
ok(uniteDuChamp("leboncoin", "Hauteur", "Hauteur", []) === null, "hors eBay : rien ne change");
ok(uniteDuChamp("ebay", "Taille du plateau", "Taille du plateau", ["20 cm", "30 cm", "40 cm"]) === "cm", "suggestions en cm : cm");
ok(valeurAvecUnite("30", "cm") === "30 cm" && valeurAvecUnite("30,5", "cm") === "30,5 cm", "« 30 » part en « 30 cm », « 30,5 » en « 30,5 cm »");
ok(valeurAvecUnite("30 cm", "cm") === "30 cm" && valeurAvecUnite("12\"", "cm") === "12\"" && valeurAvecUnite("1,2 m", "cm") === "1,2 m",
  "une valeur qui porte son unité part telle quelle (jamais convertie)");
ok(valeurAvecUnite("Rouge", null) === "Rouge", "champ ordinaire : valeur inchangée");
ok(nombreSansUnite("20 cm", "cm") === "20" && nombreSansUnite("20", "cm") === "20", "la case montre le nombre, l'unité est à côté");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout passe");
process.exit(ko ? 1 : 0);
