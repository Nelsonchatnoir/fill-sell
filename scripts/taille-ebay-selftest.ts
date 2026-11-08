// selftest:taille-ebay — (07/11, constat de Nico) LA TAILLE eBAY QUE LA RÈGLE COMMUNE NE LISAIT PAS
//   deno run --allow-read --allow-env --allow-net scripts/taille-ebay-selftest.ts
// Cas fondateurs (lus en base le 07/11) :
//   · Rosa Metra, job ba0c4d73 (voie extension, rayon 155201) : « 11-12 yrs » — la liste eBay porte « 11-12 ans »,
//     l'extension n'a rien trouvé, question. → E1 : « 11-12 ans ».
//   · PMF Vito, job 0119b570 (voie API, rayon 260956) : « FR 3 » (numérotation Lacoste) — refus 25129, question.
//     → AUCUNE règle ne la traduit sans deviner : elle RESTE une question (vérifié ici).
// 1. Chaque forme, AVANT (la règle d'hier : liste exacte, préfixe EU/FR, tailles.js, taille-de-service.js) → APRÈS.
// 2. Les branchements (voie API, IA, question qui repart seule, app).
// 3. LE BANC DE NON-RÉGRESSION : les 457 combinaisons distinctes (taille × rayon × aspect × contexte) des 915 jobs eBay
//    des 60 derniers jours (fixture du 07/11) — chaque valeur servie hier l'est à l'identique, hors les cas corrigés,
//    nommés un par un.
import { tailleEbayComplement, ageEnFrancais } from "../supabase/functions/_shared/taille-ebay.js";
import { tailleDeService } from "../supabase/functions/_shared/taille-de-service.js";
import { valeurDeListeCorrespondante } from "../supabase/functions/_shared/texte-comparable.ts";
import { tailleSansPrefixeEuFr, tailleRetenueDansLaListe } from "../supabase/functions/_shared/ebay-aspects-ia.ts";
import { assemblerAspects } from "../supabase/functions/_shared/ebay-publication.ts";
import { reponseTailleAuto } from "../supabase/functions/_shared/taille-question-auto.js";
import { nearestAllowedValue } from "../src/publication/moteur/listes.js";
import * as R from "../src/publication/moteur/regles.js";

let ko = 0, n = 0;
const ok = (cond: boolean, msg: string, detail = "") => { n++; if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${msg}${cond ? "" : `   ← ${detail}`}`); };
const lire = (p: string) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url)).replace(/\r\n/g, "\n");
const F = JSON.parse(lire("scripts/fixtures/ebay-tailles-parc-2026-11-07.json"));
const L = (cat: string, aspect = "Taille"): string[] => F.listes[cat][aspect].valeurs;
const ENFANT = L("155201");             // Rosa : « 2 ans » … « 16 ans », « 11-12 ans », 62…176, lettres (FREE_TEXT)
const HOMME = L("260956");              // PMF Vito : lettres, 24…70, UK/US 26…44 (SELECTION_ONLY, fermée par 25129)
const BEBE = L("260021");               // 56…98, Naissance, 1 mois … 24 mois
const PIEDS_BEBE = L("147285", "Pointure AU"); // Naissance, 0-6 mois, 12-18 mois, 0 … 9
const ROBES = L("63861");               // 32…62, IT/UK/US (SELECTION_ONLY)
const HAUTS_H = L("57990");             // XS/S, S, S/M…, 36…68, UK/US (SELECTION_ONLY)
const P_UK = L("15709", "Pointure UK"), P_US = L("15709", "Pointure US"), P_EU = L("15709", "Pointure EU");

// La règle d'HIER, telle que tailleAssemblee l'appliquait à la taille de la fiche (étape 2).
const hier = (nom: string, brut: string, liste: string[], ferme: boolean) =>
  valeurDeListeCorrespondante(brut, liste) ?? (ferme ? tailleSansPrefixeEuFr(nom, brut, liste) : null) ?? (tailleDeService(brut, liste, {})?.valeur ?? null);
const servi = (taille: string, liste: string[], mode: string, nom = "Taille") =>
  assemblerAspects({ taille } as never, [{ name: nom, required: true, mode, allowedValues: liste }] as never).aspects[nom]?.[0] ?? null;
// avant → après sur la taille de la fiche ; `ferme` : la liste fait foi.
const forme = (brut: string, liste: string[], ferme: boolean, attenduAvant: string | null, attenduApres: string | null, nom = "Taille") => {
  const avant = hier(nom, brut, liste, ferme);
  const apres = avant ?? (tailleEbayComplement(nom, brut, liste, { ferme })?.valeur ?? null);
  ok(avant === attenduAvant && apres === attenduApres,
    `${nom} « ${brut} » (${ferme ? "liste fermée" : "texte libre"}) : ${attenduAvant ?? "∅"} → ${attenduApres ?? (ferme ? "∅ (la question)" : "∅ (rien de neuf : la règle d'hier décide)")}`,
    `avant ${avant}, après ${apres}`);
};

console.log("1. LES ÂGES EN ANGLAIS → LEUR ÉCRITURE FRANÇAISE (E1)");
forme("11-12 yrs", ENFANT, false, null, "11-12 ans");            // Rosa
forme("11-12 yrs", ENFANT, true, null, "11-12 ans");
forme("11-12 Yrs.", ENFANT, false, null, "11-12 ans");
forme("10 yrs", ENFANT, false, null, "10 ans");
forme("3-4 years old", ENFANT, false, null, "3-4 ans");
forme("Age 11-12", ENFANT, false, null, "11-12 ans");
forme("Ages: 9-10", ENFANT, false, null, "9-10 ans");
forme("11 to 12 years", ENFANT, false, null, "11-12 ans");
forme("11/12 yrs", ENFANT, false, null, "11-12 ans");
forme("11-12 yrs / 146-152 cm", ENFANT, false, null, "11-12 ans");
forme("11-12 yrs (146-152 cm)", ENFANT, false, null, "11-12 ans");
forme("8 y.o.", ENFANT, false, null, "8 ans");
forme("18 months", BEBE, false, null, "18 mois");
forme("6 mos", BEBE, false, null, "6 mois");
forme("24 mths", BEBE, false, null, "24 mois");
forme("Newborn", BEBE, false, null, "Naissance");
forme("12-18 months", PIEDS_BEBE, false, null, "12-18 mois", "Pointure AU");
forme("12-18 mths", BEBE, false, null, null);                    // une tranche n'est jamais une de ses bornes
// (08/11, point 3 de Nico) E1 seul ne change jamais d'unité (« 24 months » est « 24 mois », vérifié plus bas) ; c'est
// E3, APRÈS lui, qui lit la table des étiquettes enfant de tailles.js : 24 mois = 2 ans = 92 cm, 18 mois = 86 cm.
// Hier ces deux lignes attendaient la question ; c'est le trou que le point 3 ferme (job ccffd8ef).
forme("24 months", ENFANT, false, null, "2 ans");                // E1 « 24 mois », puis E3 : la même étiquette (92 cm)
forme("1 year", BEBE, false, null, null);                        // jamais « 12 mois » : « 1 an » n'est pas dans la table
forme("18 months", ENFANT, true, null, "86");                    // un bébé dans un rayon 2-16 ans : sa stature, que la liste porte
ok(ageEnFrancais("24 months") === "24 mois" && ageEnFrancais("2 years") === "2 ans", "E1 ne change jamais d'unité (« 24 months » → « 24 mois »)");
forme("0-3 months", BEBE, false, null, null);                    // la liste n'a que « 3 mois » : la question
ok(ageEnFrancais("11/12 yrs") === "11-12 ans" && ageEnFrancais("12 yrs") === "12 ans" && ageEnFrancais("12") === null && ageEnFrancais("M") === null,
  "« 11/12 yrs » est UNE tranche ; un nombre nu ou une lettre ne sont jamais un âge");
console.log("   — les écritures que la règle lisait déjà : inchangées");
forme("3-4 years", ENFANT, false, "3-4 ans", "3-4 ans");
forme("10 years", ENFANT, false, "10 ans", "10 ans");
forme("11-12Y", ENFANT, false, "11-12 ans", "11-12 ans");
forme("11-12 ans", ENFANT, false, "11-12 ans", "11-12 ans");
forme("11/12 ans", ENFANT, false, "11-12 ans", "11-12 ans");
forme("12A", ENFANT, false, "12 ans", "12 ans");
forme("18 mois", BEBE, false, "18 mois", "18 mois");
forme("18M", BEBE, false, "18 mois", "18 mois");
forme("10 ans (128-140 cm)", ENFANT, false, "10 ans", "10 ans");

console.log("\n2. LES PRÉFIXES DE PAYS (E2, liste fermée seulement)");
forme("EU 38", ROBES, true, "38", "38");                         // règle du 01/10 (tessy), inchangée
forme("FR 38", ROBES, true, "38", "38");
forme("38 EU", ROBES, true, null, "38");
forme("EUR 38", ROBES, true, null, "38");
forme("Taille FR 38", ROBES, true, null, "38");
forme("EU S", HAUTS_H, true, null, "S");                          // job d3ee17a6 (rayon 57990)
forme("FR M", HAUTS_H, true, null, "M");
forme("INT XL", HAUTS_H, true, null, "XL");
forme("EU XXL", HAUTS_H, true, null, "2XL");
forme("UK 10", ROBES, true, "UK 10", "UK 10");                    // la liste l'écrit : inchangé
forme("UK10", ROBES, true, "UK 10", "UK 10");
forme("US 8", ROBES, true, "US 8", "US 8");
forme("IT 42", ROBES, true, "IT 42", "IT 42");
forme("UK 6", HOMME, true, null, null);                           // jamais converti vers un autre pays
forme("US 8", HOMME, true, null, null);
forme("FR 3", HOMME, true, null, null);                           // PMF Vito : numérotation Lacoste, la question
forme("EU 2", ROBES, true, null, null);                           // The Kooples : la question
forme("EU 43", ROBES, true, null, null);
forme("38 EU", ROBES, false, null, null);                         // texte libre : rien de neuf (part tel quel, cf. 3)
forme("EU S", HAUTS_H, false, null, null);
console.log("   — pointures : le préfixe du pays de l'ASPECT");
forme("UK 6", P_UK, true, null, "6", "Pointure UK");
forme("US 9.5", P_US, true, null, "9,5", "Pointure US");
forme("EU 36.5", P_EU, true, null, "36,5", "Pointure EU");
forme("EU 40", P_UK, true, null, null, "Pointure UK");            // jamais l'EU sur une pointure UK
forme("UK 6", P_EU, true, null, null, "Pointure EU");
ok(tailleEbayComplement("Type de taille", "11-12 yrs", ["11-12 ans"], { ferme: true }) === null
  && tailleEbayComplement("Tour de taille", "EU 38", ["38"], { ferme: true }) === null, "jamais un autre aspect que la taille ou la pointure");

console.log("\n3. LES BRANCHEMENTS");
ok(servi("11-12 yrs", ENFANT, "FREE_TEXT") === "11-12 ans", "voie API, texte libre : « 11-12 yrs » part en « 11-12 ans » (hier : tel quel)");
ok(servi("11-12 yrs", ENFANT, "SELECTION_ONLY") === "11-12 ans", "voie API, liste fermée : « 11-12 ans » (hier : la question)");
ok(servi("FR 3", HOMME, "SELECTION_ONLY") === null, "voie API : « FR 3 » reste la question (PMF Vito)");
ok(servi("EU 39", ["38", "39"], "FREE_TEXT") === "EU 39", "voie API, texte libre : « EU 39 » part tel quel (règle du 01/10, inchangée)");
ok(servi("38 EU", ROBES, "SELECTION_ONLY") === "38" && servi("EU S", HAUTS_H, "SELECTION_ONLY") === "S", "voie API, liste fermée : « 38 EU » → 38, « EU S » → S");
const t = tailleRetenueDansLaListe("Taille", "11-12 yrs", ENFANT) as { valeur?: string };
ok(t.valeur === "11-12 ans", "réponse de l'IA ou de l'app « 11-12 yrs » : l'entrée « 11-12 ans » de la liste", JSON.stringify(t));
ok("refus" in tailleRetenueDansLaListe("Taille", "FR 3", HOMME), "réponse « FR 3 » : refusée (hors de la liste)");
const question = (platform: string, taille: string, liste: string[]) => ({
  status: "needs_user", platform,
  platform_fields: {
    taille, genre: "Fille", ebayAspects: { "Département": "Enfant unisexe" },
    ebayCategoryPath: ["Vêtements, accessoires", "Enfant : vêtements, accessoires", "Enfant : unisexe", "Vêtements enfant unisexe (2-16 ans)", "Manteaux et vestes"],
    needsUserField: { field_key: "Taille", field_label: "Taille", target: { root: "ebayAspects", key: "Taille" }, allowed_values: liste },
  },
});
const rep = reponseTailleAuto(question("ebay", "11-12 yrs", ENFANT) as never, "10 ans (128-140 cm)", ["Monsoon Veste Denim Bleu Col Volant 11-12 ans", ""]) as { valeur?: string; regle?: string } | null;
ok(rep?.valeur === "11-12 ans" && rep?.regle === "E1", "question eBay de Rosa (ba0c4d73) : handler-watch répond « 11-12 ans » (E1), la publication repart", JSON.stringify(rep));
ok(reponseTailleAuto(question("opla", "11-12 yrs", ENFANT) as never, null, null) === null, "même question sur une autre plateforme : inchangée (règle propre à eBay)");
ok(reponseTailleAuto({ ...question("ebay", "FR 3", HOMME), platform_fields: { ...question("ebay", "FR 3", HOMME).platform_fields, genre: "Homme", ebayAspects: { "Département": "Homme" } } } as never, "S / 36", null) === null,
  "question eBay de PMF Vito (0119b570, « FR 3 ») : reste à la personne");
const listeFaitFoi = (platform: string, mode: string) => platform === "ebay" && mode === "SELECTION_ONLY";
const garde = (taille: string, liste: string[], mode: string) => {
  const pfE: Record<string, unknown> = { taille };
  const v = (R as any).gardeAspectsEbay({ pfE, ebayRequiredFull: [{ name: "Taille", allowedValues: liste, mode }], outils: { nearestAllowedValue, listeFaitFoi } });
  return { pfE, v };
};
ok(garde("11-12 yrs", ENFANT, "FREE_TEXT").pfE.taille === "11-12 ans", "app (voie extension) : la copie eBay part en « 11-12 ans » — l'extension trouve l'option");
ok(garde("FR 3", HOMME, "SELECTION_ONLY").pfE.taille === "FR 3", "app : « FR 3 » n'est pas réécrite (la question, sur l'écran)");
ok(garde("M", ENFANT, "FREE_TEXT").pfE.taille === "M" && garde("Unique", ["Taille unique"], "FREE_TEXT").pfE.taille === "Taille unique", "app : ce qui passait passe à l'identique");
const src = lire("supabase/functions/_shared/taille-ebay.js");
ok(!/\(\?<[=!]/.test(src), "taille-ebay.js : aucun lookbehind (WebView iOS)");
ok(/tailleEbayComplement\(nomAspect, brut, liste, \{ ferme \}\)/.test(lire("supabase/functions/_shared/ebay-publication.ts")), "ebay-publication.ts : le complément APRÈS taille-de-service, dans tailleServieEbay");
ok(/tailleSansPrefixeEuFr\(a\.name, brut, a\.allowedValues\) \?\? tailleServieEbay\(/.test(lire("supabase/functions/_shared/ebay-publication.ts")), "ebay-publication.ts : la chaîne des aspects non-taille inchangée");

console.log("\n3 bis. E3 — L'ÉTIQUETTE ENFANT DANS L'AUTRE ÉCRITURE DE LA LISTE eBay (08/11, point 3 de Nico)");
// Listes relues dans ebay_item_aspects le 08/11 (celles qui ne sont pas dans la fixture du 07/11).
const GARCON_51973 = ["2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "74", "80", "86", "92", "98", "104", "110", "116", "122", "128", "134", "140", "146", "152", "158", "164", "170", "176", "2 ans", "2-3 ans", "3 ans", "3-4 ans", "4 ans", "4-5 ans", "5 ans", "5-6 ans", "6 ans", "6-7 ans", "7 ans", "7-8 ans", "8 ans", "8-9 ans", "9 ans", "9-10 ans", "10 ans", "10-11 ans", "11 ans", "11-12 ans", "12 ans", "12-13 ans", "13 ans", "13-14 ans", "14 ans", "14-15 ans", "15 ans", "15-16 ans", "16 ans", "Taille unique"];
const BEBE_93404 = ["Enfant prématuré", "Nouveau né", "1 mois", "3 mois", "6 mois", "9 mois", "12 mois", "18 mois", "24 mois"];
const TRANCHES_260027 = ["XS/S", "L/XL", "14-16", "16-18", "18-20", "56-62", "62-68", "68-74", "74-80", "80-86", "86-92", "Bébé prématuré", "Naissance", "1 mois", "3 mois", "6 mois", "9 mois", "12 mois", "18 mois", "24 mois", "Taille unique"];
const ADOS_62482 = ["Moins de 4 ans", "4 ans", "6 ans", "8 ans", "10 ans", "12 ans", "14 ans", "16 ans", "XXS", "XS", "S", "M", "L", "XL", "XXL", "Taille unique"];
const TETE_67681 = L("67681");       // 40 … 76 de 1 en 1 : des tours de tête, pas des statures
const DIVERS_2993 = L("2993");       // 75, 80, 84, 85, 90… : pas une liste de statures enfant
// Le cas fondateur : chaouidz (sos.cuisine.valenciennes), job ccffd8ef, rayon 51973, copie « 24 mois ».
forme("24 mois", GARCON_51973, false, null, "2 ans");
forme("24 mois", GARCON_51973, true, null, "2 ans");
const q51973 = { status: "needs_user", platform: "ebay", platform_fields: {
  taille: "24 mois", ebayAspects: { "Département": "Garçon" },
  ebayCategoryPath: ["Vêtements, accessoires", "Enfant : vêtements, accessoires", "Garçon : vêtements, accessoires", "Vêtements garçon (2-16 ans)", "Sous-vêtements"],
  needsUserField: { field_key: "Taille", field_label: "Taille", target: { root: "ebayAspects", key: "Taille" }, allowed_values: GARCON_51973, input_type: "selection_only", options_completes: true },
} };
const rep51973 = reponseTailleAuto(q51973 as never, "18-24 mois / 86 cm", ["lot 3 pieces bebe garcon taille 18/24 mois kiabi tao primark", "lot 3 pièces pour bébé garçon (Kiabi Eco Conception, 18M / 77-82 cm)"]) as { valeur?: string; regle?: string } | null;
ok(rep51973?.valeur === "2 ans" && rep51973?.regle === "E3", "question eBay de ccffd8ef : handler-watch répond « 2 ans » (E3), la publication repart seule", JSON.stringify(rep51973));
ok(garde("24 mois", GARCON_51973, "FREE_TEXT").pfE.taille === "2 ans", "app (voie extension) : la copie eBay part en « 2 ans » — l'extension trouve l'option, plus de question");
ok(servi("24 mois", GARCON_51973, "SELECTION_ONLY") === "2 ans" && servi("24 mois", GARCON_51973, "FREE_TEXT") === "2 ans", "voie API : « 2 ans », liste fermée ou texte libre");
console.log("   — les écritures d'un âge (mois, ans, abrégées, anglaises)");
for (const v of ["24M", "24 m", "24mois", "24 Mois", "24 months"]) forme(v, GARCON_51973, true, null, "2 ans");
forme("36 mois", ENFANT, true, null, "3 ans");
forme("24-36 mois", ENFANT, true, null, "2-3 ans");                // la tranche entière, dans l'autre écriture
forme("2 ans", BEBE, true, null, "24 mois");                       // rayon bébé : l'âge en mois
forme("2A", BEBE, true, null, "24 mois");
forme("2 ans", BEBE_93404, true, null, "24 mois");
forme("0 mois", BEBE, true, null, "Naissance");
forme("Naissance", BEBE_93404, true, null, "Nouveau né");          // le mot de CETTE liste
forme("Prématuré", BEBE, true, null, "Bébé prématuré");
forme("Prématuré", BEBE_93404, true, null, "Enfant prématuré");
console.log("   — la stature, sur une liste de statures enfant (table des étiquettes de tailles.js)");
forme("18 mois", GARCON_51973, true, null, "86");
forme("12 mois", GARCON_51973, true, null, "80");
forme("9 mois", GARCON_51973, true, null, "74");
forme("6 mois", ENFANT, true, null, "68");
forme("3 mois", ENFANT, true, null, "62");
forme("3 ans", BEBE, true, null, "98");                            // la liste bébé n'a pas « 36 mois » : 98 cm
forme("36 mois", BEBE, true, null, "98");
forme("18-24 mois / 86 cm", GARCON_51973, true, null, "86");      // l'étiquette Vinted de la fiche : son morceau « 86 cm »
forme("18-24 mois / 86 cm", BEBE, true, null, "86");
forme("86 cm", GARCON_51973, true, null, "86");
console.log("   — une tranche : entière (statures ou autre écriture), jamais une borne");
forme("18-24 mois", TRANCHES_260027, true, null, "86-92");
forme("3-6 mois", TRANCHES_260027, true, null, "62-68");
forme("12-18 mois", TRANCHES_260027, true, null, "80-86");
forme("18-24 mois", GARCON_51973, true, null, null);               // ni « 86 », ni « 2 ans » : la question
forme("12-18 mois", ENFANT, true, null, null);
forme("0-3 mois", TRANCHES_260027, true, null, null);              // « 50-62 » n'existe pas : la question
console.log("   — jamais un âge voisin, jamais une liste qui n'écrit pas la taille");
forme("1 mois", GARCON_51973, true, null, null);                  // 56 cm : la liste commence à 74
forme("Naissance", ENFANT, true, null, null);
forme("18 mois", ADOS_62482, true, null, null);                    // « Moins de 4 ans » n'est pas une traduction
forme("24 mois", ADOS_62482, true, null, null);                    // « 2 ans » absent : jamais « 4 ans »
forme("36 mois", BEBE_93404, true, null, null);
forme("15 mois", ENFANT, true, null, null);                        // absent de la table
forme("1 an", BEBE, true, null, null);
console.log("   — une liste qui n'est pas une liste de statures enfant : aucun nombre n'y est lu comme une stature");
forme("9 mois", TETE_67681, true, null, null);                     // 74 y est un tour de tête
forme("12 mois", DIVERS_2993, true, null, null);                   // 80 y voisine 75, 84, 85
forme("3 mois", ROBES, true, null, null);                          // 62 y est un FR 62 adulte
forme("86 cm", HOMME, true, null, null);
ok(tailleEbayComplement("Type de taille", "24 mois", GARCON_51973, { ferme: true }) === null, "E3 : jamais un autre aspect que la taille ou la pointure");
ok(reponseTailleAuto({ ...q51973, platform: "opla" } as never, "18-24 mois / 86 cm", null) === null, "même question sur une autre plateforme : inchangée (règle propre à eBay)");
const tl = lire("supabase/functions/_shared/tailles.js");
ok(/"92": \["24 mois", "2 ans"\]/.test(tl) && /"86": \["18 mois"\]/.test(tl), "la table d'E3 est celle de tailles.js, non modifiée");

console.log("\n4. LE BANC DE NON-RÉGRESSION (parc eBay, 60 jours, fixture du 07/11)");
// Les seuls cas que le correctif change — chacun : hier ∅ ou hors liste, aujourd'hui une entrée de la liste.
const CORRIGES: Record<string, string> = {
  "11-12 yrs␟155201␟Taille": "11-12 ans",   // Rosa, ba0c4d73 (hier : « 11-12 yrs » hors liste)
  "EU S␟57990␟Taille": "S",                 // d3ee17a6 (hier : la question)
};
const CORRIGES_APP: Record<string, string> = {
  "11-12 yrs␟155201␟Taille": "11-12 ans",
  // (08/11, E3) robe « 18 mois » au rayon 51581 (fille 2-16 ans, liste fermée) : hier la copie restait « 18 mois » (hors
  // liste → question, à laquelle la personne a répondu « 2 ans », un âge VOISIN) ; aujourd'hui 86, sa stature dans la liste.
  // La voie API ne bouge pas : la réponse de la personne passe toujours devant (étape 1 de tailleAssemblee).
  "18 mois␟51581␟Taille": "86",
};
let identiques = 0, corriges = 0, regressions = 0, identiquesApp = 0, corrigesApp = 0;
for (const c of F.cas as Array<Record<string, any>>) {
  const l = F.listes[c.cat][c.aspect];
  const pf: Record<string, unknown> = {
    taille: c.taille, genre: c.genre, ebayCategoryPath: c.chemin ?? [],
    ebayAspects: { ...(c.departement ? { "Département": c.departement } : {}), ...(c.aspect_du_job ? { [c.aspect]: c.aspect_du_job } : {}) },
  };
  if (c.tranche_par_la_personne) pf.needsUserResolved = { [`ebayAspects.${c.aspect}`]: c.aspect_du_job };
  const apres = assemblerAspects(pf as never, [{ name: c.aspect, required: true, mode: l.mode, allowedValues: l.valeurs }] as never, []).aspects[c.aspect]?.[0] ?? null;
  const cle = `${c.taille}␟${c.cat}␟${c.aspect}`;
  if (apres === c.api_avant) identiques++;
  else if (CORRIGES[cle] !== undefined && apres === CORRIGES[cle] && l.valeurs.includes(apres) && !l.valeurs.includes(c.api_avant)) corriges++;
  else { regressions++; ok(false, `voie API « ${c.taille} » [${c.cat} ${c.aspect} ${l.mode}]`, `hier ${c.api_avant}, aujourd'hui ${apres}`); }
  if ("app_avant" in c) {
    // La copie eBay telle que l'app la laisse : inchangée (déjà dans la liste, ou rien trouvé), sinon la valeur trouvée.
    const attendu = c.app_avant === "(dans la liste)" || c.app_avant === null ? c.taille : c.app_avant;
    const appApres = String(garde(c.taille, l.valeurs, l.mode).pfE.taille);
    if (appApres === attendu) identiquesApp++;
    else if (CORRIGES_APP[cle] !== undefined && appApres === CORRIGES_APP[cle] && c.app_avant === null) corrigesApp++;
    else { regressions++; ok(false, `app « ${c.taille} » [${c.cat} ${c.aspect} ${l.mode}]`, `hier ${attendu}, aujourd'hui ${appApres}`); }
  }
}
ok(regressions === 0, `voie API : ${identiques} combinaisons identiques, ${corriges} corrigées (${Object.keys(CORRIGES).length} attendues), 0 régression`, `${regressions} régression(s)`);
ok(corriges === Object.keys(CORRIGES).length, "voie API : chaque cas corrigé nommé l'est vraiment", `${corriges}`);
ok(corrigesApp === Object.keys(CORRIGES_APP).length, `app : ${identiquesApp} identiques, ${corrigesApp} corrigée(s), 0 régression`, `${corrigesApp}`);

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ taille eBay : ${n} vérifications vertes`);
Deno.exit(ko ? 1 : 0);
