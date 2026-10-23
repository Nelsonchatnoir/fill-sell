// Autotest — LA TAILLE ÉCRITE DANS LE TITRE OU LA DESCRIPTION (19/10) — `npm run selftest:tailles-titre`
// _shared/taille-du-texte.js et ses branchements : l'écran Publier (moteur/listes : jugement, job, eBay,
// carte du rayon) et handler-watch (question de taille d'un job arrêté, taille-question-auto.js).
// Cas réels : DeadRoz (19/10 12:17 → 12:56, ≈ 50 « Taille » Beebs remplies à la main sur des jeans Levi's
// dont le titre disait « W30 L32 FR40 », « W36 L34 (46) ») ; Ornella (« Pull Kiabi 24M », job 08ddc213).
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
const S = await imp("supabase/functions/_shared/taille-de-service.js");
const C = await imp("src/utils/champsDuRayon.js");

// Grilles RELEVÉES (platform_category_aspects, 19/10).
const BEEBS_HOMME = ["32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60", "62", "64", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL"];
const BEEBS_FEMME = ["XXXS / 30", "XXS / 32", "XS / 34", "S / 36", "M / 38", "L / 40", "XL / 42", "XXL / 44", "XXXL / 46", "4XL / 48", "5XL / 50", "6XL / 52", "7XL / 54", "8XL / 56", "9XL / 58", "Taille unique", "Autre"];
const BEEBS_BEBE = ["Prématuré (- de 45 cm)", "Naissance - 0 mois (45-50 cm)", "1 mois (50-54 cm)", "3 mois (54-60 cm)", "6 mois (60-66 cm)", "9 mois (67-74 cm)", "12 mois (74-80 cm)", "18 mois (80-86 cm)", "24 mois (86-94 cm)", "3 ans (94-102 cm)", "4 ans (102-108 cm)", "5 ans (108-116 cm)"];
const VINTED_HOMME_W = ["XS", "S", "M", "L", "XL", "XXL", "W28", "W29", "W30", "W31", "W32", "W33", "W34", "W36", "W38", "W40"];
const VINTED_FEMME_W = ["XS", "S", "M", "W28 | FR 38", "W29 | FR 38", "W30 | FR 40", "W31 | FR 40", "W32 | FR 42", "W33 | FR 42"];
const EBAY_11483 = ["2XS", "XS", "S", "M", "L", "XL", "2XL", "32", "34", "36", "37", "38", "39", "40", "42", "44", "46", "48", "50", "Taille unique", "UK 30", "US 30"];
const POINTURES = ["38", "39", "40", "41", "42", "43", "44"];
const HOMME = ["Mode", "Homme", "Vêtements (homme)", "Pantalons (homme)", "Autres pantalons (homme)"];
const BEBE = ["Mode", "Bébé", "Vêtements (bébé)", "Pulls, gilets et sweats (bébé)"];
const v = (valeur, textes, grille = BEEBS_HOMME, extra = {}) => T.tailleDuTexte({ valeur, textes: [].concat(textes), grille, ...extra })?.valeur ?? null;
const doute = (valeur, textes, grille = BEEBS_HOMME) => T.tailleDuTexte({ valeur, textes: [].concat(textes), grille })?.doute ?? null;

console.log("\n1. DeadRoz : la taille du titre, telle quelle (titres réels du 19/10)");
ok("« W30 » + « … W30 L32 FR40 … » → « 40 » (Beebs homme)", v("W30", "Jeans Levi's vintage 511 W30 L32 FR40 homme bleu marine coupe slim J32") === "40");
ok("« W36 L34 (46) » : le FR entre parenthèses → « 46 »", v("", "Jean Levi's Homme braguette patch en cuir effet usagé 100% coton bleu W36 L34 (46) J398") === "46");
ok("« W34 L32 (44) » → « 44 »", v("", "Jean W34 L32 (44)") === "44");
ok("« FR48, Homme » (virgule collée) → « 48 »", v("W38", "Jean Levi’s vintage 513 W38 L30 FR48, Homme coupe droite bleu marine J108") === "48");
ok("« FR 50 » écrit l'emporte sur un W hors table (W41), fiche W40 = FR 50 → « 50 »", v("W40", "Jean Levi’s Vintage homme coupe athletic W41 FR 50 J576") === "50");
ok("« J32 », « L32 » (référence, longueur) ne sont jamais lus", v("", "Jean J32 L32") === null);
ok("sans FR écrit : W34 = FR 44 (table publiée par Vinted)", v("", "Jean Levi's W34 coupe droite") === "44");
ok("la fiche seule (« W38 », titre muet) : W38 = FR 48", v("W38", "Jeans Levi's Homme 550 braguette zippée") === "48");

console.log("\n2. Le doute ne se tranche pas : la question reste");
ok("fiche « W32 », titre « W42 FR52 » → doute", doute("W32", "Jean levis Denizen 299 loose fit bleu marine W42 FR52 homme") !== null && v("W32", "… W42 FR52 …") === null);
ok("fiche « W29 », titre « W36 L34 FR46 » → doute", v("W29", "Jean Levi’s vintage 511 W36 L34 FR46, Homme") === null);
ok("deux tours de taille (« W30 et W32 ») → doute", doute("", "Lot de deux jeans W30 et W32") !== null);
ok("fourchette « FR 40/42 », « W30-32 » → doute", doute("", "Jean taille FR 40/42") !== null && doute("", "Jean W30-32") !== null);
ok("« W30/L32 » n'est PAS une fourchette → « 40 »", v("", "Jean W30/L32") === "40");
ok("W hors de la table publiée (W37) → doute", doute("", "Jean W37 L32") !== null);
ok("FR écrit ≠ W écrit (« W30 FR44 ») → doute", doute("", "Jean W30 FR44") !== null);
ok("deux FR (« FR40 … FR42 ») → doute", doute("", ["Jean FR40", "Taille FR42 selon les marques"]) !== null);
ok("taille adulte ET âge en mois → doute", doute("", "Jean W30 FR40, 24M") !== null);
ok("« EU 38 » de la fiche n'est jamais recouvert (« taille 38 » du titre non plus)", v("EU 38", "Jean MNG Mango bleu clair femme taille 38", BEEBS_FEMME) === null);
ok("un nombre nu (« taille 38 », « T40 ») n'est jamais un FR", v("", "Jean taille 38") === null && v("", "Jean T40") === null);
ok("« Envoi FR 48h », « FR 40 € » : pas des tailles", v("", "Envoi FR 48h") === null && v("", "Prix FR 40 €") === null);
ok("aucune option : « FR 40 » sur une grille de lettres → null (jamais de conversion en lettre)", v("", "Jean FR40", ["S", "M", "L"]) === null);

console.log("\n3. L'âge en mois (« 24M » = 24 mois)");
ok("Ornella : « 24M » + « Pull Kiabi 24M » → « 24 mois (86-94 cm) »", v("24M", "Pull Kiabi 24M gris clair motifs", BEEBS_BEBE) === "24 mois (86-94 cm)");
ok("« Pyjama 18 mois » (copie vide) → « 18 mois (80-86 cm) »", v("", "Pyjama 18 mois", BEEBS_BEBE) === "18 mois (80-86 cm)");
ok("tranche « 12-18 mois », « 6-9mois », « 3 à 6 mois » → doute", doute("", "Short 12-18 mois", BEEBS_BEBE) && doute("", "T shirt 6-9mois", BEEBS_BEBE) && doute("", "Body 3 à 6 mois", BEEBS_BEBE));
ok("« porté 3 mois » est une durée : « Body porté 3 mois, taille 6 mois » → 6 mois", v("", "Body porté 3 mois, taille 6 mois", BEEBS_BEBE) === "6 mois (60-66 cm)");
ok("« 1m » (un mètre), « 2M » : jamais un âge", v("", "Écharpe longueur 1m", BEEBS_BEBE) === null && v("", "Guirlande 2M", BEEBS_BEBE) === null);
ok("âge hors des étiquettes (« 23 mois ») → doute", doute("", "Jean 23 mois", BEEBS_BEBE) !== null);
ok("jamais les années (« 3 ans ») : rien", v("", "Pantalon 3 ans", BEEBS_BEBE) === null);
ok("« 24M » sur une grille adulte : aucune option → null", v("", "Pull 24M", BEEBS_HOMME) === null);

console.log("\n4. Jamais une pointure");
ok("champ « Pointure » → null", v("W30", "Jean W30 FR40", POINTURES, { champ: "Pointure" }) === null);
ok("rayon de chaussures → null", v("", "Bottes FR40", POINTURES, { chemin: ["Mode", "Femme", "Chaussures (femme)", "Bottes (femme)"] }) === null);
ok("« taille 9M » d'une botte (Pointure) → null", v("XL / 42 / 14", "Western Boot taille 9M femme", POINTURES, { champ: "Pointure" }) === null);

console.log("\n5. L'écran Publier (moteur/listes) : ce qui passait ne bouge pas");
const juger = (value, textes, allowedValues = BEEBS_HOMME, platform = "beebs", key = "Taille", chemin = HOMME) =>
  L.jugerValeurContreListe({ platform, key, value, allowedValues, cheminCategorie: chemin, textes });
ok("« W30 » + titre FR40 → dans la grille, « 40 »", juger("W30", ["Jeans Levi's 511 W30 L32 FR40"]).valeurListe === "40");
ok("sans textes (appelant d'avant) : exactement comme avant (hors grille)", juger("W30", null).dans === false);
ok("une valeur DANS la grille n'est jamais touchée (« 46 » malgré « FR40 » au titre)", juger("46", ["Jean FR40"]).valeurListe === "46");
ok("Vinted homme : « W32 » reste « W32 » malgré « W42 FR52 » au titre", juger("W32", ["Jean W42 FR52"], VINTED_HOMME_W, "vinted", "size", ["Hommes", "Vêtements", "Jeans"]).valeurListe === "W32");
ok("Vinted homme, copie vide + « W30 L32 FR40 » → « W30 » (FR 40 seul y est ambigu : W30 ou W31)", L.tailleDeduiteDuTexte({ platform: "vinted", key: "size", value: "", allowedValues: VINTED_HOMME_W, cheminCategorie: ["Hommes", "Vêtements", "Jeans"], textes: ["Jean W30 L32 FR40"] })?.valeur === "W30"
  && L.tailleDeduiteDuTexte({ platform: "vinted", key: "size", value: "", allowedValues: VINTED_HOMME_W, cheminCategorie: ["Hommes", "Vêtements", "Jeans"], textes: ["Jean FR40"] }) === null);
ok("Vinted femme : copie vide + « FR40 W30 » → « W30 | FR 40 »", L.tailleDeduiteDuTexte({ platform: "vinted", key: "size", value: "", allowedValues: VINTED_FEMME_W, cheminCategorie: ["Femmes", "Vêtements", "Jeans"], textes: ["Jean femme W30 FR40"] })?.valeur === "W30 | FR 40");
ok("Beebs femme : « FR 40 » → « L / 40 » (la table de Beebs, lue chez elle)", L.tailleDeduiteDuTexte({ platform: "beebs", key: "Taille", value: "", allowedValues: BEEBS_FEMME, textes: ["Jean femme FR 40"] })?.valeur === "L / 40");
ok("Beebs bébé : « 24M » passe par childSizes → « 24 mois (86-94 cm) »", juger("24M", ["Pull Kiabi 24M"], BEEBS_BEBE, "beebs", "Taille", BEBE).valeurListe === "24 mois (86-94 cm)");
ok("Pointure Beebs : jamais", juger("W30", ["Jean FR40"], POINTURES, "beebs", "Pointure", ["Mode", "Femme", "Chaussures (femme)"]).dans === false);
const lignes = [{ key: "Taille", allowedValues: BEEBS_HOMME }];
ok("job : « W30 » + titre FR40 → part avec « 40 »", L.tailleDuJob({ platform: "beebs", taille: "W30", lignes, textes: ["Jean W30 FR40"], cheminCategorie: HOMME }) === "40");
ok("job : copie VIDE + titre « W36 L34 (46) » → « 46 »", L.tailleDuJob({ platform: "beebs", taille: "", lignes, textes: ["Jean W36 L34 (46)"], cheminCategorie: HOMME }) === "46");
ok("job : copie vide SANS textes → null (comme avant)", L.tailleDuJob({ platform: "beebs", taille: "", lignes, textes: null }) === null);
ok("job : « 46 » déjà exact → null (rien à changer)", L.tailleDuJob({ platform: "beebs", taille: "46", lignes, textes: ["FR40"] }) === null);
ok("eBay : « W30 » + textes → « 40 » ; sans textes → null (comme avant)", L.tailleDansListeEbay("W30", EBAY_11483, { textes: ["Jean"] }) === "40" && L.tailleDansListeEbay("W30", EBAY_11483) === null);
ok("eBay : « Unique » garde son rapprochement (« Taille unique »)", L.tailleDansListeEbay("Unique", EBAY_11483, { textes: ["x"] }) === "Taille unique");
ok("eBay : copie vide + « FR 42 » → « 42 » ; « Pointure EU » jamais", L.tailleDansListeEbay("", EBAY_11483, { textes: ["Jean FR 42"] }) === "42" && L.tailleDansListeEbay("", POINTURES, { textes: ["FR 42"], champ: "Pointure EU" }) === null);

console.log("\n6. La carte du rayon dit la même chose que le moteur");
const ligneCarte = [{ field_key: "Taille", field_label: "Taille", required: true, input_type: "dropdown", allowed_values: BEEBS_HOMME }];
const carte = (pf, textes) => C.classerChamps(ligneCarte, pf, "beebs", { regle: "nouvelle", cheminCategorie: HOMME, textes });
ok("« W30 » + « FR40 » : connue, pas une question", carte({ taille: "W30" }, ["Jean W30 FR40"]).questions.length === 0);
ok("copie vide + « W36 L34 (46) » : connue, valeur « 46 »", carte({}, ["Jean W36 L34 (46)"]).connus.some((c) => c.valeur === "46"));
ok("sans textes : la question reste, comme avant", carte({ taille: "W30" }, null).questions.length === 1);
ok("fiche W29 + titre FR46 : la question reste", carte({ taille: "W29" }, ["Jean W36 FR46"]).questions.length === 1);

console.log("\n7. handler-watch : la question de taille d'un job arrêté");
const job = (taille, allowed, chemin = BEBE, champ = "Taille") => ({ status: "needs_user", platform: "beebs",
  platform_fields: { taille, beebsCategoryPath: chemin, needsUserField: { field_key: champ, field_label: champ, allowed_values: allowed, target: { key: "taille", root: null } } } });
const orn = Q.reponseTailleAuto(job("24M", BEEBS_BEBE), "24 mois (86-94 cm)", ["Pull Kiabi 24M gris clair motifs"]);
ok("Ornella 08ddc213 : « 24M » → « 24 mois (86-94 cm) » (R5)", orn?.valeur === "24 mois (86-94 cm)" && orn?.regle === "R5");
ok("sans textes (appel d'avant) : rien, comme avant", Q.reponseTailleAuto(job("24M", BEEBS_BEBE), "24 mois (86-94 cm)") === null);
ok("R0 → R4 d'abord, inchangées (patrick giry « W28 L32 » → R1 « 38 »)", Q.reponseTailleAuto({ ...job("W28 L32", ["36", "38", "40"]), platform: "ebay" }, null, ["Jeans W28 L32 FR38"])?.regle === "R1");
ok("Pointure : jamais (« 9M » d'une botte)", Q.reponseTailleAuto(job("9M", ["38", "39", "40"], ["Mode", "Femme", "Chaussures (femme)"], "Pointure"), null, ["Western Boot taille 9M"]) === null);
ok("copie sans taille + titre « Pyjama 18 mois » → « 18 mois (80-86 cm) »", Q.reponseTailleAuto(job("", BEEBS_BEBE), null, ["Pyjama 18 mois"])?.valeur === "18 mois (80-86 cm)");
ok("une fois seulement (taille_convertie_serveur)", Q.reponseTailleAuto({ ...job("24M", BEEBS_BEBE), platform_fields: { ...job("24M", BEEBS_BEBE).platform_fields, taille_convertie_serveur: { de: "x" } } }, null, ["24M"]) === null);
// (24/10) La même source, et aussi la lecture du tour de taille (lireTourDeTaille) : une seule table, une seule lecture.
ok("la table W → FR est celle de taille-de-service (une seule source)",
  /import \{ FR_PAR_TOUR_DE_TAILLE(?:, lireTourDeTaille)? \} from "\.\/taille-de-service\.js"/.test(lire("supabase/functions/_shared/taille-du-texte.js"))
  && !/const FR_PAR_TOUR_DE_TAILLE/.test(lire("supabase/functions/_shared/taille-du-texte.js")) && S.FR_PAR_TOUR_DE_TAILLE[30] === 40);

console.log("\n8. Les branchements");
const ecran = lire("src/components/ListingPreviewScreen.jsx");
ok("écran : la ligne « missing » d'une taille lit le texte (nouveau stepper)", ecran.includes('if (variante === "nouvelle" && estChampTaille(platform, key) && allowedValues.length) {') && ecran.includes("tailleDeduiteDuTexte({ platform, key, value: \"\", allowedValues, cheminCategorie: cheminDe(platform), textes: textesDuVendeurPour(platform) })"));
ok("écran : la taille déduite d'une copie vide est une option DÉDUITE (jamais bloquante), posée sur la copie de la plateforme",
  ecran.includes('suggested: t.valeur, blocking: false, deduit: { valeur: t.valeur, source: "taille_du_texte" }, deduite: t };')
  && ecran.includes('if (d.source === "taille_du_texte" && a.dedicatedTarget === "taille") {') && ecran.includes('setPlatformDedicatedField(gp, "taille", d.valeur);'));
ok("télémétrie : la question partagée « Taille » du rendu de la pose n'est pas comptée", ecran.includes('if (f.key === "taille" && tailleDuTexteEnVol.current.has(p)) continue;'));
ok("insert : le rayon passé à tailleDuJob, copie vide marquée taille_du_texte", ecran.includes("cheminCategorie: typeof cleRayon === \"string\" ? cleRayon.split(\" > \") : null });") && ecran.includes("{ taille_du_texte: true }"));
ok("eBay : suggestion et copie vide lisent les textes du vendeur", ecran.includes("tailleDansListeEbay(sendVal, allowedValues, { textes: textesVendeurEbay") && ecran.includes('deduit: { valeur: t, source: "taille_du_texte" }'));
ok("carte du rayon : textes passés (StepGeneration → CarteRayon → classerChamps)", ecran.includes('textes={[ficheTexte?.titre ?? "", ficheTexte?.description ?? "", e.title ?? "", e.description ?? ""]}')
  && lire("src/components/CarteRayon.jsx").includes("cheminCategorie: rayon?.chemin ?? null, textes: textesCle ? JSON.parse(textesCle) : null }"));
const hw = lire("supabase/functions/handler-watch/index.ts");
ok("handler-watch : titre et description lus et passés", hw.includes('platform_fields, title, description")') && hw.includes("taille:attributs->taille->>v, titre, description") && hw.includes("reponseTailleAuto(j as never, art?.taille ?? null, textes)"));
ok("aucun appel IA dans la règle", !/fetch\(|anthropic|claude/i.test(lire("supabase/functions/_shared/taille-du-texte.js").replace(/\/\/.*$/gm, "")));
const pkg = JSON.parse(lire("package.json"));
ok("selftest inscrit au package.json", pkg.scripts["selftest:tailles-titre"] === "node scripts/tailles-titre-selftest.mjs");

console.log(`\ntailles-titre : ${n - ko}/${n} contrôles verts`);
if (ko) process.exit(1);
