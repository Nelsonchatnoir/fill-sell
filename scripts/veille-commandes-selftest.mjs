// ── AUTOTEST : VEILLE DES COMMANDES VINTED / LEBONCOIN (05/10, point 14) ─────
// Décision de Nico : liste des commandes lue toutes les 10 min, comptes PAYANTS
// seulement, bornée et mesurée, coupée au premier signe anti-robot. Ce fichier
// CHARGE background.js dans un vm (même patron que capture-fraicheur) et rejoue
// veillerCommandes / lireVerifPrioritaires avec une plateforme et une base
// simulées. Il verrouille :
//   1. rien pour un compte gratuit, ni interrupteur fermé (0 lecture de page) ;
//   2. l'amorçage : les commandes déjà là sont mémorisées, jamais relues ;
//   3. une commande neuve Vinted → l'item_id EXACT → l'annonce relue en priorité ;
//   4. la cadence de 10 min ; une commande annulée ou vieille de 3 jours : rien ;
//   5. 403 / page anti-robot → coupée 24 h, plus aucune lecture ;
//   6. Leboncoin : compte pro = rien (jamais pris pour un anti-robot) ; le titre
//      choisit quoi relire (3 au plus), un lot n'est jamais rattaché ;
//   7. les bornes (3 détails par passage) et les mesures journalières.
//   node scripts/veille-commandes-selftest.mjs
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
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "HS256" })}.${b64({ sub: "00000000-0000-4000-8000-0000000000aa" })}.sig`;
const session = { access_token: TOKEN };

// ── Monde simulé ────────────────────────────────────────────────────────────
const monde = {
  ouverte: 1, palier: "pro",
  vinted: { http: 200, bot: false, commandes: [], details: {} },
  leboncoin: { type: "individual", http: 200, commandes: [] },
  jobsVinted: [], jobsLbc: [],
  lectures: { vinted: 0, leboncoin: 0, details: 0 }, rest: [], usage: [],
};
const ilYa = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

// La page : on remplace l'injection dans l'onglet par la réponse simulée.
ctx.executerDansOngletPlateforme = async (platform, func, args) => {
  const src = String(func);
  if (platform === "vinted" && src.includes("my_orders")) {
    monde.lectures.vinted++;
    const v = monde.vinted;
    if (v.http !== 200) return { ok: false, http: v.http, bot: v.bot, motif: `http_${v.http}`, requetes: 1 };
    return { ok: true, http: 200, commandes: v.commandes, requetes: 1 };
  }
  if (platform === "vinted" && src.includes("/api/v2/transactions/")) {
    const refs = args[0];
    monde.lectures.details += refs.length;
    return { ok: true, requetes: refs.length, bot: false,
      articles: refs.map((ref) => ({ ref, item_ids: monde.vinted.details[ref] ?? [] })) };
  }
  if (platform === "leboncoin") {
    monde.lectures.leboncoin++;
    const l = monde.leboncoin;
    const typeConnu = args[1];
    const requetes = typeConnu ? 1 : 2;
    const type = typeConnu ?? l.type;
    if (type !== "individual") return { ok: false, motif: `compte_non_individual_${type}`, typeCompte: type, requetes: 1 };
    if (l.http !== 200) return { ok: false, http: l.http, motif: `http_${l.http}`, requetes, typeCompte: type };
    return { ok: true, http: 200, commandes: l.commandes, requetes, typeCompte: type };
  }
  return { ok: false, motif: "inattendu" };
};
ctx.restRequest = async (chemin, _tok, init = {}) => {
  monde.rest.push(chemin.split("?")[0]);
  if (chemin.startsWith("coin_config")) return [{ value: monde.ouverte }];
  if (chemin.startsWith("rpc/palier_de")) return monde.palier;
  if (chemin.startsWith("usage_logs")) { monde.usage.push(JSON.parse(init.body)); return null; }
  if (chemin.startsWith("cross_post_jobs") && chemin.includes("platform=eq.vinted")) {
    const ids = (chemin.match(/platform_listing_id=in\.\(([^)]*)\)/)?.[1] ?? "").split(",");
    return monde.jobsVinted.filter((j) => ids.includes(j.platform_listing_id)).map((j) => ({ id: j.id }));
  }
  if (chemin.startsWith("cross_post_jobs") && chemin.includes("platform=eq.leboncoin")) return monde.jobsLbc;
  if (chemin.startsWith("cross_post_jobs") && chemin.includes("&id=in.(")) {
    const ids = (chemin.match(/&id=in\.\(([^)]*)\)/)?.[1] ?? "").split(",");
    return [...monde.jobsVinted, ...monde.jobsLbc].filter((j) => ids.includes(j.id))
      .map((j) => ({ ...j, platform: j.platform_listing_id ? "vinted" : "leboncoin", action: "publish", listing_url: "https://x" }));
  }
  return [];
};

const etat = () => memoire.veille_commandes_etat ?? {};
const prio = () => Object.keys(memoire.verif_prioritaire ?? {});
const forcerEcheance = () => {
  const e = memoire.veille_commandes_etat;
  for (const pf of ["vinted", "leboncoin"]) if (e?.[pf]) e[pf].prochain = 0;
};
const raz = () => { for (const k of Object.keys(memoire)) delete memoire[k]; monde.lectures = { vinted: 0, leboncoin: 0, details: 0 }; monde.rest = []; };
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

console.log("\n── VEILLE DES COMMANDES ─────────────────────────────────────────");

console.log("\n1. Compte gratuit, interrupteur fermé : aucune lecture de page");
monde.palier = "free";
await ctx.veillerCommandes(session);
ok("gratuit : 0 lecture Vinted, 0 lecture Leboncoin", monde.lectures.vinted === 0 && monde.lectures.leboncoin === 0);
raz(); monde.palier = "pro"; monde.ouverte = 0;
await ctx.veillerCommandes(session);
ok("interrupteur fermé : 0 lecture", monde.lectures.vinted === 0 && monde.lectures.leboncoin === 0);
ok("interrupteur fermé : le palier n'est même pas lu", !monde.rest.includes("rpc/palier_de"));
const avantCache = monde.rest.length;
await ctx.veillerCommandes(session);
ok("droits gardés 30 min : 0 lecture de la base au passage suivant", monde.rest.length === avantCache);

console.log("\n2. Amorçage : les commandes déjà là sont mémorisées, jamais relues");
raz(); monde.ouverte = 1;
monde.vinted.commandes = [{ ref: "t1", titre: "Ancienne", date: ilYa(1), statut: "completed" }];
monde.vinted.details = { t1: ["111"] };
monde.jobsVinted = [{ id: U(1), platform_listing_id: "111" }, { id: U(2), platform_listing_id: "222" }, { id: U(3), platform_listing_id: "333" },
  { id: U(4), platform_listing_id: "444" }, { id: U(5), platform_listing_id: "555" }];
await ctx.veillerCommandes(session);
ok("premier passage : la liste est lue", monde.lectures.vinted === 1);
ok("premier passage : aucun détail, aucune relecture", monde.lectures.details === 0 && prio().length === 0);
ok("la commande est mémorisée", (etat().vinted?.vues ?? []).includes("t1") && etat().vinted?.amorcee === true);

console.log("\n3. Une commande NEUVE Vinted → l'item_id exact → relue en priorité");
monde.vinted.commandes = [{ ref: "t2", titre: "Neuve", date: ilYa(0.1), statut: "in_progress" }, ...monde.vinted.commandes];
monde.vinted.details.t2 = ["222"];
await ctx.veillerCommandes(session);
ok("cadence : 2 min après, rien n'est relu", monde.lectures.vinted === 1);
forcerEcheance();
await ctx.veillerCommandes(session);
ok("10 min après : la liste est relue", monde.lectures.vinted === 2);
ok("un seul détail (la commande neuve), jamais l'ancienne", monde.lectures.details === 1);
ok("l'annonce 222 (job U2) est désignée, rien d'autre", JSON.stringify(prio()) === JSON.stringify([U(2)]), JSON.stringify(prio()));
const relus = await ctx.lireVerifPrioritaires(session);
ok("checkPublishedListings la relit (statut publié lu en base)", relus.length === 1 && relus[0].id === U(2));
ok("une seule tentative prioritaire : la désignation est consommée", (await ctx.lireVerifPrioritaires(session)).length === 0);

console.log("\n4. Annulée, vieille de 3 jours : rien");
monde.vinted.commandes = [{ ref: "t3", titre: "Annulée", date: ilYa(0.2), statut: "failed" },
  { ref: "t4", titre: "Vieille", date: ilYa(72), statut: "completed" }, ...monde.vinted.commandes];
monde.vinted.details.t3 = ["333"]; monde.vinted.details.t4 = ["444"];
forcerEcheance();
await ctx.veillerCommandes(session);
ok("aucun détail lu, aucune annonce désignée", monde.lectures.details === 1 && prio().length === 0);

console.log("\n5. Bornes : 5 commandes neuves → 3 détails au plus");
monde.vinted.commandes = ["n1", "n2", "n3", "n4", "n5"].map((ref, i) => ({ ref, titre: ref, date: ilYa(0.05 * (i + 1)), statut: "in_progress" }))
  .concat(monde.vinted.commandes);
Object.assign(monde.vinted.details, { n1: ["111"], n2: ["333"], n3: ["444"], n4: ["555"], n5: ["555"] });
forcerEcheance();
await ctx.veillerCommandes(session);
ok("3 détails lus, pas 5", monde.lectures.details === 4, `détails ${monde.lectures.details}`);
ok("3 annonces désignées", prio().length === 3, JSON.stringify(prio()));
await ctx.lireVerifPrioritaires(session);

console.log("\n6. Anti-robot : 403 → coupée 24 h, plus aucune lecture");
monde.vinted.http = 403; monde.vinted.bot = true;
forcerEcheance();
await ctx.veillerCommandes(session);
ok("veille Vinted coupée, motif gardé", etat().vinted?.coupee?.motif === "http_403" && Number(etat().vinted?.coupee?.jusqu) > Date.now() + 23 * 3_600_000);
monde.vinted.http = 200; monde.vinted.bot = false;
const lecturesAvant = monde.lectures.vinted;
forcerEcheance();
await ctx.veillerCommandes(session);
ok("pendant la coupure : 0 lecture Vinted", monde.lectures.vinted === lecturesAvant);
ok("la coupure est tracée tout de suite (motif, http)", monde.usage.some((l) => l[0].metadata.evenement === "coupure" && l[0].metadata.http === 403));

console.log("\n7. Leboncoin : compte pro = rien ; le titre choisit quoi relire");
raz(); monde.leboncoin.type = "pro";
monde.leboncoin.commandes = [];
await ctx.veillerCommandes(session);
ok("compte pro : lu une fois, jamais coupé (ce n'est pas un anti-robot)", !etat().leboncoin?.coupee && etat().leboncoin?.typeCompte === "pro");
raz(); monde.leboncoin.type = "individual";
monde.leboncoin.commandes = [{ ref: "p1", titre: "Ancienne LBC", date: ilYa(1), statut: "completed" }];
monde.jobsLbc = [
  { id: U(11), title: "Rangement Rouge et Bleu pour 12 pots" },
  { id: U(12), title: "Rangement rouge et bleu pour 12 pots !" },
  { id: U(13), title: "Lampe vintage" },
];
await ctx.veillerCommandes(session); // amorçage
monde.leboncoin.commandes = [
  { ref: "p2", titre: "Rangement Rouge et Bleu pour 12 pots", date: ilYa(0.1), statut: "in_progress" },
  { ref: "p3", titre: "Lampe vintage", date: ilYa(0.1), statut: "in_progress", lot: true },
  ...monde.leboncoin.commandes];
forcerEcheance();
await ctx.veillerCommandes(session);
ok("les deux annonces au même titre réduit sont relues (la relecture tranche)", JSON.stringify(prio().sort()) === JSON.stringify([U(11), U(12)]), JSON.stringify(prio()));
ok("un LOT n'est jamais rattaché à une annonce", !prio().includes(U(13)));

console.log("\n8. Mesures : une ligne usage_logs par jour, jamais plus");
const amorcagesAvant = monde.usage.filter((l) => l[0].metadata.evenement === "amorcage").length;
const e = memoire.veille_commandes_etat;
ok("compteurs du jour tenus", e.mesures?.leboncoin?.passages >= 2 && e.mesures?.leboncoin?.requetes >= 2);
e.mesures.jour = "2026-10-04"; // la journée d'hier se termine
forcerEcheance();
await ctx.veillerCommandes(session);
const journalieres = () => monde.usage.filter((l) => l[0].metadata.jour);
ok("la journée finie part dans usage_logs (feature veille_commandes)", journalieres().length === 1 && journalieres()[0][0].feature === "veille_commandes" && journalieres()[0][0].metadata.jour === "2026-10-04");
forcerEcheance();
await ctx.veillerCommandes(session);
ok("jamais deux fois", journalieres().length === 1);
const evts = monde.usage.map((l) => l[0].metadata).filter((m) => m.evenement);
ok("amorçage tracé tout de suite (preuve qu'une veille tourne), avec commandes lues et requêtes",
  evts.some((m) => m.evenement === "amorcage" && m.platform === "leboncoin" && m.commandes_lues === 1 && m.requetes >= 1));
ok("une seule fois par plateforme et par poste : les passages suivants n'en écrivent plus",
  evts.filter((m) => m.evenement === "amorcage").length === amorcagesAvant);

console.log("\n9. Bornes écrites dans le fichier qui part dans le paquet");
const SOURCE = fs.readFileSync(path.join(DOSSIER, "background.js"), "utf8");
const borne = (nom) => SOURCE.match(new RegExp(`^const ${nom} = ([^;]+);`, "m"))?.[1];
ok("10 min", borne("VEILLE_COMMANDES_MS") === "10 * 60 * 1000");
ok("coupure 24 h", borne("VEILLE_COMMANDES_COUPURE_MS") === "24 * 60 * 60 * 1000");
ok("Vinted et Leboncoin seulement (Opla exclu)", borne("VEILLE_COMMANDES_PLATEFORMES") === '["vinted", "leboncoin"]');
ok("veille appelée AVANT checkPublishedListings dans le poll",
  SOURCE.indexOf("await veillerCommandes(session)") > 0 && SOURCE.indexOf("await veillerCommandes(session)") < SOURCE.indexOf("await checkPublishedListings(session).catch((e) =>\n    console.error(\"[background] checkPublishedListings:\""));

if (echecs) { console.log(`\n✗ ${echecs} échec(s)`); process.exit(1); }
console.log("\n✓ veille des commandes : payants seulement, bornée, mesurée, coupée au premier signe anti-robot");
