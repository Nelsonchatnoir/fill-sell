// ═══════════════════════════════════════════════════════════════════════════
// L'ACCESSOIRE D'UN OBJET N'EST JAMAIS L'OBJET — SELFTEST (18/10 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : « House de couette 140x190 » (eBay, Type) → « Couette » posé
// par la règle du texte. RÈGLE : « housse de… », « taie de… », « house de… »
// suivis d'un objet nomment l'ACCESSOIRE — jamais l'objet (couette, coussin,
// canapé, oreiller…). L'option qui nomme l'accessoire si la plateforme la
// propose, sinon la question. Deux endroits, la même règle :
//   · l'option d'une liste fermée (_shared/option-du-texte.js) — aspects eBay,
//     critères Leboncoin, champs Vinted et Beebs ;
//   · le mot du titre qui choisit la CATÉGORIE des quatre plateformes
//     (detectObjectKeywordDetail, src/utils/shared.js → resoudreParMot).
// Listes RÉELLES lues le 18/10 : eBay 37644 « Type » (89 valeurs) et 93391
// « Sous-type », Leboncoin « Linge de maison » (linens_product).
//
//   node --import ./scripts/loader-ext.mjs scripts/accessoire-objet-selftest.mjs

import { optionDepuisTextes, textesDeLAnnonce, zonesObjetAccessoire, motsDe } from "../supabase/functions/_shared/option-du-texte.js";
import { detectObjectKeywordDetail, zonesObjetAccessoireTexte } from "../src/utils/shared.js";
import { resoudreParMot } from "../src/utils/categorieParMot.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const deduire = (titre, options, cle, label = cle, description = "") =>
  optionDepuisTextes({ options, textes: textesDeLAnnonce({ titre, description, platformFields: {} }), cle, label }).valeur;

const EBAY_37644_TYPE = ["Alèse","Baldaquin/filet","Baldaquin et ciel de lit","Cache-sommier à bord droit","Cache-sommier à cheville à vis","Cache-sommier à coin fendu","Cache-sommier amovible","Cache-sommier à pli d'aisance","Cache-sommier à pli rond","Cache Sommier Blanc à bande enveloppante","Cache-sommier continu","Cache-sommier plissé","Chemin de lit","Couette","Courtepointe","Coussin appuie-dos","Coussin de grossesse","Coussin de jambe","Coussin de lecture","Coussin lombaire","Coussin nervuré","Coussin petit ami","Couverture","Couverture thermique","Couvre-lit","Couvre-matelas","Décoratif","Dessus de lit","Dessus matelassé","Drap","Drap-housse","Drap-housse pour table de massage","Duvet Patchwork","Édredon","Ensemble couvre-lit","Ensemble de couettes","Ensemble de couettes et d'oreillers","Ensemble de housses de couette","Ensemble de literie","Ensemble édredon","Ensemble pour canapé-lit","Feuille de mousse","Housse d'appuie-tête de table de massage","Housse de canapé-lit","Housse décorative pour coussin lombaire","Housse de couette","Housse de coussin de grossesse","Housse de coussin de lecture","Housse de coussin lombaire","Housse de coussin nervuré","Housse de coussin petit ami","Housse de traversin","Housse supérieure pour table de massage","Jeté de lit","Jupe de lit","Lit en plumes","Mousse de remplissage","Moustiquaire","Oreiller","Oreiller à eau","Oreiller cervical","Oreiller de corps","Oreiller de lit décoratif","Oreiller de soutien de nuque","Oreiller en microbilles","Oreiller en mousse","Oreiller imitation duvet","Oreiller pour dormir sur le côté","Oreiller pour dormir sur le dos","Oreiller pour l'apnée du sommeil","Parure de drap","Parure de lit","Parure de lit complète","Pinces pour drap de lit","Protection d'oreiller","Protection de matelas","Protège-matelas","Protège-oreiller","Remplissage d'oreiller","Sac de couchage","Sangle connecteur pour lits jumeaux","Set d'oreillers","Taie d'oreiller","Taie d'oreiller de lit","Taie d'oreiller de soutien de nuque","Taie d'oreiller pour dormir sur le côté","Taie d'oreiller pour l'apnée du sommeil","Taie de coussin de corps","Traversin"];
const EBAY_93391_SOUS_TYPE = ["Lits à barreaux","Lits évolutifs","Lits parapluie","Alèses","Cale-bébés","Couette","Couverture","Draps","Housses de couette","Parures, Ensembles","Tour de Lit"];
const LBC_LINGE = ["Rideaux","Voilage","Store","Coussin","Housse de coussin","Plaid et jeté","Housse de canapé","Housse de chaise","Housse de fauteuil","Galette de chaise","Coussins d'extérieur","Tapis","Tissu","Autre"];

console.log("── 1. eBay (aspect Type, liste réelle 37644) ──");
ok(deduire("House de couette 140x190", EBAY_37644_TYPE, "Type") === "Housse de couette", "cas fondateur : « House de couette » → Housse de couette (avant : Couette)");
ok(deduire("Housse de couette 240x220 coton", EBAY_37644_TYPE, "Type") === "Housse de couette", "« Housse de couette » → Housse de couette");
ok(deduire("Taie d'oreiller 60x60 lin lavé", EBAY_37644_TYPE, "Type") === "Taie d'oreiller", "« Taie d'oreiller » → Taie d'oreiller, jamais Oreiller");
ok(deduire("Couette 4 saisons 220x240", EBAY_37644_TYPE, "Type") === "Couette", "inchangé : une couette reste Couette");
ok(deduire("Oreiller en mousse à mémoire de forme", EBAY_37644_TYPE, "Type") === "Oreiller en mousse", "inchangé : un oreiller reste Oreiller en mousse");
ok(deduire("Drap-housse 140x190 blanc", EBAY_37644_TYPE, "Type") === "Drap-housse", "inchangé : drap-housse (« housse » sans objet derrière)");
ok(deduire("House de couette 140x190", EBAY_93391_SOUS_TYPE, "Sous-type") === "Housses de couette", "liste réelle 93391 : Housses de couette (pluriel de la liste)");
ok(deduire("Housse de couette 140x190", ["Couette", "Oreiller", "Drap"], "Type") === null, "pas d'option « housse » dans la liste → la question, jamais Couette");
ok(deduire("Housse de protection pour matelas 140x190", ["Matelas", "Sommier", "Alèse"], "Type") === null, "qualificatif sauté : « housse de protection pour matelas » n'est pas un Matelas");

console.log("── 2. Leboncoin (Linge de maison, liste réelle) ──");
ok(deduire("Housse coussin velours 40x40", LBC_LINGE, "linens_product", "Produit") === "Housse de coussin", "« Housse coussin » (sans « de ») → Housse de coussin (avant : Coussin)");
ok(deduire("House de coussin lin", LBC_LINGE, "linens_product", "Produit") === "Housse de coussin", "faute « House de coussin » → Housse de coussin");
ok(deduire("Housse de canapé 3 places", LBC_LINGE, "linens_product", "Produit") === "Housse de canapé", "Housse de canapé");
ok(deduire("Coussin velours 45x45", LBC_LINGE, "linens_product", "Produit") === "Coussin", "inchangé : un coussin reste Coussin");

console.log("── 3. Ce qui suit l'objet se lit comme avant (couleur, matière) ──");
ok(deduire("Housse de couette gris 140x190", ["Bleu", "Blanc", "Gris"], "Couleur") === "Gris", "« housse de couette gris » : Couleur Gris");
ok(deduire("Housse de couette en coton", ["Coton", "Lin", "Polyester"], "Matière") === "Coton", "« housse de couette en coton » : Matière Coton");
ok(deduire("Housse gris", ["Bleu", "Gris"], "Couleur") === "Gris", "champ qui n'est pas une identité : « housse gris » reste Gris");
ok(JSON.stringify(zonesObjetAccessoire(motsDe("housse de protection pour matelas en coton"))) === JSON.stringify([{ tete: 0, objets: [4], accessoires: [0, 2] }]),
  "objet = matelas seul ; « protection » nomme l'accessoire ; « en coton » se lit comme avant");

console.log("── 3 bis. Ce que le banc du parc a montré (18/10, avant → après) ──");
ok(deduire("Lot de 4 housses de noël pour coussins 45x44", ["Noël", "Halloween", "Pâques"], "Thème") === "Noël", "Thème (pas une identité) : « housses de noël pour coussins » reste Noël");
ok(deduire("Housse pour iPad en cuir", ["iPad", "iPhone", "Samsung"], "Adapté à") === "iPad", "« Adapté à » : l'objet de l'accessoire reste la bonne réponse (iPad)");
ok(deduire("Lot de 2 housses de coussin 100% coton", ["Lot", "Coussin", "Plaid"], "Sous-type") === null, "objet écarté, pas d'option « housse » : la question, jamais « Lot » lu à côté");
ok(deduire("Drap housse imperméable 70/140", ["Imperméable", "Coton", "Alèse"], "Sous-type") === "Imperméable", "« drap housse » EST l'article : rien d'écarté (Imperméable comme avant)");
ok(deduire("Housse étui portefeuille pour smartphone", ["Étui portefeuille", "Coque", "Smartphone"], "Type") === "Étui portefeuille", "« housse étui portefeuille » : l'accessoire nommé (Étui portefeuille), jamais Smartphone");
ok(deduire("Housse de couette pour lit 140x190", ["Lit", "Couette", "Drap"], "Type") === null, "« housse de couette pour lit » : ni Couette ni Lit — la question");
ok(deduire("Housse de transport guitare", ["Transport", "Guitare", "Ampli"], "Type") === "Transport", "un mot de l'accessoire (transport) reste lisible ; l'objet (guitare) jamais");

ok(deduire("Lot de 2 draps housses lit bébé", ["Lit fauteuil/lit", "Couette", "Drap"], "Type") === null,
  "« draps housses » EST l'article : rien d'écarté (la question, comme avant)");
ok(JSON.stringify(optionDepuisTextes({ options: ["Housse rigide", "Coque", "Étui"], cle: "Type", label: "Type",
  textes: textesDeLAnnonce({ titre: "BMW M Housse rigide coque noire avec logo pour Apple iPhone 4" }) }).candidats) === JSON.stringify(["Housse rigide", "Coque"]),
  "« Housse rigide » au milieu du titre, sans « de » : lue comme avant (Housse rigide et Coque en tête de la question)");
ok(deduire("2018 Audi A3 Insonorisant Housse Bouclier Bord 5Q0825230J", ["Bouclier", "Aile", "Capot"], "Type d'accessoire") === "Bouclier", "« Housse Bouclier » au milieu d'un titre : rien d'écarté (comme avant)");
ok(deduire("Couvre-Lit 240x250 cm avec taies d'oreiller", ["Couvre-lit", "Taie d'oreiller", "Oreiller"], "Type") === null, "objet nommé AVANT l'accessoire (« Couvre-lit … avec taies ») : comme avant, jamais « Taie d'oreiller »");
ok(deduire("2 housses coussins 30x50 cm", LBC_LINGE, "linens_product", "Produit") === "Housse de coussin", "« 2 housses coussins » (quantité, sans « de ») → Housse de coussin");

console.log("── 4. La CATÉGORIE (mot du titre, quatre plateformes) ──");
const mot = (t, d) => detectObjectKeywordDetail(t, d)?.mot ?? null;
ok(mot("House de couette 140x190") === "housse de couette", "« House de couette » → mot « housse de couette » (avant : couette)");
ok(mot("Housse de coussin 40x40") === null, "« Housse de coussin » → jamais « coussin » (l'objet de l'IA décide)");
ok(mot("Housse de canapé 3 places") === null, "« Housse de canapé » → jamais « canapé »");
ok(mot("Housse coussin velours") === null, "« Housse coussin velours » → jamais « coussin »");
ok(mot("Housse de protection pour matelas") === null, "« Housse de protection pour matelas » → jamais « matelas »");
ok(mot("Taie d'oreiller 60x60") === "taie d'oreiller", "« Taie d'oreiller » → taie d'oreiller");
ok(mot("Couette 4 saisons 220x240") === "couette", "inchangé : couette");
ok(mot("Coussin velours 45x45") === "coussin", "inchangé : coussin");
ok(mot("Canapé 3 places cuir") === "canape", "inchangé : canapé");
ok(mot("Lot linge de maison", "Une housse de coussin et un plaid") === "plaid", "passe 2 : la description, l'objet de la housse sauté (plaid)");
ok(zonesObjetAccessoireTexte("plaid gris").length === 0, "texte sans la tournure : aucune zone (chemin d'avant)");
for (const [pf, feuille] of [["vinted", "Housses de couette"], ["beebs", "Housses de couette"]]) {
  const r = await resoudreParMot(mot("House de couette 140x190"), pf, {});
  ok(r?.certitude === "exact" && r.chemin.at(-1) === feuille, `${pf} : « House de couette » → ${(r?.chemin ?? []).slice(-2).join(" > ")}`);
}
const rEbay = await resoudreParMot(mot("Taie d'oreiller 60x60"), "ebay", {});
ok(rEbay?.certitude === "exact" && /Taies d'oreiller/.test(rEbay.chemin.at(-1)), `ebay : « Taie d'oreiller » → ${(rEbay?.chemin ?? []).slice(-2).join(" > ")}`);

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ accessoire d'un objet : tout passe");
process.exit(ko ? 1 : 0);
