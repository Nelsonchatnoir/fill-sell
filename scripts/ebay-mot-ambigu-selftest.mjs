// ═══════════════════════════════════════════════════════════════════════════
// eBay — UN MOT AMBIGU NE TOMBE PAS EN BRANCHE SPÉCIALISÉE QUE L'OBJET CONTREDIT (14/11/2026 soir, point B de Nico)
//   npm run selftest:ebay-mot-ambigu
// ═══════════════════════════════════════════════════════════════════════════
// Cas réel (compte e5be98ba, job 86f5cd5f, 14/11 20:00) : « Caméra Q18 Pro », mot-objet « caméra » (IA) → la seule feuille
// eBay exacte « Animalerie › Caméras » (259318) prise avec certitude ; icône 📷 (« Photo, caméscopes »), dix suggestions
// eBay ailleurs, aucun attribut. Ce test prouve, sur l'ARBRE eBAY RELEVÉ (src/utils/arbres/ebayFeuilles.js) :
//   1. le cas réel est écarté, et l'objet prend le relais (📷 → « Photo, caméscopes › Appareils photo numériques ») ;
//   2. rien ne change quand le texte ou l'objet disent la branche, quand le mot n'est pas ambigu, quand l'icône n'a pas
//      de rayon eBay, hors eBay, et pour le T-shirt Goldman (rayon de mode, hors branche spécialisée) ;
//   3. les cas mesurés sur les 300 tâches réelles (classeurs Pokémon écartés, écussons et cartes inchangés) ;
//   4. le câblage (étape du mot, choix de l'IA, chemin final) et le garde-fou « à confirmer » du serveur, intact.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d ? `  ← ${d}` : ""}`); } };

const B = await import("../src/utils/brancheSpecialiseeEbay.js");
const { feuillesDe } = await import("../src/utils/categorieParMot.js");
const { getEbayCategoryPath, getEbayCategoryId } = await import("../src/utils/ebayCategories.js");
const veto = typeof B.vetoMotAmbiguSpecialise === "function" ? B.vetoMotAmbiguSpecialise : () => { throw new Error("vetoMotAmbiguSpecialise absente"); };
const essai = (f) => { try { return f(); } catch (e) { return `exception : ${e.message}`; } };
const feuilles = await feuillesDe("ebay");
const C = (s) => s.split(" > ");
const v = (chemin, titre, mot, icone, plateforme = "ebay") => essai(() => veto({ plateforme, chemin: C(chemin), titre, description: "", mot, feuilles,
  cheminIcone: icone ? getEbayCategoryPath(icone, "") : null }));

console.log(`1. Le cas réel (arbre eBay relevé : ${feuilles.length} feuilles)`);
const r = v("Animalerie > Caméras", "Caméra Q18 Pro", "caméra", "📷");
ok(r && typeof r === "object" && r.regle === "mot_ambigu_hors_branche_specialisee_1411", "« Caméra Q18 Pro » : « Animalerie › Caméras » écartée", JSON.stringify(r));
ok(essai(() => B.motAmbiguDansArbre("caméra", feuilles)) === true, "« caméra » est ambigu (feuilles sous plusieurs racines)");
ok(JSON.stringify(getEbayCategoryPath("📷", "")) === JSON.stringify(["Photo, caméscopes", "Appareils photo numériques"]) && String(getEbayCategoryId("📷", "")) === "31388",
  "l'objet prend le relais : 📷 → « Photo, caméscopes › Appareils photo numériques » (31388)");
ok(essai(() => B.vetoBrancheSpecialisee({ plateforme: "ebay", chemin: C("Animalerie > Caméras"), titre: "Caméra Q18 Pro", mot: "caméra" })) === null,
  "rouge d'avant : la règle du 10/10 (vêtements seulement) laissait passer « Animalerie › Caméras »");

console.log("\n2. Rien ne change quand…");
ok(v("Animalerie > Caméras", "Caméra pour chien wifi", "caméra", "📷") === null, "le texte dit la branche (« caméra pour chien »)");
ok(v("Animalerie > Chiens > Laisses", "Laisse cuir marron", "laisse", "🐕") === null, "l'objet dit la branche (🐕 → Animalerie)");
ok(v("Collections > Ecussons", "Ecusson pm", "écusson", "🚗") === null && v("Collections > Ecussons", "Écusson PVC Police Municipale", "écusson", "📦") === null,
  "l'icône n'a pas de rayon eBay (🚗, 📦) : elle ne contredit rien");
ok(essai(() => veto({ plateforme: "ebay", chemin: ["Animalerie", "Chats", "Griffoirs"], titre: "Griffoir carton", mot: "griffoir",
  feuilles: [{ chemin: ["Animalerie", "Chats", "Griffoirs"] }, { chemin: ["Maison", "Décoration", "Cadres"] }], cheminIcone: ["Maison", "Décoration"] })) === null,
  "un mot propre à une seule racine n'est jamais écarté");
ok(v("Animalerie > Caméras", "Caméra Q18 Pro", "caméra", "📷", "vinted") === null, "hors eBay : rien");
ok(v("Vêtements, accessoires > Homme : vêtements, accessoires > Homme : hauts > T-shirts", "T-shirt Jean-Jacques Goldman", "t-shirt", "👕") === null,
  "T-shirt Goldman : rayon de mode, hors branche spécialisée — inchangé");
ok(v("Collections > Jeux de cartes à collectionner > JCC : cartes à l'unité", "Carte Pokémon Dracaufeu", "carte", "🃏") === null, "cartes à collectionner (objet 🃏 dans Collections) : inchangées");

console.log("\n3. Les cas mesurés (300 tâches eBay réelles, 60 jours)");
ok(v("Bricolage > Matériel d'atelier et de bricolage > Boîtes à outils, rangements > Classeurs", "Classeur Pokémon 151 Écarlate et Violet couverture Mew blanc", "classeur", "🃏")?.regle === "mot_ambigu_hors_branche_specialisee_1411",
  "« Classeur Pokémon » (🃏) n'est plus rangé en « Bricolage › Boîtes à outils »");
ok(v("Sports, vacances > Camping, randonnée > Sacs de randonnée > Sacs à dos de montagne", "Sac à dos de randonnée Quechua 40L", "sac à dos", "🎒") === null, "sac de randonnée (le texte dit la branche) : inchangé");

console.log("\n4. Le câblage et le garde-fou");
const rp = lire("src/utils/resolutionPublication.js");
ok((rp.match(/\?\? vetoMotAmbiguSpecialise\(\{/g) ?? []).length === 3, "trois points : la certitude du mot, le choix de l'IA, le chemin final");
ok(/const feuillesEbay = plateformesAPublier\.includes\("ebay"\) \? await feuillesDe\("ebay"\)/.test(rp) && /const cheminIconeObjetEbay = iconeObjetEbay \? getEbayCategoryPath\(iconeObjetEbay, ""\) : null;/.test(rp),
  "l'arbre eBay et le rayon de l'objet lus une fois");
ok(/veto\.regle === "mot_ambigu_hors_branche_specialisee_1411" \? "icone_mot_ambigu" : "icone_mode_hors_sport"/.test(rp), "la trace du job dit quelle règle a écarté le rayon");
const w = lire("supabase/functions/ebay-api-worker/index.ts");
ok(/AUCUN attribut de l'article ne confirme notre catégorie \(ebayAspects vide\) — c'est ce qui distingue ce cas du T-shirt Goldman/.test(w) && /if \(racineContestee && !dejaTranche\) \{/.test(w),
  "serveur : le garde-fou « à confirmer » est en place, inchangé");

console.log(`\n${verts}/${verts + rouges} vérifications`);
if (rouges) { console.log(`ÉCHEC : ${rouges}`); process.exit(1); }
