// Autotest — LA TAILLE UNIQUE (19/10 soir) — `npm run selftest:taille-unique`
// _shared/taille-du-texte.js (tailleUniqueDuVendeur) et ses branchements : l'écran Publier (moteur/listes :
// jugement, job, eBay) et handler-watch (question de taille d'un job arrêté, taille-question-auto.js).
// Cas réels : Sébastien (19/10) — djellaba « Unique » refusée par eBay en « Costumes » (grille SANS taille
// unique : la question reste) ; « Gilet poncho … - T.U », « Robe … taille unique » (grilles eBay qui l'ont).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(R, p), "utf8").split("\r\n").join("\n");
const imp = (p) => import(pathToFileURL(path.join(R, p)).href);
let ko = 0, n = 0;
const ok = (nom, c, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom}${d ? ` — ${d}` : ""}`); } };

const T = await imp("supabase/functions/_shared/taille-du-texte.js");
const L = await imp("src/publication/moteur/listes.js");
const Q = await imp("supabase/functions/_shared/taille-question-auto.js");

// Grilles RELEVÉES (19/10) : eBay 63861 (Robes, extrait), eBay 3001 (Costumes, ENTIÈRE, relue à 20:36 après
// le refus — aucune taille unique), Vinted (« Taille unique » répété par section), Beebs (« Universel »),
// Opla (codes), Beebs femme.
const EBAY_ROBES = ["XS", "S", "M", "L", "XL", "2XL", "32", "34", "36", "38", "40", "42", "44", "Taille unique", "UK 8", "US 6"];
const EBAY_COSTUMES = ["2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64", "66", "68",
  "UK 32", "UK 34", "UK 36", "UK 38", "UK 40", "UK 42", "UK 44", "UK 46", "UK 48", "UK 50", "US 32", "US 34", "US 36", "US 38", "US 40", "US 42", "US 44", "US 46", "US 48", "US 50"];
const VINTED = ["XS", "S", "M", "L", "XL", "Taille unique", "XS", "S", "Taille unique"];
const BEEBS_UNIVERSEL = ["S", "M", "L", "XL", "Universel"];
const OPLA = [{ code: "S", title: "S" }, { code: "TAILLE_UNIQUE", title: "Taille unique" }];
const BEEBS_FEMME = ["XXXS / 30", "XXS / 32", "XS / 34", "S / 36", "M / 38", "L / 40", "XL / 42", "XXL / 44", "Taille unique", "Autre"];
const v = (valeur, textes, grille = VINTED, extra = {}) => T.tailleDuTexte({ valeur, textes: [].concat(textes), grille, ...extra })?.valeur ?? null;
const doute = (valeur, textes, grille = VINTED) => T.tailleDuTexte({ valeur, textes: [].concat(textes), grille })?.doute ?? null;

console.log("\n1. L'écriture du vendeur sur la copie → l'option de taille unique de la grille");
ok("« T.U » → « Taille unique » (eBay)", v("T.U", "", EBAY_ROBES) === "Taille unique");
ok("« T.U. », « T. unique », « T: unique » → « Taille unique »", ["T.U.", "T. unique", "T: unique"].every((x) => v(x, "", EBAY_ROBES) === "Taille unique"));
ok("« Taille unique (TU) », « TU / One size » → « Taille unique »", v("Taille unique (TU)", "", EBAY_ROBES) === "Taille unique" && v("TU / One size", "", VINTED) === "Taille unique");
ok("« One size fits all », « OSFA » → « Universel » (Beebs)", v("One size fits all", "", BEEBS_UNIVERSEL) === "Universel" && v("OSFA", "", BEEBS_UNIVERSEL) === "Universel");
ok("Opla : le CODE « TAILLE_UNIQUE »", v("T.U", "", OPLA) === "TAILLE_UNIQUE");
ok("« Taille unique » répété par section (Vinted) : une seule option, pas un doute", v("T.U", "", VINTED) === "Taille unique");
ok("motif et règle tracés", T.tailleDuTexte({ valeur: "T.U", textes: [], grille: EBAY_ROBES })?.regle === "unique");

console.log("\n2. Copie VIDE : le titre ou la description qui disent « taille unique »");
ok("« Gilet poncho … - T.U » → « Taille unique »", v("", "Gilet poncho style bohème noir et blanc - Lely Wood - T.U", EBAY_ROBES) === "Taille unique");
ok("« Bonnet noire Taille unique femme » → « Taille unique »", v("", "Bonnet noire Taille unique femme très bon état") === "Taille unique");
ok("« Blouse rose Bluoltre TU, détails » → « Taille unique »", v("", "Blouse rose Bluoltre TU, détails zips dorés") === "Taille unique");
ok("« Taille Unique (Convient du 36 au 42) » → « Taille unique » (une indication, pas une taille)", v("", "Pull Taille Unique (Convient du 36 au 42) #p1") === "Taille unique");
ok("« TU 38/40 » → « Taille unique »", v("", "Robe tunique fleurie TU 38/40 - Seven Star Paris") === "Taille unique");
ok("« Jamais porté, taille unique », « non doublée, taille unique » : pas des négations", v("", "Jamais porté, taille unique") === "Taille unique" && v("", "Robe non doublée, taille unique") === "Taille unique");
ok("« taille universelle » → « Universel »", v("", "Écharpe taille universelle", BEEBS_UNIVERSEL) === "Universel");
ok("« la taille s'adapte », « tour de taille 80 cm » : pas une autre taille", v("", ["Jupe taille unique", "La taille s'adapte, tour de taille 80 cm, taille 90 cm"]) === "Taille unique");

console.log("\n3. Les garde-fous : la question reste");
ok("Sébastien, djellaba : « Unique » face à eBay « Costumes » (aucune taille unique) → null", v("Unique", "Djellaba traditionnelle marocaine homme / unisexe - Marron brodée", EBAY_COSTUMES) === null);
ok("grille sans taille unique, copie vide + « taille unique » → null (jamais une lettre)", v("", "T-shirt taille unique", ["S", "M", "L"]) === null);
ok("une copie qui porte une AUTRE taille n'est jamais recouverte (« M » + « taille unique »)", v("M", "Pull taille unique") === null);
ok("« taille 38 » à côté → doute", doute("", "Botte taille 38 Genouillère taille unique") !== null);
ok("« T:36 TU » → doute", doute("", "Haut noir Enza & Lea Paris T:36 TU en cachemire") !== null);
ok("« Taille unique / L » → doute", doute("", "Robe Taille unique / L") !== null);
ok("FR / W / mois à côté → doute (« W30 FR40 taille unique »)", doute("", "Jean W30 FR40 taille unique") !== null);
ok("copie « T.U » + « taille 38 » → doute", doute("T.U", "Pull taille 38") !== null);
ok("« pas de taille unique » → doute", doute("", "Pull pas de taille unique, voir mesures") !== null);
ok("deux options uniques différentes → doute", doute("T.U", "", ["S", "Taille unique", "Universel"]) !== null);
ok("« pièce unique », « adaptateur universel » : rien", v("", "Figurine bouledogue pièce unique") === null && v("", "Adaptateur universel", BEEBS_UNIVERSEL) === null);
ok("« TU Delft », « SI TU AS » : rien", v("", "Sweat TU Delft bleu") === null && v("", "SI TU AS DES QUESTIONS") === null);
ok("« one size up » : rien", v("", "fits one size up") === null);
ok("pointure : jamais (champ ou rayon de chaussures)", T.tailleDuTexte({ valeur: "", textes: ["Chaussons taille unique"], grille: ["38", "Taille unique"], champ: "Pointure" }) === null);

console.log("\n4. La règle d'avant, inchangée");
ok("sans taille unique nulle part : FR / W / mois comme avant (« W30 L32 FR40 » → « 40 »)", v("", "Jean W30 L32 FR40", ["38", "40", "42"]) === "40");
ok("« 24M » → « 24 mois (86-94 cm) »", v("24M", "Pull Kiabi 24M", ["18 mois (80-86 cm)", "24 mois (86-94 cm)"]) === "24 mois (86-94 cm)");
ok("« EU 38 » de la copie : jamais recouvert", v("EU 38", "Jean taille unique", BEEBS_FEMME) === null);

console.log("\n5. Les branchements (écran Publier, eBay, job)");
ok("jugement : « T.U » est dans la grille Beebs femme (« Taille unique »)", L.jugerValeurContreListe({ platform: "beebs", key: "Taille", value: "T.U", allowedValues: BEEBS_FEMME, textes: ["Gilet - T.U"] }).valeurListe === "Taille unique");
ok("jugement sans textes : comme avant (hors liste)", L.jugerValeurContreListe({ platform: "beebs", key: "Taille", value: "T.U", allowedValues: BEEBS_FEMME }).dans === false);
ok("eBay : « T.U » → « Taille unique »", L.tailleDansListeEbay("T.U", EBAY_ROBES, { textes: ["Gilet poncho - T.U"] }) === "Taille unique");
ok("eBay : « Unique » garde son chemin (tailles.js) → « Taille unique »", L.tailleDansListeEbay("Unique", EBAY_ROBES, { textes: ["x"] }) === "Taille unique");
ok("eBay Costumes : « Unique » → null (la question reste)", L.tailleDansListeEbay("Unique", EBAY_COSTUMES, { textes: ["Djellaba traditionnelle marocaine homme / unisexe - Marron brodée"] }) === null);
ok("job : copie vide + « Bonnet taille unique » → « Taille unique » posée", L.tailleDuJob({ platform: "vinted", taille: "", lignes: [{ key: "size", allowedValues: VINTED }], textes: ["Bonnet taille unique"] }) === "Taille unique");

console.log("\n6. handler-watch : la question de taille d'un job arrêté");
const jobEbay = (taille, allowed) => ({ status: "needs_user", platform: "ebay",
  platform_fields: { taille, ebayCategoryPath: ["Vêtements, accessoires", "Homme : vêtements, accessoires", "Homme : vêtements", "Costumes"],
    needsUserField: { platform: "ebay", field_key: "Taille", field_label: "Taille", target: { root: "ebayAspects", key: "Taille" }, allowed_values: allowed, input_type: "selection_only" } } });
ok("Sébastien 12854dbb rejoué : « Unique » + grille « Costumes » → aucune réponse (la question reste)",
  Q.reponseTailleAuto(jobEbay("Unique", EBAY_COSTUMES), "Unique", ["Djellaba traditionnelle marocaine homme / unisexe - Marron brodée", ""]) === null);
ok("« Unique » + grille qui l'a → R0 (inchangé) « Taille unique »", Q.reponseTailleAuto(jobEbay("Unique", EBAY_ROBES), null, ["Robe"])?.regle === "R0");
const tu = Q.reponseTailleAuto(jobEbay("T.U", EBAY_ROBES), null, ["Gilet poncho style bohème - T.U"]);
ok("« T.U » → R5 « Taille unique », cible ebayAspects.Taille", tu?.valeur === "Taille unique" && tu?.regle === "R5" && tu?.cible?.root === "ebayAspects");
const depop = { status: "needs_user", platform: "depop", platform_fields: { taille: "", needsUserField: { field_key: "depopTaille", field_label: "Taille", allowed_values: ["XS", "S", "M", "One size"] } } };
ok("Depop, copie vide + « taille unique » → « One size » (R5)", Q.reponseTailleAuto(depop, null, ["Bonnet laine taille unique"])?.valeur === "One size");

console.log("\n7. Le module");
const src = lire("supabase/functions/_shared/taille-du-texte.js");
ok("le dictionnaire de tailles.js est réutilisé (memeTaille), pas recopié", src.includes('import { tailleDansGrille, memeTaille } from "./tailles.js"'));
ok("aucun appel IA dans la règle", !/fetch\(|anthropic|claude/i.test(src.replace(/\/\/.*$/gm, "")));
ok("l'extension n'importe pas la règle (rien à livrer)", !fs.readdirSync(path.join(R, "chrome-extension"), { recursive: true }).some((f) => /\.(js|mjs)$/.test(f) && lire(path.join("chrome-extension", f)).includes("taille-du-texte")));
const pkg = JSON.parse(lire("package.json"));
ok("selftest inscrit au package.json", pkg.scripts["selftest:taille-unique"] === "node scripts/taille-unique-selftest.mjs");

console.log(`\ntaille-unique : ${n - ko}/${n} contrôles verts`);
if (ko) process.exit(1);
