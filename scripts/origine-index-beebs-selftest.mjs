// ── AUTOTEST : LA CATÉGORIE D'ORIGINE LUE AUSSI DANS L'INDEX (05/10, Louis) ──
// « Rangement Rouge et Bleu pour 12 pots… » (1791017762605) : ni objet de l'IA,
// ni mot du titre, ni catalogue Vinted, et son annonce Beebs relevée SANS
// capture — mais l'index Beebs portait « Yaourtières ». L'écran de préparation
// ne lisait que capture.categorie : « rayon à choisir », alors que la sœur
// capturée partait seule en Électroménager. Ce fichier verrouille :
//   1. la feuille d'origine trouvée depuis « Yaourtières » (Beebs) ;
//   2. l'écran lit donnees_index.categorie en repli de capture.categorie ;
//   3. avec cette origine, la résolution ne refuse plus (pas d'« objet non
//      reconnu », pas de question de rayon).
//   node --import ./scripts/loader-ext.mjs scripts/origine-index-beebs-selftest.mjs
import fs from "node:fs";

let echecs = 0;
const ok = (titre, c, d = "") => { if (c) console.log(`  ✓ ${titre}`); else { echecs++; console.log(`  ✗ ${titre}${d ? ` — ${d}` : ""}`); } };

const { feuilleDepuisOrigine } = await import("../src/utils/categorieParMot.js");
const { resoudrePublication } = await import("../src/utils/resolutionPublication.js");
const { questionsRayonOuvertes } = await import("../src/utils/rayonPublication.js");

console.log("\n1. La feuille d'origine depuis l'index Beebs");
const fe = await feuilleDepuisOrigine("beebs", "Yaourtières");
ok("« Yaourtières » → Maison > Petit électroménager > Yaourtières", JSON.stringify(fe?.chemin) === JSON.stringify(["Maison", "Petit électroménager", "Yaourtières"]), JSON.stringify(fe?.chemin));

console.log("\n2. L'écran de préparation lit l'index en repli");
const src = fs.readFileSync("src/components/ListingPreviewScreen.jsx", "utf8");
ok("donnees_index sélectionné avec capture", /\.select\("platform, capture, donnees_index, vu_le"\)/.test(src));
ok("capture d'abord, l'index ensuite", /ligne\?\.capture\?\.categorie \?\? ligne\?\.donnees_index\?\.categorie/.test(src));

console.log("\n3. La résolution de la fiche de Louis, sans objet ni mot du titre");
const supabase = {
  from: () => { throw new Error("aucun réseau"); },
  functions: { invoke: async () => ({ data: null, error: { message: "hors ligne" } }) },
  rpc: async () => ({ data: null, error: null }),
};
const titre = "Rangement Rouge et Bleu pour 12 pots et 12 couvercles pour yaourtière Multidélices";
const edited = { leboncoin: { etat: "Neuf sans étiquette", marque: "Marque générique", lbcPoidsGrammes: 500, lbcTransporteurs: ["Mondial Relay", "Colissimo"] } };
const selected = new Set(["leboncoin"]);
const base = {
  plateformes: ["leboncoin"], selected, edited,
  initialListing: { titre, description: "Rangement pour yaourtière.", marque: "Marque générique", categorie: "Autre", vinted_catalog_id: null },
  sharedFields: {}, sharedOverrides: {}, activeAiIcon: null, activeAiObjet: null, lang: "fr", supabase, ebayVoieApi: false,
  outils: { platformFieldsConfig: {}, isConditionKey: () => false, defaultConditionFor: () => null,
    GENERIC_ASPECTS_PF_KEY: { leboncoin: "lbcAspects", vinted: "vintedAspects", beebs: "beebsAspects" },
    normAspectVal: (v) => String(v ?? "").toLowerCase(), resolveArticleIcon: () => "📦",
    resolveArticleIconDetail: () => ({ icon: "📦" }), OPLA_ETAT_PAR_LIBELLE: {} },
};
const avant = await resoudrePublication({ ...base, origineCat: null });
ok("sans origine (avant) : refus « objet non reconnu » — le défaut reproduit", avant.refus?.code === "objet_non_reconnu" || /ranger cet article/.test(String(avant.refus?.message ?? "")), JSON.stringify(avant.refus));
const apres = await resoudrePublication({ ...base, origineCat: { platform: "beebs", chemin: fe?.chemin ?? [], id: fe?.id ?? null, genre: null, brut: "Yaourtières" } });
ok("avec l'origine de l'index : aucun refus", !apres.refus, JSON.stringify(apres.refus));
ok("et aucune question de rayon sur Leboncoin", Object.keys(questionsRayonOuvertes(apres.pfParPlateforme, selected, edited) ?? {}).length === 0);

if (echecs) { console.log(`\n✗ ${echecs} échec(s)`); process.exit(1); }
console.log("\n✓ origine lue dans l'index : une fiche Beebs sans capture se range seule");
