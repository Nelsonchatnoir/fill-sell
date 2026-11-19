// ═══════════════════════════════════════════════════════════════════════════
// LE MOT-OBJET DU TITRE : UNE DATE N'EST PAS UNE CARTE, UN SWEAT JORDAN N'EST PAS UNE BASKET — VERROU (19/11/2026 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Cas (compte de Nico, lot du 19/11 13:25) :
//   · « TEST FillSell 28/10 — marque Kiabi — ne pas acheter » : le mot-objet retenu était « 28/10 » (règle de dernier
//     recours « numéro de carte » de src/utils/shared.js) → 🃏 → eBay 183454 « JCC : cartes à l'unité », question « Jeu » ;
//   · « … sweat Nike Jordan taille M » : « jordan » (règle 👟, placée avant 🧶) → Baskets, question de pointure.
// Mesuré sur 30 jours (57 557 fiches publiées) : 25 titres rangés 🃏 sur une date, un âge ou une échelle
// (« 9/12 mois », « 11/12 ans », « 8/10 ans », « 1/16 », « 6/18 mois », « 28/10 ») ; 24 vêtements Jordan / Air Max /
// Air Force rangés 👟 (sweat, t-shirt, jogging, maillot, veste, débardeur…), 19 comptes.
// Règle : (1) le numéro de carte de dernier recours exige un nombre de cartes ≥ 19 après la barre (un mois, un âge,
// une échelle « 1/16 » ne sont jamais un numéro de carte) ; (2) Jordan / Air Max / Air Force ne nomment une
// chaussure que si le titre ne nomme pas un vêtement (sweat, t-shirt, jogging, maillot, veste…).
//   node scripts/objet-date-et-jordan-1911-selftest.mjs
import { detectObjectKeywordDetail } from "../src/utils/shared.js";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
const icone = (t, d = "") => detectObjectKeywordDetail(t, d)?.icon ?? null;
const mot = (t, d = "") => detectObjectKeywordDetail(t, d)?.mot ?? null;

console.log("\n1. Une date, un âge, une échelle ne sont pas un numéro de carte");
for (const t of [
  "TEST FillSell 28/10 — marque Kiabi — ne pas acheter",
  "TEST FillSell 28/10 — 0.6.152c rayon par identifiant — ne pas acheter",
  "TEST FillSell 30/10 — fiche d'essai abandonnée (à supprimer)",
  "lot 13 articles 9/12 mois fille",
  "Leeging Zara 11/12 ans gris",
  "Gigoteuse H&M rose lapins – 2,5 TOG – 9/12 mois",
  "Jupette de danse neuve plume 10/12",
  "Cape undiz les aristocrats taille 8/10 ans",
  "Camion de pompier scania R-serie bruder 1/16",
  "Gigoteuse Disney Le Roi Lion Primark – 6/18 mois – TOG 2,5",
  "Posipi 6/12",
  "Dragon ball movie postcard 18/18",
]) ok(icone(t) !== "🃏", `« ${t} » : pas une carte`, `${icone(t)} (${mot(t)})`);
ok(!/^\d/.test(String(mot("TEST FillSell 28/10 — 0.6.152c rayon par identifiant — ne pas acheter") ?? "")), "« 28/10 » n'est jamais le mot-objet");

console.log("\n2. Un vrai numéro de carte reste une carte");
for (const t of [
  "Galegon 53/123 Diamant & Perle : Trésors Mystérieux",
  "Stalgamin 051/167 - Mascarade Crépusculaire EV06 - TWM FR",
  "Dracaufeu 4/102 set de base",
  "Pikachu 25/102",
  "Lot cartes Pokémon x20",
]) ok(icone(t) === "🃏", `« ${t} » : une carte`, `${icone(t)} (${mot(t)})`);

console.log("\n3. Jordan / Air Max / Air Force : un vêtement nommé reste un vêtement");
for (const t of [
  "TEST FillSell 999 ne pas acheter - sweat Nike Jordan taille M",
  "Jordan sweatshirt homme L noir col rond logo impression graphique",
  "t shirt garçon jordan noir jaune numero 23 coton polyester taille 12/13 ans",
  "Jogging Jordan 12-13 ans vert",
  "Pantalon de Jogging Nike Air Max Gris et Noir - Taille S - Poche Arrière Zippée",
  "Veste zippée Jordan – Noir / Rouge / Blanc  5-6 ans / 110-116 cm Excellent état",
  "Débardeur noir Jordan Loose Fit Tee M",
  "Rare - Maillot NBA Chicago Bulls #45 Michael Jordan – Champion - (XS-S Adulte) / Taille XL enfant",
]) ok(icone(t) !== "👟", `« ${t} » : pas une chaussure`, `${icone(t)} (${mot(t)})`);
ok(icone("TEST FillSell 999 ne pas acheter - sweat Nike Jordan taille M") === "🧶", "le sweat Jordan : 🧶 (pull, sweat)");

console.log("\n4. Une vraie paire reste une chaussure");
for (const t of [
  "Air Jordan 1 Mid taille 42",
  "Nike Air Max 90 blanche pointure 41",
  "Nike Air Force 1 '07 blanc 43",
  "Jordan 4 Retro Military Black 44",
  "Baskets Nike Jordan enfant 35",
]) ok(icone(t) === "👟", `« ${t} » : une chaussure`, `${icone(t)} (${mot(t)})`);

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
process.exit(echecs ? 1 : 0);
