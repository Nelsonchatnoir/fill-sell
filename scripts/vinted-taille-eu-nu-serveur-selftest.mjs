// ═══════════════════════════════════════════════════════════════════════════
// Selftest « EU N » ≡ « N » — TAILLE VINTED, SERVEUR (2026-10-06, dbz70)
//   node scripts/vinted-taille-eu-nu-serveur-selftest.mjs
//
// LE CAS : republication dbz70 « Baskets Femme Lacoste » (job ebbddbdb, 06/10
// 15:39, extension 0.6.100). La capture de l'annonce d'origine rend « EU 40 »
// (size_id 2037, groupe 87 « EU » du référentiel Vinted) ; le formulaire de la
// catégorie (Femmes > Chaussures > Baskets, catalog 2632) n'offre que le groupe
// 7 « Chaussures » : « 34 » … « 46 » nus. Le serveur ne servait rien
// (« 1 : aucune option exacte ; 2 : aucune option par jeton ; 3 : … ») et
// l'extension ≥ 0.6.90 ne retire plus « EU » (ca63277) : refus, sur une taille
// que l'annonce porte.
// CE QUE CE TEST PROUVE, sur le code importé de
// supabase/functions/_shared/vinted-taille-republication.ts (jamais recopié) :
//   1. « EU 40 » / « EU 40.5 » / « EU 40,5 » → l'option nue de la grille relevée
//      (republication ET publication), et par la grille vue au dernier échec ;
//   2. rien ne change là où ça marchait : « EU N » présent tel quel, nombre
//      nu → « EU N » (costumes), « FR N », lettres ;
//   3. jamais une conversion de système : « UK 8 », « US 8 », « IT 42 » → rien.
// ═══════════════════════════════════════════════════════════════════════════
import {
  ORDRE_EXACT_D_ABORD, TAILLE_PREFIXEE_RE, grilleDuDernierEchecTaille, optionNuPourEu,
  tailleAServir, tailleAServirPublication,
} from "../supabase/functions/_shared/vinted-taille-republication.ts";

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const moderne = { ordrePrefixe: ORDRE_EXACT_D_ABORD, euCoupe: false };

// Grilles RELEVÉES en prod (platform_category_aspects, 06/10).
const BASKETS_FEMME = ["34", "34.5", "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", "40", "40.5", "41", "41.5", "42", "42.5", "43", "43.5", "44", "44.5", "45", "45.5", "46", "Taille unique", "Autre"];
const BASKETS_HOMME = ["38", "38,5", "39", "39,5", "40", "40,5", "41", "41,5", "42", "42,5", "43", "43,5", "44", "44,5", "45", "45,5", "46", "46,5", "47", "47,5", "48", "48,5", "49", "50", "51", "52", "Taille unique", "Autre"];
const FEMME_SEPAREE = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "Autre", "Taille unique", "EU 34", "EU 36", "EU 38", "EU 40", "UK 8", "UK 10", "FR 38", "FR 40"];
const COSTUMES = ["XXS", "XS", "S", "M", "L", "XL", "Taille unique", "DE 42", "DE 44", "42S", "42R", "EU 42", "EU 44", "EU 46"];
// Le diagnostic RÉEL du job ebbddbdb (last_diagnostic, 06/10 13:51Z).
const DIAG_DBZ70 = "taille demandée « EU 40 » — candidats essayés : « EU 40 » — onglets vus : (sans onglet) [34, 34.5, 35, 35.5, 36, 36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40, 40.5, 41, 41.5, 42, 42.5, 43, 43.5, … +7]";

console.log("\n[1] dbz70 — republication, capture « EU 40 », grille nue des baskets femme");
{
  const r = tailleAServir({ captureTaille: "EU 40", inventaireTaille: { v: "EU 40", source: "capture" }, options: BASKETS_FEMME }, moderne);
  ok("« EU 40 » → « 40 » servi", r.valeur === "40", JSON.stringify(r));
  ok("   étape 1 (même taille, orthographe de la grille)", r.etape === 1 && /même taille/.test(r.detail ?? ""), JSON.stringify(r));
  const vieux = tailleAServir({ captureTaille: "EU 40", inventaireTaille: null, options: BASKETS_FEMME }, {});
  ok("client sans capacité (coupe « EU », ordre 3→1→2) → « 40 » aussi", vieux.valeur === "40", JSON.stringify(vieux));
  const demi = tailleAServir({ captureTaille: "EU 40.5", inventaireTaille: null, options: BASKETS_FEMME }, moderne);
  ok("demi-pointure « EU 40.5 » → « 40.5 » (hier : hors périmètre)", demi.valeur === "40.5", JSON.stringify(demi));
  const virgule = tailleAServir({ captureTaille: "EU 40,5", inventaireTaille: null, options: BASKETS_HOMME }, moderne);
  ok("« EU 40,5 » face à « 40,5 » (grille homme à virgule) → « 40,5 »", virgule.valeur === "40,5", JSON.stringify(virgule));
  ok("TAILLE_PREFIXEE_RE prend les demi-pointures", TAILLE_PREFIXEE_RE.test("EU 40.5") && TAILLE_PREFIXEE_RE.test("EU 40,5") && TAILLE_PREFIXEE_RE.test("EU 40"));
  const parDiag = tailleAServir({ captureTaille: "EU 40", inventaireTaille: null, options: grilleDuDernierEchecTaille(DIAG_DBZ70, "EU 40") }, moderne);
  ok("grille non relevée : celle VUE au dernier échec du job (diagnostic réel) → « 40 »", parDiag.valeur === "40", JSON.stringify(parDiag));
}

console.log("\n[2] Rien ne change là où ça marchait");
{
  const sep = tailleAServir({ captureTaille: "EU 40", inventaireTaille: null, options: FEMME_SEPAREE }, moderne);
  ok("robes (grille séparée) : « EU 40 » exact → « EU 40 » (publiée le 30/09, inchangé)", sep.valeur === "EU 40" && sep.etape === 1, JSON.stringify(sep));
  const deux = tailleAServir({ captureTaille: "EU 40", inventaireTaille: null, options: ["40", "EU 40", "41"] }, moderne);
  ok("grille qui porte « EU 40 » ET « 40 » → l'exact « EU 40 »", deux.valeur === "EU 40", JSON.stringify(deux));
  const nu = tailleAServir({ captureTaille: "42", inventaireTaille: null, options: COSTUMES }, moderne);
  ok("costumes : « 42 » nu → « EU 42 » (règle du 23/09, inchangée)", nu.valeur === "EU 42", JSON.stringify(nu));
  const eu42 = tailleAServir({ captureTaille: "EU 42", inventaireTaille: null, options: COSTUMES }, moderne);
  ok("costumes : « EU 42 » → « EU 42 »", eu42.valeur === "EU 42", JSON.stringify(eu42));
  const absent = tailleAServir({ captureTaille: "EU 43", inventaireTaille: null, options: COSTUMES }, moderne);
  ok("costumes : « EU 43 » absent → rien (jamais « DE 43 » ni un autre)", absent.valeur === null, JSON.stringify(absent));
  const doublon = tailleAServir({ captureTaille: "EU 40", inventaireTaille: null, options: ["40", "40 ", "41"] }, moderne);
  ok("deux options « 40 » (grille douteuse) → rien", doublon.valeur === null, JSON.stringify(doublon));
  const sans = tailleAServir({ captureTaille: "EU 40", inventaireTaille: null, options: null }, moderne);
  ok("grille inconnue → rien (on n'invente pas)", sans.valeur === null, JSON.stringify(sans));
}

console.log("\n[3] Jamais une conversion de système");
for (const t of ["UK 8", "UK 8.5", "FR 52"]) {
  const r = tailleAServir({ captureTaille: t, inventaireTaille: null, options: BASKETS_FEMME }, moderne);
  ok(`« ${t} » sur la grille nue → rien`, r.valeur === null, JSON.stringify(r));
}
{
  const g = (o) => o.map((b) => ({ brut: b, norm: b.replace(/\s+/g, " ").trim().toUpperCase() }));
  ok("optionNuPourEu(« UK 8 ») → null", optionNuPourEu("UK 8", g(BASKETS_FEMME)) === null);
  ok("optionNuPourEu(« US 8 ») → null", optionNuPourEu("US 8", g(BASKETS_FEMME)) === null);
  ok("optionNuPourEu(« IT 42 ») → null", optionNuPourEu("IT 42", g(BASKETS_FEMME)) === null);
  ok("optionNuPourEu(« EU 40 ») → « 40 »", optionNuPourEu("EU 40", g(BASKETS_FEMME))?.brut === "40");
}

console.log("\n[4] Publication — une fiche qui porte « EU 40 »");
{
  const p = tailleAServirPublication({ taille: "EU 40", cheminCategorie: "Femmes > Chaussures > Baskets", options: BASKETS_FEMME }, { euCoupe: false });
  ok("« EU 40 » → « 40 » (baskets femme)", p.valeur === "40", JSON.stringify(p));
  const p2 = tailleAServirPublication({ taille: "EU 41,5", cheminCategorie: "Hommes > Chaussures > Baskets", options: BASKETS_HOMME });
  ok("« EU 41,5 » → « 41,5 » (baskets homme, tout client)", p2.valeur === "41,5", JSON.stringify(p2));
  const p3 = tailleAServirPublication({ taille: "EU 38", cheminCategorie: "Femmes > Vêtements > Robes", options: FEMME_SEPAREE }, { euCoupe: false });
  ok("« EU 38 » déjà option de la grille → rien à servir (inchangé)", p3.valeur === null, JSON.stringify(p3));
  const p4 = tailleAServirPublication({ taille: "UK 8", cheminCategorie: "Femmes > Chaussures > Baskets", options: BASKETS_FEMME }, { euCoupe: false });
  ok("« UK 8 » → rien (pas de conversion)", p4.valeur === null, JSON.stringify(p4));
  const p5 = tailleAServirPublication({ taille: "42", cheminCategorie: "Hommes > Vêtements > Costumes et blazers > Autres", options: COSTUMES }, { euCoupe: false });
  ok("« 42 » nu → « EU 42 » (règle du 23/09, inchangée)", p5.valeur === "EU 42", JSON.stringify(p5));
}

console.log(ko ? `\n[selftest:vinted-taille-eu-nu-serveur] ÉCHEC — ${ko} vérification(s) en défaut.` : "\n[selftest:vinted-taille-eu-nu-serveur] OK");
process.exit(ko ? 1 : 0);
