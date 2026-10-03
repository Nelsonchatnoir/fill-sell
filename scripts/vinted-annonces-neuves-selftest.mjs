// Autotest — Vinted ne garde pas certaines annonces neuves (03/10, point 26)
//   npm run selftest:vinted-annonces-neuves
//
// Compte de Nico, 03/10 :
//   · jogging Primark : annonce 10222622571 publiée à 08:18, disparue du
//     dressing sans retrait. Le contrôle des ventes a lu un 404 et, la fiche
//     portant l'id d'une ANCIENNE annonce (10067774305, importée puis finie),
//     a conclu « remplacée par une republication » et clos la NOUVELLE annonce
//     en silence — il n'y avait eu aucune republication ;
//   · buste : annonce 10223005469 « en vérification » chez Vinted (masquée aux
//     acheteurs, retrait refusé tant que dure la vérification) — l'app disait
//     « En ligne ».
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA FICHE SUIT L'ANNONCE LA PLUS RÉCENTE (serveur, toutes versions)");
const ujs = lire("supabase/functions/update-job-status/index.ts");
ok(/if \(jobRow\?\.platform === "vinted" && jobRow\.action === "publish" && jobRow\.inventaire_id != null\) \{\s+ficheVintedAMettreAJour = jobRow\.inventaire_id;/.test(ujs),
  "une publication Vinted réussie désigne sa fiche");
ok(/const nouvelId = lien\.match\(\/\\\/items\\\/\(\\d\{6,\}\)\/\)\?\.\[1\] \?\? null;/.test(ujs), "l'id lu dans le lien de l'annonce publiée");
ok(/if \(actuel !== nouvelId && \(!actuel \|\| \(\/\^\\d\+\$\/\.test\(actuel\) && BigInt\(actuel\) < BigInt\(nouvelId\)\)\)\) \{/.test(ujs),
  "la fiche prend l'id le PLUS RÉCENT, jamais l'inverse");
ok(/maj = actuel \? maj\.eq\("vinted_item_id", actuel\) : maj\.is\("vinted_item_id", null\);/.test(ujs), "écriture conditionnelle (rien d'écrasé entre lecture et écriture)");
// Le cas réel, à la main : 10067774305 (ancienne) < 10222622571 (nouvelle) → la fiche passe à la nouvelle.
ok(BigInt("10067774305") < BigInt("10222622571"), "jogging : l'ancienne annonce est plus petite — la fiche passe à 10222622571");

console.log("\n2. « REMPLACÉE » SEULEMENT PAR UNE ANNONCE PLUS RÉCENTE (extension 0.6.90)");
const bg = lire("chrome-extension/background.js");
ok(/const ficheSurPlusRecente = idArticle && idJob != null && \/\^\\d\+\$\/\.test\(idArticle\) && \/\^\\d\+\$\/\.test\(String\(idJob\)\)\s+&& BigInt\(idArticle\) > BigInt\(String\(idJob\)\);\s+if \(ficheSurPlusRecente\) \{/.test(bg),
  "fiche sur une annonce plus ANCIENNE : plus de clôture silencieuse — la lecture normale juge (deux lectures, puis la question)");
const remplacee = (fiche, job) => /^\d+$/.test(fiche) && /^\d+$/.test(job) && BigInt(fiche) > BigInt(job);
ok(!remplacee("10067774305", "10222622571"), "jogging de Nico : PAS « remplacée »");
ok(remplacee("10209972080", "7730261249"), "une vraie republication (fiche sur la plus récente) : toujours « remplacée »");

console.log("\n3. « EN VÉRIFICATION CHEZ VINTED » SE DIT");
ok(/en_verification: \/\\\\\?"item_alert_type\\\\\?"\\s\*:\\s\*\\\\\?"delayed_publication\\\\\?"\/\.test\(html\)/.test(bg), "le contrôle des ventes lit le signal de Vinted (même que le retrait)");
const signal = /\\?"item_alert_type\\?"\s*:\s*\\?"delayed_publication\\?"/;
ok(signal.test('{\\"item_alert\\":{\\"item_alert_type\\":\\"delayed_publication\\"}}') && signal.test('"item_alert_type":"delayed_publication"') && !signal.test('"item_alert_type":null'),
  "le signal, en JSON échappé comme en clair");
ok(/patch\.platform_fields = \{ \.\.\.pfV, vinted_en_verification: \{ depuis: pfV\.vinted_en_verification\?\.depuis \?\? new Date\(\)\.toISOString\(\), vu_le: new Date\(\)\.toISOString\(\) \} \};/.test(bg)
   && /const \{ vinted_en_verification: _v, \.\.\.sansV \} = pfV;/.test(bg), "posé tant que Vinted vérifie, retiré dès qu'il a fini");
const st = lire("src/tabs/StockTab.jsx");
ok(/const enVerifVinted = p === "vinted" && online && vintedEnVerification\(latestPubByPlatform\[p\]\);/.test(st)
   && /En vérification chez Vinted — masquée aux acheteurs/.test(st), "l'app : « En vérification chez Vinted — masquée aux acheteurs », plus « En ligne »");
const fn = st.slice(st.indexOf("export function vintedEnVerification"), st.indexOf("export function RemovePlatformsModal"));
const vintedEnVerification = new Function(`${fn.replace("export function", "function")}; return vintedEnVerification;`)();
const T = Date.parse("2026-10-03T12:00:00Z");
ok(vintedEnVerification({ platform: "vinted", platform_fields: { vinted_en_verification: { vu_le: "2026-10-03T11:00:00Z" } } }, T) === true, "vu il y a 1 h : en vérification");
ok(vintedEnVerification({ platform: "vinted", platform_fields: { vinted_en_verification: { vu_le: "2026-09-30T11:00:00Z" } } }, T) === false, "plus de 48 h sans relecture : on ne l'affirme plus");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ annonces Vinted neuves : jamais closes à tort, « en vérification » dit");
