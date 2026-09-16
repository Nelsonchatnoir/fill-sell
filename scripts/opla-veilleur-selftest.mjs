// ── AUTOTEST DU VEILLEUR DE VENTE OPLA (lot B, 2026-09-16) ───────────────────
// Ce fichier ne relit pas le code : il l'EXÉCUTE. background.js est chargé dans
// un contexte vm avec chrome.* simulé, et on observe ce que `checkListingState`
// conclut pour chaque réponse possible de l'oracle.
//
// Ce qu'il verrouille, et pourquoi chaque contrôle existe :
//   · la VENTE ne se conclut QUE sur status:"sold", à l'exact. Toute la valeur
//     du lot A tient là-dedans ;
//   · un 404 ne devient JAMAIS "sold" — c'est la vente fantôme du 12/07,
//     rejouée sur une cinquième plateforme ;
//   · un statut jamais observé au relevé (`reserved`, ou ce qu'Opla ajoutera)
//     ne conclut RIEN — c'est l'anti-Beebs ("sold":"Vendu" lu comme un état) ;
//   · aucune lecture ratée (onglet absent, HTTP non-200, exception, onglet figé)
//     ne produit un verdict — pire cas : vente vue en retard ;
//   · AUCUN prix n'est jamais rendu : le corps d'un article vendu est identique
//     à celui d'un disponible, `priceCents` est le prix AFFICHÉ, pas le payé.
//
//   node scripts/opla-veilleur-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
const ID = "art_9bd45b6e216d54411152c1c97017101c";
const URL_ANNONCE = `https://www.opla.co/product/${ID}`;

let echecs = 0;
const ok = (titre, condition, detail = "") => {
  if (condition) console.log(`  ok   ${titre}`);
  else { echecs += 1; console.log(`  KO   ${titre}${detail ? ` — ${detail}` : ""}`); }
};

// ── Bac à sable ──────────────────────────────────────────────────────────────
// `oracle` décrit ce que l'onglet rend : soit le résultat de l'injection, soit
// une exception. `onglet` décide si workTabForFetch trouve un onglet.
function charger({ oracle, onglet = true } = {}) {
  const appels = { executeScript: 0, fetchWorker: 0, ongletsCrees: 0 };
  const local = {};
  const sessionStore = onglet ? { fillsell_work_tab_opla: 42 } : {};
  const aire = (bag) => ({
    get: async (k) => (k == null ? { ...bag }
      : typeof k === "string" ? (k in bag ? { [k]: bag[k] } : {})
      : Object.fromEntries((Array.isArray(k) ? k : [k]).filter((n) => n in bag).map((n) => [n, bag[n]]))),
    set: async (o) => { Object.assign(bag, o); },
    remove: async (k) => { delete bag[k]; },
  });
  const rien = { addListener: () => {}, removeListener: () => {} };
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    // ⚠️ Le fetch du SERVICE WORKER : s'il est appelé pour Opla, c'est un bug —
    // il rendrait 429 en vrai. Le compteur le surveille.
    fetch: async () => { appels.fetchWorker += 1; return { ok: false, status: 429, text: async () => "", url: "" }; },
    chrome: {
      runtime: {
        onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
        lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }),
      },
      alarms: { onAlarm: rien, create: () => {}, getAll: async () => [], get: async () => null, clear: async () => false },
      storage: { local: aire(local), session: aire(sessionStore), onChanged: rien },
      tabs: {
        onRemoved: rien, onUpdated: rien,
        query: async () => [],
        // `onglet:false` simule le cas RÉEL du paquet CWS : pas de permission
        // d'hôte opla.co, donc aucun onglet ouvrable. getOrCreateWorkTab
        // rejette, lireEtatOpla attrape, et le verdict doit rester "unknown".
        create: async () => {
          appels.ongletsCrees += 1;
          if (!onglet) throw new Error("Cannot access contents of the url \"https://www.opla.co/\"");
          return { id: 99 };
        },
        remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 42 }),
        // L'onglet mémorisé est bien vivant et bien sur opla.co.
        get: async (id) => (onglet && id === 42 ? { id: 42, url: "https://www.opla.co/", discarded: false } : null),
      },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: {
        executeScript: async () => {
          appels.executeScript += 1;
          if (typeof oracle === "function") return oracle();
          return [{ result: oracle }];
        },
      },
      cookies: { get: async () => null, getAll: async () => [] },
      action: { onClicked: rien, setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
      power: { requestKeepAwake: () => {}, releaseKeepAwake: () => {} },
      notifications: { create: () => {} },
    },
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  const contexte = vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8"), contexte, { filename: "background.js" });
  // Les `const` de module ne deviennent PAS des propriétés du global du
  // contexte (contrairement aux `function`) : PLATFORM_HOSTS et
  // PLATFORM_HANDLERS ne sont lisibles qu'en évaluant DANS le contexte.
  const evaluer = (expr) => vm.runInContext(expr, contexte);
  return { ctx, appels, evaluer };
}

const lire = async (oracle, options) => {
  const { ctx, appels } = charger({ oracle, ...options });
  const r = await ctx.checkListingState(URL_ANNONCE, "opla");
  return { ...r, appels };
};
const rep = (etat, moderation = "approved") => ({ status: 200, etat, moderation, erreurApi: null });

console.log("\n── VEILLEUR DE VENTE OPLA ─────────────────────────────────────");

console.log("\n1. Les cinq réponses RELEVÉES au lot A");
{
  const vendu = await lire(rep("sold"));
  ok("status 'sold' → sold (preuve POSITIVE)", vendu.state === "sold", vendu.state);
  ok("… et AUCUN prix (Opla n'expose pas le prix payé)", vendu.price === null, String(vendu.price));

  ok("status 'available' → active", (await lire(rep("available"))).state === "active");
  ok("status 'available' + moderation 'pending' → active (modération asynchrone)",
    (await lire(rep("available", "pending"))).state === "active");
  ok("status 'draft' (« Publier plus tard ») → unavailable, PAS sold",
    (await lire(rep("draft"))).state === "unavailable");
  ok("status 'rejected' (modération) → unavailable, PAS sold",
    (await lire(rep("rejected"))).state === "unavailable");

  const efface = await lire({ status: 404, etat: null, moderation: null, erreurApi: "article_not_found" });
  ok("404 article_not_found → unavailable", efface.state === "unavailable", efface.state);
  ok("⛔ 404 n'est JAMAIS une vente", efface.state !== "sold");
}

console.log("\n2. Un statut jamais observé ne conclut RIEN (l'anti-Beebs)");
{
  const reserve = await lire(rep("reserved"));
  ok("'reserved' (présent dans les libellés, jamais vu) → unknown", reserve.state === "unknown", reserve.state);
  ok("… et le motif NOMME la valeur rencontrée",
    String(reserve.raison).includes("reserved"), String(reserve.raison));
  ok("'pending_moderation' → unknown", (await lire(rep("pending_moderation"))).state === "unknown");
  ok("status absent → unknown", (await lire({ status: 200, etat: null })).state === "unknown");
  ok("status vide → unknown", (await lire(rep(""))).state === "unknown");
}

console.log("\n3. Aucune lecture ratée ne produit de verdict");
{
  const sansOnglet = await lire(rep("sold"), { onglet: false });
  ok("aucun onglet exploitable → unknown", sansOnglet.state === "unknown", sansOnglet.state);
  ok("… et AUCUN repli sur le fetch du service worker (il rendrait 429)",
    sansOnglet.appels.fetchWorker === 0, `${sansOnglet.appels.fetchWorker} appel(s)`);

  ok("HTTP 500 → unknown", (await lire({ status: 500 })).state === "unknown");
  ok("HTTP 429 (empreinte refusée) → unknown", (await lire({ status: 429 })).state === "unknown");
  ok("HTTP 403 → unknown", (await lire({ status: 403 })).state === "unknown");
  ok("exception réseau dans l'onglet → unknown",
    (await lire({ erreur: "Failed to fetch" })).state === "unknown");
  ok("injection sans résultat → unknown", (await lire(() => [{}])).state === "unknown");
  const jette = await lire(() => { throw new Error("Cannot access contents of the page"); });
  ok("executeScript qui lève → unknown", jette.state === "unknown", jette.state);
  ok("… motif nommé, jamais muet", !!jette.raison);
}

console.log("\n4. Le lien, et ce qu'on refuse d'en tirer");
{
  const { ctx } = charger({ oracle: rep("sold") });
  const sansId = await ctx.checkListingState("https://www.opla.co/product/pas-un-identifiant", "opla");
  ok("URL sans art_… → unknown, aucune lecture tentée", sansId.state === "unknown", sansId.state);
  ok("… motif nommé", sansId.raison === "opla_id_introuvable", String(sansId.raison));
  // L'ancienne forme /article/<id> n'a jamais été valide, mais un job écrit par
  // un build antérieur au lot 7 la porte — son identifiant, lui, est bon.
  const vieuxLien = await ctx.checkListingState(`https://www.opla.co/article/${ID}`, "opla");
  ok("vieux lien /article/<id> : l'identifiant est quand même repêché", vieuxLien.state === "sold", vieuxLien.state);
}

console.log("\n5. Les quatre plateformes en service ne passent pas par là");
{
  const { evaluer } = charger({ oracle: rep("sold") });
  const hotes = evaluer("PLATFORM_HOSTS");
  const registre = evaluer("PLATFORM_HANDLERS");
  ok("PLATFORM_HOSTS.opla est câblé (sans quoi le veilleur serait aveugle)",
    hotes?.opla === "opla.co", String(hotes?.opla));
  ok("les 4 hôtes en service sont intacts",
    hotes.vinted === "vinted.fr" && hotes.leboncoin === "leboncoin.fr"
    && hotes.ebay === "ebay.fr" && hotes.beebs === "beebs.app");
  ok("⛔ opla reste NON implémentée (le levier n'est pas levé par ce lot)",
    registre?.opla?.implemented === false, String(registre?.opla?.implemented));
  ok("⛔ et sans newListingUrl", !("newListingUrl" in (registre?.opla ?? {})));
  ok("les 4 handlers en service restent implemented:true",
    ["vinted", "leboncoin", "ebay", "beebs"].every((p) => registre[p]?.implemented === true));
}

console.log(
  echecs === 0
    ? "\nTOUT PASSE — la vente se conclut sur 'sold' et sur rien d'autre\n"
    : `\n${echecs} CONTRÔLE(S) EN ÉCHEC\n`
);
process.exit(echecs === 0 ? 0 : 1);
