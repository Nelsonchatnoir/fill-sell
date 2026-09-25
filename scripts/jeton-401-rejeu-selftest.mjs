// ── AUTOTEST : UN 401 APRÈS UNE VEILLE SE REJOUE UNE FOIS (0.6.67, 25/09) ───
// Le cas de MeMiniandMove, nuit du 24 au 25/09 : son Mac s'endort au milieu
// d'un cycle ; au réveil (06:07), la capture de la republication de tête part
// avec le jeton du cycle, expiré depuis 04:49 → 401 → rien d'écrit, le job est
// resservi puis regelé. Correctif : callEdgeFunction et restRequest relisent
// la session PROPRE sur un 401 et rejouent la même requête UNE fois avec le
// jeton rafraîchi du MÊME compte.
//
// Ce que ce fichier VERROUILLE :
//   1. 401 + jeton rafraîchi du même compte → la requête repart, une fois, et
//      c'est la réponse du rejeu qui revient ;
//   2. jamais deux rejeux (401 → 401 : l'erreur 401 remonte comme avant, avec
//      son statut, pour invalidateRejectedSession) ;
//   3. jamais le jeton d'un AUTRE compte ;
//   4. sans session propre (copie relayée de dépannage) : aucun rejeu ;
//   5. une réponse 200 ne relit rien ;
//   6. restRequest suit la même règle, même corps renvoyé ;
//   7. aucun appel à une fonction edge pendant la relecture (le chemin
//      d'amorçage d'extension-session bouclerait) — prouvé en comptant les
//      appels /functions/v1/.
//
// Il n'analyse pas le code : il CHARGE background.js dans un vm et appelle les
// vraies fonctions (même patron que capture-fraicheur-selftest.mjs).
//
//   node scripts/jeton-401-rejeu-selftest.mjs
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

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (sub, n) => `${b64u({ alg: "HS256" })}.${b64u({ sub, n })}.sig`;
const SUB = "63ad8597-4fee-4277-9a69-14ad44af1896";
const AUTRE = "11111111-2222-3333-4444-555555555555";

// Un bac à sable par scénario : storage local réel (Map), fetch scripté.
function charger({ session, reponses, refresh }) {
  const rien = { addListener: () => {} };
  const store = new Map();
  const aireLocale = {
    get: async (cles) => {
      const liste = Array.isArray(cles) ? cles : (typeof cles === "string" ? [cles] : Object.keys(cles ?? {}));
      const out = {};
      for (const k of liste) if (store.has(k)) out[k] = store.get(k);
      return out;
    },
    set: async (o) => { for (const [k, v] of Object.entries(o)) store.set(k, v); },
    remove: async (k) => { for (const c of (Array.isArray(k) ? k : [k])) store.delete(c); },
  };
  const aire = () => ({ get: async () => ({}), set: async () => {}, remove: async () => {} });
  const appels = [];
  const file = [...reponses];
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async (url, init = {}) => {
      appels.push({ url: String(url), auth: init?.headers?.Authorization ?? null, body: init?.body ?? null });
      if (String(url).includes("/auth/v1/token")) {
        return { ok: Boolean(refresh), status: refresh ? 200 : 400, json: async () => refresh ?? {}, text: async () => "" };
      }
      const r = file.shift() ?? { status: 200, json: { ok: true } };
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.json ?? {}, text: async () => JSON.stringify(r.json ?? {}) };
    },
    chrome: {
      runtime: { onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
                 lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }) },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aireLocale, session: aire(), onChanged: rien },
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
  // FILLSELL_CONFIG est un `const` de config.js : pas une propriété du global
  // du vm. La clé est relue dans la SOURCE qui part dans le paquet.
  const cle = fs.readFileSync(path.join(DOSSIER, "config.js"), "utf8").match(/SESSION_OWN:\s*"([^"]+)"/)[1];
  if (session) store.set(cle, session);
  // Le chargement du script a pu déclencher des fetch (démarrage) : on ne
  // compte que ceux du scénario.
  appels.length = 0;
  return { ctx, appels, store, cle };
}

const maintenantS = () => Math.floor(Date.now() / 1000);
const PERIME = jwt(SUB, 1);   // le jeton du cycle, expiré pendant la veille
const FRAIS = jwt(SUB, 2);    // celui que rend le refresh
const sessionExpiree = { access_token: PERIME, refresh_token: "r1", expires_at: maintenantS() - 3600 };
const refreshOk = { access_token: FRAIS, refresh_token: "r2", expires_at: maintenantS() + 3600 };

console.log("\n── UN 401 APRÈS UNE VEILLE SE REJOUE UNE FOIS ─────────────────");

console.log("\n1. 401 PUIS JETON RAFRAÎCHI DU MÊME COMPTE → UN REJEU, SA RÉPONSE REVIENT");
{
  const { ctx, appels } = charger({ session: sessionExpiree, reponses: [{ status: 401 }, { status: 200, json: { success: true, n: 7 } }], refresh: refreshOk });
  const data = await ctx.callEdgeFunction("update-job-status", PERIME, { jobId: "cacee338", status: "processing" });
  const fonctions = appels.filter((a) => a.url.includes("/functions/v1/"));
  ok("la réponse du REJEU revient à l'appelant", data?.success === true && data?.n === 7, JSON.stringify(data));
  ok("deux appels de la fonction, pas un de plus", fonctions.length === 2, String(fonctions.length));
  ok("le rejeu porte le jeton RAFRAÎCHI", fonctions[1]?.auth === `Bearer ${FRAIS}`, fonctions[1]?.auth);
  ok("le rejeu porte le MÊME corps", fonctions[0]?.body === fonctions[1]?.body);
  ok("le refresh passe par /auth/v1/token (session propre)", appels.some((a) => a.url.includes("/auth/v1/token")));
}

console.log("\n2. JAMAIS DEUX REJEUX — 401 PUIS 401 : L'ERREUR REMONTE AVEC SON STATUT");
{
  const { ctx, appels } = charger({ session: sessionExpiree, reponses: [{ status: 401 }, { status: 401 }, { status: 200 }], refresh: refreshOk });
  let err = null;
  try { await ctx.callEdgeFunction("update-job-status", PERIME, {}); } catch (e) { err = e; }
  ok("une erreur est levée", Boolean(err));
  ok("son statut est 401 (invalidateRejectedSession la reconnaît)", err?.status === 401, String(err?.status));
  ok("deux appels exactement", appels.filter((a) => a.url.includes("/functions/v1/")).length === 2);
}

console.log("\n3. JAMAIS LE JETON D'UN AUTRE COMPTE");
{
  const autre = { access_token: jwt(AUTRE, 9), refresh_token: "x", expires_at: maintenantS() + 3600 };
  const { ctx, appels } = charger({ session: autre, reponses: [{ status: 401 }, { status: 200 }] });
  let err = null;
  try { await ctx.callEdgeFunction("update-job-status", PERIME, {}); } catch (e) { err = e; }
  ok("aucun rejeu avec le jeton d'un autre compte", appels.filter((a) => a.url.includes("/functions/v1/")).length === 1);
  ok("le 401 remonte tel quel", err?.status === 401);
}

console.log("\n4. SANS SESSION PROPRE : AUCUN REJEU (comme avant)");
{
  const { ctx, appels } = charger({ session: null, reponses: [{ status: 401 }, { status: 200 }] });
  let err = null;
  try { await ctx.callEdgeFunction("get-pending-jobs", PERIME, {}); } catch (e) { err = e; }
  ok("un seul appel", appels.filter((a) => a.url.includes("/functions/v1/")).length === 1);
  ok("le 401 remonte", err?.status === 401);
}

console.log("\n5. MÊME JETON EN STOCK (non expiré) : 401 = vrai refus, AUCUN REJEU");
{
  const vivant = { access_token: PERIME, refresh_token: "r1", expires_at: maintenantS() + 3600 };
  const { ctx, appels } = charger({ session: vivant, reponses: [{ status: 401 }, { status: 200 }], refresh: refreshOk });
  let err = null;
  try { await ctx.callEdgeFunction("update-job-status", PERIME, {}); } catch (e) { err = e; }
  ok("un seul appel : rien de neuf à essayer", appels.filter((a) => a.url.includes("/functions/v1/")).length === 1);
  ok("aucun refresh forcé ici (invalidateRejectedSession garde ce rôle)", !appels.some((a) => a.url.includes("/auth/v1/token")));
  ok("le 401 remonte", err?.status === 401);
}

console.log("\n6. UNE RÉPONSE 200 NE RELIT RIEN");
{
  const { ctx, appels } = charger({ session: sessionExpiree, reponses: [{ status: 200, json: { jobs: [] } }], refresh: refreshOk });
  const data = await ctx.callEdgeFunction("get-pending-jobs", PERIME, {});
  ok("un seul appel, aucun refresh", appels.length === 1 && Array.isArray(data?.jobs), `${appels.length}`);
}

console.log("\n7. restRequest SUIT LA MÊME RÈGLE — ET NE PASSE PAR AUCUNE FONCTION EDGE");
{
  const { ctx, appels } = charger({ session: sessionExpiree, reponses: [{ status: 401 }, { status: 204 }], refresh: refreshOk });
  const corps = JSON.stringify({ platform_fields: { republish_step: "captured" } });
  const r = await ctx.restRequest("cross_post_jobs?id=eq.cacee338", PERIME, { method: "PATCH", body: corps });
  const rest = appels.filter((a) => a.url.includes("/rest/v1/"));
  ok("le PATCH repart une fois, avec le jeton rafraîchi", rest.length === 2 && rest[1].auth === `Bearer ${FRAIS}`, rest.map((a) => a.auth).join(" | "));
  ok("même corps", rest[0].body === corps && rest[1].body === corps);
  ok("return=minimal : null, comme avant", r === null);
  ok("aucun appel /functions/v1/ pendant la relecture (pas de boucle d'amorçage)", !appels.some((a) => a.url.includes("/functions/v1/")));
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
