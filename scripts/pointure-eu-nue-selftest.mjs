// selftest:pointure-eu-nue — (25/10, point 5 de Nico) une pointure « EU N » est la pointure « N » d'une grille de
// pointures nue (Leboncoin « Pointure », Beebs « Pointure », Vinted chaussures). Cas : Marta MELE (« EU 37.5 » →
// question « Pointure » Leboncoin, 10 abandons le 24/10) et 90ace0e4 (« EU 31 » → « 16 » posé à la question, parti
// ainsi sur Leboncoin et Beebs). Jamais UK/US/IT/DE, jamais une demi-pointure arrondie, jamais un vêtement.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const L = await import(pathToFileURL(join(ROOT, "src/publication/moteur/listes.js")).href);
let ko = 0, n = 0;
const ok = (titre, cond, detail = "") => { n++; if (cond) console.log(`✓ ${titre}`); else { ko++; console.log(`✗ ${titre} ${detail}`); } };
const juge = (platform, key, value, allowedValues, cheminCategorie = null) =>
  L.jugerValeurContreListe({ platform, key, value, allowedValues, cheminCategorie });

// Grilles relevées (platform_category_aspects, 24/10).
const LBC = [];
for (let h = 32; h <= 99; h++) LBC.push(h % 2 ? `${(h - 1) / 2},5` : String(h / 2));
LBC.push("50 et plus");
const BEEBS_FEMME = ["34", "34.5", "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", "40", "40.5", "41", "41.5", "42", "42.5", "43", "43.5", "44", "44.5", "45", "45.5", "46", "Taille unique", "Autre"];
const BEEBS_ENFANT = Array.from({ length: 27 }, (_, i) => String(15 + i));
const VINTED_HOMME = ["38", "38,5", "39", "39,5", "40", "40,5", "41", "41,5", "42", "42,5", "43", "43,5", "44", "44,5", "45", "45,5", "46", "46,5", "47", "47,5", "48", "48,5", "49", "50", "51", "52", "Taille unique", "Autre"];

console.log("1. Leboncoin « Pointure » (shoe_size) : « EU N » est « N »");
ok("« EU 37.5 » (Marta) → « 37,5 »", juge("leboncoin", "shoe_size", "EU 37.5", LBC).valeurListe === "37,5");
ok("« EU 31 » (90ace0e4) → « 31 », jamais « 16 »", juge("leboncoin", "shoe_size", "EU 31", LBC).valeurListe === "31");
ok("« EU 38 » → « 38 » ; « EUR 38 » → « 38 » ; « EU 37,5 » → « 37,5 »",
  juge("leboncoin", "shoe_size", "EU 38", LBC).valeurListe === "38" && juge("leboncoin", "shoe_size", "EUR 38", LBC).valeurListe === "38"
  && juge("leboncoin", "shoe_size", "EU 37,5", LBC).valeurListe === "37,5");
ok("« 37.5 » nu : inchangé (« 37,5 »)", juge("leboncoin", "shoe_size", "37.5", LBC).valeurListe === "37,5");
ok("UK / US / IT ne se lisent jamais", ["UK 5", "US 7", "IT 38", "UK5"].every((v) => juge("leboncoin", "shoe_size", v, LBC).dans === false));
ok("« EU 99 » hors grille → question", juge("leboncoin", "shoe_size", "EU 99", LBC).dans === false);
ok("tailleDuJob Leboncoin : « EU 37.5 » part « 37,5 »", L.tailleDuJob({ platform: "leboncoin", taille: "EU 37.5", lignes: [{ key: "shoe_size", allowedValues: LBC }] }) === "37,5");

console.log("\n2. Beebs « Pointure » : même règle ; « Taille » (vêtement) ne bouge pas");
ok("« EU 37.5 » → « 37.5 » (femme)", juge("beebs", "Pointure", "EU 37.5", BEEBS_FEMME).valeurListe === "37.5");
ok("« EU 31 » → « 31 » (enfant)", juge("beebs", "Pointure", "EU 31", BEEBS_ENFANT).valeurListe === "31");
ok("« EU 38.5 » sur une grille d'entiers : hors liste, jamais « 38 »", juge("beebs", "Pointure", "EU 38.5", BEEBS_ENFANT).dans === false && juge("beebs", "Pointure", "EU 38.5", BEEBS_ENFANT).suggested === null);
ok("« Taille » (vêtement) « EU 38 » sur une grille nue : jamais « 38 » (point G)", juge("beebs", "Taille", "EU 38", ["34", "36", "38", "40"]).dans === false);

console.log("\n3. Vinted : seulement un rayon Chaussures");
ok("sans rayon : « EU 39 » reste hors liste (point G, comme avant)", juge("vinted", "size", "EU 39", ["38", "38.5", "39"]).valeurListe === null);
ok("Hommes › Chaussures › Baskets : « EU 42.5 » → « 42,5 »", juge("vinted", "size", "EU 42.5", VINTED_HOMME, ["Hommes", "Chaussures", "Baskets"]).valeurListe === "42,5");
ok("Femmes › Vêtements › Robes : « EU 38 » → jamais « 38 »", juge("vinted", "size", "EU 38", ["34", "36", "38", "40"], ["Femmes", "Vêtements", "Robes"]).dans === false);
ok("grille qui écrit « EU 38 » : l'exact fait foi", juge("vinted", "size", "EU 38", ["EU 38", "38"], ["Femmes", "Chaussures", "Bottes"]).valeurListe === "EU 38");

console.log("\n4. Ce qui passait ne bouge pas");
ok("Leboncoin clothing_st « XS » → « 34 - XS »", juge("leboncoin", "clothing_st", "XS", ["32 - XXS", "34 - XS", "36 - S"]).valeurListe === "34 - XS");
ok("Opla : jamais touchée (« EU 44 » sur une grille d'entiers reste hors liste)", juge("opla", "size", "EU 44", Array.from({ length: 37 }, (_, i) => String(14 + i)), ["Hommes", "Chaussures", "Baskets"]).dans === false);
ok("estChampPointure : seulement shoe_size, Pointure, size d'un rayon Chaussures",
  L.estChampPointure("leboncoin", "shoe_size") && !L.estChampPointure("leboncoin", "clothing_st") && L.estChampPointure("beebs", "Pointure")
  && !L.estChampPointure("beebs", "Taille") && !L.estChampPointure("vinted", "size") && L.estChampPointure("vinted", "size", ["Enfants", "Filles", "Chaussures"]));

console.log("\n5. Câblage");
const src = readFileSync(join(ROOT, "src/publication/moteur/listes.js"), "utf8");
const corps = src.slice(src.indexOf("export function jugerValeurContreListe"), src.indexOf("export function tailleDuJob"));
ok("jugerValeurContreListe appelle pointureNuePourEu après tailleDansGrille", corps.indexOf("pointureNuePourEu(") > corps.indexOf("tailleDansGrille("));

console.log(ko ? `\n✗ pointure-eu-nue : ${ko}/${n} contrôle(s) rouge(s)` : `\n✓ pointure-eu-nue : ${n}/${n} contrôles verts`);
process.exit(ko ? 1 : 0);
