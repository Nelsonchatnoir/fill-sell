// Autotest : MODIFIER EN LOT LE PRIX OU LA QUANTITÉ DES FICHES (04/10/2026, Louis).
//
//     node --import ./scripts/loader-ext.mjs scripts/modifier-en-lot-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. le calcul : valeur fixe, ± euros, ± %, arrondi au centime ; 1 € au
//      moins ; un article SANS prix n'a pas de base pour un calcul : laissé
//      de côté, jamais un prix inventé ;
//   2. la quantité : entière, 1 au moins (0 = vendu, c'est le geste Vendre) ;
//   3. une écriture par valeur, pas par article ;
//   4. l'écran dit la vérité : les annonces en ligne ne changent pas, et
//      aucun chemin n'envoie un prix ou une quantité de fiche à une
//      plateforme (les jobs ne savent que publier, retirer, republier).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const M = await charger("src/stock/modifierEnLot.js");

console.log("1. le prix");
const items = [
  { id: 1, prix_vente: 10, quantite: 1 },
  { id: 2, prix_vente: 12.5, quantite: 3 },
  { id: 3, prix_vente: null, quantite: 1 },
  { id: 4, prix_vente: 1.5, quantite: 2 },
];
ok(M.lireNombre("12,5") === 12.5 && M.lireNombre("10 %") === 10 && M.lireNombre("3 €") === 3 && M.lireNombre("abc") === null && M.lireNombre("-2") === null, "saisies lues : « 12,5 », « 10 % », « 3 € » ; refusées : texte, négatif");
const fixe = M.planPrix(items, "fixer", 15);
ok(fixe.changements.length === 4 && fixe.ignores.length === 0, "valeur fixe : tous les articles, y compris celui sans prix");
const pct = M.planPrix(items, "plus_pct", 10);
ok(pct.changements.find((c) => c.id === 2).apres === 13.75 && pct.changements.find((c) => c.id === 1).apres === 11, "+ 10 % : 10 → 11, 12,50 → 13,75");
ok(pct.ignores.length === 1 && pct.ignores[0].id === 3 && pct.ignores[0].raison === "sans_prix", "+ 10 % : l'article sans prix est laissé de côté (aucun prix inventé)");
const moins = M.planPrix(items, "moins_euros", 1);
ok(moins.changements.find((c) => c.id === 1).apres === 9 && moins.ignores.some((x) => x.id === 4 && x.raison === "sous_minimum"), "− 1 € : 10 → 9 ; 1,50 → 0,50 refusé (1 € au moins)");
ok(M.planPrix(items, "moins_pct", 33).changements.find((c) => c.id === 1).apres === 6.7, "− 33 % : arrondi au centime (6,70)");
ok(M.planPrix(items, "fixer", 0.5).ignores.length === 4, "fixer à 0,50 € : refusé partout");
ok(M.planPrix([{ id: 9, prix_vente: 15 }], "fixer", 15).changements.length === 0, "même prix : rien à écrire");

console.log("2. la quantité");
const q = M.planQuantite(items, 2);
ok(q.changements.map((c) => c.id).join() === "1,2,3", "quantité 2 : seuls ceux qui ne l'ont pas changent");
ok(M.planQuantite(items, 0).changements.length === 0 && M.planQuantite(items, 1.5).changements.length === 0, "0 ou 1,5 : refusés (entier, 1 au moins — 0 = vendu, geste Vendre)");

console.log("3. une écriture par valeur");
const g = M.parValeur([{ id: 1, apres: 15 }, { id: 2, apres: 15 }, { id: 3, apres: 9 }]);
ok(g.length === 2 && g[0].ids.join() === "1,2" && g[1].ids.join() === "3", "deux valeurs, deux écritures");

console.log("4. l'écran dit la vérité");
const barre = lire("src/stock/BarreModifierLot.jsx");
ok(/Les annonces déjà en ligne ne changent pas, sur aucune plateforme/.test(barre), "en-tête : les annonces en ligne ne changent pas, sur aucune plateforme");
ok(/Tes annonces en ligne gardent leur prix \(une republication aussi\)/.test(barre) && /Tes annonces en ligne n'ont pas changé/.test(barre), "sous le bouton et au bilan : rien ne part vers les annonces");
ok(/update\(champ === "prix" \? \{ prix_vente: g\.valeur \} : \{ quantite: g\.valeur \}\)\.in\("id", g\.ids\)/.test(barre) && /eq\("user_id", userId\)/.test(barre), "écriture : la fiche seule (prix_vente ou quantite), bornée à la personne");
const stock = lire("src/tabs/StockTab.jsx");
ok(/<BarreModifierLot /.test(stock) && /Modifier le prix ou la quantité de plusieurs articles/.test(stock), "Stock : la porte et la barre du mode");
ok(/filter\(\(i\) => i\.statut === 'stock'\)/.test(stock), "Stock : seuls les articles en stock (jamais un vendu)");
// Aucun chemin ne pousse un prix de fiche vers une annonce existante.
const fonctions = fs.readdirSync(join(ROOT, "supabase/functions")).filter((d) => !d.startsWith("_") && !d.startsWith("."));
const poussePrix = fonctions.filter((d) => {
  const f = join(ROOT, "supabase/functions", d, "index.ts");
  return fs.existsSync(f) && /reviseInventoryItem|bulkUpdatePriceQuantity|ReviseItem|updateOffer/.test(fs.readFileSync(f, "utf8"));
});
ok(poussePrix.length === 0, "aucune fonction ne révise le prix d'une annonce en ligne (eBay compris)");

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
