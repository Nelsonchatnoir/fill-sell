// La question « Marque » quand la plateforme ne connaît pas la marque
// (03/10 nuit, clôture « marque » — Nico) : elle dit pourquoi, propose
// « Sans marque » en un geste et une recherche dans le catalogue de la
// plateforme ; jamais d'impasse, jamais de bouton gris sans explication,
// jamais « Sans marque » écrit sur la fiche.
import fs from "node:fs";
import assert from "node:assert/strict";
import { estQuestionMarqueHorsCatalogue, marqueDemandee, comparable } from "../src/utils/questionMarque.js";

// 1. Reconnaître la question : clé `raison` (0.6.94), ou la forme 0.6.93.
const q094 = { field_key: "brand", field_label: "Marque", raison: "marque_hors_catalogue", demandee: "Bonobo", allowed_values: ["Sans marque", "Bonobo Jeans"] };
assert.equal(estQuestionMarqueHorsCatalogue({ platform: "vinted" }, q094), true);
assert.equal(estQuestionMarqueHorsCatalogue({ platform: "vinted" }, { field_key: "brand", allowed_values: ["Sans marque"] }), true, "question posée par une 0.6.93");
assert.equal(estQuestionMarqueHorsCatalogue({ platform: "vinted" }, { field_key: "brand", allowed_values: ["Nike", "Adidas"] }), false, "liste sans « Sans marque » : question ordinaire");
assert.equal(estQuestionMarqueHorsCatalogue({ platform: "beebs" }, { field_key: "Marque", allowed_values: ["Sans marque"] }), false, "Beebs n'a pas cette contrainte (repli « Autre » de sa liste)");
assert.equal(estQuestionMarqueHorsCatalogue({ platform: "vinted" }, { field_key: "size", allowed_values: ["Sans marque"] }), false);
assert.equal(estQuestionMarqueHorsCatalogue({ platform: "vinted" }, null), false);

// 2. La marque demandée, pour la phrase d'explication.
assert.equal(marqueDemandee({ platform_fields: { marque: "Cousu Main" } }, { field_key: "brand" }), "Cousu Main");
assert.equal(marqueDemandee({ platform_fields: { marque: "X" } }, q094), "Bonobo", "la valeur demandée au moment de l'arrêt prime");
assert.equal(comparable("Levi’s  "), comparable("levi's"));
assert.equal(comparable("Gérard Darel"), comparable("gerard darel"));

// 3. La modale : question dédiée, chaque choix valide d'un tap, pas de
//    « Valider » grisé, et la fiche n'est PAS réécrite.
const stock = fs.readFileSync(new URL("../src/tabs/StockTab.jsx", import.meta.url), "utf8");
assert.match(stock, /const questionMarque = estQuestionMarqueHorsCatalogue\(job, f\) && !champsSup\.length && !descriptionRequise;/);
assert.match(stock, /<QuestionMarque job=\{job\} f=\{f\} lang=\{lang\} saving=\{saving\}\s*onChoisir=\{\(v\) => \{ setValue\(v\); valider\(\{ valeur: v \}\); \}\} \/>/);
assert.match(stock, /\{!questionMarque && <button\s*onClick=\{\(\) => valider\(\{ sansValeur: valeursIndisponibles \}\)\}/, "pas de bouton Valider (gris) sous la question marque");
assert.match(stock, /if \(!sansValeur && job\.inventaire_id != null && !questionMarque\) \{/, "« Sans marque » n'est jamais écrit sur la fiche");
const comp = fs.readFileSync(new URL("../src/annonces/QuestionMarque.jsx", import.meta.url), "utf8");
assert.match(comp, /ne connaît pas la marque/, "la phrase dit pourquoi");
assert.match(comp, /ligne\('Sans marque', true\)/, "« Sans marque » en premier, en un geste");
assert.match(comp, /__fillsellCmd: 'CHERCHER_MARQUE'/, "recherche dans le catalogue via l'extension");
assert.match(comp, /cette question revient/, "le nom tapé tel quel : on dit ce qui se passera");

// 4. L'extension : la question porte la raison et de VRAIES marques du
//    catalogue ; la recherche passe par une liste fermée de commandes.
const vinted = fs.readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8");
assert.match(vinted, /raison: "marque_hors_catalogue", demandee,/);
assert.match(vinted, /const catalogue = await marquesDuCatalogueVinted\(demandee\);/);
assert.match(vinted, /fetch\(`\/api\/v2\/brands\?keyword=\$\{encodeURIComponent\(q\)\}/, "le moteur de recherche du menu Marque de Vinted");
assert.doesNotMatch(vinted.slice(vinted.indexOf("async function marquesDuCatalogueVinted")), /^\s*choix\.el\.click\(\)/m);
const relais = fs.readFileSync(new URL("../chrome-extension/content-scripts/fillsell-auth.js", import.meta.url), "utf8");
assert.match(relais, /"CHERCHER_MARQUE",/, "commande ajoutée à la liste FERMÉE");
assert.match(relais, /__fillsellMarques: \{ q,/);
const bg = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
assert.match(bg, /if \(msg\?\.type === "CHERCHER_MARQUE"\) \{/);
assert.match(bg, /async function chercherMarquesVinted\(q\)/);
// Relevé du test réel 0.6.94 (fe223d47) : la raison et la marque demandée
// étaient perdues en chemin — elles traversent maintenant markNeedsUser.
assert.equal(bg.split("...(f.raison ? { raison: String(f.raison).slice(0, 60) } : {}),").length - 1, 2, "raison transmise par les deux chemins needs_user");
assert.equal(bg.split("...(f.demandee ? { demandee: String(f.demandee).slice(0, 120) } : {}),").length - 1, 2, "marque demandée transmise");
assert.match(bg, /if \(cree && tabId != null\) chrome\.tabs\.remove\(tabId\)/, "l'onglet ouvert pour chercher est refermé");

console.log("✓ question « Marque » : le pourquoi, « Sans marque » en un geste, la recherche au catalogue ; jamais d'impasse ni de fiche réécrite");
