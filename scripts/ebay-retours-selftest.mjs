// ═══════════════════════════════════════════════════════════════════════════
// Selftest « eBay : les retours proposés = ceux qu'eBay accepte pour CE compte » (06/11, Nico, point 4 — Pascal Caffray)
//   node scripts/ebay-retours-selftest.mjs
// LE CAS : fluxen62 (compte eBay professionnel) — l'écran proposait « Pas de retour » (interdit aux pros, 25002) et
// seulement 30 jours ; le serveur acceptait 14/30/60 mais ne recevait jamais la durée. LA RÈGLE : _shared/ebay-retours.js.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { typeVendeurEbayDuXml, pasDeRetourPermis, choixRetoursEbay, optionsRetoursEbay, DUREES_RETOURS_EBAY } from "../supabase/functions/_shared/ebay-retours.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const getUser = (t) => `<?xml version="1.0"?><GetUserResponse><Ack>Success</Ack><User><SellerInfo><SellerBusinessType>${t}</SellerBusinessType></SellerInfo></User></GetUserResponse>`;

console.log("1. Le type de vendeur, lu chez eBay (GetUser)");
ok("Commercial → professionnel", typeVendeurEbayDuXml(getUser("Commercial")) === "professionnel");
ok("Private → particulier", typeVendeurEbayDuXml(getUser("Private")) === "particulier");
ok("Undefined, absent, illisible → inconnu (null)", typeVendeurEbayDuXml(getUser("Undefined")) === null && typeVendeurEbayDuXml("<Ack>Failure</Ack>") === null && typeVendeurEbayDuXml(null) === null);

console.log("2. Les choix de l'écran");
const vals = (t) => choixRetoursEbay(t).map((c) => c.valeur);
ok("professionnel : 14, 30, 60 jours — jamais « pas de retour »", eq(vals("professionnel"), ["acceptes_14", "acceptes_30", "acceptes_60"]));
ok("inconnu : idem (eBay le refuserait peut-être)", eq(vals(null), ["acceptes_14", "acceptes_30", "acceptes_60"]));
ok("particulier : les trois durées + « pas de retour »", eq(vals("particulier"), ["acceptes_14", "acceptes_30", "acceptes_60", "refuses"]));
ok("les durées sont celles que le serveur envoie (14, 30, 60)", eq(DUREES_RETOURS_EBAY, [14, 30, 60]));

console.log("3. Le choix part tel quel au serveur");
for (const j of [14, 30, 60]) ok(`acceptes_${j} → retours_jours ${j}`, eq(optionsRetoursEbay(`acceptes_${j}`, "professionnel"), { retours: `acceptes_${j}`, retours_jours: j }));
ok("« pas de retour » d'un particulier → refuses", eq(optionsRetoursEbay("refuses", "particulier"), { retours: "refuses", retours_jours: null }));
ok("« pas de retour » d'un professionnel (état périmé à l'écran) → 30 jours, jamais refuses", eq(optionsRetoursEbay("refuses", "professionnel"), { retours: "acceptes_30", retours_jours: 30 }));
ok("pasDeRetourPermis : particulier seulement", pasDeRetourPermis("particulier") && !pasDeRetourPermis("professionnel") && !pasDeRetourPermis(null));

console.log("4. Le serveur envoie à eBay la durée reçue (corpsCreation) et refuse « pas de retour » hors particulier");
const ea = readFileSync(join(ROOT, "supabase/functions/ebay-account/index.ts"), "utf8");
ok("corpsCreation : retours_jours (14/30/60) → returnPeriod.value ; refuses → returnsAccepted false",
  /const jours = \[14, 30, 60\]\.includes\(Number\(options\.retours_jours\)\) \? Number\(options\.retours_jours\) : 30;/.test(ea)
  && /returnPeriod: \{ value: jours, unit: "DAY" \}/.test(ea) && /if \(options\.retours === "refuses"\) return \{ \.\.\.base, returnsAccepted: false \};/.test(ea));
ok("creer_politique : garde AVANT corpsCreation (type lu chez eBay, 400 sinon)",
  /if \(options\.retours === "refuses" && !pasDeRetourPermis\(tv\)\)[\s\S]{0,1200}const corps = corpsCreation\(type, options, serviceCode\);/.test(ea));
ok("creer_conditions : même garde", /if \(ret\.acceptes === false && !pasDeRetourPermis\(await lireTypeVendeurEbay\(env, token\)\)\)/.test(ea));
ok("proposer_conditions : jamais « non acceptés » proposé hors particulier", /propRet\.acceptes === false && !pasDeRetourPermis\(checklist\.type_vendeur\)/.test(ea));
ok("la checklist porte type_vendeur (GetUser)", /lireTypeVendeurEbay\(env, token\),\n  \]\);/.test(ea) && /type_vendeur: typeVendeur, http, at: sellerState\.at/.test(ea));

console.log("5. L'écran (EbayCompteSection)");
const ui = readFileSync(join(ROOT, "src/components/EbayCompteSection.jsx"), "utf8");
ok("plus aucune liste figée « 30 jours / pas de retour »", !ui.includes("[['acceptes_30', t.retoursAcceptes], ['refuses', t.retoursRefuses]]"));
ok("les deux listes viennent de choixRetoursEbay(type lu)", (ui.match(/choixRetoursEbay\(typeVendeurEbay\)/g) ?? []).length === 2 && /const typeVendeurEbay = checklist\?\.type_vendeur \?\? null;/.test(ui));
ok("l'envoi passe par optionsRetoursEbay (durée comprise)", /options: \{ nom, \.\.\.\(type === 'return' \? optionsRetoursEbay\(source\.retours, typeVendeurEbay\)/.test(ui));

console.log("6. Voie extension (06/11, point 5) : le type lu sur une annonce eBay du compte (API Browse)");
const { typeVendeurEbayDeBrowse } = await import("../supabase/functions/_shared/ebay-retours.js");
const BR = await import("../supabase/functions/_shared/ebay-brouillon-refus.js");
ok("BUSINESS → professionnel, INDIVIDUAL → particulier, rien → inconnu",
  typeVendeurEbayDeBrowse({ seller: { sellerAccountType: "BUSINESS" } }) === "professionnel"
  && typeVendeurEbayDeBrowse({ seller: { sellerAccountType: "INDIVIDUAL" } }) === "particulier" && typeVendeurEbayDeBrowse({}) === null);
ok("la question de la voie extension a les mêmes choix que l'écran (codes), « Pas de retour » seulement au particulier",
  eq(BR.optionsRetoursDuCompte("particulier").map((o) => o.code), choixRetoursEbay("particulier").map((c) => c.valeur))
  && eq(BR.optionsRetoursDuCompte(null).map((o) => o.code), choixRetoursEbay(null).map((c) => c.valeur))
  && eq(BR.optionsRetoursDuCompte("professionnel").map((o) => o.code), choixRetoursEbay("professionnel").map((c) => c.valeur)));
const uj = readFileSync(join(ROOT, "supabase/functions/update-job-status/index.ts"), "utf8");
const tvs = readFileSync(join(ROOT, "supabase/functions/_shared/ebay-type-vendeur.ts"), "utf8");
ok("update-job-status lit le type quand la question des retours part, et le passe à la question",
  /typeVendeurEbayDuCompte\(createClient\(/.test(uj) && /retoursEbayChoix,\s*\n[^\n]*\n\s*typeVendeurEbay,/.test(uj));
ok("le type vient de GetUser (voie API) sinon d'une annonce en ligne par Browse", /seller_state\?\.type_vendeur/.test(tvs) && /get_item_by_legacy_id/.test(tvs));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
