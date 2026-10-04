// Autotest de L'ABSENCE DE MARQUE TRADUITE (04/10/2026, Louis — « Marque
// générique » bloquait chaque article sur Vinted).
//
//     deno run --allow-read scripts/marque-absente-selftest.ts
//
// Ce qu'il prouve, sans réseau ni base :
//   1. la liste fermée : les absences connues sont reconnues, les VRAIES
//      marques qui leur ressemblent ne le sont jamais (égalité exacte) ;
//   2. le job servi (get-pending-jobs) : Vinted, Beebs, Leboncoin, Opla
//      reçoivent « Sans marque » avec une trace ; une vraie marque, un retrait,
//      une autre plateforme ne bougent pas ;
//   3. eBay (API) : l'entrée générique de la liste eBay pour une absence, et
//      JAMAIS par-dessus un aspect « Marque » réel (défaut corrigé le 04/10) ;
//   4. get-pending-jobs appelle bien la fonction partagée.
import { estSansMarque, traduireAbsenceMarqueJob, SANS_MARQUE } from "../supabase/functions/_shared/marque-absente.js";
import { assemblerAspects } from "../supabase/functions/_shared/ebay-publication.ts";

let ko = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

console.log("1. liste fermée");
for (const v of ["Marque générique", "Générique", "GENERIQUE", "Sans marque", "sans marque.", "Aucune", "Aucune marque",
  "Pas de marque", "pas de marque", "Non marqué", "No brand", "Unbranded", "Generic", "- Sans marque/Générique -", "Unbranded/Generic"]) {
  ok(estSansMarque(v), `« ${v} » = absence de marque`);
}
for (const v of ["Generic Surplus", "Générique & Co", "Autre", "Vintage", "Nike", "Marque", "Fait main", "Sans Gêne", "U Collection", "", null]) {
  ok(!estSansMarque(v), `« ${v} » n'est PAS une absence de marque`);
}

console.log("2. job servi");
const job = (platform: string, pf: Record<string, unknown>, action = "publish") => ({ platform, action, platform_fields: pf });
const jv = job("vinted", { marque: "Marque générique", vintedAspects: { brand: "Générique" } });
const tv = traduireAbsenceMarqueJob(jv, new Date("2026-10-04T22:00:00Z"));
ok(jv.platform_fields.marque === SANS_MARQUE && (jv.platform_fields.vintedAspects as Record<string, unknown>).brand === SANS_MARQUE,
  "Vinted : marque et vintedAspects.brand → « Sans marque » (ligne native, brand_id 1)");
ok(tv?.de === "Marque générique" && tv?.champs.join() === "marque,vintedAspects.brand", "Vinted : trace marque_traduite (de, champs)");
const jb = job("beebs", { marque: "Aucune", beebsAspects: { Marque: "aucune marque" } });
traduireAbsenceMarqueJob(jb);
ok(jb.platform_fields.marque === SANS_MARQUE && (jb.platform_fields.beebsAspects as Record<string, unknown>).Marque === SANS_MARQUE, "Beebs : « Sans marque », plus « Autre » d'office");
const jl = job("leboncoin", { marque: "No brand", lbcAspects: { clothing_brand: "Unbranded", couleur: "Generic" } });
traduireAbsenceMarqueJob(jl);
ok(jl.platform_fields.marque === SANS_MARQUE && (jl.platform_fields.lbcAspects as Record<string, unknown>).clothing_brand === SANS_MARQUE, "Leboncoin : marque et *_brand traduits");
ok((jl.platform_fields.lbcAspects as Record<string, unknown>).couleur === "Generic", "Leboncoin : un champ qui n'est pas une marque ne bouge pas");
const jo = job("opla", { marque: "Générique" }, "republish");
ok(traduireAbsenceMarqueJob(jo) && jo.platform_fields.marque === SANS_MARQUE, "Opla (republication) : traduit");
const vraie = job("vinted", { marque: "Generic Surplus", vintedAspects: { brand: "Nike" } });
ok(traduireAbsenceMarqueJob(vraie) === null && vraie.platform_fields.marque === "Generic Surplus"
  && (vraie.platform_fields.vintedAspects as Record<string, unknown>).brand === "Nike", "⛔ une vraie marque n'est jamais remplacée");
const deja = job("vinted", { marque: "Sans marque" });
ok(traduireAbsenceMarqueJob(deja) === null && !("marque_traduite" in deja.platform_fields), "déjà « Sans marque » : rien, pas de trace");
const retrait = job("vinted", { marque: "Marque générique" }, "delete");
ok(traduireAbsenceMarqueJob(retrait) === null && retrait.platform_fields.marque === "Marque générique", "un retrait ne bouge pas");
const ebayJob = job("ebay", { marque: "Marque générique" });
ok(traduireAbsenceMarqueJob(ebayJob) === null, "eBay : laissé à ebay-publication (liste eBay)");

console.log("3. eBay par l'API");
const LISTE = ["- Sans marque/Générique -", "Nike", "Adidas"];
const cat = (mode: string, liste: string[] = LISTE) => [
  { name: "Marque", required: true, mode, allowedValues: liste },
  { name: "Modèle", required: true, mode: "FREE_TEXT", allowedValues: [] },
];
const marque = (pf: Record<string, unknown>, mode = "SELECTION_ONLY", liste?: string[]) =>
  assemblerAspects(pf as never, cat(mode, liste) as never).aspects;
ok(marque({ marque: "Marque générique" })["Marque"]?.[0] === "- Sans marque/Générique -", "absence → entrée générique de la liste eBay");
ok(marque({ marque: "" })["Marque"]?.[0] === "- Sans marque/Générique -", "marque vide → entrée générique");
ok(marque({ marque: "", ebayAspects: { Marque: "Nike" } })["Marque"]?.[0] === "Nike", "⛔ aspect « Nike » tranché, fiche sans marque : Nike reste (défaut d'avant le 04/10)");
ok(marque({ marque: "Generic Surplus" }, "FREE_TEXT", [])["Marque"]?.[0] === "Generic Surplus", "« Generic Surplus » (vraie marque) n'est plus prise pour une absence");
ok(marque({ marque: "Générique" })["Modèle"]?.[0] === "Ne s'applique pas", "Modèle « Ne s'applique pas » sur un objet sans marque");
ok(!marque({ marque: "", ebayAspects: { Marque: "Nike" } })["Modèle"], "Modèle non inventé quand la marque est réelle");

console.log("4. câblage");
const gpj = Deno.readTextFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url));
ok(/traduireAbsenceMarqueJob\(j\)/.test(gpj) && gpj.indexOf("traduireAbsenceMarqueJob(j)") < gpj.indexOf("UN DÉPÔT VINTED SANS COULEUR OU SANS MARQUE NE PART PAS AU REFUS"),
  "get-pending-jobs traduit AVANT la garde « marque manquante » de Vinted");
const pub = Deno.readTextFileSync(new URL("../supabase/functions/_shared/ebay-publication.ts", import.meta.url));
ok(!/MARQUE_GENERIQUE_RE/.test(pub) && /estSansMarque/.test(pub), "ebay-publication : plus de regex non ancrée, la liste fermée");

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
Deno.exit(ko ? 1 : 0);
