// Autotest de src/utils/strategiePrix.js — la stratégie de prix du vendeur (29/10, lot B 1.4, promesse XEWER).
//   node scripts/strategie-prix-selftest.mjs
import {
  prixSelonStrategie, strategieValide, libelleStrategie, positionDansFourchette, STRATEGIE_PAR_DEFAUT, TITRES_STRATEGIE,
} from "../src/utils/strategiePrix.js";

let ko = 0;
const ok = (cond, nom) => { if (cond) console.log(`  ✓ ${nom}`); else { ko++; console.log(`  ✗ ${nom}`); } };

const analyse = { prix_vente_suggere: 28, fourchette_marche: { bas: 22, moyen: 28, haut: 35 } };
console.log("1. La borne suit la stratégie");
ok(prixSelonStrategie(analyse, "rapide").prix === 22, "vente rapide → bas de la fourchette");
ok(prixSelonStrategie(analyse, "marche").prix === 28, "prix du marché → moyen");
ok(prixSelonStrategie(analyse, "haut").prix === 35, "prix haut → haut de la fourchette");
ok(prixSelonStrategie(analyse, null).prix === 28 && STRATEGIE_PAR_DEFAUT === "marche", "aucune stratégie → prix du marché (comportement d'avant)");
ok(strategieValide("n'importe quoi") === "marche", "valeur inconnue → prix du marché");
console.log("2. Les replis");
ok(prixSelonStrategie({ prix_vente_suggere: 19.6 }, "rapide").prix === 20, "sans fourchette → le prix suggéré, arrondi à l'euro");
ok(prixSelonStrategie({ fourchette_min: 10, fourchette_max: 18 }, "rapide").prix === 10, "ancienne fourchette min/max lue");
ok(prixSelonStrategie({ verdict: "x" }, "haut") === null, "aucun prix dans l'analyse (identify) → null, rien n'est inventé");
ok(prixSelonStrategie({ fourchette_marche: { bas: 0.4, moyen: 0.6, haut: 0.9 } }, "rapide").prix === 1, "jamais moins de 1 €");
console.log("3. L'affichage");
ok(libelleStrategie("rapide") === "vente rapide" && libelleStrategie("haut", "en") === "higher price", "libellés FR / EN");
ok(TITRES_STRATEGIE.fr.haut === "Prix plus haut, attendre le bon acheteur", "les mots du mail du 27/10");
ok(Math.abs(positionDansFourchette(22, { bas: 22, haut: 35 })) < 1e-9 && positionDansFourchette(35, { bas: 22, haut: 35 }) === 1, "jauge 0 → 1");
ok(positionDansFourchette(30, null) === null, "sans fourchette, pas de jauge");

if (ko) { console.log(`\n${ko} échec(s)`); process.exit(1); }
console.log("\ntout passe");
