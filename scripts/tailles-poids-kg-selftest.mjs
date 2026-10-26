// ═══════════════════════════════════════════════════════════════════════════
// LES TAILLES EN POIDS SE PLACENT SEULES DANS LA GRILLE DU RAYON (26/10, Diana — règle de Nico)
// `npm run selftest:tailles-poids-kg`
// ═══════════════════════════════════════════════════════════════════════════
// Diana (Pro depuis 14:46) : couches Carryboo « Taille 5 (12-18 kg) », rayon Vinted « Couches jetables », grille en kg.
// Arrêt à 16:13 « Vinted ne reconnaît pas la taille » ; elle a choisi « 11–25 kg » à la main. Désormais :
//   · la règle R6 (_shared/taille-de-service.js) place la tranche dans l'option qui la CONTIENT, au plus près de son
//     poids de départ — la même que la personne ;
//   · l'app (jugerValeurContreListe) la pose sans question quand la grille est connue ;
//   · le serveur (handler-watch, reponseTailleAuto) répond seul à la question posée par l'extension.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const S = await imp("supabase/functions/_shared/taille-de-service.js");
const Q = await imp("supabase/functions/_shared/taille-question-auto.js");
const L = await imp("src/publication/moteur/listes.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

// La grille relevée le 26/10 à 16:13 (platform_category_aspects, vinted, « Couches jetables », size).
const COUCHES = ["Jusqu'à 2 kg", "2–5 kg", "3–6 kg", "4–9 kg", "7–18 kg", "9–20 kg", "11–25 kg", "13–27 kg", "16 kg et plus"];
const r6 = (v) => S.tailleDeService(v, COUCHES)?.valeur ?? null;

console.log("1. La tranche de poids, lue");
ok(JSON.stringify(S.lirePoidsKg("Taille 5 (12-18 kg)")) === JSON.stringify({ min: 12, max: 18 }), "« Taille 5 (12-18 kg) » → 12 à 18 kg");
ok(S.lirePoidsKg("Jusqu'à 2 kg")?.max === 2 && S.lirePoidsKg("16 kg et plus")?.max === Infinity && S.lirePoidsKg("T4 (7 à 18 kg)")?.min === 7, "« Jusqu'à 2 kg », « 16 kg et plus », « 7 à 18 kg »");
ok(S.lirePoidsKg("4-9kg")?.max === 9 && S.lirePoidsKg("2–5 kg")?.min === 2, "tirets et kilos collés");
ok(S.lirePoidsKg("Taille 5") === null && S.lirePoidsKg("M") === null && S.lirePoidsKg("38") === null, "aucun kilo écrit : rien n'est lu");

console.log("\n2. Placée dans la grille du rayon");
ok(r6("Taille 5 (12-18 kg)") === "11–25 kg", "Diana : « Taille 5 (12-18 kg) » → « 11–25 kg » (son propre choix)", String(r6("Taille 5 (12-18 kg)")));
ok(r6("Taille 1 (2-5 kg)") === "2–5 kg" && r6("T3 4-9kg") === "4–9 kg", "une tranche écrite telle quelle → la même option");
ok(r6("Taille 4 (9-14 kg)") === "9–20 kg" && r6("+16 kg") === "16 kg et plus", "9-14 kg → « 9–20 kg » ; +16 kg → « 16 kg et plus »");
ok(r6("Taille 5") === null && r6("M") === null, "sans kilo : la question, avec la grille entière (jamais devinée)");
ok(S.tailleDeService("Taille 5 (12-18 kg)", ["XS", "S", "M"]) === null, "une grille sans kilo : rien n'est posé");
ok(S.tailleDeService("12-30 kg", COUCHES) === null, "aucune option ne contient toute la tranche : la question (jamais une option qui en exclut une partie)");

console.log("\n3. Dans l'app, sans question");
const j = L.jugerValeurContreListe({ platform: "vinted", key: "size", value: "Taille 5 (12-18 kg)", allowedValues: COUCHES, cheminCategorie: ["Enfants", "Bain et change", "Couches", "Couches jetables"] });
ok(j.dans === true && j.valeurListe === "11–25 kg", "jugerValeurContreListe : la taille de la fiche est placée, la tâche part avec « 11–25 kg »", JSON.stringify(j));
ok(L.tailleDuJob({ platform: "vinted", taille: "Taille 5 (12-18 kg)", lignes: [{ key: "size", allowedValues: COUCHES }] }) === "11–25 kg", "tailleDuJob : le job porte l'écriture exacte de la grille");

console.log("\n4. Au serveur : la question posée par l'extension se répond seule (handler-watch)");
const job = { status: "needs_user", platform: "vinted", platform_fields: { taille: "Taille 5 (12-18 kg)", categoryPath: ["Enfants", "Bain et change", "Couches", "Couches jetables"],
  needsUserField: { platform: "vinted", field_key: "size", field_label: "Taille", input_type: "grid", allowed_values: COUCHES, target: { key: "taille" } } } };
const rep = Q.reponseTailleAuto(job);
ok(rep?.valeur === "11–25 kg" && rep?.regle === "R6", "reponseTailleAuto → « 11–25 kg » (R6) : le job repart sans la personne", JSON.stringify(rep));

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
