// ═══════════════════════════════════════════════════════════════════════════
// DEPOP : UNE PHOTO NE COÛTE JAMAIS LA PUBLICATION — `npm run selftest:depop-photos-reprise`
// ═══════════════════════════════════════════════════════════════════════════
// 24/10/2026 (extension 0.6.132, point 2 — Johan). « présignature refusée pour la photo 1 (HTTP Failed to fetch) » :
// la demande d'emplacement photo (POST /presentation/api/v1/pictures/) n'avait reçu aucune réponse (pré-requête CORS
// de webapi.depop.com qui échoue au hasard : 190 échecs pour 3 661 photos du 10 au 23/10, 4,9 % par photo). Une
// publication de 8 photos perdait un passage sur trois ; Johan en a enchaîné quatre.
// Ce test exécute le VRAI connecteur (content-scripts/depop.js, après depop-tailles.js comme Chrome) avec un réseau
// qui se tait comme en prod :
//   · présignature, envoi de la photo et validation se reprennent sur place quand le réseau n'a rien rendu ;
//   · une RÉPONSE (401, 4xx, 5xx) n'est jamais reprise : elle se lit ;
//   · la création de l'annonce (POST /listing/products/) n'est JAMAIS reprise (jamais une annonce en double).
//   node scripts/depop-photos-reprise-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };

const DEPOP = lire("chrome-extension/content-scripts/depop.js");

function connecteur(reseau) {
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} }, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date,
    Promise, RegExp, Error, TypeError, Uint8Array, globalThis: undefined,
    document: { cookie: "access_token=jeton-essai" },
    setTimeout: (f) => setTimeout(f, 0), clearTimeout,
    fetch: reseau,
  });
  ctx.globalThis = ctx;
  vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
  vm.runInContext(`${DEPOP}\n;globalThis.__t = { depopMonterPhoto, depopValiderPhotos, depopJson, depopJsonPhoto, DEPOP_REPRISES_PHOTO_MS, depopTrace: () => depopTrace };`, ctx, { filename: "depop.js" });
  // La photo source et sa mise en JPEG ne sont pas l'objet du test.
  vm.runInContext(`depopLirePhoto = async () => ({ blob: async () => "blob" }); depopPreparerImage = async () => ({ jpeg: "jpeg", largeur: 1024, hauteur: 1024 });`, ctx);
  return ctx.__t;
}
const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corps ?? {}) });

console.log("\n1. la présignature reprise quand le réseau se tait");
{
  let appels = 0;
  const D = connecteur(async (url, opt) => {
    if (String(url).endsWith("/presentation/api/v1/pictures/")) { appels++; if (appels <= 2) throw new TypeError("Failed to fetch"); return reponse(200, { id: 5027708132, url: "https://s3.essai/put" }); }
    if (String(url).startsWith("https://s3.essai/")) return reponse(200);
    return reponse(404);
  });
  const id = await D.depopMonterPhoto("https://photo/1.jpg", 0);
  ok(id === 5027708132 && appels === 3, "deux silences puis la réponse : la photo part (3 appels)", `id ${id}, appels ${appels}`);
  ok(D.depopTrace().some((l) => /présignature : réseau muet \(Failed to fetch\), nouvel essai 1\/3/.test(l)), "la reprise est tracée");
}
{
  let appels = 0;
  const D = connecteur(async (url) => { if (String(url).endsWith("/pictures/")) { appels++; throw new TypeError("Failed to fetch"); } return reponse(404); });
  let erreur = null; try { await D.depopMonterPhoto("https://photo/1.jpg", 0); } catch (e) { erreur = e; }
  ok(erreur && /présignature refusée pour la photo 1 \(HTTP Failed to fetch\)/.test(erreur.message) && appels === 4,
    "réseau muet à chaque fois : 4 essais (1 + 3), puis le même message qu'avant (le serveur le classe toujours)", `${erreur?.message} — ${appels}`);
}

console.log("\n2. une réponse se lit, elle ne se reprend pas");
for (const [status, attendu] of [[401, /Connecte-toi|session|Depop/i], [403, /présignature refusée pour la photo 1 \(HTTP 403\)/], [500, /HTTP 500/]]) {
  let appels = 0;
  const D = connecteur(async (url) => { if (String(url).endsWith("/pictures/")) { appels++; return reponse(status, {}); } return reponse(404); });
  let erreur = null; try { await D.depopMonterPhoto("https://photo/1.jpg", 0); } catch (e) { erreur = e; }
  ok(erreur && attendu.test(erreur.message) && appels === 1, `HTTP ${status} : un seul appel, lu tel quel`, `${erreur?.message} — ${appels}`);
}

console.log("\n3. l'envoi de la photo (PUT signé) repris quand le réseau se tait");
{
  let puts = 0;
  const D = connecteur(async (url, opt) => {
    if (String(url).endsWith("/pictures/")) return reponse(200, { id: 7, url: "https://s3.essai/put" });
    if (String(url).startsWith("https://s3.essai/")) { puts++; if (puts === 1) throw new TypeError("Failed to fetch"); return reponse(200); }
    return reponse(404);
  });
  const id = await D.depopMonterPhoto("https://photo/1.jpg", 0);
  ok(id === 7 && puts === 2, "un silence puis l'envoi : la photo part", `${id} — ${puts}`);
}

console.log("\n4. la création de l'annonce n'est JAMAIS reprise");
{
  let creations = 0;
  const D = connecteur(async (url) => { if (String(url).endsWith("/listing/products/")) { creations++; throw new TypeError("Failed to fetch"); } return reponse(404); });
  const r = await D.depopJson("/presentation/api/v1/listing/products/", { methode: "POST", corps: {} });
  ok(r.statut === 0 && r.erreurReseau && creations === 1, "POST /listing/products/ : un seul envoi, l'échec réseau est rendu tel quel", JSON.stringify(r) + " — " + creations);
  const src = DEPOP;
  ok(/const c = await depopJson\(DEPOP_ENDPOINTS\.creer, \{ methode: "POST", corps \}\);/.test(src), "la création passe par depopJson (sans reprise), jamais par depopJsonPhoto");
  ok(!/depopJsonPhoto\(DEPOP_ENDPOINTS\.creer/.test(src), "aucune reprise branchée sur la création");
}

console.log("\n5. les délais");
{
  const D = connecteur(async () => reponse(404));
  ok(JSON.stringify([...D.DEPOP_REPRISES_PHOTO_MS]) === "[1000,2500,5000]", "1 s, 2,5 s, 5 s");
}

console.log(ko ? `\n${ko} ÉCHEC(S) sur ${n}` : `\nTOUT VERT (${n} contrôles)`);
process.exit(ko ? 1 : 0);
