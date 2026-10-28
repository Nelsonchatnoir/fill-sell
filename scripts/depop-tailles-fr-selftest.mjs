// `npm run selftest:depop-tailles-fr` — LES TAILLES FRANÇAISES VERS LA GRILLE DEPOP DU RAYON (28/10, point 14).
//
// Cas fondateur : thecloset72000, jean femme Lee « Taille FR 50 » (28/10 20:36), rayon womenswear/bottoms/jeans —
// grille Depop 24 (IT) : One size, XS…XXL, 24…34 (TOURS DE TAILLE), 36…48 (EU), Other. Le 50 n'y est pas : la
// question était JUSTE ; la personne a choisi « Other » elle-même. Ce test tient :
//   A. la chaîne complète (taille de la fiche → tailleDepop (app, get-pending-jobs) → connecteur depopResoudreTaille,
//      grilles RÉELLES du relevé du 08/10) pour les cas demandés : FR 50 jean femme, FR 38 robe, homme FR 42/44,
//      enfant 8 ans, chaussures 39, taille sans correspondance → question ;
//   B. le bloc des tours de taille des grilles 62 et 24 : un nombre FRANÇAIS de la plage n'y est jamais l'option du
//      même nombre (W) — 26 jeans « W30 L32 FR40 » partis en « 40 » le 14/10 ; W du texte, W de la fiche, impair ;
//      sinon question avec les W de la table de Vinted en tête ; la réponse de la personne n'est jamais rejugée ;
//   C. garde-fous : jamais « Other » posé seul, jamais une taille inventée, la table W → FR est celle du serveur.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
const importer = (p) => import(pathToFileURL(path.join(RACINE, p)).href);
let ko = 0, ok = 0;
const dit = (nom, c, detail) => { if (c) ok++; else ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

// Le connecteur, exécuté (même bac à sable que selftest:depop-acces).
const ctx = vm.createContext({ console, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
ctx.globalThis = ctx;
vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}
;globalThis.__t = { depopResoudreTaille, DEPOP_FR_PAR_W: typeof DEPOP_FR_PAR_W === "object" ? DEPOP_FR_PAR_W : {}, DEPOP_ZONE_TOUR_DE_TAILLE: typeof DEPOP_ZONE_TOUR_DE_TAILLE === "object" ? DEPOP_ZONE_TOUR_DE_TAILLE : {} };`, ctx, { filename: "depop.js" });
const T = ctx.__t;
const { tailleDepop } = await importer("src/utils/depopPublication.js");
const { FR_PAR_TOUR_DE_TAILLE } = await importer("supabase/functions/_shared/taille-de-service.js");

// Les grilles RÉELLES (relevé du 08/10, même forme que la réponse lue par depopGrilles()).
const brut = JSON.parse(lire("docs/plateformes/depop/brut/attributes-categories-size-mapping.json"));
const grilles = { feuilles: new Map(), grilles: new Map(brut.size_sets.map((s) => [s.id, s])) };
for (const e of brut.category_size_mapping) grilles.feuilles.set(`${e.department}/${e.group}/${e.product_type}`, e);
const libellesDe = (id) => grilles.grilles.get(id).sizes.map((s) => s.name_i18n.en);

// La chaîne : fiche → copie Depop (tailleDepop) → connecteur.
function chaine(rayon, tailleFiche, { titre = "", description = "", reponse = null, republication = false } = {}) {
  const chemin = rayon.split("/");
  const pf = { taille: tailleFiche, depopTaille: reponse ?? tailleDepop(tailleFiche, chemin) };
  if (reponse) pf.needsUserResolved = { depopTaille: reponse };
  return T.depopResoudreTaille(pf, chemin, "IT", grilles, [titre, description], { republication });
}
const sortie = (r) => r?.libelle ?? (r?.question ? "QUESTION" : JSON.stringify(r));

const JEAN_F = "womenswear/bottoms/jeans", ROBE = "womenswear/dresses/dresses", HAUT_F = "womenswear/tops/blouses";
const JEAN_H = "menswear/bottoms/jeans", CHINO_H = "menswear/bottoms/trousers", CHEMISE_H = "menswear/tops/shirts";
const VESTE_H = "menswear/coats-jackets/jackets", TSHIRT_E = "kidswear/tops/tshirts", PANTALON_E = "kidswear/bottoms/trousers";
const BASKETS_F = "womenswear/footwear/trainers", BASKETS_H = "menswear/footwear/trainers", BASKETS_E = "kidswear/footwear/trainers";

console.log("\nA. LA CHAÎNE COMPLÈTE, GRILLES RÉELLES (région IT = compte français)");
{
  // 1. FR 50 jean femme (le cas du 28/10) : la grille 24 n'a ni 50 ni lettre au-delà de XXL.
  const lee = chaine(JEAN_F, "50", { titre: "Lee Taille FR 50 Femme Jean Bleu Coton Easy Fit Coupe Droite", description: "Taille : FR 50" });
  dit("jean femme FR 50 → QUESTION (grille 24 : 36…48, XS…XXL) — jamais « Other » posé seul", lee.question && !lee.libelle, sortie(lee));
  dit("la question liste la grille EXACTE, « Other » compris (la personne le choisit)", lee.question?.allowed_values?.includes("Other") && lee.question?.allowed_values?.includes("48"));
  dit("le message dit pourquoi : « 50 » absent, la plus grande taille chiffrée est « 48 », la taille reste dans la description",
    /« 50 » n'y est pas \(la plus grande taille chiffrée de cette grille est « 48 »\)/.test(lee.message ?? "") && /reste écrite dans la description/.test(lee.message ?? ""), lee.message);
  dit("« FR 50 » écrit : la même question", sortie(chaine(JEAN_F, "FR 50")) === "QUESTION");
  dit("jean femme FR 44 → « 44 » (bloc EU de la grille 24)", sortie(chaine(JEAN_F, "44")) === "44", sortie(chaine(JEAN_F, "44")));
  dit("jean femme FR 36 / « EU 36 » / « T36 » → « 36 »", ["36", "EU 36", "T36"].every((t) => sortie(chaine(JEAN_F, t)) === "36"));
  // 2. FR 38 robe (grille 81 : 32…62 paires).
  dit("robe FR 38 → « 38 » (nu, « FR 38 », « EU 38 », « T38 »)", ["38", "FR 38", "EU 38", "T38"].every((t) => sortie(chaine(ROBE, t)) === "38"));
  dit("robe FR 50 / 54 → « 50 » / « 54 » (la grille 81 va jusqu'à 62)", sortie(chaine(ROBE, "50")) === "50" && sortie(chaine(ROBE, "FR 54")) === "54");
  dit("haut femme FR 34 → « 34 » (grille 9 : 32…62, aucun tour de taille)", sortie(chaine(HAUT_F, "34")) === "34");
  // 3. Homme FR 42 / 44.
  dit("chemise homme 42 → « 42 » (grille 56)", sortie(chaine(CHEMISE_H, "42")) === "42");
  dit("jean homme FR 42 / FR 44 → « 42 » / « 44 » (bloc EU 42…56 de la grille 62 : inchangé)", sortie(chaine(JEAN_H, "42")) === "42" && sortie(chaine(JEAN_H, "FR 44")) === "44");
  dit("veste homme FR 44 → QUESTION (grille 98 : 46…56 ; aucune table homme publiée vers les lettres)", sortie(chaine(VESTE_H, "44")) === "QUESTION");
  dit("veste homme FR 48 → « 48 »", sortie(chaine(VESTE_H, "48")) === "48");
  // 4. Enfant.
  dit("t-shirt enfant « 8 ans » → « 8 years »", sortie(chaine(TSHIRT_E, "8 ans")) === "8 years");
  dit("« 8 ans (123-128 cm) » (écriture Beebs) → « 8 years »", sortie(chaine(TSHIRT_E, "8 ans (123-128 cm)")) === "8 years", sortie(chaine(TSHIRT_E, "8 ans (123-128 cm)")));
  dit("« 8 ans / 128 cm » (écriture Vinted) → « 8 years »", sortie(chaine(PANTALON_E, "8 ans / 128 cm")) === "8 years");
  dit("stature seule « 128 » / « 128 cm » → « 8 years » (étiquette française)", sortie(chaine(TSHIRT_E, "128")) === "8 years" && sortie(chaine(TSHIRT_E, "128 cm")) === "8 years");
  dit("stature « 92 » (= 24 mois = 2 ans : deux tailles Depop) → QUESTION", sortie(chaine(TSHIRT_E, "92")) === "QUESTION", sortie(chaine(TSHIRT_E, "92")));
  dit("« 36 mois », « 18 ans » → QUESTION (aucun équivalent exact)", sortie(chaine(TSHIRT_E, "36 mois")) === "QUESTION" && sortie(chaine(TSHIRT_E, "18 ans")) === "QUESTION");
  // 5. Chaussures 39.
  dit("baskets femme 39 → « EUR 39 » (grille 48)", sortie(chaine(BASKETS_F, "39")) === "EUR 39");
  dit("baskets homme 39 / « EU 39 » → « EUR 39 » (grille 79)", sortie(chaine(BASKETS_H, "39")) === "EUR 39" && sortie(chaine(BASKETS_H, "EU 39")) === "EUR 39");
  dit("baskets enfant 39 → « 39 (adult) » (grille 104)", sortie(chaine(BASKETS_E, "39")) === "39 (adult)");
  dit("baskets femme 39,5 → « EUR 39.5 » ; enfant 39,5 → QUESTION (pas de demi-pointure en 104)", sortie(chaine(BASKETS_F, "39,5")) === "EUR 39.5" && sortie(chaine(BASKETS_E, "39,5")) === "QUESTION");
  // 6. Sans correspondance.
  dit("« UK 8 » baskets homme → QUESTION (jamais converti)", sortie(chaine(BASKETS_H, "UK 8")) === "QUESTION");
  dit("« XXXL » jean femme → QUESTION (la grille 24 s'arrête à XXL)", sortie(chaine(JEAN_F, "XXXL")) === "QUESTION");
  dit("« Autre » → QUESTION (jamais « Other » choisi pour la personne)", sortie(chaine(JEAN_F, "Autre")) === "QUESTION");
}

console.log("\nB. LE BLOC DES TOURS DE TAILLE (grilles 62 et 24)");
{
  const g62 = libellesDe(62), g24 = libellesDe(24);
  const bloc = (g, a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i)).every((x) => g.includes(x));
  dit("relevé : la 62 porte 24…40 un par un PUIS 42…56 pairs ; la 24 porte 24…34 un par un PUIS 36…48 pairs",
    bloc(g62, 24, 40) && !g62.includes("41") && ["42", "44", "56"].every((x) => g62.includes(x)) && bloc(g24, 24, 34) && !g24.includes("35") && ["36", "48"].every((x) => g24.includes(x)) && !g24.includes("50"));
  dit("les zones du connecteur sont celles du relevé", JSON.stringify(T.DEPOP_ZONE_TOUR_DE_TAILLE) === JSON.stringify({ 24: [24, 34], 62: [24, 40] }));
  // recrutementgroupezk704, 14/10 : fiche « 40 », titre « … W30 L32 FR40 » → parti en « 40 » (W40).
  const levi = chaine(JEAN_H, "40", { titre: "Jeans Levi's 501 Vintage W30 L32 FR40 Homme Coupe droite bleu J374" });
  dit("jean homme fiche « 40 » + titre « W30 L32 FR40 » → « 30 » (W du texte = FR 40 par la table de Vinted)", sortie(levi) === "30", sortie(levi));
  dit("titre « W31 L34 FR40 » → « 31 »", sortie(chaine(JEAN_H, "40", { titre: "Jean Wrangler homme bleu délavé W31 L34 - J540" })) === "31");
  dit("titre « W29 L32 FR39 », fiche « 38 » → « 29 »", sortie(chaine(JEAN_H, "38", { titre: "Jean Levi's vintage 505 W29 L32 FR39 Homme Coupe droite J266" })) === "29");
  const contra = chaine(JEAN_H, "38", { titre: "Jean Levi's vintage 511 W36 L34 FR46, Homme Coupe slim Bleu marine J74" });
  dit("titre « W36 … FR46 » contre fiche « 38 » (contradiction) → QUESTION", sortie(contra) === "QUESTION", sortie(contra));
  // thecloset72000, 28/10 16:52 : chino « Taille 30 », fiche « 40 » → parti en « 40 » (W40).
  const chino = chaine(CHINO_H, "40", { titre: "School Rag Taille 30 Homme Pantalon Chino Beige Camel Coupe Slim" });
  dit("chino fiche « 40 », aucun W écrit → QUESTION", sortie(chino) === "QUESTION", sortie(chino));
  dit("… avec en tête les W de la table de Vinted (30, 31) puis la lecture W (40)", JSON.stringify(chino.question?.allowed_values?.slice(0, 3)) === JSON.stringify(["30", "31", "40"]), JSON.stringify(chino.question?.allowed_values?.slice(0, 3)));
  dit("… et le message nomme les tours de taille", /TOURS DE TAILLE/.test(chino.message ?? "") && /W30 ou W31 pour un 40/.test(chino.message ?? ""), chino.message);
  // tiblancdeshaut, 22/10 : « Jean H&M … EUR 34 », fiche « 34 » → parti en « 34 » (W34).
  const hm = chaine(JEAN_F, "34", { titre: "Jean H&M large taille EUR 34 US 2 bleu clair" });
  dit("jean femme fiche « 34 » (EUR 34) → QUESTION, en tête 24, 25, 34", sortie(hm) === "QUESTION" && JSON.stringify(hm.question.allowed_values.slice(0, 3)) === JSON.stringify(["24", "25", "34"]), sortie(hm));
  dit("« EU 34 » / « FR 34 » jean femme → QUESTION (jamais l'option W34)", sortie(chaine(JEAN_F, "EU 34")) === "QUESTION" && sortie(chaine(JEAN_F, "FR 34")) === "QUESTION");
  dit("W écrit : « W30 | FR 40 » (Vinted) → « 30 » ; « W33 L34 » → « 33 » ; « 33/34 » → « 33 »",
    sortie(chaine(JEAN_H, "W30 | FR 40")) === "30" && sortie(chaine(JEAN_H, "W33 L34")) === "33" && sortie(chaine(JEAN_H, "33/34")) === "33");
  dit("femme : « W30 » → « 30 » ; « W36 » (aussi un EU 36) → QUESTION, comme avant", sortie(chaine(JEAN_F, "W30")) === "30" && sortie(chaine(JEAN_F, "W36")) === "QUESTION");
  dit("nombre nu impair « 33 » → « 33 » (aucune taille française n'est impaire)", sortie(chaine(JEAN_H, "33")) === "33");
  dit("fiche « 34 » + titre « W34 L34 » → « 34 » (le W écrit sans W)", sortie(chaine(JEAN_H, "34", { titre: "Jeans Levi's Homme 517 Bootcut W34 L34 (44)" })) === "34");
  dit("la réponse de la personne (« 40 ») n'est jamais rejugée, même avec un W30 au titre", sortie(chaine(JEAN_H, "40", { titre: "Levi's W30 L32", reponse: "40" })) === "40");
  const repub = chaine(CHINO_H, "40", { titre: "School Rag Taille 30 Homme Pantalon Chino", republication: true });
  dit("republication, doute (aucun W écrit) : la taille de l'annonce repart (« 40 »), jamais une question — et le doute est tracé", sortie(repub) === "40" && /douteux/.test(repub.motif ?? ""), JSON.stringify(repub));
  dit("republication, certain (« W31 L34 » au titre) : corrigée en « 31 »", sortie(chaine(CHINO_H, "40", { titre: "Pantalon chino Tommy Hilfiger beige W31 L34", republication: true })) === "31");
  dit("combinaison homme (grille 62) : même règle", sortie(chaine("menswear/jumpsuit-and-playsuit/dungarees-overalls", "40")) === "QUESTION");
  dit("hors du bloc : jean homme « 46 » → « 46 », « W42 » → QUESTION (inchangés)", sortie(chaine(JEAN_H, "46")) === "46" && sortie(chaine(JEAN_H, "W42")) === "QUESTION");
  dit("hors des grilles 62/24 : rien ne change (« 40 » haut homme, grille 56)", sortie(chaine("menswear/tops/tshirts", "40")) === "40");
}

console.log("\nC. GARDE-FOUS");
{
  dit("la table W → FR du connecteur est celle du serveur (FR_PAR_TOUR_DE_TAILLE), à l'entrée près",
    JSON.stringify(Object.entries(T.DEPOP_FR_PAR_W)) === JSON.stringify(Object.entries(FR_PAR_TOUR_DE_TAILLE).map(([k, v]) => [k, v])));
  // Aucune taille de fiche n'atterrit sur « Other » sans que la personne l'ait dit.
  const rayons = [JEAN_F, ROBE, HAUT_F, JEAN_H, CHINO_H, CHEMISE_H, VESTE_H, TSHIRT_E, BASKETS_F, BASKETS_H, BASKETS_E];
  const tailles = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "32", "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "FR 38", "EU 40", "W30", "W32 L34", "8 ans", "12 mois", "Taille unique", "39", "42,5", "UK 8", "US 10", "Autre", "Other"];
  let other = 0, invente = 0;
  for (const r of rayons) for (const t of tailles) {
    const s = chaine(r, t);
    if (s?.libelle === "Other" && !/^(other)$/i.test(t)) other++;
    if (s?.libelle && !libellesDe(grilles.feuilles.get(r).size_set_by_region.IT).includes(s.libelle)) invente++;
  }
  dit(`${rayons.length} rayons × ${tailles.length} tailles : « Other » jamais posé seul`, other === 0, other);
  dit("toute taille posée est une option EXACTE de la grille du rayon", invente === 0, invente);
  const dep = lire("chrome-extension/content-scripts/depop.js");
  dit("le connecteur passe le titre et la description au juge des tailles", dep.includes("depopResoudreTaille(pf, v.chemin, depopRegion(session.pays), grilles, [job?.title, job?.description],") && /republication: job?.action === "republish" || pf.republish_recreation === true || pf.republish_prevol_only === true/.test(dep));
  dit("la question porte le message qui dit pourquoi (repli : la phrase d'avant)", dep.includes('error: taille.message ?? "Depop exige une taille de SA grille pour ce rayon."'));
}

console.log(`\n${ko === 0 ? "✓" : "✗"} depop-tailles-fr : ${ok} contrôles verts, ${ko} rouges`);
process.exit(ko === 0 ? 0 : 1);
