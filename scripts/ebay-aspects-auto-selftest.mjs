// ═══════════════════════════════════════════════════════════════════════════
// eBay — CE QUE L'ENCART REMPLIT SEUL, ET QUAND — SELFTEST (10/10, cas Manon)
// ═══════════════════════════════════════════════════════════════════════════
// Le moteur du stepper ET du lot (ListingPreviewScreen) décide ici, par deux
// fonctions pures (src/publication/moteur/aspectsEbayAuto.js), de ce qu'il
// demande à l'IA et de ce qu'il reprend quand la catégorie change. Ce contrôle
// exécute le code livré :
//   1. rien n'est demandé, rien n'est déclaré « terminé », tant que la liste
//      des exigés relue n'est pas celle de la catégorie COURANTE (course
//      catégorie / liste : la cause d'une question posée sans que l'IA ait vu
//      le champ) ;
//   2. chaque aspect est demandé une fois PAR catégorie — un exigé devenu
//      manquant après le premier appel l'est à son tour ; jamais deux fois ;
//   3. « terminé » attend la fin des appels en vol ;
//   4. une valeur posée par le moteur pour une AUTRE catégorie, absente de la
//      liste d'ici, est reprise (« Type : Pull » de « Pulls, cardigans » sur
//      un vêtement passé en « Manteaux, vestes ») ; valable ici, elle reste ;
//      retouchée par la personne, elle n'est plus jamais touchée ;
//   5. le câblage dans ListingPreviewScreen : la garde de liste sur les poses
//      et sur l'IA, le second essai d'un appel qui n'aboutit pas, l'article
//      dans la mesure (usage_logs).
//
//   node --import ./scripts/loader-ext.mjs scripts/ebay-aspects-auto-selftest.mjs
import { readFileSync } from "node:fs";
import { aspectsADemanderIa, valeursAutoAReprendre } from "../src/publication/moteur/aspectsEbayAuto.js";
import { normAspectVal } from "../src/publication/moteur/listes.js";

let ko = 0;
const ok = (c, quoi, vu) => { if (!c) { ko++; console.log(`  ✗ ${quoi}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); } else console.log(`  ✓ ${quoi}`); };

// MÊME critère que ListingPreviewScreen (isEbayClosedList) — le câblage le vérifie plus bas.
const isEbayClosedList = (allowedValues, mode) => {
  const n = Array.isArray(allowedValues) ? allowedValues.length : 0;
  return n > 0 && (n <= 200 || mode === "SELECTION_ONLY");
};

// Listes RÉELLES (ebay_item_aspects, relues le 10/10).
const TYPE_63862 = ["Blazer", "Cap", "Coatigan", "Gilet", "Manteau", "Poncho", "Veste"];
const STYLE_63862 = ["3 en 1", "Anorak", "Bermuda", "Bombers", "Caban", "College", "Coupe vent", "Doudoune",
  "Imperméable", "Kimono", "Manteau basique", "Matelassé", "Moto", "Pardessus", "Parka", "Trench", "Veste militaire"];
const STYLE_63866 = ["Boléro", "Cache-cœur", "Cap", "Cardigan", "Fermeture éclair sur toute la longueur", "Gilet", "Henley", "Pull", "Tunique"];
const statut = (etats) => Object.entries(etats).map(([name, state]) => ({
  name, state, mode: "FREE_TEXT",
  allowedValues: name === "Type" ? TYPE_63862 : name === "Style" ? STYLE_63862 : [],
}));

console.log("1. Jamais sur la liste d'une autre catégorie");
{
  const r = aspectsADemanderIa({ categorie: "63862", listeAJour: false, statut: statut({ Style: "missing" }), dejaDemandes: new Set() });
  ok(r.attendre && r.aDemander.length === 0 && !r.fini, "liste pas encore relue → rien demandé, rien « terminé »", r);
  const r2 = aspectsADemanderIa({ categorie: null, listeAJour: true, statut: statut({ Style: "missing" }), dejaDemandes: new Set() });
  ok(r2.attendre && !r2.fini, "pas de catégorie → attendre", r2);
  const r3 = aspectsADemanderIa({ categorie: "63862", listeAJour: true, statut: null, dejaDemandes: new Set() });
  ok(r3.attendre && !r3.fini, "pas de liste d'exigés → attendre (jamais « terminé » par défaut)", r3);
}

console.log("\n2. Le déroulé du cas Manon (Polaire Reebok) : la course catégorie / liste");
{
  const deja = new Set();
  // a) catégorie de l'icône, liste relue, tout est posé (défauts, titre) : terminé.
  let r = aspectsADemanderIa({ categorie: "63866", listeAJour: true, statut: [{ name: "Département", state: "ok" }], dejaDemandes: deja });
  ok(r.fini && r.aDemander.length === 0, "63866 : rien de manquant → terminé pour 63866", r);
  // b) la résolution pose 63862 : la liste de 63866 est encore là le temps de la relecture.
  r = aspectsADemanderIa({ categorie: "63862", listeAJour: false, statut: [{ name: "Département", state: "ok" }], dejaDemandes: deja });
  ok(r.attendre && !r.fini, "63862 sur la liste d'avant → ni demande, ni « terminé » (AVANT : 63862 marquée « IA faite »)", r);
  // c) la liste de 63862 arrive : Style manque → il part à l'IA.
  r = aspectsADemanderIa({ categorie: "63862", listeAJour: true, statut: statut({ Type: "ok", Style: "missing" }), dejaDemandes: deja });
  ok(JSON.stringify(r.aDemander) === JSON.stringify(["Style"]) && !r.fini, "liste de 63862 relue → Style demandé à l'IA", r);
}

console.log("\n3. Une fois par aspect ET par catégorie, jamais deux");
{
  const deja = new Set(["63862|Style"]);
  let r = aspectsADemanderIa({ categorie: "63862", listeAJour: true, statut: statut({ Style: "missing" }), dejaDemandes: deja, enVol: 0 });
  ok(r.aDemander.length === 0 && r.fini, "Style déjà demandé, aucun appel en vol → terminé (la question part)", r);
  r = aspectsADemanderIa({ categorie: "63862", listeAJour: true, statut: statut({ Style: "missing" }), dejaDemandes: deja, enVol: 1 });
  ok(r.aDemander.length === 0 && !r.fini, "un appel en vol → pas encore terminé", r);
  r = aspectsADemanderIa({ categorie: "63862", listeAJour: true, statut: statut({ Style: "missing", Type: "missing" }), dejaDemandes: deja });
  ok(JSON.stringify(r.aDemander) === JSON.stringify(["Type"]), "Type devenu manquant APRÈS le premier appel → demandé à son tour (AVANT : jamais)", r);
  r = aspectsADemanderIa({ categorie: "57988", listeAJour: true, statut: statut({ Style: "missing" }), dejaDemandes: deja });
  ok(JSON.stringify(r.aDemander) === JSON.stringify(["Style"]), "autre catégorie : Style redemandé pour elle", r);
  r = aspectsADemanderIa({
    categorie: "63862", listeAJour: true, dejaDemandes: new Set(),
    statut: [{ name: "Numéro de pièce fabricant", state: "missing" }, { name: "Style", state: "missing" }],
    aDefaut: (a) => a.name === "Numéro de pièce fabricant",
  });
  ok(JSON.stringify(r.aDemander) === JSON.stringify(["Style"]), "un aspect à défaut fixe (MPN) n'est jamais demandé à l'IA", r);
  r = aspectsADemanderIa({ categorie: "63862", listeAJour: true, statut: statut({ Style: "ok", Type: "ok" }), dejaDemandes: new Set() });
  ok(r.fini && !r.aDemander.length, "rien de manquant → terminé tout de suite", r);
}

console.log("\n4. Ce qui est repris quand la catégorie change");
{
  const st = [
    { name: "Type", mode: "FREE_TEXT", allowedValues: TYPE_63862 },
    { name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63862 },
    { name: "Département", mode: "SELECTION_ONLY", allowedValues: ["Femme", "Homme"] },
    { name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: Array.from({ length: 250 }, (_, i) => `M${i}`) },
  ];
  const poses = {
    Type: { categorie: "63866", valeur: "Pull" },               // hors liste de 63862
    Style: { categorie: "63866", valeur: "Gilet" },             // hors liste de 63862
    "Département": { categorie: "63866", valeur: "Femme" },     // valable ici
    "Matière doublure externe": { categorie: "63866", valeur: "Polyester" }, // liste trop longue : ne fait pas foi
    Couleur: { categorie: "63866", valeur: "Noir" },            // pas exigé ici : pas touché
  };
  const aspects = { Type: "Pull", Style: "Gilet", "Département": "Femme", "Matière doublure externe": "Polyester", Couleur: "Noir" };
  const r = valeursAutoAReprendre({ categorie: "63862", autoPoses: poses, aspects, statut: st, listeFermee: isEbayClosedList, norm: normAspectVal });
  ok(JSON.stringify(r.retirer.sort()) === JSON.stringify(["Style", "Type"]), "Type « Pull » et Style « Gilet » (posés pour 63866) repris en 63862", r);
  ok(r.reetiqueter.includes("Département") && r.reetiqueter.includes("Matière doublure externe"), "Département valable, Matière (liste qui ne fait pas foi) gardés", r);
  ok(!r.retirer.includes("Couleur") && !r.reetiqueter.includes("Couleur") && !r.oublier.includes("Couleur"), "un aspect non exigé ici n'est pas touché", r);
  const r2 = valeursAutoAReprendre({ categorie: "63862", autoPoses: { Type: { categorie: "63866", valeur: "Pull" } }, aspects: { Type: "Veste" }, statut: st, listeFermee: isEbayClosedList, norm: normAspectVal });
  ok(r2.oublier.includes("Type") && !r2.retirer.length, "retouché par la personne (« Veste ») : oublié, jamais repris", r2);
  const r3 = valeursAutoAReprendre({ categorie: "63862", autoPoses: { Type: { categorie: "63862", valeur: "Veste" } }, aspects: { Type: "Veste" }, statut: st, listeFermee: isEbayClosedList, norm: normAspectVal });
  ok(!r3.retirer.length && !r3.reetiqueter.length && !r3.oublier.length, "posé pour CETTE catégorie : rien à faire", r3);
  const r4 = valeursAutoAReprendre({ categorie: "63866", autoPoses: { Style: { categorie: "63862", valeur: "Polaire" } }, aspects: { Style: "Polaire" }, statut: [{ name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63866 }], listeFermee: isEbayClosedList, norm: normAspectVal });
  ok(r4.retirer.includes("Style"), "un mot libre posé ailleurs est rejugé dans la nouvelle catégorie", r4);
  const r5 = valeursAutoAReprendre({ categorie: "63862", autoPoses: { Style: { categorie: "63866", valeur: "manteau BASIQUE" } }, aspects: { Style: "manteau BASIQUE" }, statut: st, listeFermee: isEbayClosedList, norm: normAspectVal });
  ok(r5.reetiqueter.includes("Style"), "casse/accents ignorés pour juger « dans la liste »", r5);
}

console.log("\n5. Le câblage dans ListingPreviewScreen");
{
  const src = readFileSync(new URL("../src/components/ListingPreviewScreen.jsx", import.meta.url), "utf8");
  ok(/import \{ aspectsADemanderIa, valeursAutoAReprendre \} from "\.\.\/publication\/moteur\/aspectsEbayAuto"/.test(src), "les deux décisions viennent du module éprouvé ici");
  ok(/const isEbayClosedList = \(allowedValues, mode\) => \{\s*const n = Array\.isArray\(allowedValues\) \? allowedValues\.length : 0;\s*return n > 0 && \(n <= EBAY_CLOSED_LIST_MAX \|\| mode === "SELECTION_ONLY"\);/.test(src)
    && /const EBAY_CLOSED_LIST_MAX = 200;/.test(src), "isEbayClosedList identique à celle de ce test (≤ 200 ou SELECTION_ONLY)");
  ok(/const ebayListeAJour = Boolean\(ebayPreviewCategoryId\) && ebayAspectsLusPour === ebayPreviewCategoryId;/.test(src), "ebayListeAJour : la liste relue est celle de la catégorie courante");
  ok(/if \(!ebayRequiredStatus \|\| !ebayPreviewCategoryId \|\| !ebayListeAJour\) return;/.test(src), "les poses automatiques attendent la bonne liste");
  ok(/listeFermee: isEbayClosedList, norm: normAspectVal/.test(src), "la reprise juge avec isEbayClosedList et normAspectVal");
  ok(/if \(!cat \|\| !ebayRequiredStatus \|\| !ebayListeAJour\) return;/.test(src), "l'IA attend la bonne liste");
  ok(!/aspectsResolvedFor/.test(src), "plus de « une seule tentative par catégorie » (aspectsResolvedFor retiré)");
  ok(/for \(let essai = 1; essai <= 2 && res === null; essai\+\+\)/.test(src), "un appel qui n'aboutit pas est retenté une fois");
  ok(/finally \{ setEbayIaEnVol\(n => Math\.max\(0, n - 1\)\); \}/.test(src) && !/finally \{ setEbayIaFiniePour\(ebayPreviewCategoryId\); \}/.test(src),
    "« terminé » n'est plus posé à l'aveugle à la fin d'un appel");
  ok(/if \(ebayCategorieCourante\.current !== cat\) return;/.test(src), "une réponse revenue après un changement de catégorie ne pose rien");
  ok(/aspects_inventaire_id: invId \?\? null,\s*categorie_ebay: String\(cat\),/.test(src), "la demande nomme l'article et la catégorie (mesure serveur)");
  ok(/champs: \[a\.name\], categorie: ebayPreviewCategoryId \?\? null, inventaire_id: invId \?\? null \}/.test(src), "champ_requis_bloquant eBay nomme l'article");
  ok(/if \(ebayAspectsLusPour !== ebayPreviewCategoryId\) return false;\s*if \(ebayRequiredPreview && ebayIaFiniePour !== ebayPreviewCategoryId\) return false;/.test(src),
    "le lot attend toujours la liste ET la fin de l'IA avant de compter ses questions");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ encart eBay : ce qu'il remplit seul, et quand — tout est vert");
process.exit(ko ? 1 : 0);
