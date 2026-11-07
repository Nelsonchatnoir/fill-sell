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
forme("24 months", ENFANT, false, null, null);                   // jamais « 2 ans » : mois ≠ ans
forme("1 year", BEBE, false, null, null);                        // jamais « 12 mois »
forme("18 months", ENFANT, true, null, null);                    // un bébé dans un rayon 2-16 ans : la question
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

console.log("\n4. LE BANC DE NON-RÉGRESSION (parc eBay, 60 jours, fixture du 07/11)");
// Les seuls cas que le correctif change — chacun : hier ∅ ou hors liste, aujourd'hui une entrée de la liste.
const CORRIGES: Record<string, string> = {
  "11-12 yrs␟155201␟Taille": "11-12 ans",   // Rosa, ba0c4d73 (hier : « 11-12 yrs » hors liste)
  "EU S␟57990␟Taille": "S",                 // d3ee17a6 (hier : la question)
};
const CORRIGES_APP: Record<string, string> = {
  "11-12 yrs␟155201␟Taille": "11-12 ans",
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
