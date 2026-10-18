// ── AUTOTEST : LE PC RESTE ÉVEILLÉ TANT QU'IL RESTE UN JOB (18/10/2026) ─────
// Décision de Nico (chantier « zéro friction », point A) : l'extension garde le
// PC éveillé tant qu'il reste UN job en attente ou en cours, SANS plafond de
// 4 h ; elle ne relâche que quand la file est vide. Filets gardés : plus de
// session, 2 h sans un seul poll réussi, démarrage du service worker.
// Ce fichier CHARGE background.js dans un vm (même patron que
// capture-fraicheur-selftest.mjs) et compte les vrais appels chrome.power.
//   node scripts/eveil-file-selftest.mjs
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

const appels = { demande: 0, relache: 0 };
const stockage = {};
function charger() {
  const rien = { addListener: () => {} };
  const aire = (m) => ({
    get: async (k) => (typeof k === "string" ? { [k]: m[k] } : { ...m }),
    set: async (o) => { Object.assign(m, o); },
    remove: async (k) => { delete m[k]; },
  });
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
      storage: { local: aire(stockage), session: aire({}), onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }),
              remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }) },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] },
      cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => { appels.demande++; }, releaseKeepAwake: () => { appels.relache++; } },
      notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return ctx;
}
const ctx = charger();
await new Promise((r) => setTimeout(r, 50)); // le filet de démarrage (asynchrone) passe
const SOURCE = fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8");
const CLE = SOURCE.includes("FILLSELL_CONFIG.STORAGE_KEYS.KEEP_AWAKE") ? ctx.FILLSELL_CONFIG?.STORAGE_KEYS?.KEEP_AWAKE ?? "fillsell_keep_awake" : "fillsell_keep_awake";
const vieillir = (h) => { const ep = stockage[CLE]; if (ep) { ep.depuis = new Date(Date.now() - h * 3_600_000).toISOString(); ep.maj = new Date(Date.now() - h * 3_600_000).toISOString(); } };

console.log("\n── LE PC RESTE ÉVEILLÉ TANT QU'IL RESTE UN JOB ───────────────");
console.log("\n1. Plus de plafond de 4 h (décision de Nico, 18/10)");
ok("aucune trace du plafond dans le code (EVEIL_PLAFOND_MS, relache_plafond)", !/EVEIL_PLAFOND_MS|relache_plafond|eveilPlafondAtteint/.test(SOURCE));
ok("le filet de durée est l'absence de poll : 2 h", /const EVEIL_SANS_POLL_MS = 2 \* 60 \* 60 \* 1000;/.test(SOURCE));
{
  appels.demande = 0; appels.relache = 0;
  await ctx.arbitrerEveil(3, null);
  ok("une file de 3 jobs → éveil demandé", appels.demande === 1 && Boolean(stockage[CLE]), JSON.stringify(appels));
  // Le lot tourne depuis 5 h, chaque poll a rafraîchi l'épisode il y a 2 min.
  stockage[CLE].depuis = new Date(Date.now() - 5 * 3_600_000).toISOString();
  stockage[CLE].maj = new Date(Date.now() - 2 * 60_000).toISOString();
  const avant = appels.relache;
  await ctx.arbitrerEveil(40, null);
  ok("5 h plus tard, 40 jobs en file → TOUJOURS éveillé (avant : relâché à 4 h)", appels.relache === avant && Boolean(stockage[CLE]));
  await ctx.arbitrerEveil(1, null);
  ok("un seul job en file → toujours éveillé", appels.relache === avant && Boolean(stockage[CLE]));
}
console.log("\n2. La file vide relâche, tout de suite");
{
  const avant = appels.relache;
  await ctx.arbitrerEveil(0, null);
  ok("file vide → relâché, épisode effacé", appels.relache === avant + 1 && !stockage[CLE]);
}
console.log("\n3. Le filet : 2 h sans un seul poll réussi");
{
  await ctx.arbitrerEveil(5, null);
  const avant = appels.relache;
  vieillir(0.5);
  await ctx.relacherEveilSiSansPoll(null);
  ok("serveur injoignable depuis 30 min → on garde l'éveil (la file est peut-être pleine)", appels.relache === avant && Boolean(stockage[CLE]));
  vieillir(2.5);
  await ctx.relacherEveilSiSansPoll(null);
  ok("2 h 30 sans poll réussi → relâché", appels.relache === avant + 1 && !stockage[CLE]);
  ok("le poll en échec (401, 5xx) passe par ce filet", (SOURCE.match(/await relacherEveilSiSansPoll\(/g) ?? []).length >= 2);
  ok("sans session : relâche immédiate, comme avant", /Pas de session valide, poll ignoré[\s\S]{0,600}await relacherEveil\("relache", 0, null\);/.test(SOURCE));
}
console.log("\n4. Un job EN COURS tient la machine (long cycle, publication du popup)");
ok("entre deux jobs du cycle, l'éveil est redemandé (l'épisode se rafraîchit)", /await demanderEveil\(jobs\.length - i, null\)\.catch\(\(\) => \{\}\);\s*const outcome = await processJob\(job, session\.access_token\);/.test(SOURCE));
ok("une publication lancée du popup demande l'éveil", /async function publishSelectedUnlocked\(jobIds\) \{[\s\S]{0,300}demanderEveil\(/.test(SOURCE));
console.log("\n5. Le serveur compte TOUTE la file de CE poste (get-pending-jobs)");
{
  const GPJ = fs.readFileSync(path.join(RACINE, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
  const bloc = GPJ.slice(GPJ.indexOf("const heldBacklog = "), GPJ.indexOf("const travailRetenu = "));
  ok("plus de borne « imminent » (next_action_after ≤ +15 min)", !/15 \* 60_000/.test(bloc) && !/next_action_after/.test(bloc));
  ok("une pause anti-robot compte (sa sonde a besoin d'un poste éveillé)", !/idsAntirobot/.test(bloc));
  ok("seuls les jobs d'un AUTRE poste sont exclus", /return !idsAutrePoste\.has\(String\(j\.id\)\);/.test(bloc));
  ok("les jobs laissés à l'autre poste et ceux qu'il a réservés y sont rangés",
    /idsAutrePoste\.add\(id\)/.test(GPJ) && /if \(!idsPris\.has\(String\(j\.id\)\)\) idsAutrePoste\.add\(String\(j\.id\)\)/.test(GPJ));
  ok("le compte part dans jobs_retenus_sync (lu par toutes les versions)", /sync_prioritaire: travailRetenu > 0,\s*jobs_retenus_sync: travailRetenu,/.test(GPJ));
}
console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ éveil tant qu'il reste un job — tout est vert");
process.exit(echecs ? 1 : 0);
