// ═══════════════════════════════════════════════════════════════════════════
// TITRE VINTED « TROP DE SYMBOLES » : CORRIGÉ SEUL, AVANT LE DÉPÔT
//   `npm run selftest:titre-symboles-vinted-extension`
// ═══════════════════════════════════════════════════════════════════════════
// 18/10/2026 (extension 0.6.128), décision de Nico : Vinted refuse « Le titre
// contient trop de symboles d'affilée » ; on ne pose plus de question — les
// symboles en trop partent avant le dépôt, les mots et la marque restent.
// La règle (même que le serveur, _shared/titre-symboles-vinted.js) :
//   R1 « — » « ― » → « - » ; R2 « … » et « ... » (ou plus) retirés ;
//   R3 un « – » collé à un autre symbole (espaces ignorés) → « - » ;
//   R4 suite de 3 symboles ou plus (espaces ignorés) : guillemets/parenthèses
//      et premier séparateur gardés, le reste retiré ;
//   marque masquée puis restituée ; idempotent ; lettres/chiffres intouchés.
// Ce test exécute le VRAI background.js (vm) : assagirSymbolesVinted,
// sanitizeJob (publication ET recréation), construireJobRecreation (le titre
// réécrit par la personne, pf.titre_saisi, passe avant le titre capturé).
//   node scripts/titre-symboles-vinted-extension-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

function chargerBackground() {
  const rien = { addListener: () => {} };
  const aire = (m) => ({ get: async (k) => (typeof k === "string" ? { [k]: m[k] } : { ...m }), set: async (o) => { Object.assign(m, o); }, remove: async (k) => { delete m[k]; } });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"), btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire({}), session: aire({}), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }), remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] }, cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} }, notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return ctx;
}
const B = chargerBackground();
await new Promise((r) => setTimeout(r, 30));
const assagir = (t, marque = null) => B.assagirSymbolesVinted(t, { marque });
const alnum = (s) => [...String(s).normalize("NFC")].filter((c) => /[\p{L}\p{N}]/u.test(c)).join("");

console.log("\n1. Les refus réels de Vinted — corrigés");
const REFUSES = [
  // [entrée, attendu, d'où]
  ['Hoodie Streetwear "Gangs / Security" – Motif Bandana Paisley – Taille S',
   'Hoodie Streetwear "Gangs / Security" - Motif Bandana Paisley – Taille S', "R3 : « – » collé au guillemet → « - » ; l'autre « – » (entre deux mots) reste"],
  ["TEST FillSell — Paris 2024 — ne pas acheter", "TEST FillSell - Paris 2024 - ne pas acheter", "R1 : « — » → « - »"],
  ["TEST FILLSELL — ne pas acheter (sera retiré)", "TEST FILLSELL - ne pas acheter (sera retiré)", "R1 (titre réel en base)"],
  ["Une, deux, trois... Princesses tome 6 – À l'école du royaume", "Une, deux, trois Princesses tome 6 – À l'école du royaume", "R2 : « ... » retiré, « – » entre deux mots gardé"],
  ["Une, deux, trois... Princesses tome 6 - À l'école du royaume", "Une, deux, trois Princesses tome 6 - À l'école du royaume", "R2 (titre réel en base, tiret simple)"],
  // Le cas « Tracteur … Bruder » donné en abrégé : le vrai titre (job en attente, marque Bruder).
  ["Tracteur Claas avec remorque et chargeur frontal Bruder — Neuf en boîte", "Tracteur Claas avec remorque et chargeur frontal Bruder - Neuf en boîte", "R1 (titre réel, marque Bruder)"],
  ["Tracteur … Bruder — Neuf en boîte", "Tracteur Bruder - Neuf en boîte", "R1 + R2 sur la forme abrégée (« … » est retiré par R2)"],
  ["Robe Zara !!! neuve ??? taille M", "Robe Zara ! neuve ? taille M", "R4 : suite de 3 symboles → le premier séparateur gardé"],
  ['Jean "Levi\'s" -- !! (W32)', 'Jean "Levi\'s" - (W32)', "R4 : guillemets et parenthèses gardés, le premier séparateur aussi"],
  ["Pull trois…Princesses", "Pull trois Princesses", "R2 : « … » qui collait deux mots → une espace (jamais deux mots collés)"],
  ["Livre « Le Petit Prince » – Folio", "Livre « Le Petit Prince » - Folio", "R3 : « – » collé au « » » → « - » (le guillemet reste)"],
  ["Montre Casio A158 (rétro) – neuve", "Montre Casio A158 (rétro) - neuve", "R3 : « – » collé à la parenthèse → « - »"],
];
for (const [entree, attendu, quoi] of REFUSES) {
  const marque = /Bruder/.test(entree) ? "Bruder" : null;
  const obtenu = assagir(entree, marque);
  ok(obtenu === attendu, `${quoi}\n      « ${entree} » → « ${attendu} »`, `obtenu : « ${obtenu} »`);
}

console.log("\n2. Les titres acceptés par Vinted — jamais touchés");
// Relevés en base le 18/10 : les seuls titres publiés/vendus (sur 70 555) où
// une lecture large voit des symboles voisins — ½ ⅓ sont des CHIFFRES.
const ACCEPTES = [
  "Chemise HUGO Hugo Boss Slim Fit Easy Iron Bleu Rayée Homme Taille 44 / 17½ – XL – Authentique",
  "Adidas Stan Smith beige / crème cuir – Taille 41⅓ – Bon état",
  "Adidas Originals New York vert/blanc – 41 ⅓ – neuves avec boîte",
  "Gomme de musculation pour la mâchoire – Jaw Trainer",
  'Robe (taille M) - "Zara"',
  "T-shirt 100% coton – taille L",
  "Lot 3 + 2 / neuf",
  "Jean Levi's 501 W32 L34",
  "Pull Abercrombie & Fitch – M",
  "Veste A.P.C. taille M",
  "Livre « Le Petit Prince » - Folio",
  "Montre Casio A158 (rétro) neuve – boîte",
];
for (const t of ACCEPTES) ok(assagir(t) === t, `inchangé : « ${t} »`, `obtenu : « ${assagir(t)} »`);

console.log("\n3. La marque est masquée, puis restituée");
ok(assagir("T-shirt Yes!!! taille M") === "T-shirt Yes! taille M", "sans marque connue : « Yes!!! » est une suite de 3 symboles (R4)");
ok(assagir("T-shirt Yes!!! taille M", "Yes!!!") === "T-shirt Yes!!! taille M", "marque « Yes!!! » : jamais touchée");
ok(assagir("Veste A.P.C. -- taille M", "A.P.C.") === "Veste A.P.C. -- taille M", "marque « A.P.C. » : ses points ne comptent pas dans la suite (« -- » seuls : 2 symboles)");
ok(assagir("Veste A.P.C. -- taille M") === "Veste A.P.C. taille M", "…sans la marque, « . -- » fait 3 symboles (R4)");
ok(assagir("Sac C&A — neuf", "c&a") === "Sac C&A - neuf", "masque insensible à la casse, la casse du titre est restituée");

console.log("\n4. Idempotent ; lettres, chiffres, accents jamais touchés");
for (const [entree] of REFUSES) {
  const marque = /Bruder/.test(entree) ? "Bruder" : null;
  const une = assagir(entree, marque);
  ok(assagir(une, marque) === une, `idempotent : « ${une} »`);
  ok(alnum(une) === alnum(entree), `mêmes lettres et chiffres : « ${entree.slice(0, 40)}… »`, `${alnum(entree)} ≠ ${alnum(une)}`);
}
ok(assagir("") === "" && assagir(null) === "" && assagir("   ") === "", "vide reste vide");

console.log("\n5. sanitizeJob — Vinted seulement, publication ET recréation");
{
  const j = B.sanitizeJob({ platform: "vinted", title: 'Hoodie Streetwear "Gangs / Security" – Motif Bandana Paisley – Taille S ✨', platform_fields: { marque: "Gang" } });
  ok(j.title === 'Hoodie Streetwear "Gangs / Security" - Motif Bandana Paisley – Taille S', "Vinted : emoji retirés PUIS symboles assagis (cas réel needs_user, marque « Gang »)", j.title);
  const l = B.sanitizeJob({ platform: "leboncoin", title: "TEST FillSell — Paris 2024 — ne pas acheter" });
  ok(l.title === "TEST FillSell — Paris 2024 — ne pas acheter", "Leboncoin : la règle Vinted ne s'applique pas", l.title);
  const inchange = { platform: "vinted", title: "Jean Levi's 501 W32 L34", platform_fields: {} };
  ok(B.sanitizeJob(inchange) === inchange, "titre déjà sage : le job est rendu tel quel (même objet)");
  const marqueBrand = B.sanitizeJob({ platform: "vinted", title: "T-shirt Yes!!! taille M", platform_fields: { brand: "Yes!!!" } });
  ok(marqueBrand.title === "T-shirt Yes!!! taille M", "la marque se lit aussi dans platform_fields.brand");
}

console.log("\n6. construireJobRecreation — le titre saisi passe avant le titre capturé");
{
  const cap = { payload: { titre: "TEST FillSell — Paris 2024 — ne pas acheter", description: "d", natif: {} }, libelles: {}, photos_urls: ["https://x/1.jpg"] };
  const job = { id: "j1", title: "titre du job", inventaire_id: 7 };
  const r1 = B.construireJobRecreation(job, { vinted_account_id: "31995881" }, cap, 999);
  ok(r1.title === "TEST FillSell - Paris 2024 - ne pas acheter", "sans titre saisi : le titre capturé, assagi (recréation comprise)", r1.title);
  const r2 = B.construireJobRecreation(job, { vinted_account_id: "31995881", titre_saisi: "  TEST FillSell  Paris 2024 ne pas acheter " }, cap, 999);
  ok(r2.title === "TEST FillSell Paris 2024 ne pas acheter", "titre saisi par la personne : il passe AVANT le titre capturé (espaces normalisés)", r2.title);
  const long = "Mot ".repeat(40).trim();
  const r3 = B.construireJobRecreation(job, { titre_saisi: long }, cap, 999);
  ok(r3.title.length <= 100 && !r3.title.endsWith(" ") && long.startsWith(r3.title), "titre saisi trop long : coupé au dernier mot entier, à 100", `${r3.title.length} : ${r3.title}`);
  ok(B.titreSaisiRecreation({}) === "" && B.titreSaisiRecreation({ titre_saisi: "   " }) === "", "aucun titre saisi → \"\" (le titre capturé reste)");
}

console.log("\n7. Ancres");
const BG = fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8");
ok(/const sage = assagirSymbolesVinted\(title, \{ marque: pfT\.marque \?\? pfT\.brand \?\? null \}\);/.test(BG), "sanitizeJob appelle la règle pour Vinted, marque de platform_fields");
ok(/title: titreSaisi \|\| \(cap\.payload\?\.titre \?\? job\.title \?\? ""\),/.test(BG), "construireJobRecreation : titre_saisi d'abord");
ok(/const saisiR = titreSaisiRecreation\(j\.platform_fields\);/.test(BG), "la réserve de la sync compare au même titre que la copie");
{
  const corps = (s) => s.replace(/\s+/g, " ").trim();
  const mod = extraireFonctionJs(BG, "titreSaisiRecreation");
  const fab = extraireFonctionJs(BG, "construireJobRecreation");
  const iife = fab.match(/const titreSaisi = \(\(\) => \{([\s\S]*?)\}\)\(\);/)?.[1] ?? "";
  ok(iife && corps(iife) === corps(mod.slice(mod.indexOf("{") + 1, mod.lastIndexOf("}"))), "la copie du corps dans construireJobRecreation est IDENTIQUE à titreSaisiRecreation");
}

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`✗ ${ko} échec(s)`); process.exit(1); }
console.log("✓ selftest titre-symboles-vinted-extension : OK");
