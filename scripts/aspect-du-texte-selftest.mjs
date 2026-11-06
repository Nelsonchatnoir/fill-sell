// ═══════════════════════════════════════════════════════════════════════════
// Selftest « un aspect eBay exigé que le texte dit déjà » (06/11, Nico, point 9 — ayadi007)
//   node scripts/aspect-du-texte-selftest.mjs
// Les cas réels d'ayadi007 (catégories 11205 et 54235, listes relues dans ebay_item_aspects le 06/11) et la règle :
// une mesure NOMMÉE (ou un triple dont l'ordre est nommé) recalée sur l'option exacte ; une option écrite en toutes
// lettres ; sinon rien (la question) — jamais inventé.
// ═══════════════════════════════════════════════════════════════════════════
import { aspectDuTexte, mesuresDuTexte, dimensionDeLAspect, optionEcriteDuTexte } from "../supabase/functions/_shared/aspect-du-texte.js";

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const cm = (...v) => v.map((n) => `${n} cm`);
// 54235 (sièges) : Longueur 25…85 cm, Largeur 40…85 cm, Hauteur 40…100 cm (pas de 5) ; Type (extrait).
const LONGUEUR = cm(25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85);
const LARGEUR = cm(40, 45, 50, 55, 60, 65, 70, 75, 80, 85);
const HAUTEUR = cm(40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100);
const TYPE_54235 = ["Banc", "Canapé", "Chaise", "Chaise de bureau", "Chaise ou fauteuil de bureau", "Chaise pliante", "Fauteuil", "Fauteuil à bascule"];
// 11205 (imprimantes, scanners) : Type (extrait de la liste réelle).
const TYPE_11205 = ["Imprimante 3D", "Imprimante d'étiquettes", "Imprimante grand format", "Imprimante mobile", "Imprimante standard",
  "Imprimante tout-en-un", "Scanner à main", "Scanner à plat", "Scanner mobile", "Scanner portatif et compact", "Stylo scanner et lecteur"];

console.log("1. Les cas réels d'ayadi007 : rien d'écrit → rien de déduit (la question, jamais inventé)");
ok("« Chaise Ergonomique B300 Pro / Support lombaire adaptatif, blanc » : Longueur → null",
  aspectDuTexte({ name: "Longueur", allowedValues: LONGUEUR, textes: ["Chaise Ergonomique B300 Pro", "Support lombaire adaptatif, blanc"] }) === null);
const scan = aspectDuTexte({ name: "Type", allowedValues: TYPE_11205, textes: ["scanner de codes-barres portable Android", "Système mis à niveau : Android 14…"] });
ok("« scanner de codes-barres portable » : Type → null (aucune option écrite telle quelle : « portable » ≠ « portatif »)", scan === null, JSON.stringify(scan));
ok("« Support imprimante blanc 60x40x70cm » : triple SANS ordre nommé → aucune mesure",
  aspectDuTexte({ name: "Hauteur", allowedValues: HAUTEUR, textes: ["Support imprimante blanc 60x40x70cm", "Meuble de Rangement pour Dossier avec Roulettes 60x40x70cm"] }) === null);

console.log("2. Une mesure NOMMÉE, recalée sur l'option exacte");
const t1 = ["Chaise de bureau", "Dimensions : Longueur 60 cm, largeur : 55 cm, hauteur 1,2 m"];
ok("Longueur 60 cm → « 60 cm »", aspectDuTexte({ name: "Longueur", allowedValues: LONGUEUR, textes: t1 })?.valeur === "60 cm");
ok("largeur : 55 cm → « 55 cm »", aspectDuTexte({ name: "Largeur", allowedValues: LARGEUR, textes: t1 })?.valeur === "55 cm");
ok("hauteur 1,2 m → 120 cm, hors liste (40…100) → null", aspectDuTexte({ name: "Hauteur", allowedValues: HAUTEUR, textes: t1 }) === null);
ok("« H 70 cm » (majuscule) → Hauteur « 70 cm »", aspectDuTexte({ name: "Hauteur", allowedValues: HAUTEUR, textes: ["Tabouret H 70 cm"] })?.valeur === "70 cm");
ok("« 1m50 » nommé longueur → 150 cm (hors liste) → null", aspectDuTexte({ name: "Longueur", allowedValues: LONGUEUR, textes: ["longueur 1m50"] }) === null);
ok("« longueur : 450 mm » → « 45 cm »", aspectDuTexte({ name: "Longueur", allowedValues: LONGUEUR, textes: ["longueur : 450 mm"] })?.valeur === "45 cm");
ok("deux longueurs différentes → null", aspectDuTexte({ name: "Longueur", allowedValues: LONGUEUR, textes: ["longueur 60 cm", "longueur 65 cm"] }) === null);
ok("« Dimensions (L x l x H) : 60 x 40 x 70 cm » → L 60, l 40, H 70",
  JSON.stringify(mesuresDuTexte(["Dimensions (L x l x H) : 60 x 40 x 70 cm"])) === JSON.stringify({ longueur: [60], largeur: [40], hauteur: [70] }), JSON.stringify(mesuresDuTexte(["Dimensions (L x l x H) : 60 x 40 x 70 cm"])));
ok("« L x P x H : 80 x 45 x 95 cm » → profondeur 45", JSON.stringify(mesuresDuTexte(["L x P x H : 80 x 45 x 95 cm"])) === JSON.stringify({ longueur: [80], profondeur: [45], hauteur: [95] }));
ok("« lxlxh » tout en minuscules : ordre non sûr → rien", JSON.stringify(mesuresDuTexte(["dimensions lxlxh 60x40x70 cm"])) === "{}", JSON.stringify(mesuresDuTexte(["dimensions lxlxh 60x40x70 cm"])));
ok("« Longueur de la robe » n'est pas une mesure (sa règle à elle)", dimensionDeLAspect("Longueur de la robe") === null && dimensionDeLAspect("Longueur (cm)") === "longueur");

console.log("3. L'option écrite en toutes lettres");
ok("« Imprimante 3D Anycubic Kobra » → « Imprimante 3D »", aspectDuTexte({ name: "Type", allowedValues: TYPE_11205, textes: ["Imprimante 3D Anycubic Kobra"] })?.valeur === "Imprimante 3D");
ok("« Chaise de bureau ergonomique » → la plus précise « Chaise de bureau » (pas « Chaise »)",
  aspectDuTexte({ name: "Type", allowedValues: TYPE_54235, textes: ["Chaise de bureau ergonomique"] })?.valeur === "Chaise de bureau");
const deux = optionEcriteDuTexte({ allowedValues: TYPE_54235, textes: ["Lot : un banc et un fauteuil"] });
ok("deux options sans lien (banc, fauteuil) → candidates, rien de posé", !deux?.valeur && deux?.candidats?.length === 2, JSON.stringify(deux));
ok("accents et casse près : « scanner A PLAT » → « Scanner à plat »", aspectDuTexte({ name: "Type", allowedValues: TYPE_11205, textes: ["Scanner A PLAT Canon"] })?.valeur === "Scanner à plat");
ok("mot entier seulement : « Banco » ne nomme pas « Banc »", aspectDuTexte({ name: "Type", allowedValues: TYPE_54235, textes: ["Tabouret Banco"] }) === null);
ok("jamais une option vague (« Autre », « Oui »)", aspectDuTexte({ name: "Style", allowedValues: ["Autre", "Oui"], textes: ["Autre modèle, oui vraiment"] }) === null);
ok("jamais la marque, la taille, la couleur, l'état", ["Marque", "Taille", "Couleur", "État"].every((n) => aspectDuTexte({ name: n, allowedValues: ["Canon", "M", "Noir", "Neuf"], textes: ["Canon M noir neuf"] }) === null));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
