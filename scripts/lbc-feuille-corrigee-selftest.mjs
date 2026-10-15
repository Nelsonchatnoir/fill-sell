// Autotest — Leboncoin : la feuille que l'objet nomme, pas celle d'un mot
// complément — `npm run selftest:lbc-feuille-corrigee`
// (_shared/lbc-feuille-corrigee.js, get-pending-jobs).
// Cas RELEVÉS le 15/10 sur 244 publications Maison & Jardin de 60 jours : 3
// corrigées (lampe Accolay de PAUGUES, statue Vierge Marie, lampes de chevet),
// le « Rangement pour 12 pots » reste (« pots » est un Produit de sa feuille).
import { corrigerFeuilleLbc } from "../supabase/functions/_shared/lbc-feuille-corrigee.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA LAMPE ACCOLAY (63c12339) PASSE EN DÉCORATION › ÉCLAIRAGE");
const lampe = { lbcCategoryPath: ["Maison & Jardin", "Arts de la table"],
  lbcAspects: { condition: "Très bon état", decoration_type: "Lampe à poser", house_and_garden_type: "Éclairage", table_art_product: "Autre", table_art_type: "Autre" } };
const r = corrigerFeuilleLbc(lampe, "Accolay Vintage Ceramic Table Lamp — lampe à poser en céramique");
ok(r?.apres.join(" > ") === "Maison & Jardin > Décoration", "feuille Décoration", JSON.stringify(r?.apres));
ok(r?.paire.univers === "Éclairage" && r?.paire.produit === "Lampe à poser", "paire Éclairage / Lampe à poser");
ok(r && !("table_art_type" in r.pf.lbcAspects) && !("table_art_product" in r.pf.lbcAspects) && r.pf.lbcAspects.condition === "Très bon état", "le fourre-tout de l'ancienne feuille part, le reste demeure");
ok(r?.pf.feuille_corrigee?.avant?.[1] === "Arts de la table", "trace feuille_corrigee");

console.log("\n2. RIEN NE BOUGE QUAND LA FEUILLE EST JUSTE OU LE DOUTE RESTE");
ok(corrigerFeuilleLbc({ lbcCategoryPath: ["Maison & Jardin", "Décoration"], lbcAspects: { house_and_garden_type: "Objet décoratif", decoration_type: "Vase, cache pot et céramique", table_art_type: "Accessoire de table", table_art_product: "Plateau" } }, "Ancien plateau à olives faïence") === null,
  "jocabroc (22/09) : notre feuille a une vraie paire → elle reste");
ok(corrigerFeuilleLbc({ lbcCategoryPath: ["Maison & Jardin", "Arts de la table"], lbcAspects: { table_art_type: "Autre", table_art_product: "Autre", home_appliance_type: "Cuisine et cuisson", home_appliance_product: "Yaourtière" } }, "Rangement Gris et Rose pour 12 pots et 12 couvercles de yaourtière") === null,
  "« pots » nomme un Produit de NOTRE feuille (Bocaux et pots) → elle reste");
ok(corrigerFeuilleLbc({ lbcCategoryPath: ["Maison & Jardin", "Arts de la table"], lbcAspects: { table_art_type: "Autre", table_art_product: "Autre", house_and_garden_type: "Éclairage", decoration_type: "Lampe à poser", diy_type: "Électricité, éclairage et domotique", diy_product: "Lampe torche" } }, "lampe") === null,
  "deux autres feuilles candidates → rien (Leboncoin et la personne tranchent)");
ok(corrigerFeuilleLbc({ lbcCategoryPath: ["Maison & Jardin", "Arts de la table"], lbcAspects: { table_art_type: "Autre", table_art_product: "Autre", house_and_garden_type: "Éclairage", decoration_type: "Produit inventé" } }, "x") === null,
  "une paire hors de la liste relevée n'est pas réelle → rien");
ok(corrigerFeuilleLbc({ lbcCategoryPath: ["Électronique", "Photo, audio & vidéo"], lbcAspects: {} }, "x") === null, "hors Maison & Jardin → rien");

console.log("\n3. GET-PENDING-JOBS L'APPLIQUE AUX PUBLICATIONS EN FILE");
const gpj = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
ok(/corrigerFeuilleLbc\(\(j\.platform_fields/.test(gpj) && /j\.platform !== "leboncoin" \|\| j\.action !== "publish" \|\| j\.status !== "pending"/.test(gpj), "publications Leboncoin en file seulement, CAS sur pending");

console.log("\n4. LA MARQUE CHOISIE VAUT POUR LA REPUBLICATION VINTED (point 8)");
const bg = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
ok(/marque: marqueChoisieRepublication\(pf, cap\.libelles\?\.marque\) \?\? cap\.libelles\?\.marque \?\? null/.test(bg), "la recréation pose la marque choisie avant la marque capturée");
ok(/if \(marqueChoisieRepublication\(pf, cap\.libelles\?\.marque\)\) return \{\};/.test(bg), "l'identifiant de l'ancienne marque n'est pas transmis quand la personne en a choisi une autre");
const ujs = fs.readFileSync(new URL("../supabase/functions/update-job-status/index.ts", import.meta.url), "utf8");
ok(/&& !marqueHorsCatalogue\s/.test(ujs), "update-job-status : une marque hors catalogue n'est plus « reprise » puis retirée de la question");
ok(/marque_choisie: v,/.test(gpj), "get-pending-jobs sert la réponse rangée sur l'article");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
