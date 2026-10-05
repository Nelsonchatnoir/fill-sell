// ═══════════════════════════════════════════════════════════════════════════
// SONDE VINTED : UN 401 N'EST PAS UNE DÉCONNEXION (05/10)
// ═══════════════════════════════════════════════════════════════════════════
// Mesuré le 05/10 : le jeton d'accès Vinted vit 1 h ; la page le renouvelle
// par POST /web/api/auth/refresh. Le service worker, lui, lisait le compte
// avec un jeton expiré et prenait un 401 — sept comptes connectés vus « 401 ».
// Vérifie, sans réseau :
//   1. sonde du service worker : 401 + cookie de connexion v_uid → connectée ;
//      401 sans v_uid → indéterminé (jamais « déconnecté ») ; 200 → connectée ;
//   2. onglet (content script) : un 401 sur l'API renouvelle le jeton comme la
//      page, puis rejoue la requête UNE fois ; un second 401 reste un 401.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
let echecs = 0;
const ok = (titre, condition, detail = "") => {
  if (condition) console.log(`  ✓ ${titre}`);
  else { echecs += 1; console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ""}`); }
};
const rien = { addListener: () => {} };

function chargerBackground({ statutVinted, cookieVuid }) {
  const appels = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, TextEncoder, TextDecoder,
    AbortController, Response, Headers,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async (url) => {
      appels.push(String(url));
      if (String(url).startsWith("https://www.vinted.fr/api/v2/users/current")) {
        return { ok: statutVinted === 200, status: statutVinted, url: String(url),
          json: async () => ({ user: { id: 42, login: "nico", country_code: "FR", locale: "fr" } }) };
      }
      return { ok: false, status: 599, url: String(url), json: async () => ({}), text: async () => "" };
    },
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien, lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, session: { get: async () => ({}), set: async () => {}, remove: async () => {} }, onChanged: rien },
      tabs: { onRemoved: rien, onUpdated: rien, query: async () => [] },
      windows: { onRemoved: rien },
      scripting: { executeScript: async () => [] },
      cookies: {
        get: async ({ name }) => (name === "v_uid" && cookieVuid ? { name: "v_uid", value: "12345" } : null),
        getAll: async () => [],
      },
      permissions: { contains: async () => false },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
    },
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  return { ctx, appels };
}

console.log("\n1. Sonde du service worker (Vinted seule)");
{
  const { ctx } = chargerBackground({ statutVinted: 401, cookieVuid: true });
  const r = await ctx.probePlatformSessions(["vinted"]);
  ok("401 + cookie de connexion → connectée", r.vinted === true, JSON.stringify({ v: r.vinted, h: r.http?.vinted }));
  ok("… et le code dit pourquoi, pas un 401 nu", r.http?.vinted === "jeton_expire_session_ouverte", String(r.http?.vinted));
  ok("… sans inventer d'identité", r.vinted_identite == null);
}
{
  const { ctx } = chargerBackground({ statutVinted: 401, cookieVuid: false });
  const r = await ctx.probePlatformSessions(["vinted"]);
  ok("401 sans cookie de connexion → indéterminé, JAMAIS « déconnecté »", r.vinted === null && r.vinted !== false, JSON.stringify({ v: r.vinted, h: r.http?.vinted }));
}
{
  const { ctx } = chargerBackground({ statutVinted: 200, cookieVuid: true });
  const r = await ctx.probePlatformSessions(["vinted"]);
  ok("200 → connectée, avec l'identité lue", r.vinted === true && r.vinted_identite?.login === "nico", JSON.stringify(r.vinted_identite));
}

console.log("\n2. Onglet Vinted : un 401 renouvelle le jeton comme la page, puis rejoue UNE fois");
function chargerContentScript(reponses) {
  const appels = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, AbortController,
    location: { href: "https://www.vinted.fr/", hostname: "www.vinted.fr", origin: "https://www.vinted.fr", pathname: "/" },
    document: { cookie: "", querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, readyState: "complete", body: null, documentElement: {} },
    window: {}, navigator: { userAgent: "test" },
    MutationObserver: class { observe() {} disconnect() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, postMessage() {},
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } }, Event: class { constructor(t) { this.type = t; } },
    fetch: async (url, init = {}) => {
      appels.push(`${init.method ?? "GET"} ${url}`);
      const s = reponses.shift() ?? 599;
      return { ok: s >= 200 && s < 300, status: s, text: async () => '{"user":{"id":42,"login":"nico"}}', json: async () => ({ user: { id: 42, login: "nico" } }) };
    },
    chrome: { runtime: { onMessage: rien, sendMessage: () => {}, id: "selftest", getURL: (p) => p } },
  };
  ctx.globalThis = ctx; ctx.self = ctx; ctx.window = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "content-scripts", "vinted.js"), "utf8"), contexte, { filename: "vinted.js" });
  return { ctx, appels };
}
{
  const { ctx, appels } = chargerContentScript([401, 200, 200]);
  const r = await ctx.fetchBorne("/api/v2/users/current", { credentials: "include" });
  ok("jeton expiré, session ouverte → la lecture aboutit (200)", r.status === 200, String(r.status));
  ok("renouvellement fait par POST /web/api/auth/refresh, puis la requête rejouée", appels.join(" | ") === "GET /api/v2/users/current | POST /web/api/auth/refresh | GET /api/v2/users/current", appels.join(" | "));
}
{
  const { ctx, appels } = chargerContentScript([401, 401]);
  const r = await ctx.fetchBorne("/api/v2/users/current", { credentials: "include" });
  ok("session vraiment fermée (renouvellement refusé) → 401 rendu, sans boucle", r.status === 401 && appels.length === 2, appels.join(" | "));
}
{
  const { ctx, appels } = chargerContentScript([401, 200, 401]);
  const r = await ctx.fetchBorne("/api/v2/users/current", { credentials: "include" });
  ok("un seul rejeu, jamais deux", r.status === 401 && appels.length === 3, appels.join(" | "));
}
{
  const { ctx, appels } = chargerContentScript([401]);
  const r = await ctx.fetchBorne("/items/123", { credentials: "include" });
  ok("une page (hors API) n'est jamais rejouée", r.status === 401 && appels.length === 1, appels.join(" | "));
}

console.log("");
if (echecs) { console.error(`✗ ${echecs} vérification(s) en échec`); process.exit(1); }
console.log("✓ sonde Vinted : un compte connecté n'est plus jamais vu déconnecté");
