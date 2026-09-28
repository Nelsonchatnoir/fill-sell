// ═══════════════════════════════════════════════════════════════════════════
// UN LIVRE SUR LE MAQUILLAGE N'EST PAS UN COSMÉTIQUE (0.6.78, 28/09)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS, xxewwer (Pro), job 28f1b00e : « Maquillage Fabienne Sévigné Francis
// Giacobetti Livre Relié AGEP », annonce 3238655837 en ligne et acceptée par
// Leboncoin en Loisirs > Livres. Republication : retrait à 21:09, puis 4
// redépôts refusés AVANT navigation par lbcProduitInterdit — le seul mot
// « Maquillage » du titre. Annonce hors ligne, message « rien à faire ».
//
// Ce fichier CHARGE background.js (vm) et verrouille :
//   1. la garde juge d'abord la catégorie : résolue hors Divers > Autres (où
//      l'app range seule les cosmétiques), ce n'est pas un cosmétique ;
//   2. sans catégorie, ou en Divers > Autres, la garde d'avant reste entière ;
//   3. elle tourne AVANT le retrait, sur le job exact du redépôt ;
//   4. après un retrait, une garde qui refuse le redépôt n'est plus présentée
//      comme une panne passagère (garde_depot).
//
//   node scripts/lbc-garde-cosmetique-categorie-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
let ko = 0;
const ok = (titre, c, detail = "") => { console.log(`  ${c ? "✓" : "✗"} ${titre}${!c && detail ? ` — ${detail}` : ""}`); if (!c) ko++; };

function chargerBackground() {
  const rien = { addListener: () => {} };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
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
      storage: { local: aire(), session: aire(), onChanged: rien },
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
const bg = chargerBackground();
const LIVRE = "Maquillage Fabienne Sévigné Francis Giacobetti Livre Relié AGEP";
const job = (title, lbcCategoryPath, extra = {}) => ({
  id: "j", platform: "leboncoin", action: "publish", title,
  platform_fields: { ...(lbcCategoryPath ? { lbcCategoryPath } : {}), republish_recreation: true, ...extra },
});

console.log("\n1. La catégorie d'abord");
ok("cas réel : le livre en Loisirs > Livres passe (plus aucun blocage au redépôt)", bg.precheckJob(job(LIVRE, ["Loisirs", "Livres"])) === null,
  bg.precheckJob(job(LIVRE, ["Loisirs", "Livres"])));
ok("un parfum rangé en Divers > Autres reste refusé", /interdit la vente de cosmétiques/.test(bg.precheckJob(job("Parfum Chanel N°5 100 ml", ["Divers", "Autres"])) ?? ""));
ok("le même livre rangé en Divers > Autres reste refusé (rien n'est présumé)", /interdit la vente/.test(bg.precheckJob(job(LIVRE, ["Divers", "Autres"])) ?? ""));
ok("« Divers » seul vaut Divers > Autres", /interdit la vente/.test(bg.precheckJob(job("Mascara waterproof", ["Divers"])) ?? ""));
ok("sans catégorie, la garde d'avant est entière", /interdit la vente/.test(bg.precheckJob(job("Rouge à lèvres Dior", null)) ?? ""));
ok("le veto non consommable tient toujours (trousse en Divers > Autres)", !/interdit la vente/.test(bg.precheckJob(job("Trousse de maquillage", ["Divers", "Autres"])) ?? ""));
ok("accents et casse de la catégorie sans effet", bg.precheckJob(job(LIVRE, ["LOISIRS", "Livres"])) === null
  && /interdit la vente/.test(bg.precheckJob(job("Parfum Chanel", ["DIVERS", "Autres"])) ?? ""));
ok("un retrait n'est jamais bloqué par cette garde", bg.precheckJob({ ...job("Parfum Chanel", ["Divers", "Autres"]), action: "delete" }) === null);

console.log("\n2. Les gardes du redépôt passent avant le retrait");
{
  const src = fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8");
  const debut = src.indexOf("async function processRepublishJobPlateforme");
  const corps = src.slice(debut, src.indexOf("\nasync function ", debut + 50));
  const iGarde = corps.indexOf("const blocage = precheckJob(jobRedepot);");
  const iRetrait = corps.indexOf("await executerRetraitViaHandler(job, accessToken)");
  ok("precheckJob sur le job du redépôt, AVANT le retrait", iGarde > 0 && iRetrait > 0 && iGarde < iRetrait);
  ok("même forme que le redépôt (publish, sans URL, republish_recreation)",
    /const jobRedepot = \{ \.\.\.job, action: "publish", listing_url: null, platform_listing_id: null,\s*platform_fields: \{ \.\.\.pf, republish_recreation: true \} \};/.test(corps));
  ok("refus : needs_user, annonce toujours en ligne, garde tracée", /prevol_gardes/.test(corps) && /AVANT tout retrait, ton annonce est toujours en ligne/.test(corps));
  ok("après un retrait, un refus de garde est nommé garde_depot, sans promesse de reprise",
    /const blocageRedepot = precheckJob\(jobRecreation\);[\s\S]{0,300}?pf\.needs_user_source = "garde_depot";/.test(corps)
    && /Une nouvelle tentative automatique n'y changerait rien/.test(corps));
}

console.log(ko ? `\n${ko} échec(s).` : "\nGarde cosmétiques Leboncoin : catégorie d'abord, avant le retrait, jamais « rien à faire » sur un refus certain.");
process.exit(ko ? 1 : 0);
