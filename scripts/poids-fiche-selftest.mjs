// Autotest — LE poids de la fiche : un seul champ, lu partout pareil (04/10, Louis — point 2)
//   npm run selftest:poids-fiche
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// shared.js importe d'autres modules de l'app : on n'en extrait que la règle.
const shared = lire("src/utils/shared.js");
const debut = shared.indexOf("export const POIDS_G_MIN");
const fin = shared.indexOf("\n}\n", shared.indexOf("export function lirePoidsGrammes")) + 3;
const code = shared.slice(debut, fin).replace(/export /g, "");
const { lirePoidsGrammes } = new Function(`${code}; return { lirePoidsGrammes };`)();

console.log("\n1. LA LECTURE D'UNE SAISIE");
ok(lirePoidsGrammes("").vide && lirePoidsGrammes(null).vide && lirePoidsGrammes("  ").vide, "vide → NULL (on ne sait pas), jamais 0");
ok(lirePoidsGrammes("650").valeur === 650, "650 → 650 g");
ok(lirePoidsGrammes("1 200").valeur === 1200 && lirePoidsGrammes("1 200").valeur === 1200, "espaces (insécables compris) tolérés");
ok(lirePoidsGrammes("0").invalide && lirePoidsGrammes("200001").invalide, "hors des bornes de la base : refusé, dit à l'écran");
ok(lirePoidsGrammes("1,5").invalide && lirePoidsGrammes("1.5").invalide && lirePoidsGrammes("500g").invalide, "ni virgule, ni unité, ni arrondi : rien de deviné");
const mig = lire("supabase/migrations/20261004091000_fiche_poids_et_traces_de_changement.sql");
ok(/poids_g IS NULL OR poids_g BETWEEN 1 AND 200000/.test(mig), "mêmes bornes que la contrainte en base");

console.log("\n2. LES TROIS ÉCRANS");
const app = lire("src/App.jsx");
ok(/poids_g:v\.poids_g\?\?null/.test(app), "la fiche chargée porte son poids");
ok(/const poidsMaj=poidsLu&&!poidsLu\.invalide&&poidsLu\.valeur!==\(editItem\.poids_g\?\?null\)\?\{poids_g:poidsLu\.valeur\}:\{\};/.test(app), "modification : écrit seulement s'il a changé et s'il est lisible");
ok(/editItem\._table==='inventaire'&&\(\(\)=>\{/.test(app) && /inputMode="numeric"/.test(app), "champ texte à clavier numérique, réservé aux fiches d'inventaire");
ok(/const ecrireType=editItem\.typeConnu!==false\|\|editItem\.typeChoisi===true;/.test(app), "une catégorie inconnue n'est plus devinée à l'enregistrement (le relevé la complète)");
const stock = lire("src/tabs/StockTab.jsx");
ok(/<Field label=\{t\('fieldPoids'\)\} value=\{iPoids\} set=\{setIPoids\}/.test(stock) && /icon=\{iconeChamp\(Weight\)\}/.test(stock), "ajout : le champ Poids, icône au trait (refonte, zéro émoji)");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/const comblerPoidsFiche = \(copies\) =>/.test(lps) && /lbcPoidsGrammes: poidsDeLaFiche/.test(lps), "stepper : la carte Livraison Leboncoin part du poids de la fiche");
ok(/\.update\(\{ poids_g: poidsCopieLbc \}\)/.test(lps), "et un poids tapé au stepper revient sur la fiche");
ok(/const champs = v\.champs\.filter\(c => c !== "prix"\);/.test(lps), "le prix n'est plus un « contenu divergent » : la base le suit et le journalise");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ un seul poids par fiche, lu et écrit pareil sur les trois écrans");
