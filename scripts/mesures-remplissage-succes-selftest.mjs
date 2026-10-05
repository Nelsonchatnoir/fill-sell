// ── AUTOTEST : MESURES DU REMPLISSAGE VINTED QUAND LA PUBLICATION RÉUSSIT (05/10, point 9)
// Avant : remplissage_mesures n'était écrit que sur échec ou reprise — une
// publication réussie (canal coupé par la redirection de succès) ou une
// republication ne les emportait jamais : impossible de vérifier chez Carla et
// Ciddjy après la 0.6.97. Ce fichier charge background.js et vinted.js et
// verrouille : (1) mesures rendues → jointes au job ; (2) canal coupé →
// l'instantané envoyé AVANT le clic tient lieu de mesure ; (3) une valeur d'un
// essai précédent ne parle jamais pour celui-ci ; (4) republication : reportées
// sur pf, que toutes les écritures envoient.
//   node scripts/mesures-remplissage-succes-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
let echecs = 0;
const ok = (titre, condition, detail = "") => {
  if (condition) { console.log(`  ✓ ${titre}`); return; }
  echecs += 1;
  console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ""}`);
};

const memoire = {};
function charger() {
  const rien = { addListener: () => {} };
  const local = {
    get: async (k) => (typeof k === "string" ? { [k]: memoire[k] } : { ...memoire }),
    set: async (o) => { Object.assign(memoire, JSON.parse(JSON.stringify(o))); },
    remove: async (k) => { delete memoire[k]; },
  };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }),
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
                 lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local, session: aire(), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }),
              remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] },
      cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
      notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return ctx;
}

const ctx = charger();
const M1 = { total_ms: 41000, etapes: [], rattrapees: 2 };
const C1 = { choisi: "8", source: "choix" };

console.log("\n── MESURES DU REMPLISSAGE VINTED ─────────────────────────────────");
console.log("\n1. Résultat rendu : mesures jointes à la copie du job");
ctx.envoyerFillListingBrut = async () => ({ success: true, remplissage_mesures: M1, colis_bilan: C1 });
const j1 = { id: "j1", platform_fields: { remplissage_mesures: { total_ms: 999999 }, autre: 1 } };
await ctx.envoyerFillListing(1, j1);
ok("mesures du NOUVEL essai jointes", j1.platform_fields.remplissage_mesures?.total_ms === 41000 && j1.platform_fields.colis_bilan?.choisi === "8");
ok("les autres champs restent", j1.platform_fields.autre === 1);

console.log("\n2. Canal coupé par la redirection de succès : l'instantané d'avant le clic");
ctx.envoyerFillListingBrut = async (_t, job) => {
  ctx.noterMesuresAvantSoumission(String(job.id), { ...M1, avant_soumission: true }, C1);
  throw new Error("canal coupé");
};
const j2 = { id: "j2", platform_fields: { remplissage_mesures: { total_ms: 5 } } };
let leve = false;
try { await ctx.envoyerFillListing(1, j2); } catch { leve = true; }
ok("l'erreur remonte telle quelle (le chemin de succès canal coupé est inchangé)", leve);
ok("l'instantané est joint (avant_soumission)", j2.platform_fields.remplissage_mesures?.avant_soumission === true && j2.platform_fields.remplissage_mesures?.total_ms === 41000);

console.log("\n3. Aucun résultat, aucun instantané : la valeur d'un essai précédent ne survit pas");
ctx.envoyerFillListingBrut = async () => { throw new Error("Timeout: rien"); };
const j3 = { id: "j3", platform_fields: { remplissage_mesures: { total_ms: 123 }, colis_bilan: { x: 1 }, garde: true } };
try { await ctx.envoyerFillListing(1, j3); } catch { /* attendu */ }
ok("mesures et bilan hérités retirés", !("remplissage_mesures" in j3.platform_fields) && !("colis_bilan" in j3.platform_fields) && j3.platform_fields.garde === true);
ok("un instantané d'un AUTRE job ne se mélange pas", (() => { ctx.noterMesuresAvantSoumission("autre", M1, null); return !("remplissage_mesures" in j3.platform_fields); })());

console.log("\n4. Republication : reportées sur pf (succès, rapprochement, reprise, question)");
const pf = { republish_step: "captured", remplissage_mesures: { total_ms: 7 } };
ctx.reporterMesuresRemplissage(pf, { platform_fields: { remplissage_mesures: M1, colis_bilan: C1 } });
ok("pf reçoit les mesures de la recréation", pf.remplissage_mesures?.total_ms === 41000 && pf.colis_bilan?.choisi === "8" && pf.republish_step === "captured");
const pf2 = { remplissage_mesures: { total_ms: 7 }, colis_bilan: { y: 1 } };
ctx.reporterMesuresRemplissage(pf2, { platform_fields: {} });
ok("sans mesure ce coup-ci : la vieille valeur part", !("remplissage_mesures" in pf2) && !("colis_bilan" in pf2));

console.log("\n5. Le content script envoie l'instantané AVANT le clic « Publier »");
const V = fs.readFileSync(path.join(DOSSIER, "content-scripts", "vinted.js"), "utf8");
const iClic = V.indexOf("publishBtn.click();");
const iInst = V.lastIndexOf("envoyerInstantaneMesures(job?.id)", iClic);
ok("envoyerInstantaneMesures juste avant publishBtn.click()", iInst > 0 && iClic - iInst < 200);
ok("message FILLSELL_FILL_MESURES écouté par le background", fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8").includes("msg?.type === \"FILLSELL_FILL_MESURES\""));
ok("deux reports dans la republication (une passe, recréation)", (fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8").split("reporterMesuresRemplissage(pf, jobRecreation);").length - 1) === 2);

if (echecs) { console.log(`
✗ ${echecs} échec(s)`); process.exit(1); }
console.log("\n✓ mesures du remplissage Vinted écrites quand la publication réussit, jamais héritées");
