// Autotest — Louis : le vrai poids sur Leboncoin, et la grille de colis Vinted
// de chaque rayon (03/10, point 13) — `npm run selftest:colis-poids`
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const { grilleColisVinted, grilleReleveeDepuisOptions, chargerGrilleColisRelevee } = await import(pathToFileURL(join(ROOT, "src/utils/vintedColis.js")).href);
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. VINTED : LA GRILLE RELEVÉE D'UN RAYON INCONNU DE LA TABLE");
const r = grilleReleveeDepuisOptions(["11|5 kg", "12|10 kg", "13|20 kg", "14|30 kg", "x|y", "11|5 kg"]);
ok(r.length === 4 && r[0].id === 11 && r[0].libelle === "5 kg", "« id|libellé » lu (l'id fait foi : « 5 kg » existe sous 8 et 11), doublons et déchets écartés");
// Rayon RÉEL de Louis, inconnu de la table générée le 03/10.
const CHEMIN = ["Maison", "Petits appareils de cuisine", "Machines à pain"];
ok(grilleColisVinted(CHEMIN) === null, "avant : rayon inconnu → aucune grille (la carte ne proposait rien)");
const fauxSupabase = { from: () => ({ select: () => ({ eq() { return this; }, maybeSingle: async () => ({ data: { allowed_values: ["1|Petit", "2|Moyen", "3|Grand"] } }) }) }) };
const g = await chargerGrilleColisRelevee(fauxSupabase, CHEMIN);
ok(Array.isArray(g) && g.map((x) => x.id).join(",") === "1,2,3", "après lecture du catalogue : les formats que Vinted a offerts sur ce rayon");
ok(grilleColisVinted(["Femmes", "Vêtements", "Robes", "Robes casual"])?.length >= 3, "la Mode garde sa grille (table générée ou défaut)");
const vt = lire("chrome-extension/content-scripts/vinted.js");
ok(/discovered\.push\(\{ key: "package_size", label: "Format du colis", required: false, inputType: "radio", options: grilleColis, source: "dom" \}\);/.test(vt),
  "l'extension range au catalogue les formats offerts (jamais requis : un relevé)");
const carte = lire("src/components/CarteColisVinted.jsx");
ok(/chargerGrilleColisRelevee\(supabase, chemin\)/.test(carte), "la carte charge la grille relevée quand la table n'a rien");

console.log("\n2. LEBONCOIN : LE VRAI POIDS SE DONNE");
const lbcCarte = lire("src/components/CarteLivraisonLeboncoin.jsx");
ok(/onChange\?\.\('lbcPoidsGrammes', Number\.isFinite\(n\) && n > 0 && n <= 30000 \? n : null\)/.test(lbcCarte), "la carte Livraison écrit lbcPoidsGrammes (grammes, facultatif)");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");
ok(/const poids = Number\(fields\?\.lbcPoidsGrammes\) > 0 \? Number\(fields\.lbcPoidsGrammes\) : null;/.test(lbc), "l'extension pose ce poids dans la tranche de Leboncoin (chemin existant)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ colis : le vrai poids se donne, et chaque rayon Vinted apprend sa grille");
