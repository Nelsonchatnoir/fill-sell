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
//      appels /functions/v1/ ;
//   8–10. (04/11, sebastien64310 — redémarrage de l'Auth de 6 s) un 503
//      « auth_indisponible » rejoue la même requête (2, 5, 10 s), puis remonte
//      en 503, jamais en 401 ; un 503 sans ce code n'est jamais rejoué ;
//   11. un refresh sans réponse de l'Auth (5xx, 521, réseau) ne purge jamais la
//      session ; seul un refus (4xx) la purge, comme avant.
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
function charger({ session, reponses, refresh, refreshStatut = null, rapide = false }) {
  // rapide : les attentes créées PENDANT le scénario (sleep) passent à 0 ms et leurs durées sont notées — jamais les
  // minuteries posées au chargement du script (démarrage), qui tireraient des appels sur les réponses scriptées.
  const attentes = [];
  let accelere = false;
  const minuteur = (f, ms, ...a) => {
    if (rapide && accelere) { attentes.push(ms); return setTimeout(f, 0, ...a); }
    return setTimeout(f, ms, ...a);
  };
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
    setTimeout: minuteur, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async (url, init = {}) => {
      appels.push({ url: String(url), auth: init?.headers?.Authorization ?? null, body: init?.body ?? null });
      if (String(url).includes("/auth/v1/token")) {
        if (refreshStatut === "reseau") throw new TypeError("fetch failed");
        if (refreshStatut) return { ok: false, status: refreshStatut, json: async () => { throw new SyntaxError("html"); }, text: async () => "<html>down</html>" };
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
  attentes.length = 0;
  // Le démarrage du script continue en asynchrone après son chargement (minuteries de 30 s, 5 min) : on le laisse
  // poser ses minuteries avec leurs vraies durées, puis seules les attentes du scénario sont accélérées.
  const accelerer = async () => {
    await new Promise((r) => setTimeout(r, 50));
    appels.length = 0;
    attentes.length = 0;
    accelere = true;
  };
  return { ctx, appels, store, cle, attentes, accelerer };
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

// ── (04/11, sebastien64310) L'AUTH INDISPONIBLE (redémarrage de 6 s) NE CONCLUT RIEN ────────────────────────────────
const INDISPO = { status: 503, json: { error: "Connexion à FillSell momentanément indisponible : nouvel essai automatique, rien à faire.", code: "auth_indisponible" } };
const vivante = () => ({ access_token: FRAIS, refresh_token: "r2", expires_at: maintenantS() + 3600 });

console.log("\n8. 503 « auth_indisponible » PUIS 200 : LA MÊME REQUÊTE SE REJOUE, SA RÉPONSE REVIENT");
{
  const { ctx, appels, attentes, accelerer } = charger({ session: vivante(), reponses: [INDISPO, { status: 200, json: { success: true, n: 8 } }], rapide: true });
  await accelerer();
  const data = await ctx.callEdgeFunction("update-job-status", FRAIS, { job_id: "b3727bbe", status: "published" });
  const f = appels.filter((a) => a.url.includes("/functions/v1/"));
  ok("la réponse du rejeu revient (le verdict « published » est écrit)", data?.success === true && data?.n === 8, JSON.stringify(data));
  ok("deux appels, même jeton, même corps", f.length === 2 && f[0].auth === f[1].auth && f[0].body === f[1].body);
  ok("attente de 2 s avant le rejeu", attentes.includes(2000), JSON.stringify(attentes));
  ok("aucun refresh : le jeton n'est pas en cause", !appels.some((a) => a.url.includes("/auth/v1/token")));
}

console.log("\n9. 503 « auth_indisponible » QUI DURE : TROIS REJEUX (2, 5, 10 s), PUIS UN 503 — JAMAIS UN 401");
{
  const { ctx, appels, attentes, accelerer } = charger({ session: vivante(), reponses: [INDISPO, INDISPO, INDISPO, INDISPO, { status: 200 }], rapide: true });
  await accelerer();
  let err = null;
  try { await ctx.callEdgeFunction("get-pending-jobs", FRAIS, {}); } catch (e) { err = e; }
  ok("quatre appels au plus", appels.filter((a) => a.url.includes("/functions/v1/")).length === 4);
  ok("attentes 2 s, 5 s, 10 s", [2000, 5000, 10000].every((ms) => attentes.includes(ms)), JSON.stringify(attentes));
  ok("l'erreur remonte en 503 (le poll saute le cycle, invalidateRejectedSession n'est pas appelée)", err?.status === 503, String(err?.status));
}

console.log("\n10. UN 503 SANS « auth_indisponible » : AUCUN REJEU (on ne sait pas ce qui a été écrit)");
{
  const { ctx, appels, accelerer } = charger({ session: vivante(), reponses: [{ status: 503, json: { error: "boom" } }, { status: 200 }], rapide: true });
  await accelerer();
  let err = null;
  try { await ctx.callEdgeFunction("update-job-status", FRAIS, {}); } catch (e) { err = e; }
  ok("un seul appel", appels.filter((a) => a.url.includes("/functions/v1/")).length === 1);
  ok("le 503 remonte", err?.status === 503);
}

console.log("\n11. REFRESH SANS RÉPONSE DE L'AUTH (521, réseau) : LA SESSION N'EST JAMAIS PURGÉE");
for (const statut of [521, 503, "reseau"]) {
  const bientot = { access_token: FRAIS, refresh_token: "r2", expires_at: maintenantS() + 120 };
  const { ctx, store, cle } = charger({ session: bientot, reponses: [], refreshStatut: statut });
  const s = await ctx.refreshIfNeeded(bientot, cle);
  ok(`${statut} : la session reste stockée`, store.get(cle)?.access_token === FRAIS);
  ok(`${statut} : son jeton encore vivant sert`, s?.access_token === FRAIS, JSON.stringify(s));
}
{
  const expiree = { access_token: PERIME, refresh_token: "r1", expires_at: maintenantS() - 60 };
  const { ctx, store, cle } = charger({ session: expiree, reponses: [], refreshStatut: 521 });
  const s = await ctx.refreshIfNeeded(expiree, cle);
  ok("jeton expiré + Auth muette : null pour ce passage, mais rien de purgé", s === null && store.get(cle)?.refresh_token === "r1");
}
{
  const bientot = { access_token: FRAIS, refresh_token: "r2", expires_at: maintenantS() + 120 };
  const { ctx, store, cle } = charger({ session: bientot, reponses: [] });
  const s = await ctx.refreshIfNeeded(bientot, cle);
  ok("refus de l'Auth (400, refresh révoqué) : purge, comme avant", s === null && !store.has(cle));
}
{
  const own = { access_token: FRAIS, refresh_token: "r2", expires_at: maintenantS() + 3600 };
  const { ctx, store, cle } = charger({ session: own, reponses: [], refreshStatut: 521 });
  await ctx.invalidateRejectedSession({ ...own, storage_key: cle });
  ok("invalidateRejectedSession sur une Auth muette : la session est gardée", store.get(cle)?.access_token === FRAIS);
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nTout est vert.");
process.exit(echecs ? 1 : 0);
