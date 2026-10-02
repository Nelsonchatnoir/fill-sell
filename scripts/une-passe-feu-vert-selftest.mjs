// Autotest — une-passe Vinted : feu vert avant retrait, preuve par numéro —
// `npm run selftest:une-passe-feu-vert`
// 9cdr9rm4rn (6afed5b9, 02/10) : l'arrière-plan abandonne le remplissage à
// 300 s ; 43 s plus tard le content script, toujours vivant, retire l'annonce
// puis soumet ; la reprise recrée par-dessus → deux copies en ligne.
// Ce test relit le code LIVRÉ et vérifie l'ordre des gestes.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const vt = lire("chrome-extension/content-scripts/vinted.js");
const bg = lire("chrome-extension/background.js");
let ko = 0;
const ok = (c, nom) => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}`); ko++; } };

console.log("\n1. LE CONTENT SCRIPT DEMANDE LE FEU VERT AVANT DE RETIRER");
const iUne = vt.indexOf("  if (onePass?.item_id) {\n    const traceDel = [];");
const iFeu = vt.indexOf('askBackground({ type: "UNE_PASSE_FEU_VERT", jobId: job.id })', iUne);
const iDel = vt.indexOf("const del = await deleteVintedItemViaApi(String(onePass.item_id)", iUne);
ok(iUne > 0 && iFeu > iUne && iDel > iFeu, "feu vert demandé APRÈS les gardes et AVANT la suppression");
const bloc = vt.slice(iFeu, iDel);
ok(/feu\?\.ok !== true/.test(bloc) && /return \{/.test(bloc) && /rien n'a été retiré, rien n'a été soumis/.test(bloc), "pas de feu vert → retour immédiat, rien retiré, rien soumis");

console.log("\n2. L'ARRIÈRE-PLAN NE DONNE LE FEU VERT QUE S'IL ATTEND CE REMPLISSAGE");
ok(/msg\?\.type === "UNE_PASSE_FEU_VERT"[\s\S]{0,200}remplissagesUnePasseAttendus\.has\(msg\.jobId\)/.test(bg), "réponse = le job est encore attendu");
const iAdd = bg.indexOf("remplissagesUnePasseAttendus.add(job.id);");
const iFill = bg.indexOf("result = await envoyerFillListing(tabId, jobRecreation);", iAdd);
const iDelSet = bg.indexOf("remplissagesUnePasseAttendus.delete(job.id);", iFill);
ok(iAdd > 0 && iFill > iAdd && iDelSet > iFill && /finally \{\s*remplissagesUnePasseAttendus\.delete\(job\.id\);/.test(bg), "attendu pendant le remplissage, oublié dans un finally (abandon, timeout, coupure)");
ok(/canal_coupe_diag = \{/.test(bg), "la coupure laisse son diagnostic (adresse et état de l'onglet)");

console.log("\n3. LA RECRÉATION SE PROUVE PAR SON NUMÉRO AVANT TOUT TITRE");
const iConc = bg.indexOf("async function conclureRecreationApresSoumission(");
const iNum = bg.indexOf("recréation prouvée par son numéro (onglet redirigé par Vinted", iConc);
const iTitre = bg.indexOf("vintedUploadSucceededForTitle(tabId, jobRecreation.title)", iConc);
ok(iConc > 0 && iNum > iConc && iTitre > iNum, "numéro lu dans l'adresse de l'onglet AVANT la sonde par titre");
ok(/idNum !== String\(pf\.vinted_item_id \?\? ""\)/.test(bg), "jamais le numéro de l'annonce retirée");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ une-passe : aucun retrait orphelin, la recréation se prouve par son numéro");
