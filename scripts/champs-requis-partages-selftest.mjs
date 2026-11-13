// ═══════════════════════════════════════════════════════════════════════════
// LES CHAMPS REQUIS PARTAGÉS (05/11 soir, demande de Nico) — `npm run selftest:champs-requis-partages`
// ═══════════════════════════════════════════════════════════════════════════
// Cas réels : compte assopmfrance (boutique « PMF Vito », Pro), 05/11 de 17:27 à 19:23 — 8 fiches, 5 publications
// parties SANS Beebs ou Vinted, 1 fiche abandonnée, à cause de la taille / pointure / du rayon. Rejoue le code LIVRÉ :
//   · _shared/pointure-du-texte.js (« T36,5 », « Taille 36,5 (US 4.5Y) », demi-pointure seule, faux positifs) ;
//   · _shared/taille-du-texte.js (« taille M » en lettres, en dernier recours) ;
//   · _shared/champs-requis-auto.js (taille unique d'un accessoire sans taille : casquette, sac…) ;
//   · src/publication/moteur/listes.js (traduction dans la grille de CHAQUE plateforme, pointure hors grille dite) ;
//   · src/publication/moteur/regles.js (UNE question taille pour plusieurs plateformes, plateformes retenues) ;
//   · src/utils/shared.js + beebsCategories.js (un contenant de bijoux n'est jamais un bijou) ;
// puis vérifie le branchement de l'écran Publier (ListingPreviewScreen, BlocQuestions, EcranConfirmer) : un champ de
// rayon qui manque grise le bouton (nouveau stepper), « Continuer sans X » est le seul chemin sans la plateforme, et
// un décochage dit qui l'a fait. Règle de Nico : jamais une valeur inventée — rien de lisible → la question, UNE fois.
// Les grilles sont celles du catalogue relevé en production (platform_category_aspects, lues le 05/11 au soir).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const { pointureDuTexte } = await import("../supabase/functions/_shared/pointure-du-texte.js");
const { tailleUniqueAccessoire } = await import("../supabase/functions/_shared/champs-requis-auto.js");
const { jugerValeurContreListe, pointureHorsGrille, tailleDeduiteDuTexte, horsListeBloque } = await import("../src/publication/moteur/listes.js");
const { composerQuestionTaille, plateformesBloqueesChamps, aspectBloquant } = await import("../src/publication/moteur/regles.js");
const { detectObjectKeywordDetail, detectObjectIcon, detectType } = await import("../src/utils/shared.js");
const { getBeebsCategoryPath, beebsCategoryStatus } = await import("../src/utils/beebsCategories.js");
const { getVintedCategoryPath } = await import("../src/utils/vintedCategories.js");

let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const val = (r) => r?.valeur ?? (r?.doute ? "doute" : null);

// ── Les grilles du catalogue (production, 05/11) ─────────────────────────────────────────────────────────────────
const demi = (a, b, pas05 = true) => { const o = []; for (let n = a; n <= b; n++) { o.push(String(n)); if (pas05 && n < b) o.push(`${n}.5`); } return o; };
const BEEBS_FEMME = [...demi(34, 46), "Taille unique", "Autre"];                          // Baskets (femme)
const BEEBS_HOMME = [...demi(38, 49), "50", "51", "52", "Taille unique", "Autre"];        // Baskets (homme)
const BEEBS_FILLE = Array.from({ length: 27 }, (_, i) => String(15 + i));                 // Baskets (fille) : 15 … 41, entiers
const VINTED_FEMMES = [...demi(34, 46), "Taille unique", "Autre"];                       // Femmes > Chaussures > Baskets
const VINTED_HOMMES = [...demi(38, 49).map((x) => x.replace(".", ",")), "50", "51", "52", "Taille unique", "Autre"];
const LBC = [...demi(16, 50).map((x) => x.replace(".", ",")).filter((x) => x !== "50"), "50 et plus"]; // Mode > Chaussures
const CAPS_BEEBS = ["XS", "S", "M", "L", "XL", "XXL", "Taille Unique", ...Array.from({ length: 14 }, (_, i) => String(52 + i))];
const CAPS_VINTED = ["XS", "S", "M", "L", "XL", "XXL", "Taille unique", ...Array.from({ length: 14 }, (_, i) => String(52 + i))];
const VINTED_FEMMES_HAUTS = ["XXXS / 30 / 2", "XXS / 32 / 4", "XS / 34 / 6", "S / 36 / 8", "M / 38 / 10", "L / 40 / 12", "XL / 42 / 14", "XXL / 44 / 16", "Taille unique", "Autre"];
const R = {
  beebsFemme: ["Mode", "Femme", "Chaussures (femme)", "Baskets (femme)"],
  beebsHomme: ["Mode", "Homme", "Chaussures (homme)", "Baskets (homme)"],
  beebsFille: ["Mode", "Fille", "Chaussures (fille)", "Baskets (fille)"],
  vintedFemmes: ["Femmes", "Chaussures", "Baskets"],
  vintedHommes: ["Hommes", "Chaussures", "Baskets"],
  lbc: ["Mode", "Chaussures"],
  capsBeebs: ["Mode", "Homme", "Accessoires (homme)", "Chapeaux et casquettes (homme)"],
  capsVinted: ["Hommes", "Accessoires", "Chapeaux et casquettes", "Casquettes"],
};
const juger = (platform, key, value, allowedValues, cheminCategorie, textes = null) =>
  jugerValeurContreListe({ platform, key, value, allowedValues, cheminCategorie, textes });
// La ligne d'un champ de rayon telle que l'écran la bâtit pour une valeur de copie hors grille (genericRequiredStatus).
const ligneHorsGrille = (platform, key, value, allowedValues, chemin, inputType) => ({
  key, label: key, state: "invalid", value, allowedValues,
  blocking: horsListeBloque({ regle: "nouvelle", platform, key, inputType, allowedValues, suggested: null }),
  horsGrille: pointureHorsGrille({ platform, key, value, allowedValues, cheminCategorie: chemin }),
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("1) 1793886275067017 « Nike Court Borough Low 2 blanches T36,5 » — pointure dans le titre, Beebs « Fille »");
const NIKE = ["Nike Court Borough Low 2 blanches T36,5 – Réf. AV3171-100 – Excellent état",
  "Nike Court Borough Low 2 blanches T36,5 – Réf. AV3171-100 – Excellent état\nDescription\nPaire de Nike Court Borough Low 2 originales.\nTaille 36,5 (US 4.5Y)\nRéférence AV3171-100\nColoris blanc\nModèle mixte junior, convient également aux petits pieds adultes"];
ok(val(pointureDuTexte({ textes: NIKE, chemin: R.lbc.concat("Enfant"), grille: LBC })) === "36,5", "la pointure du titre « T36,5 » est LUE (Leboncoin « 36,5 »), « US 4.5Y » à côté n'est plus un doute");
ok(val(pointureDuTexte({ textes: NIKE, chemin: R.beebsFemme, grille: BEEBS_FEMME })) === "36.5", "… et écrite comme la grille Beebs femme l'écrit (« 36.5 »)");
ok(val(pointureDuTexte({ textes: NIKE, chemin: R.vintedFemmes, grille: VINTED_FEMMES })) === "36.5", "… et la grille Vinted femmes (« 36.5 », le rayon du vendeur : catalogue 2632)");
ok(val(pointureDuTexte({ textes: NIKE, chemin: R.beebsFille, grille: BEEBS_FILLE })) === null, "rayon Beebs « Fille » (grille d'ENTIERS) : rien n'est posé — une demi-pointure n'est jamais arrondie");
const nikeFille = pointureHorsGrille({ platform: "beebs", key: "Pointure", value: "36.5", allowedValues: BEEBS_FILLE, cheminCategorie: R.beebsFille });
ok(Boolean(nikeFille?.motif) && /entières/.test(nikeFille.motif) && /36,5/.test(nikeFille.motif), "la question DIT pourquoi (« Ce rayon n'a que des pointures entières : 36,5 n'y figure pas… »)", nikeFille?.motif);
ok(JSON.stringify(nikeFille?.candidats) === JSON.stringify(["36", "37"]), "… les deux voisines (36, 37) en tête — jamais choisies à sa place");
ok(juger("leboncoin", "shoe_size", "36,5", LBC, R.lbc).dans && juger("ebay", "Pointure", "36,5", LBC, null).dans !== false, "la même pointure passe chez Leboncoin (« 36,5 ») — une seule taille pour toutes");
const nikeLigne = ligneHorsGrille("beebs", "Pointure", "36.5", BEEBS_FILLE, R.beebsFille, "dropdown");
ok(aspectBloquant(nikeLigne) && JSON.stringify(plateformesBloqueesChamps(new Set(["leboncoin", "ebay", "beebs"]), { beebs: [nikeLigne], leboncoin: [] })) === JSON.stringify(["beebs"]),
  "Beebs reste RETENUE par la question (et le bouton grisé, plus bas) — plus jamais publiée sans Beebs en silence");

console.log("2) 1793898424918 « Casquette 39THIRTY New York Giants NFL bleue Medium-Large » — taille demandée pour Beebs");
const NEW_ERA = ["Casquette 39THIRTY New York Giants NFL bleue Medium-Large", "Casquette structurée bleue à visière courbe rouge au motif alvéolé, avec le logo « ny » brodé en blanc. Étiquette intérieure New Era lisible, composition 100 % polyester."];
ok(val(pointureDuTexte({ textes: NEW_ERA, chemin: R.vintedHommes, grille: VINTED_HOMMES })) === null, "« 39THIRTY » n'est JAMAIS lu comme une pointure 39");
ok(tailleDeduiteDuTexte({ platform: "beebs", key: "Taille", value: "", allowedValues: CAPS_BEEBS, cheminCategorie: R.capsBeebs, textes: NEW_ERA }) === null, "… ni comme une taille");
ok(tailleUniqueAccessoire({ chemin: R.capsBeebs, textes: NEW_ERA, allowedValues: CAPS_BEEBS, tailleFiche: "Medium-Large" }) === null,
  "la fiche dit « Medium-Large » (étiquette lue par Lens) : jamais « Taille Unique » par-dessus — la question, UNE fois");
ok(!juger("beebs", "Taille", "Medium-Large", CAPS_BEEBS, R.capsBeebs).dans && !juger("vinted", "size", "Medium-Large", CAPS_VINTED, R.capsVinted).dans,
  "« Medium-Large » n'a pas d'option unique (M ? L ?) chez Beebs ni chez Vinted : jamais choisie à sa place");
const capsBeebs = ligneHorsGrille("beebs", "Taille", "Medium-Large", CAPS_BEEBS, R.capsBeebs, "dropdown");
const capsVinted = ligneHorsGrille("vinted", "size", "Medium-Large", CAPS_VINTED, R.capsVinted, "grid");
const qCaps = composerQuestionTaille([{ gp: "beebs", a: capsBeebs }, { gp: "vinted", a: capsVinted }]);
ok(qCaps.lignes.length === 2 && qCaps.mode === "une" && qCaps.communes.includes("M") && qCaps.communes.includes("L"),
  "Vinted et Beebs : UNE question taille, une réponse écrite dans la grille de chacune");
const CASQ = ["Casquette New Era 9FORTY Yankees noire", "Casquette réglable, très bon état"];
ok(val(tailleUniqueAccessoire({ chemin: R.capsBeebs, textes: CASQ, allowedValues: CAPS_BEEBS })) === "Taille Unique", "une casquette SANS taille écrite → « Taille Unique » de la grille Beebs, sans question");
ok(val(tailleUniqueAccessoire({ chemin: R.capsVinted, textes: CASQ, allowedValues: CAPS_VINTED })) === "Taille unique", "… et « Taille unique » de la grille Vinted (écrite comme elle)");
ok(tailleUniqueAccessoire({ chemin: R.capsBeebs, textes: ["Casquette en laine taille 58"], allowedValues: CAPS_BEEBS }) === null, "« taille 58 » écrite → jamais « Taille unique » (la question)");
ok(tailleUniqueAccessoire({ chemin: "Mode > Fille > Accessoires (fille) > Casquettes, chapeaux et bandeaux (fille)", textes: ["Casquette Reine des neiges 3 ans"], allowedValues: ["Bébé 0-36 mois", "Enfant 3 ans et plus", "Taille Unique"] }) === null,
  "casquette d'enfant « 3 ans » → jamais « Taille Unique »");

console.log("3) 1793886275067012 « Boîte à bijoux artisanale Liban – Coffret en bois marqueterie » — rangée en « Bijoux (femme) »");
const BOITE_T = "Boîte à bijoux artisanale Liban – Coffret en bois marqueterie Lebanon Vintage";
const BOITE_D = "Magnifique coffret en bois artisanal rapporté du Liban.\nDécor traditionnel en marqueterie\nIntérieur doublé de velours rouge\nIdéal comme boîte à bijoux, coffret à souvenirs ou objet de décoration";
const kw = detectObjectKeywordDetail(BOITE_T, BOITE_D);
const iconeBoite = detectObjectIcon(BOITE_T, BOITE_D, detectType(BOITE_T, ""));
ok(kw?.icon !== "💍" && kw?.contenantBijoux === true, "le mot « bijoux » d'une BOÎTE à bijoux ne fait plus l'icône bijou", JSON.stringify(kw));
ok(detectType(BOITE_T, "") === "Maison", "le TYPE de la fiche n'est plus « Mode » (une boîte est un objet de la maison)", detectType(BOITE_T, ""));
for (const g of ["Femme", "Homme", "Fille", "Garçon"]) {
  const ch = getBeebsCategoryPath(iconeBoite, g);
  ok(!(ch ?? []).some((x) => /bijou/i.test(x)), `Beebs (${g}) : jamais un rayon « Bijoux » (${JSON.stringify(ch)} — ${beebsCategoryStatus(iconeBoite)})`);
}
ok(!(getVintedCategoryPath(iconeBoite, "Femme") ?? []).some((x) => /^bijoux$/i.test(x)), "Vinted : jamais « Bijoux » non plus");
for (const [titre, attendu] of [
  ["Écrin à bague velours rouge", "pas_bijou"], ["Présentoir à bijoux 3 étages", "pas_bijou"], ["Range-bijoux mural en bois", "pas_bijou"],
  ["Porte-bijoux arbre doré", "pas_bijou"], ["Boîte à bijoux en bois avec tiroirs pour colliers et bagues", "pas_bijou"],
  ["Boîte à montres 10 compartiments", "pas_bijou"], ["Organiseur de bijoux en velours", "pas_bijou"],
  ["Bague argent 925 dans son écrin", "💍"], ["Coffret bijoux Swarovski collier et boucles d'oreilles", "💍"],
  ["Collier fantaisie + boîte à bijoux offerte", "💍"], ["Bracelet perles", "💍"], ["Montre Casio dans sa boîte d'origine", "⌚"],
]) {
  const ic = detectObjectKeywordDetail(titre, "")?.icon;
  ok(attendu === "pas_bijou" ? (ic !== "💍" && ic !== "⌚") : ic === attendu, `« ${titre} » → ${attendu === "pas_bijou" ? "jamais un bijou ni une montre" : attendu}`, ic);
}

console.log("4) 1793901624164 « Baskets montantes Chuck Taylor All Star marron » — Vinted « size » et Beebs « Pointure » à part");
const conv = { vinted: ligneHorsGrille("vinted", "size", "EU 37", VINTED_HOMMES, R.vintedHommes, "grid"),
  beebs: ligneHorsGrille("beebs", "Pointure", "EU 37", BEEBS_HOMME, R.beebsHomme, "dropdown") };
const qConv = composerQuestionTaille([{ gp: "vinted", a: conv.vinted }, { gp: "beebs", a: conv.beebs }]);
ok(qConv.lignes.length === 2, "Vinted et Beebs : UNE question « Taille » (une seule réponse), plus deux questions séparées");
ok(/de 38 à 52/.test(conv.vinted.horsGrille?.motif ?? "") && /de 38 à 52/.test(conv.beebs.horsGrille?.motif ?? ""), "elle DIT pourquoi : « La grille de ce rayon va de 38 à 52 : 37 n'y figure pas. Vérifie le rayon… »", conv.beebs.horsGrille?.motif);
ok(juger("leboncoin", "shoe_size", "37", LBC, R.lbc).dans, "Leboncoin « 37 » passe (sa grille va de 16 à 50)");
ok(juger("vinted", "size", "EU 37", VINTED_FEMMES, R.vintedFemmes).dans && juger("beebs", "Pointure", "EU 37", BEEBS_FEMME, R.beebsFemme).dans,
  "rayon FEMME : « EU 37 » s'écrit seul dans les grilles Vinted et Beebs (« 37 ») — aucune question");
ok(JSON.stringify(plateformesBloqueesChamps(new Set(["leboncoin", "ebay", "vinted", "beebs"]), { vinted: [conv.vinted], beebs: [conv.beebs], leboncoin: [] })) === JSON.stringify(["vinted", "beebs"]),
  "Vinted et Beebs restent retenues tant qu'elle n'a pas répondu (ou choisi « Continuer sans »)");

console.log("5) 1793902912702 « Baskets montantes noires à lacets tige chaussette » (homme) — fiche abandonnée");
const HOMME_SANS = ["Baskets montantes noires à lacets tige chaussette", "Baskets montantes maje noires à lacets, avec tige en maille type chaussette. Bouts et talon en cuir noir, semelle bicolore noire et blanche."];
ok(pointureDuTexte({ textes: HOMME_SANS, chemin: R.beebsHomme, grille: BEEBS_HOMME }) === null, "rien d'écrit : AUCUNE pointure inventée — la question reste, une fois");
const h36 = pointureHorsGrille({ platform: "beebs", key: "Pointure", value: "EU 36", allowedValues: BEEBS_HOMME, cheminCategorie: R.beebsHomme });
ok(/de 38 à 52/.test(h36?.motif ?? ""), "la copie portait « EU 36 » sur un rayon homme qui commence à 38 : la question le dit (rayon ou pointure à vérifier)");

console.log("6) 1793898908348 « Baskets chunky multicolores » — le contre-exemple qui marchait : UNE taille pour les 4 plateformes");
ok(juger("vinted", "size", "40", VINTED_FEMMES, R.vintedFemmes).valeurListe === "40" && juger("beebs", "Pointure", "40", BEEBS_FEMME, R.beebsFemme).valeurListe === "40"
  && juger("leboncoin", "shoe_size", "40", LBC, R.lbc).valeurListe === "40", "la réponse « 40 » s'écrit telle quelle chez Vinted, Beebs et Leboncoin (eBay reçoit la même)");

console.log("7) Chaussures HOMME et FEMME, ENFANT : la pointure du texte, traduite dans la grille de chaque plateforme");
const AIRMAX = ["Nike Air Max 90 blanche T43", ""];
ok(val(pointureDuTexte({ textes: AIRMAX, chemin: R.vintedHommes, grille: VINTED_HOMMES })) === "43" && val(pointureDuTexte({ textes: AIRMAX, chemin: R.beebsHomme, grille: BEEBS_HOMME })) === "43"
  && val(pointureDuTexte({ textes: AIRMAX, chemin: R.lbc.concat("Homme"), grille: LBC })) === "43", "homme « T43 » → 43 chez Vinted, Beebs, Leboncoin");
const HOMME_DEMI = ["Baskets homme Adidas EU 44,5", ""];
ok(val(pointureDuTexte({ textes: HOMME_DEMI, chemin: R.vintedHommes, grille: VINTED_HOMMES })) === "44,5" && val(pointureDuTexte({ textes: HOMME_DEMI, chemin: R.beebsHomme, grille: BEEBS_HOMME })) === "44.5",
  "homme « EU 44,5 » → « 44,5 » chez Vinted, « 44.5 » chez Beebs (l'écriture de chaque grille)");
ok(val(pointureDuTexte({ textes: ["Escarpins noirs pointure 38", ""], chemin: R.beebsFemme, grille: BEEBS_FEMME })) === "38", "femme « pointure 38 » → 38");
ok(val(pointureDuTexte({ textes: ["Bottines cuir taille 37 et demi", ""], chemin: R.vintedFemmes, grille: VINTED_FEMMES })) === "37.5", "femme « taille 37 et demi » → 37.5 (jamais arrondi)");
ok(val(pointureDuTexte({ textes: ["Sandales dorées 39.5", ""], chemin: R.beebsFemme, grille: BEEBS_FEMME })) === "39.5", "femme « 39.5 » écrit seul (demi-pointure) → 39.5");
ok(val(pointureDuTexte({ textes: ["Baskets fille pointure 28", ""], chemin: R.beebsFille, grille: BEEBS_FILLE })) === "28", "enfant « pointure 28 » → 28 (grille Beebs fille)");
ok(val(pointureDuTexte({ textes: ["Baskets pointure 42", ""], chemin: R.beebsFille, grille: BEEBS_FILLE })) === "doute", "enfant « pointure 42 » (pointure adulte) → doute, la question");
ok(val(pointureDuTexte({ textes: ["Chaussures fille 30,5", ""], chemin: R.beebsFille, grille: BEEBS_FILLE })) === null, "enfant « 30,5 » sur une grille d'entiers → rien posé (jamais arrondi)");

console.log("8) Faux positifs : jamais une pointure ni une taille");
for (const [t, ch] of [["Lot de 12 paires de lacets", R.vintedHommes], ["12 pots de crème", R.vintedHommes], ["Basket Puma de taille 40,5 cm", R.vintedFemmes],
  ["Nike Air Force 1 édition 2019", R.vintedHommes], ["Réf. AV3171-100", R.vintedHommes], ["Baskets Nike US 9.5", R.vintedHommes], ["Nike taille 42 US", R.vintedHommes],
  ["Baskets", R.vintedHommes], ["semelle intérieure 26,5", R.vintedHommes], ["Baskets 36,5 €", R.vintedFemmes], ["Casquette 39THIRTY", R.vintedHommes]]) {
  ok(pointureDuTexte({ textes: [t, ""], chemin: ch, grille: VINTED_HOMMES.concat(VINTED_FEMMES) }) === null, `« ${t} » → rien`);
}
ok(val(pointureDuTexte({ textes: ["Baskets T42", "semelle 26,5"], chemin: R.vintedHommes, grille: VINTED_HOMMES })) === "42", "« T42 » + « semelle 26,5 » → 42 (une longueur de semelle ne gêne pas)");
ok(val(pointureDuTexte({ textes: ["Baskets T42", "taille 43"], chemin: R.vintedHommes, grille: VINTED_HOMMES })) === "doute", "deux pointures écrites → doute, la question");

console.log("9) Vêtements : « taille M » écrit → la grille (lettres en dernier recours)");
const pullM = tailleDeduiteDuTexte({ platform: "vinted", key: "size", value: "", allowedValues: VINTED_FEMMES_HAUTS, cheminCategorie: ["Femmes", "Vêtements", "Pulls"], textes: ["Pull col roulé taille M", ""] });
ok(pullM?.valeur === "M / 38 / 10", "« Pull taille M » → « M / 38 / 10 » chez Vinted", JSON.stringify(pullM));
ok(tailleDeduiteDuTexte({ platform: "vinted", key: "size", value: "", allowedValues: VINTED_FEMMES_HAUTS, cheminCategorie: ["Femmes", "Vêtements", "Pulls"], textes: ["Pull taille M/L", ""] }) === null, "« taille M/L » → doute, la question");
ok(tailleDeduiteDuTexte({ platform: "vinted", key: "size", value: "", allowedValues: VINTED_FEMMES_HAUTS, cheminCategorie: ["Femmes", "Vêtements", "Pulls"], textes: ["Pull taille M, FR 40", ""] })?.valeur === "L / 40 / 12",
  "un FR écrit passe devant la lettre (règle du 19/10 inchangée)");
ok(tailleDeduiteDuTexte({ platform: "vinted", key: "size", value: "", allowedValues: VINTED_FEMMES_HAUTS, cheminCategorie: ["Femmes", "Vêtements", "Robes"], textes: ["Robe T38", ""] }) === null, "« T38 » d'un vêtement : nombre nu, jamais lu (règle du 19/10 inchangée)");

console.log("10) Sac, accessoires : « Taille unique » quand rien n'est dit");
ok(val(tailleUniqueAccessoire({ chemin: "Mode > Femme > Accessoires (femme) > Sacs à main et pochettes (femme) > Sacs à main (femme)", textes: ["Sac à main cuir noir Longchamp"], allowedValues: ["Taille unique", "S", "M"] })) === "Taille unique", "sac à main → « Taille unique »");
ok(tailleUniqueAccessoire({ chemin: "Mode > Homme > Accessoires (homme) > Ceintures (homme)", textes: ["Ceinture cuir"], allowedValues: ["70 mm", "Ajustable", "Taille unique"] }) === null, "ceinture : sa longueur compte → jamais « Taille unique »");
ok(tailleUniqueAccessoire({ chemin: "Femmes > Vêtements > Pulls", textes: ["Pull"], allowedValues: ["S", "Taille unique"] }) === null, "vêtement → jamais « Taille unique » d'office");
ok(tailleUniqueAccessoire({ chemin: R.capsBeebs, textes: CASQ, allowedValues: ["S", "M", "L"] }) === null, "grille sans taille unique → la question");

console.log("11) Branchement : l'écran Publier");
const lps = lire("src/components/ListingPreviewScreen.jsx");
const bq = lire("src/publication/BlocQuestions.jsx");
const ec = lire("src/publication/EcranConfirmer.jsx");
const garde = lps.slice(lps.indexOf("const requiredBlocking ="), lps.indexOf("refusSansQuestion;", lps.indexOf("const requiredBlocking =")));
// (14/11, lot « zéro friction », A3 — Nico : « le dernier écran doit toujours laisser partir ce qui est prêt ») La règle
// du 05/11 (« jamais de plateforme perdue en silence ») garde son but par un autre chemin : la plateforme qui attend est
// RETENUE à ce clic et NOMMÉE (sous le bouton, puis sur l'écran de suivi) ; le bouton ne grise que si plus rien ne part.
// Verrou : scripts/valeurs-probables-selftest.mjs.
ok(/\(variante === "nouvelle" && publishChips\.length === 0 && plateformesRetenuesAuClic\.length > 0\) \|\|/.test(garde)
  && /const publishChips = \[\.\.\.plateformesPubliables\]\.filter\(p => !plateformesRetenuesAuClic\.includes\(p\)\)/.test(lps),
  "un champ de rayon qui attend RETIENT sa plateforme, nommément, sans griser les autres (nouveau stepper) ; plus rien de prêt → bouton gris");
ok(/\.\.\.\(variante === "nouvelle" \? plateformesBloqueesChamps : \[\]\),/.test(lps), "… et « Continuer sans X » est offert : la plateforme ne part sans lui que par un geste de la personne");
ok(/tailleUniqueAccessoire\(\{ chemin: cheminListe, textes, allowedValues, tailleFiche \}\)/.test(lps) && /"accessoire_sans_taille"/.test(lps), "la taille unique d'un accessoire passe par champRequisAuto et se pose sur la copie");
ok(/tailleUniqueAccessoire\(\{\s*chemin: pf\.ebayCategoryPath/.test(lps), "… et chez eBay");
ok(/pointureHorsGrille\(\{ platform, key, value: src/.test(lps) && /a\.horsGrille\?\.motif/.test(bq), "la question dit pourquoi une pointure connue n'entre pas dans la grille");
ok(/decoche_par: `moteur:\$\{decocheParMoteurRef\.current\[vu\.platform\]\}`/.test(lps) && /decoche_par: "personne"/.test(lps), "« plateforme_decochee » dit QUI a décoché (personne, ou moteur + motif)");
ok(/noterDecochageMoteur\(\[\.\.\.selected\]\.filter\(p => categorieFermee/.test(lps) && /Retirée par FillSell : /.test(ec), "une plateforme retirée par FillSell le dit sur sa ligne (jamais « Non cochée » muet)");

console.log(`\n${rouges ? "✗" : "✓"} champs-requis-partages : ${verts} verts, ${rouges} ratés`);
if (rouges) process.exit(1);
