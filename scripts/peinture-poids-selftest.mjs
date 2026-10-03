// Autotest — une peinture signée n'est pas un pot de peinture, et « Poids »
// ne propose jamais les choix de « Type » (03/10, point 9) —
// `npm run selftest:peinture-poids`
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const shared = await import(pathToFileURL(join(ROOT, "src/utils/shared.js")).href);
const { sansListesEmpruntees } = await import(pathToFileURL(join(ROOT, "src/utils/catalogueListes.js")).href);
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const icone = (t) => shared.detectObjectKeywordDetail(t, "")?.icon ?? null;

console.log("\n1. LES ŒUVRES DU PARC (titres RELEVÉS le 03/10) → 🖼️");
for (const t of [
  "Peinture paysage verger en fleurs signée",
  "Lot 2 peintures paysage encadrées – montagnes et lac – signées",
  "Peinture à huile",
  "Peinture Baptême Christ signé Michel France Religious Painting Jesus",
  "Peinture florale sur carton signée CB – mention « Christiane Bertin »",
  "Peinture à l'huile sur toile Nature morte Fruits Théière Signée Cadre Doré",
]) ok(icone(t) === "🖼️", `« ${t.slice(0, 60)} » → 🖼️`, String(icone(t)));

console.log("\n2. LA PEINTURE DE BRICOLAGE RESTE DU BRICOLAGE, LES LIVRES DES LIVRES");
for (const t of ["Peinture jaune", "Peinture acrylique 20 tubes de lot", "Lot peinture gouache talens 8x16ml",
  "Lot de 6 pinceaux neufs – peinture et rénovation", "Pistolet sans fil peinture mukins", "Peinture crayeuse"]) {
  ok(icone(t) === "🖌️", `« ${t} » → 🖌️`, String(icone(t)));
}
ok(icone("Livre peinture vitrail") === "📚", "« Livre peinture vitrail » → 📚");
ok(icone("Lot 2 Livres Vintage Technique Peinture - Que Sais-je ? & Livres Jaunes") === "📚", "lot de livres sur la peinture → 📚");
ok(icone("Tjanting (ou Canting) en laiton – Outil traditionnel pour Batik (peinture sur tissu)") !== "🖼️", "outil de batik « peinture sur tissu » : pas une œuvre");

console.log("\n3. « POIDS » NE PROPOSE JAMAIS LES CHOIX DE « TYPE » (listes RELEVÉES en base)");
// Listes EXACTES de la sauvegarde _backup_0310_catalogue_lbc (diy_weight et furniture_weight avant réparation).
const TYPES_BRICOLAGE = ["Chauffage et ventilation", "Électricité, éclairage et domotique", "Équipement et protection", "Matériel",
  "Menuiserie et matériaux de construction", "Outils à main", "Outils électroportatifs", "Revêtement sol, mur et peinture",
  "Plomberie et sanitaire", "Quincaillerie et droguerie", "Autre"];
const bricolage = sansListesEmpruntees([
  { field_key: "diy_type", field_label: "Type", allowed_values: TYPES_BRICOLAGE },
  { field_key: "diy_weight", field_label: "Poids", allowed_values: [...TYPES_BRICOLAGE] },
  { field_key: "condition", field_label: "État", allowed_values: ["Neuf", "Très bon état", "Bon état", "État satisfaisant"] },
]);
ok(bricolage.find((r) => r.field_key === "diy_weight").allowed_values === null && bricolage.find((r) => r.field_key === "diy_weight").liste_empruntee,
  "Bricolage : la liste de « Type » sur « Poids » est écartée");
ok(Array.isArray(bricolage.find((r) => r.field_key === "diy_type").allowed_values), "« Type » garde sa liste");
const TYPES_MEUBLE = ["Canapé et fauteuil", "Meuble de rangement", "Lit et matelas", "Table et bureau", "Chaise et tabouret", "Accessoire", "Autre"];
const meuble = sansListesEmpruntees([
  { field_key: "furniture_category", field_label: "Type", allowed_values: TYPES_MEUBLE },
  { field_key: "furniture_weight", field_label: "Poids", allowed_values: [...TYPES_MEUBLE] },
  { field_key: "furniture_quantity", field_label: "Quantité", allowed_values: [...TYPES_MEUBLE] },
]);
ok(meuble.filter((r) => r.liste_empruntee).map((r) => r.field_key).sort().join(",") === "furniture_quantity,furniture_weight", "Ameublement : Poids et Quantité écartés, Type gardé");
const ETATS = ["Neuf", "Très bon état", "Bon état", "État satisfaisant", "Pour pièces"];
const etats = sansListesEmpruntees([
  { field_key: "condition", field_label: "État", allowed_values: ETATS },
  { field_key: "clothing_condition", field_label: "État", allowed_values: [...ETATS] },
]);
ok(etats.every((r) => Array.isArray(r.allowed_values) && !r.liste_empruntee), "deux « État » à liste égale : intacts (ni l'un ni l'autre n'est un champ d'identité)");

console.log("\n4. LA CAUSE, FERMÉE DANS L'EXTENSION ET L'APP");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
const f = lbc.slice(lbc.indexOf("async function releverOptionsCritere("), lbc.indexOf("async function releverOptionsCritere(") + 1500);
ok(/if \(!menu\) \{ document\.body\.click\(\); return null; \}/.test(f) && !/const scope = menu \|\| document;/.test(f), "relevé des options : plus de repli sur tout le document");
const bg = lire("chrome-extension/background.js");
ok(/const rayonLbcHorsJob = job\.platform === "leboncoin"/.test(bg) && /if \(!rayonLbcHorsJob && \(result\?\.discoveredRequired\?\.length/.test(bg),
  "suggestion Leboncoin retenue : rien n'est appris sous notre rayon");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/rows = sansListesEmpruntees\(rows\);/.test(lps), "le stepper écarte les listes empruntées du catalogue");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ peinture : œuvre ou bricolage selon ce qu'elle est, et jamais une liste d'un autre champ");
