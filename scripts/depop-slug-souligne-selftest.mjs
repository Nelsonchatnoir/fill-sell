// ═══════════════════════════════════════════════════════════════════════════
// DEPOP : LE SLUG PEUT PORTER UN « _ » — `npm run selftest:depop-slug-souligne`
// ═══════════════════════════════════════════════════════════════════════════
// 18/10/2026 (extension 0.6.128). Le slug Depop est « <pseudo>-<mots>-<suffixe> »
// et le pseudo du vendeur peut porter un « _ » : 33 slugs sur 37 d'un même
// compte (thard_733-jean-bonobo-…). La règle /products/([A-Za-z0-9]+-…)
// l'excluait : mesuré en base le 18/10, 71 liens Depop sur 306 n'étaient PAS
// lus (lireEtatDepop → « depop_id_introuvable », idAnnonceDepuisUrl → null,
// capturerArticle → « identifiant Depop inattendu »). Avec [A-Za-z0-9_]+ :
// 306/306, et aucun « _ » n'a été vu après le premier tiret.
// Ce test exécute le VRAI code : content-scripts/depop.js dans un bac à sable
// (après depop-tailles.js, comme Chrome), et background.js dans un vm.
//   node scripts/depop-slug-souligne-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

const DEPOP = lire("chrome-extension/content-scripts/depop.js");
const BG = lire("chrome-extension/background.js");

// ── 1. Le connecteur Depop, exécuté ──────────────────────────────────────────
const ctxD = vm.createContext({ console: { log() {}, warn() {}, error() {}, info() {} }, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
ctxD.globalThis = ctxD;
vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctxD, { filename: "depop-tailles.js" });
vm.runInContext(`${DEPOP}\n;globalThis.__t = { depopSlugDepuisUrl, capturerArticle };`, ctxD, { filename: "depop.js" });
const D = ctxD.__t;

console.log("\n1. depop.js — depopSlugDepuisUrl");
const CAS = [
  ["https://www.depop.com/products/thard_733-jean-bonobo-taille-38-3f2a/", "thard_733-jean-bonobo-taille-38-3f2a", "pseudo avec « _ » (le cas du 18/10)"],
  ["https://www.depop.com/fr/products/thard_733-jean-bonobo-taille-38-3f2a/manage/", "thard_733-jean-bonobo-taille-38-3f2a", "page de gestion /fr/…/manage/"],
  ["https://www.depop.com/products/_thard_-pull-gris-9a1b?ref=x", "_thard_-pull-gris-9a1b", "« _ » en tête et en fin de pseudo, paramètres ignorés"],
  ["https://www.depop.com/products/nicoparis-t-shirt-patagonia-1c2d/", "nicoparis-t-shirt-patagonia-1c2d", "slug sans « _ » : lu comme avant"],
  ["https://www.depop.com/products/create/", null, "/products/create/ n'est pas une annonce"],
  ["https://www.depop.com/products/edit/", null, "/products/edit/ n'est pas une annonce"],
  ["https://www.depop.com/products/thard_733/", null, "pas de tiret : pas un slug"],
  ["https://www.depop.com/products/thard_733-jean-/", null, "jamais un slug qui finit par un tiret"],
];
for (const [url, attendu, quoi] of CAS) {
  const obtenu = D.depopSlugDepuisUrl(url);
  ok(obtenu === attendu, `${quoi} → ${attendu ?? "null"}`, `obtenu : ${obtenu}`);
}
{
  // capturerArticle : la garde d'identifiant laisse passer le « _ » (la
  // requête réseau n'est pas jouée ici : depopJson est remplacé).
  vm.runInContext("depopJson = async () => ({ ok: false, statut: 404 });", ctxD);
  const r1 = await D.capturerArticle("thard_733-jean-bonobo-taille-38-3f2a");
  const r2 = await D.capturerArticle("create");
  ok(r1.error !== "identifiant Depop inattendu" && /fiche Depop illisible/.test(String(r1.error)), "capturerArticle(« thard_733-… ») passe la garde (avant : « identifiant Depop inattendu »)", JSON.stringify(r1));
  ok(r2.error === "identifiant Depop inattendu", "capturerArticle(« create ») est toujours refusé");
}

// ── 2. background.js, exécuté ────────────────────────────────────────────────
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

console.log("\n2. background.js — idAnnonceDepuisUrl et lireEtatDepop");
ok(B.idAnnonceDepuisUrl("depop", "https://www.depop.com/products/thard_733-jean-bonobo-taille-38-3f2a/") === "thard_733-jean-bonobo-taille-38-3f2a",
  "idAnnonceDepuisUrl(depop) lit le slug à « _ » (avant : null → retombée sur l'égalité d'URL)");
ok(B.idAnnonceDepuisUrl("depop", "https://www.depop.com/products/nicoparis-t-shirt-patagonia-1c2d/") === "nicoparis-t-shirt-patagonia-1c2d", "…et le slug sans « _ » comme avant");
ok(B.idAnnonceDepuisUrl("depop", "https://www.depop.com/products/create/") === null, "…jamais /products/create/");
{
  // Sans onglet Depop, lireEtatDepop s'arrête plus loin — mais plus jamais
  // sur « depop_id_introuvable » pour un slug à « _ ».
  B.ongletDepopPret = async () => ({ tabId: null, motif: "aucun_onglet" });
  const r1 = await B.lireEtatDepop("https://www.depop.com/products/thard_733-jean-bonobo-taille-38-3f2a/");
  const r2 = await B.lireEtatDepop("https://www.depop.com/products/create/");
  ok(r1.raison !== "depop_id_introuvable" && r1.state === "unknown", "lireEtatDepop(« thard_733-… ») : le slug est lu (raison « " + r1.raison + " », jamais « depop_id_introuvable »)");
  ok(r2.raison === "depop_id_introuvable", "lireEtatDepop(/products/create/) : toujours « depop_id_introuvable »");
}

console.log("\n3. Ancres — plus aucune règle de slug sans « _ »");
ok(!/products\\\/\(\[A-Za-z0-9\]\+-/.test(BG) && !/products\\\/\(\[A-Za-z0-9\]\+-/.test(DEPOP), "aucun /products/([A-Za-z0-9]+-… restant (background.js, depop.js)");
ok((BG.match(/\/\\\/products\\\/\(\[A-Za-z0-9_\]\+-\[A-Za-z0-9-\]\*\[A-Za-z0-9\]\)\(\?:\[\/\?#\]\|\$\)\//g) ?? []).length === 2, "background.js : veilleur (lireEtatDepop) et idAnnonceDepuisUrl portent [A-Za-z0-9_]+");
ok(/\/\^\[A-Za-z0-9_\]\+-\[A-Za-z0-9-\]\*\[A-Za-z0-9\]\$\/\.test\(String\(slug \?\? ""\)\)/.test(DEPOP), "depop.js : la garde de capturerArticle porte [A-Za-z0-9_]+");

console.log(`\n${n - ko}/${n} vérifications`);
if (ko) { console.log(`✗ ${ko} échec(s)`); process.exit(1); }
console.log("✓ selftest depop-slug-souligne : OK");
