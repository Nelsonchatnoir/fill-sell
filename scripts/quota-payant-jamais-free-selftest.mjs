// ═══════════════════════════════════════════════════════════════════════════
// JAMAIS LE PLAFOND FREE PRÊTÉ À UN COMPTE (26/10) — `npm run selftest:quota-payant-jamais-free`
// ═══════════════════════════════════════════════════════════════════════════
// Jocabroc (Pro) le 26/10 : « je pouvais encore faire 89 republications et là je me retrouve plus qu'à 5 ». Ses
// compteurs étaient intacts (annonces 85/120 restantes, republications 4 960/5 000) et aucun écran ne lui a montré 5
// (journaux relus) ; le seul « 5 » en base est coin_config.quota_annonces_free. Un défaut de règle a été trouvé en
// cherchant : la modale de conversion disait « Ton forfait comprend {plafond ?? quota_annonces_free} annonces » —
// sans plafond rendu, un compte payant aurait lu « 5 ». Ce selftest refuse tout repli sur le nombre du plan Free
// dans les écrans qui parlent du forfait de la personne.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

const modale = lire("src/components/ConversionModal.jsx");
ok(!/\?\?\s*K\.quota_annonces_free/.test(modale), "modale de conversion : aucun « ?? K.quota_annonces_free » (le plafond Free n'est jamais le repli du forfait de la personne)");
ok(/quotaCas\.plafond != null \? <>Ton forfait comprend \{quotaCas\.plafond\} annonces créées par mois/.test(modale), "sans plafond rendu : la phrase ne dit aucun nombre");
const usagesFree = [...modale.matchAll(/K\.quota_annonces_free/g)].length;
ok(usagesFree === 1 && /quotaFree=\{K\.quota_annonces_free\}/.test(modale), "le nombre du plan Free ne sert qu'à décrire le plan Free (feuille Cloud)", String(usagesFree));
for (const f of ["src/publication/lot/LotPublication.jsx", "src/publication/EcranOuPublier.jsx", "src/reglages/ReglagesUI.jsx", "src/components/RepublicationPlanifiee.jsx", "src/tabs/StockTab.jsx"]) {
  ok(!/quota_annonces_free/.test(lire(f)), `${f} : aucune lecture du plafond Free`);
}

console.log(`\n${rouges === 0 ? "✓" : "✗"} quota-payant-jamais-free : ${verts} contrôles verts, ${rouges} rouges`);
process.exit(rouges === 0 ? 0 : 1);
