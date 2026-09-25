// Autotest — FORMAT DU COLIS VINTED, DERNIÈRE PASSE (2026-09-25)
// `npm run selftest:vinted-colis-derniere-passe`
//
// Ce qui a été payé : 7 refus 400 `package_size` en 60 jours (« Sélectionne
// le format de ton colis »), TOUS avec un format CONNU (« Petit », id 1
// capturé, ou la règle Mode), 6 sur 7 sur des RÉPUBLICATIONS — l'annonce
// d'origine était déjà retirée, elle restait hors ligne jusqu'au rejeu
// (81bf5d44, nerema75, 24/09 : recréée au 3e essai).
// Le format n'est pas une donnée qui manque : c'est un choix que Vinted perd
// entre la pose et le clic. D'où, dans vinted.js :
//   · sur une républication (recréation OU une-passe après retrait), le
//     format connu est reposé en DERNIER geste avant le clic ;
//   · le prix est relu APRÈS cette pose (un clic sur le format peut vider la
//     prop `value` du composant prix, bug du 18/07) ;
//   · une publication neuve garde son chemin tel quel (0 refus depuis 0.6.58).
// Test STATIQUE, relu à la source : l'ordre des gestes est ce qu'on garantit.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8").split("\r\n").join("\n");

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const iCond = src.indexOf("const reposerAvantDepot = colisVoulu && !colisSectionAbsente && (recreation || onePassDeleted);");
const iBloc = src.indexOf("if ((colisSectionAbsente && colisVoulu) || reposerAvantDepot) {");
const iPrix = src.indexOf("if (colisRepose && job.price != null) await ensurePriceCommitted(job.price);");
const iClic = src.indexOf('const publishBtn = await waitForKey("publish.submit");');
const iSuppr = src.indexOf("onePassDeleted = true;");

console.log("\n[1] la dernière passe du format");
ok("la condition vise les républications seulement (recréation ou une-passe après retrait)", iCond > 0);
ok("le bloc de dernière passe couvre la section absente ET la républication", iBloc > iCond);
ok("la pose de dernière passe vient APRÈS le retrait une-passe", iSuppr > 0 && iBloc > iSuppr, `${iSuppr} / ${iBloc}`);
ok("le prix est relu APRÈS la pose, AVANT le clic", iPrix > iBloc && iPrix < iClic, `${iBloc} / ${iPrix} / ${iClic}`);
ok("aucun autre geste entre la relecture du prix et le clic (hors traces)",
  !/selectPackageSize|simulateFullClick|fillPriceField/.test(src.slice(iPrix + 10, iClic)));

console.log("\n[2] une publication neuve garde son chemin");
const bloc = src.slice(iBloc, iPrix);
ok("colisRepose n'est posé que par une pose réussie", /await selectPackageSize\([^)]*\);\s*\n\s*colisRepose = true;/.test(bloc));
ok("la publication neuve (ni recréation, ni une-passe) ne déclenche pas la repose", !/reposerAvantDepot\s*=\s*colisVoulu\s*&&\s*!colisSectionAbsente\s*&&\s*\(?\s*true/.test(src));

console.log("\n[3] la pose elle-même (correctif du 22/09) reste l'aller-retour");
const iSel = src.indexOf("async function selectPackageSize(");
const corpsSel = src.slice(iSel, src.indexOf("\n}\n", iSel));
ok("un radio déjà coché est reposé par un aller-retour", /simulateFullClick\(autres\[0\]\);[\s\S]*simulateFullClick\(radio\);/.test(corpsSel));

console.log("\n[4] hygiène");
ok("vinted.js ne contient aucun caractère de contrôle U+0008", !src.includes(String.fromCharCode(8)));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
