// VERROU (12/11/2026, point 7 de Nico — ROUGE, priorité absolue) : UN ACHAT GOOGLE PLAY QUI ÉCHOUE DIT POURQUOI.
//
//     npm run selftest:achats-google-code
//
// Preuve (usage_logs checkout_issue, Play Console en lecture seule) : du 16/10 au 12/11, 18 premiers achats Google sur 20
// sont revenus « Purchase is not purchased » (8 comptes, dont un 10 fois en 2 jours, Premium, Pro et Business) ; la feuille
// Google s'ouvrait (2,5 à 17 s contre 49 à 81 s pour un achat payé), Google n'a créé AUCUNE commande ; aucun ancien
// jeton (jamais une montée de palier). Le module natif (@capgo/native-purchases 8.3.3) JETAIT la réponse de Google
// (BillingResponseCode et message) : l'app ne pouvait ni dire au client ce qui bloquait, ni nous le dire.
//   A. Le module natif (patch, binaire vc38) : chaque refus part avec le code de Google (`GOOGLE_<NOM>`) et son message ;
//      une feuille qui ne s'ouvre pas est refusée (avant : la promesse attendait sans fin) ; les patchs d'avant restent.
//   B. L'app classe chaque code (déjà abonné, indisponible, réseau, annulé, refus avec code) et dit au client la cause et
//      quoi faire, « rien n'a été débité » ; un binaire d'avant (sans code) garde l'issue d'avant, message plus utile.
//   C. Le forfait de base demandé est le bon (le module rend planIdentifier = le PRODUIT : jamais trouvé parmi les
//      forfaits, la « première offre venue » partait).
//   D. Chaque issue est tracée avec la durée de la feuille et le binaire.
//   E. Versions : OTA 2.9.175 et binaire Android 2.9.175 / vc38 alignés (préparé, soumis seulement au go de Nico).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 400)}`}`); } };

console.log("A. Le module natif transmet le code de Google (patch, binaire vc38)");
const patch = lire("patches/@capgo+native-purchases+8.3.3.patch");
const ajouts = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
ok(/static String nomCodeGoogle\(int code\)/.test(ajouts), "une table code → nom (BillingResponseCode)");
const attendus = { "-3": "SERVICE_TIMEOUT", "-2": "FEATURE_NOT_SUPPORTED", "-1": "SERVICE_DISCONNECTED", 1: "USER_CANCELED", 2: "SERVICE_UNAVAILABLE",
  3: "BILLING_UNAVAILABLE", 4: "ITEM_UNAVAILABLE", 5: "DEVELOPER_ERROR", 6: "ERROR", 7: "ITEM_ALREADY_OWNED", 8: "ITEM_NOT_OWNED", 12: "NETWORK_ERROR" };
ok(Object.entries(attendus).every(([c, nom]) => ajouts.includes(`case ${c}: return "GOOGLE_${nom}";`)) && /default: return "GOOGLE_CODE_" \+ code;/.test(ajouts),
  "les 12 réponses de Google ont leur nom (et un code inconnu garde son numéro)");
ok(/purchaseCall\.reject\(messageGoogle\("Purchase is not purchased", billingResult\), nomCodeGoogle\(codeGoogle\)\);/.test(ajouts),
  "feuille revenue sans achat : rejet AVEC le code et le message de Google (avant : « Purchase is not purchased » nu)");
ok(/purchaseCall\.reject\("Purchase is not purchased \(state " \+ purchase\.getPurchaseState\(\) \+ "\)", "GOOGLE_ETAT_" \+ purchase\.getPurchaseState\(\)\);/.test(ajouts),
  "achat rendu dans un état inconnu : l'état part avec le refus");
ok(/if \(billingResult2\.getResponseCode\(\) != BillingClient\.BillingResponseCode\.OK\) \{\s*closeBillingClient\(\);\s*call\.reject\(messageGoogle\("Billing flow not launched", billingResult2\), nomCodeGoogle\(billingResult2\.getResponseCode\(\)\)\);/.test(ajouts),
  "feuille qui ne s'ouvre pas : refusée avec son code (avant : seulement écrite au journal Android, l'achat attendait sans fin)");
ok(/setOldPurchaseToken\(oldPurchaseToken\)/.test(ajouts) && /isFillSellCoinProduct/.test(ajouts), "les patchs d'avant restent (montée de palier en place, Pépites iOS non finies)");
ok(!/"Purchase is pending"/.test(ajouts), "« en attente » inchangé (déjà lisible)");
const java = "node_modules/@capgo/native-purchases/android/src/main/java/ee/forgr/nativepurchases/NativePurchasesPlugin.java";
if (fs.existsSync(join(ROOT, java)) && /nomCodeGoogle/.test(lire(java))) ok(/messageGoogle\("Billing flow not launched"/.test(lire(java)), "node_modules porte le patch d'aujourd'hui");

console.log("B. L'app classe le code et le dit au client");
const I = await import(pathToFileURL(join(ROOT, "src/lib/issueAchat.js")).href);
const rejet = (nom, debug = "") => ({ message: `Purchase is not purchased (${nom}${debug ? `: ${debug}` : ""})`, code: `GOOGLE_${nom}` });
const issue = (e) => I.classerIssueAchat(e);
ok(typeof I.messageIssueAchat === "function" && typeof I.forfaitDeBaseGoogle === "function", "messageIssueAchat et forfaitDeBaseGoogle existent");
if (typeof I.messageIssueAchat === "function") {
  ok(issue(rejet("USER_CANCELED")).issue === "annule", "USER_CANCELED → annulé (aucun message, comme un abandon iPhone)");
  const deja = issue(rejet("ITEM_ALREADY_OWNED", "Item is already owned."));
  ok(deja.issue === "deja_abonne" && deja.code === "GOOGLE_ITEM_ALREADY_OWNED" && /Restaurer mes achats/.test(I.messageIssueAchat(deja, "fr")), "ITEM_ALREADY_OWNED → déjà abonné : « Restaurer mes achats »", deja);
  ok(["ITEM_UNAVAILABLE", "BILLING_UNAVAILABLE", "FEATURE_NOT_SUPPORTED"].every((c) => issue(rejet(c)).issue === "indisponible"), "ITEM_UNAVAILABLE, BILLING_UNAVAILABLE, FEATURE_NOT_SUPPORTED → indisponible sur ce téléphone");
  ok(["SERVICE_UNAVAILABLE", "NETWORK_ERROR", "SERVICE_DISCONNECTED", "SERVICE_TIMEOUT"].every((c) => issue(rejet(c)).issue === "reseau"), "SERVICE_UNAVAILABLE, NETWORK_ERROR, SERVICE_DISCONNECTED, SERVICE_TIMEOUT → Google ne répond pas");
  const dev = issue(rejet("DEVELOPER_ERROR", "Invalid offer token"));
  ok(dev.issue === "erreur" && dev.code === "GOOGLE_DEVELOPER_ERROR" && /DEVELOPER_ERROR/.test(I.messageIssueAchat(dev, "fr")) && /Invalid offer token/.test(dev.message), "DEVELOPER_ERROR → erreur, avec son code à l'écran et le message de Google dans la trace", dev);
  ok(issue({ message: "Billing flow not launched (ITEM_ALREADY_OWNED)", code: "GOOGLE_ITEM_ALREADY_OWNED" }).issue === "deja_abonne", "feuille jamais ouverte : même classement");
  const vieux = issue(new Error("Purchase is not purchased"));
  ok(vieux.issue === "abandon_ou_refus" && vieux.code === "GOOGLE_NON_ACHETE" && /moyen de paiement/.test(I.messageIssueAchat(vieux, "fr")), "binaire d'avant (vc37, sans code) : abandon_ou_refus comme avant, et le message dit quoi vérifier", vieux);
  const tous = [vieux, deja, issue(rejet("ITEM_UNAVAILABLE")), issue(rejet("NETWORK_ERROR")), dev];
  ok(tous.every((x) => /rien n'a été débité/.test(I.messageIssueAchat(x, "fr")) && /nothing was charged/.test(I.messageIssueAchat(x, "en"))), "chaque message dit « rien n'a été débité » (vrai : Google n'a rendu aucun achat), FR et EN");
  ok(I.messageIssueAchat(issue(new Error("Premium not confirmed by server")), "fr") === null && I.messageIssueAchat(issue(new Error("User cancelled")), "fr") === null,
    "hors feuille Google (confirmation serveur) ou annulé : aucun message inventé ici");
}

console.log("C. Le bon forfait de base");
if (typeof I.forfaitDeBaseGoogle === "function") {
  // La forme que rend getProducts du module 8.3.3 pour un abonnement Android (lue dans NativePurchasesPlugin.java).
  const produit = { planIdentifier: "app.fillsell.premium.standard", identifier: "standard-monthly", offerToken: "x" };
  ok(I.forfaitDeBaseGoogle(produit, "app.fillsell.premium.standard") === "standard-monthly", "Android : le forfait de base (identifier), pas le produit (planIdentifier)");
  ok(I.forfaitDeBaseGoogle({ identifier: "app.fillsell.pro2.sub" }, "app.fillsell.pro2.sub") === null, "iPhone (identifier = produit) : null, le chemin d'avant");
  ok(I.forfaitDeBaseGoogle({}, "x") === null && I.forfaitDeBaseGoogle(null, "x") === null, "rien de lisible : null, le repli d'avant");
}
const java0 = fs.existsSync(join(ROOT, java)) ? lire(java) : "";
if (java0) ok(/product\.put\("planIdentifier", productDetails\.getProductId\(\)\);/.test(java0) && /product\.put\("identifier", selectedOfferDetails\.getBasePlanId\(\)\);/.test(java0) && /offerDetails\.getBasePlanId\(\)\.equals\(planIdentifier\)/.test(java0),
  "le module : planIdentifier = produit, identifier = forfait, et l'achat cherche le forfait — d'où la correction");
const iap = lire("src/lib/iap.js");
ok(/const planId = \(Capacitor\.getPlatform\(\) === 'android' \? forfaitDeBaseGoogle\(product, productId\) : null\)\s*\?\? product\?\.planIdentifier/.test(iap), "iap.js : le forfait d'abord sur Android, le repli d'avant ensuite ; iPhone inchangé");

console.log("D. La trace de chaque issue");
const app = lire("src/App.jsx");
const i0 = app.indexOf("async function handleIAPPurchase(");
const bloc = app.slice(i0, app.indexOf("async function handleIAPRestore(", i0));
ok(/duree_feuille_ms:debutFeuille\?Date\.now\(\)-debutFeuille:null,binaire:binaireAchat\?\?null/.test(bloc), "checkout_issue porte la durée de la feuille et le binaire");
ok(/debutFeuille=Date\.now\(\);\s*const \{cancelled,enAttente,issue:issueStore,purchaseToken\}=await purchasePremium\(/.test(bloc), "la durée part juste avant la feuille");
ok(/const msgStore=messageIssueAchat\(cl,lang\);/.test(bloc) && /issueTunnel\(cl\.issue==='erreur'\?'erreur':cl\.issue,\{code:cl\.code,message:cl\.message\}\)/.test(bloc), "chaque issue est écrite avec son code et son message, puis dite au client");
ok(!/Achat non finalisé : rien n'a été débité\.":/.test(bloc), "plus de « Achat non finalisé » sans suite");

console.log("E. Versions");
// L'OTA 2.9.175 porte le correctif aux binaires d'avant ; le binaire vc38 (module patché) vient APRÈS, à un numéro à lui
// (règle de l'OTA : un numéro de binaire n'est jamais celui d'une OTA, et une OTA passe AU-DESSUS du dernier binaire).
const num = (v) => String(v).split(".").map(Number).reduce((a, x) => a * 1000 + x, 0);
const pkg = JSON.parse(lire("package.json")), lock = JSON.parse(lire("package-lock.json")), gradle = lire("android/app/build.gradle");
const vName = /^\s*versionName "([^"]+)"/m.exec(gradle)?.[1] ?? "", vCode = Number(/^\s*versionCode (\d+)/m.exec(gradle)?.[1] ?? 0);
ok(num(pkg.version) >= num("2.9.175") && lock.version === pkg.version && lock.packages[""].version === pkg.version, `l'app en ${pkg.version} (≥ 2.9.175, l'OTA du correctif ; package.json et lock alignés)`);
ok(vCode >= 37 && num(vName) <= num(pkg.version), `binaire Android ${vName} / vc${vCode} : jamais au-dessus de l'app (vc37 en production ; vc38 préparée à part)`);

console.log(`\n${n - ko}/${n} contrôles verts${ko ? ` — ${ko} ROUGE(S)` : ""}`);
process.exit(ko ? 1 : 0);
