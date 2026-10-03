// Autotest — une statue n'est pas un bijou (03/10, point 8) —
// `npm run selftest:statue-rayon`
// La statue de Nico (fiche 1790285936487, « Statue buste femme en terre cuite
// ancienne drapé et collier », objet de l'IA « buste ») est partie en Bijoux
// (Vinted, Leboncoin) et en « Bijoux (femme) » sur Beebs, d'où une taille de
// bague demandée : la règle 💍 (« collier ») passait avant la statuaire, et la
// vérification du rayon était injoignable (essais sur localhost).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const shared = await import(pathToFileURL(join(ROOT, "src/utils/shared.js")).href);
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const icone = (t) => shared.detectObjectKeywordDetail(t, "")?.icon ?? null;

console.log("\n1. LE DICTIONNAIRE : L'OBJET D'ART AVANT LE BIJOU QU'IL PORTE");
ok(icone("Statue buste femme en terre cuite ancienne drapé et collier") === "🖼️", "la statue de Nico → 🖼️ (plus 💍)");
ok(icone("Buste de femme en plâtre avec collier de perles") === "🖼️", "buste avec collier → 🖼️");
ok(icone("Sculpture africaine bracelet en bronze") === "🖼️", "sculpture … bracelet → 🖼️");
ok(icone("Collier pendentif buste de femme") === "💍", "collier pendentif buste → 💍 (le bijou nommé d'abord reste un bijou)");
ok(icone("Bracelet argent 925") === "💍" && icone("Bague en or 18 carats") === "💍" && icone("Boucles d'oreilles créoles") === "💍", "les bijoux restent des bijoux");
ok(icone("Baguette magique Harry Potter") !== "💍", "« baguette » n'est toujours pas une bague");

console.log("\n2. VÉRIFICATION INJOIGNABLE : UN RAYON D'UNE AUTRE ICÔNE QUE L'OBJET ATTEND");
const res = fs.readFileSync(join(ROOT, "src/utils/resolutionPublication.js"), "utf8").split("\r\n").join("\n");
ok(/const iconeDeLObjet = motCategorie \? \(detectObjectKeywordDetail\(String\(motCategorie\), ""\)\?\.icon \?\? null\) : null;/.test(res),
  "l'icône de l'objet vu par l'IA est calculée");
ok(/if \(verificationInjoignable && motCategorie && motCategorieSource === "ia" && iconeDeLObjet\) \{/.test(res)
  && /if \(!pf\.categorie_icone \|\| pf\.categorie_icone === iconeDeLObjet\) continue;/.test(res),
  "seulement quand la vérification ne répond pas ET que l'icône du rayon n'est pas celle de l'objet");
ok(/pf\.rayon_a_reessayer = \{ motif: "verification_injoignable"/.test(res)
  && /if \(row\.platform === "vinted"\) delete pf\.categoryPath;/.test(res)
  && /else if \(row\.platform === "beebs"\) delete pf\.beebsCategoryPath;/.test(res),
  "le rayon est retiré et la plateforme attend (rayon_a_reessayer) — jamais publiée telle quelle");
ok(/if \(row\.platform === "ebay" && ebayVoieApi === true\) continue;/.test(res), "eBay par l'API : le serveur choisit, inchangé");
ok(icone("buste") === icone("statue"), "« buste » et « statue » : même icône, donc rien de retenu à tort sur une panne");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ statue : jamais en bijoux, et jamais un rayon non vérifié d'une autre icône que l'objet");
