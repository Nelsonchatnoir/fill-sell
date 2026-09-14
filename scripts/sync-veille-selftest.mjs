// ── AUTOTEST DU VEILLEUR DE RUN FIGÉ (2026-09-14) ────────────────────────────
// Le veilleur reprend une sync dont la boucle est morte avec son service
// worker. Son seul vrai danger, c'est de reprendre un run qui VIT ENCORE :
// deux boucles sur le même dressing, curseurs qui se marchent dessus, et
// marquage de disparitions faussé — l'inventaire des gens.
//
// Ce fichier ne relit pas le code : il l'EXÉCUTE. background.js est chargé tel
// quel dans un contexte vm avec chrome.* et fetch simulés, et on observe ce
// qui part sur le réseau. Les fonctions déclarées avec `function` deviennent
// des propriétés du global du contexte : c'est ce qui permet de les appeler et
// d'en remplacer certaines (ouvrirOngletVintedPret, getValidSession…).
//
// Limite ASSUMÉE : `syncDressingEnCours` est un `let` de module, donc
// invisible depuis l'extérieur du contexte — la garde « une sync tourne dans
// CE worker » est vérifiée à la lecture, pas ici.
//
//   node scripts/sync-veille-selftest.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER = path.join(RACINE, "chrome-extension");
const USER = "11111111-2222-3333-4444-555555555555";
const RUN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const JWT = `${b64url({ alg: "HS256" })}.${b64url({ sub: USER, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

const ilYA = (min) => new Date(Date.now() - min * 60_000).toISOString();

let echecs = 0;
const ok = (titre, condition, detail = "") => {
  if (condition) {
    console.log(`  ✓ ${titre}`);
  } else {
    echecs += 1;
    console.log(`  ✗ ${titre}${detail ? ` — ${detail}` : ""}`);
  }
};

// ── Le bac à sable ───────────────────────────────────────────────────────────
function charger({ routes, alarmeArmee = false }) {
  const journal = [];
  const local = {};
  const sessionStore = {};
  const aire = (bag) => ({
    get: async (k) => (k == null ? { ...bag }
      : typeof k === "string" ? (k in bag ? { [k]: bag[k] } : {})
      : { ...bag }),
    set: async (o) => { Object.assign(bag, o); },
    remove: async (k) => { delete bag[k]; },
  });
  const rien = { addListener: () => {} };
  const ctx = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, TextEncoder, TextDecoder, crypto: globalThis.crypto,
    Blob: globalThis.Blob, FormData: globalThis.FormData,
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    importScripts: (f) => vm.runInContext(fs.readFileSync(path.join(DOSSIER, f), "utf8"), contexte, { filename: f }),
    fetch: async (url, init = {}) => {
      const methode = init.method ?? "GET";
      const chemin = String(url).replace(/^.*\/rest\/v1\//, "");
      journal.push({ methode, chemin, corps: init.body ? JSON.parse(init.body) : null });
      const route = routes.find((r) => r.quand(methode, chemin));
      const rendu = route ? route.rend(methode, chemin) : [];
      return {
        ok: true, status: 200,
        json: async () => rendu,
        text: async () => JSON.stringify(rendu),
      };
    },
    chrome: {
      runtime: {
        onMessage: rien, onInstalled: rien, onStartup: rien, onUpdateAvailable: rien,
        lastError: null, id: "selftest", getManifest: () => ({ version: "0.0.0" }),
      },
      alarms: {
        onAlarm: rien, create: () => {}, getAll: async () => [],
        get: async () => (alarmeArmee ? { name: "armee", scheduledTime: Date.now() + 60_000 } : null),
        clear: async () => false,
      },
      storage: { local: aire(local), session: aire(sessionStore), onChanged: rien },
      tabs: {
        onRemoved: rien, onUpdated: rien, query: async () => [], create: async () => ({ id: 1 }),
        remove: async () => {}, sendMessage: () => {}, update: async () => ({ id: 1 }), get: async () => ({ id: 1 }),
      },
      windows: { onRemoved: rien, create: async () => ({ id: 1, tabs: [{ id: 1 }] }), getAll: async () => [], remove: async () => {}, update: async () => {} },
      scripting: { executeScript: async () => [] },
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
  ctx.getValidSession = async () => ({ access_token: JWT });
  return { ctx, journal, local };
}

// Route qui sert UN run de sync sur la lecture du veilleur.
const routeLectureRun = (run) => ({
  quand: (m, c) => m === "GET" && c.startsWith(`vinted_sync_runs?id=eq.${RUN}`) && c.includes("select=id,status"),
  rend: () => (run ? [run] : []),
});
const routeUsageLogs = { quand: (m, c) => m === "POST" && c.startsWith("usage_logs"), rend: () => [] };

async function poserEtat(ctx, etat) {
  await ctx.chrome.storage.local.set({ FILLSELL_SYNC_VEILLE: { [USER]: etat } });
}
const lireEtat = async (ctx) =>
  (await ctx.chrome.storage.local.get("FILLSELL_SYNC_VEILLE"))?.FILLSELL_SYNC_VEILLE?.[USER] ?? null;

const patchsCas = (journal) => journal.filter((l) => l.methode === "PATCH" && l.chemin.includes("status=eq.running"));

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── VEILLEUR DE RUN FIGÉ ───────────────────────────────────────");

{
  console.log("\n1. Aucune sync ouverte ici : la ronde ne coûte pas une requête");
  const { ctx, journal } = charger({ routes: [] });
  ok("decodeJwtSub rend bien l'utilisateur du jeton", ctx.decodeJwtSub(JWT) === USER, ctx.decodeJwtSub(JWT));
  await ctx.veillerRunFige();
  ok("zéro appel réseau", journal.length === 0, `${journal.length} appel(s)`);
}

{
  console.log("\n2. La boucle VIT (le curseur a bougé) : on ré-observe, on ne touche à RIEN");
  const run = { id: RUN, status: "running", page_suivante: 3, items_vus: 192, updated_at: ilYA(1), declencheur: "bouton" };
  const { ctx, journal } = charger({ routes: [routeLectureRun(run), routeUsageLogs] });
  ctx.syncDressingVinted = async () => { throw new Error("reprise interdite ici"); };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: ilYA(30), vuA: ilYA(30), reprises: 0 });
  await ctx.veillerRunFige();
  ok("aucune revendication", patchsCas(journal).length === 0);
  const etat = await lireEtat(ctx);
  ok("observation rafraîchie sur le curseur courant", etat?.items_vus === 192 && etat?.page_suivante === 3);
  ok("compteur de reprises conservé à 0", etat?.reprises === 0);
}

{
  console.log("\n3. Silence de 5 min : trop tôt, rien ne bouge");
  const maj = ilYA(5);
  const run = { id: RUN, status: "running", page_suivante: 2, items_vus: 96, updated_at: maj, declencheur: "bouton" };
  const { ctx, journal } = charger({ routes: [routeLectureRun(run), routeUsageLogs] });
  ctx.syncDressingVinted = async () => { throw new Error("reprise interdite ici"); };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: maj, vuA: maj, reprises: 0 });
  await ctx.veillerRunFige();
  ok("aucune revendication avant le seuil", patchsCas(journal).length === 0);
}

{
  console.log("\n4. Silence de 20 min : revendication puis reprise à la page mémorisée");
  const maj = ilYA(20);
  const run = { id: RUN, status: "running", page_suivante: 2, items_vus: 96, updated_at: maj, declencheur: "bouton_distant" };
  const { ctx, journal } = charger({
    routes: [
      routeLectureRun(run),
      { quand: (m, c) => m === "PATCH" && c.includes("status=eq.running"), rend: () => [{ ...run, updated_at: new Date().toISOString() }] },
      routeUsageLogs,
    ],
  });
  const reprises = [];
  ctx.syncDressingVinted = async (o) => { reprises.push(o); return { ok: true }; };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: maj, vuA: maj, reprises: 0 });
  await ctx.veillerRunFige();
  const cas = patchsCas(journal);
  ok("une revendication, une seule", cas.length === 1, `${cas.length}`);
  ok("filtrée sur status=eq.running", !!cas[0]?.chemin.includes("status=eq.running"));
  ok("filtrée sur l'updated_at LU (compare-and-swap)", !!cas[0]?.chemin.includes(`updated_at=eq.${encodeURIComponent(maj)}`), cas[0]?.chemin);
  ok("la revendication ne touche ni au statut, ni au curseur, ni à erreur",
    cas[0] && !("status" in cas[0].corps) && !("page_suivante" in cas[0].corps)
    && !("items_vus" in cas[0].corps) && !("erreur" in cas[0].corps),
    JSON.stringify(cas[0]?.corps));
  ok("reprise déclenchée une fois", reprises.length === 1);
  ok("marquée repriseVeille (ne désarme aucune reprise auto)", reprises[0]?.repriseVeille === true);
  ok("déclencheur d'origine conservé", reprises[0]?.declencheur === "bouton_distant");
  ok("aucune création de run neuf", journal.filter((l) => l.methode === "POST" && l.chemin.startsWith("vinted_sync_runs")).length === 0);
  const etat = await lireEtat(ctx);
  ok("compteur de reprises incrémenté à 1", etat?.reprises === 1, String(etat?.reprises));
}

{
  console.log("\n5. Revendication PERDUE (un autre a écrit entre-temps) : aucune reprise");
  const maj = ilYA(20);
  const run = { id: RUN, status: "running", page_suivante: 2, items_vus: 96, updated_at: maj, declencheur: "bouton" };
  const { ctx, journal } = charger({
    routes: [
      routeLectureRun(run),
      { quand: (m, c) => m === "PATCH" && c.includes("status=eq.running"), rend: () => [] },
      routeUsageLogs,
    ],
  });
  const reprises = [];
  ctx.syncDressingVinted = async (o) => { reprises.push(o); return { ok: true }; };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: maj, vuA: maj, reprises: 0 });
  await ctx.veillerRunFige();
  ok("la revendication a bien été tentée", patchsCas(journal).length === 1);
  ok("AUCUNE seconde boucle : pas de reprise", reprises.length === 0, `${reprises.length} reprise(s)`);
  const etat = await lireEtat(ctx);
  ok("compteur NON consommé", etat?.reprises === 0);
}

{
  console.log("\n6. Plafond de 3 reprises atteint : la main revient au chien de garde");
  const maj = ilYA(45);
  const run = { id: RUN, status: "running", page_suivante: 2, items_vus: 96, updated_at: maj, declencheur: "bouton" };
  const { ctx, journal } = charger({ routes: [routeLectureRun(run), routeUsageLogs] });
  const reprises = [];
  ctx.syncDressingVinted = async (o) => { reprises.push(o); return { ok: true }; };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: maj, vuA: maj, reprises: 3 });
  await ctx.veillerRunFige();
  ok("aucune revendication", patchsCas(journal).length === 0);
  ok("aucune reprise", reprises.length === 0);
}

{
  console.log("\n7. Le run n'est plus 'running' : surveillance levée, rien d'autre");
  const run = { id: RUN, status: "done", page_suivante: 4, items_vus: 202, updated_at: ilYA(40), declencheur: "bouton" };
  const { ctx, journal } = charger({ routes: [routeLectureRun(run), routeUsageLogs] });
  const reprises = [];
  ctx.syncDressingVinted = async (o) => { reprises.push(o); return { ok: true }; };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: ilYA(40), vuA: ilYA(40), reprises: 0 });
  await ctx.veillerRunFige();
  ok("aucune revendication sur un run terminé", patchsCas(journal).length === 0);
  ok("aucune reprise", reprises.length === 0);
  ok("état effacé", (await lireEtat(ctx)) === null);
}

{
  console.log("\n8. Une reprise automatique est déjà armée : le veilleur se tait");
  const maj = ilYA(30);
  const run = { id: RUN, status: "running", page_suivante: 2, items_vus: 96, updated_at: maj, declencheur: "bouton" };
  const { ctx, journal } = charger({ routes: [routeLectureRun(run), routeUsageLogs], alarmeArmee: true });
  const reprises = [];
  ctx.syncDressingVinted = async (o) => { reprises.push(o); return { ok: true }; };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: maj, vuA: maj, reprises: 0 });
  await ctx.veillerRunFige();
  ok("aucune lecture, aucune revendication (zéro recouvrement)", journal.length === 0, `${journal.length} appel(s)`);
  ok("aucune reprise", reprises.length === 0);
}

{
  console.log("\n9. Lecture du run impossible (réseau) : on ne conclut rien");
  const maj = ilYA(30);
  const { ctx, journal } = charger({ routes: [] });
  ctx.fetch = async () => { throw new Error("réseau coupé"); };
  const reprises = [];
  ctx.syncDressingVinted = async (o) => { reprises.push(o); return { ok: true }; };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: maj, vuA: maj, reprises: 0 });
  await ctx.veillerRunFige();
  ok("aucune reprise sur une lecture ratée", reprises.length === 0);
  ok("état conservé pour la prochaine ronde", (await lireEtat(ctx))?.runId === RUN);
  ok("journal vide (le fetch a levé)", journal.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n── LA REPRISE ELLE-MÊME (chemin réel, sans doublure) ──────────");

{
  console.log("\n10. Un run repris ADOPTE la ligne 'running' et ne marque aucune disparition");
  const maj = ilYA(20);
  const run = { id: RUN, status: "running", page_suivante: 2, items_vus: 96, updated_at: maj, declencheur: "bouton" };
  const { ctx, journal } = charger({
    routes: [
      routeLectureRun(run),
      { quand: (m, c) => m === "PATCH" && c.includes("status=eq.running"), rend: () => [{ ...run, updated_at: new Date().toISOString() }] },
      // La requête d'ADOPTION de syncDressingUnlocked (run 'running' du compte).
      {
        quand: (m, c) => m === "GET" && c.includes("user_id=eq.") && c.includes("status=eq.running"),
        rend: () => [{ id: RUN, page_suivante: 2, items_vus: 96, items_crees: 0, items_maj: 96, erreur: null }],
      },
      routeUsageLogs,
    ],
  });
  // L'onglet de travail ne s'ouvre pas : la sync échoue TÔT, mais après
  // l'adoption — c'est exactement ce qu'on veut observer.
  ctx.ouvrirOngletVintedPret = async () => { throw new Error("onglet de travail Vinted : le content script ne répond pas"); };
  ctx.getOrCreateWorkTab = async () => { throw new Error("onglet de travail Vinted : le content script ne répond pas"); };
  await poserEtat(ctx, { runId: RUN, page_suivante: 2, items_vus: 96, updated_at: maj, vuA: maj, reprises: 0 });
  await ctx.veillerRunFige();

  const adoption = journal.filter((l) => l.methode === "GET" && l.chemin.includes("status=eq.running") && l.chemin.includes("user_id=eq."));
  ok("la ligne 'running' est ADOPTÉE (pas de run neuf)", adoption.length === 1, `${adoption.length} adoption(s)`);
  ok("aucun POST de création de run", journal.filter((l) => l.methode === "POST" && l.chemin.startsWith("vinted_sync_runs")).length === 0);
  ok("aucune écriture d'inventaire", journal.filter((l) => l.chemin.startsWith("inventaire") && l.methode !== "GET").length === 0);
  const disparitions = journal.filter((l) => JSON.stringify(l.corps ?? {}).includes("disparu_le"));
  ok("AUCUN marquage de disparition", disparitions.length === 0, `${disparitions.length}`);
  const clotures = journal.filter((l) => l.methode === "PATCH" && l.corps && "finished_at" in l.corps);
  ok("le run est clos honnêtement (pas de succès inventé)",
    clotures.length >= 1 && clotures.every((c) => c.corps.status !== "done"),
    JSON.stringify(clotures.map((c) => c.corps.status)));
  ok("surveillance levée après clôture", (await lireEtat(ctx)) === null);
}

// ═══════════════════════════════════════════════════════════════════════════
// NON-RÉGRESSION DU CHEMIN NOMINAL — le harnais mock de la boucle (28 pages,
// 2 682 articles : le profil de `vestiaires`, le plus gros dressing du parc).
// C'est la question qui prime sur tout le reste : est-ce qu'une sync qui
// marche marche toujours, et pareil ?
console.log("\n── CHEMIN NOMINAL : 28 PAGES, 2 682 ARTICLES (profil vestiaires) ──");

function bacNominal({ usageLogsPendJamais = false } = {}) {
  const routesNominal = [
    // Aucun run en cours, aucun run incomplet : la sync en CRÉE un.
    { quand: (m, c) => m === "GET" && c.startsWith("vinted_sync_runs"), rend: () => [] },
    { quand: (m, c) => m === "POST" && c.startsWith("vinted_sync_runs"), rend: () => [{ id: RUN, page_suivante: 1, items_vus: 0, updated_at: new Date().toISOString() }] },
    { quand: (m) => m === "GET", rend: () => [] },
    { quand: () => true, rend: () => [] },
  ];
  const bac = charger({ routes: routesNominal });
  bac.ctx.syncPauseMs = () => 0; // la cadence humaine n'est pas l'objet du test
  if (usageLogsPendJamais) {
    const vraiFetch = bac.ctx.fetch;
    bac.ctx.fetch = async (url, init) => {
      if (String(url).includes("usage_logs")) {
        bac.journal.push({ methode: "POST", chemin: "usage_logs (SUSPENDU)", corps: init?.body ? JSON.parse(init.body) : null });
        return new Promise(() => {}); // ne résout JAMAIS
      }
      return vraiFetch(url, init);
    };
  }
  return bac;
}

{
  console.log("\n11. La sync mockée va au bout, et trace UNE ligne par page");
  const { ctx, journal } = bacNominal();
  await ctx.chrome.storage.local.set({ FILLSELL_SYNC_MOCK: { actif: true, total_articles: 2682 } });
  const t0 = Date.now();
  const res = await ctx.syncDressingVinted({ declencheur: "bouton" });
  const duree = Date.now() - t0;
  const clotures = journal.filter((l) => l.methode === "PATCH" && l.corps && "finished_at" in l.corps);
  const derniere = clotures[clotures.length - 1];
  ok("la sync rend un succès", res?.ok === true, JSON.stringify(res));
  ok("run clos en 'done'", derniere?.corps?.status === "done", JSON.stringify(derniere?.corps?.status));
  ok("2 682 articles lus", derniere?.corps?.items_vus === 2682, String(derniere?.corps?.items_vus));
  const pages = journal
    .filter((l) => l.chemin.startsWith("usage_logs") && l.corps?.[0]?.feature === "sync_page")
    .map((l) => l.corps[0].metadata.page);
  ok("28 traces de page, une par page, dans l'ordre",
    pages.length === 28 && pages.every((p, i) => p === i + 1),
    `${pages.length} trace(s) : ${pages.slice(0, 5).join(",")}…`);
  ok("jamais une trace par article (2 682 ≠ 28)", pages.length < 100);
  const iTrace2 = journal.findIndex((l) => l.corps?.[0]?.feature === "sync_page" && l.corps[0].metadata.page === 2);
  const iEcriture2 = journal.findIndex((l, i) => i > iTrace2 && l.chemin.startsWith("inventaire") && l.methode === "POST");
  ok("la trace de la page 2 précède les écritures de la page 2", iTrace2 > 0 && iEcriture2 > iTrace2);
  ok("état de veille levé à la clôture", (await lireEtat(ctx)) === null);
  console.log(`     (28 pages déroulées en ${duree} ms, pauses humaines neutralisées)`);
}

{
  console.log("\n12. Même sync, mais la trace de page NE RÉPOND JAMAIS : rien ne bloque");
  const { ctx, journal } = bacNominal({ usageLogsPendJamais: true });
  await ctx.chrome.storage.local.set({ FILLSELL_SYNC_MOCK: { actif: true, total_articles: 2682 } });
  const res = await Promise.race([
    ctx.syncDressingVinted({ declencheur: "bouton" }),
    new Promise((r) => setTimeout(() => r({ ok: false, reason: "BLOQUÉ" }), 60_000)),
  ]);
  const clotures = journal.filter((l) => l.methode === "PATCH" && l.corps && "finished_at" in l.corps);
  const derniere = clotures[clotures.length - 1];
  ok("la sync va quand même au bout", res?.ok === true, JSON.stringify(res));
  ok("run clos en 'done' avec ses 2 682 articles",
    derniere?.corps?.status === "done" && derniere?.corps?.items_vus === 2682,
    JSON.stringify({ s: derniere?.corps?.status, v: derniere?.corps?.items_vus }));
  ok("les 28 traces ont bien été TENTÉES", journal.filter((l) => l.chemin.includes("usage_logs")).length >= 28);
}

console.log("");
if (echecs) {
  console.error(`✗ ${echecs} vérification(s) en échec`);
  process.exit(1);
}
console.log("✓ veilleur de run figé : toutes les vérifications passent\n");
