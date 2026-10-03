// Selftest — supabase/functions/_shared/retrait-ebay-par-numero.js (01/10).
// Cas réels du parc (retraits eBay relus en base le 01/10) + le repli du
// content script eBay rejoué tel qu'il est écrit (titre exact d'une ancre).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  numeroAnnonceEbay, etiquetteRetraitEbay, servirRetraitsEbayParNumero,
} from "../supabase/functions/_shared/retrait-ebay-par-numero.js";

let n = 0;
const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// 1. La regex est celle de l'extension, mot pour mot (sinon le serveur et le
//    Hub ne liraient pas le même numéro).
const ebayJs = readFileSync(new URL("../chrome-extension/content-scripts/ebay.js", import.meta.url), "utf8");
const bgJs = readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
const reExt = String.raw`/\/itm\/(?:[^/]*\/)?(\d{9,})|itemId=(\d{9,})/i`;
assert.ok(ebayJs.includes(reExt), "content-scripts/ebay.js lit le numéro avec la même regex");
assert.ok(bgJs.includes(reExt), "background.js (DELETE_TARGETS.ebay) lit le numéro avec la même regex");
ok("même lecture du numéro que l'extension (content script + DELETE_TARGETS)");

// 2. (03/10) Le repli par titre a été RETIRÉ du content script par 57e2667
//    (0.6.84, 02/10), en application de la règle du 27/09 : un titre ne prouve
//    jamais l'identité. Le test exigeait sa PRÉSENCE (rouge depuis le 02/10) ;
//    il exige désormais son ABSENCE — plus strict : un retour du repli dans
//    l'extension le fait rougir. L'étiquette servie (section 3) et le rejeu de
//    l'ancien repli (section 4) restent : les postes 0.6.81 à 0.6.83 (minimum
//    serveur 0.6.81) embarquent encore ce repli.
assert.ok(!/a\.textContent\.trim\(\) === cible/.test(ebayJs), "plus aucun repli par titre exact dans ebay.js (0.6.84+)");
assert.ok(!/annonce trouvée par titre exact/.test(ebayJs), "plus de trace « trouvée par titre exact » dans ebay.js");
ok("ebay.js (0.6.84+) : aucun repli par titre — seul le numéro identifie l'annonce");

// 3. Cas réels.
const reels = [
  { id: "ea012a37", platform: "ebay", action: "delete", listing_url: "https://www.ebay.fr/itm/307204072564",
    title: "Service à café vintage – Porcelaine de France Dijon – 5 tasses + 6 soucoupes" },
  { id: "9e50c151", platform: "ebay", action: "delete", listing_url: "https://www.ebay.fr/itm/407173913443",
    title: "Vintage Thick Glass Butter Dish" },
  { id: "ext-1", platform: "ebay", action: "delete", listing_url: "https://www.ebay.fr/itm/407236494843",
    title: "Présentoir vintage en bois sculpté – 3 compartiments – plateau de service" },
  { id: "ext-2", platform: "ebay", action: "delete", listing_url: "https://www.ebay.fr/itm/407164456128",
    title: "Lustre Suspension Vintage 6 Feux Chrome Bois Verre Moulé Années 60/70" },
];
assert.equal(numeroAnnonceEbay(reels[0].listing_url), "307204072564");
assert.equal(numeroAnnonceEbay("https://www.ebay.fr/itm/service-a-cafe/307204072564?hash=x"), "307204072564");
assert.equal(numeroAnnonceEbay("https://www.ebay.fr/sh/lst/active?itemId=307204072564"), "307204072564");
assert.equal(numeroAnnonceEbay(null), null);
assert.equal(numeroAnnonceEbay("https://www.ebay.fr/sh/lst/active"), null);
ok("numéro lu sur les formes réelles (nu, avec slug, itemId), rien sans numéro");

const autres = [
  { id: "v1", platform: "vinted", action: "delete", listing_url: "https://www.vinted.fr/items/1", title: "Robe" },
  { id: "e1", platform: "ebay", action: "publish", listing_url: null, title: "Chemise 38" },
  { id: "e2", platform: "ebay", action: "republish", listing_url: "https://www.ebay.fr/itm/407173913443", title: "Plat" },
];
const sansNumero = { id: "e3", platform: "ebay", action: "delete", listing_url: null, title: "Vintage Thick Glass Butter Dish" };
const { servis, retenus } = servirRetraitsEbayParNumero([...reels, ...autres, sansNumero]);

assert.equal(retenus.length, 1); assert.equal(retenus[0].id, "e3");
ok("retrait eBay sans numéro : retenu (jamais servi au repli par titre)");
for (const a of autres) assert.ok(servis.includes(a), `${a.id} servi tel quel (même objet)`);
ok("Vinted, publication et republication eBay : servis tels quels, même objet");

for (const r of reels) {
  const s = servis.find((x) => x.id === r.id);
  assert.ok(s && s !== r, `${r.id} : copie servie`);
  assert.equal(s.listing_url, r.listing_url);
  assert.equal(s.title, etiquetteRetraitEbay(numeroAnnonceEbay(r.listing_url)));
  assert.equal(r.title.length > 0, true, "l'original n'est pas modifié");
}
ok("retraits eBay avec numéro : copie servie, lien intact, titre = étiquette, original intact");

// 4. Le repli des postes ANTÉRIEURS À LA 0.6.84 (encore servis : minimum
//    0.6.81), rejoué : ancres d'un Hub où l'annonce visée n'est PAS (autre
//    compte, ou déjà finie) mais où un homonyme EST.
const hub = reels.map((r) => ({ textContent: `  ${r.title}  `, href: "https://www.ebay.fr/itm/999999999999" }));
for (const r of reels) {
  const s = servis.find((x) => x.id === r.id);
  const avant = hub.filter((a) => a.textContent.trim() === r.title.trim());
  const apres = hub.filter((a) => s.title && a.textContent.trim() === s.title.trim());
  assert.equal(avant.length, 1, "avant : l'homonyme aurait été pris");
  assert.equal(apres.length, 0, "après : le repli ne trouve rien");
}
ok("repli par titre rejoué : l'homonyme était pris avant, plus rien après");

console.log(`retrait-ebay-par-numero : ${n} contrôles verts`);
